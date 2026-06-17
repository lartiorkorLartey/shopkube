package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
)

// Config
type Config struct {
	Port        string
	DBHost      string
	DBPort      string
	DBName      string
	DBUser      string
	DBPassword  string
	RabbitMQURL string
	LogLevel    string
}

func loadConfig() Config {
	return Config{
		Port:        getEnv("PORT", "8088"),
		DBHost:      getEnv("DB_HOST", "localhost"),
		DBPort:      getEnv("DB_PORT", "5432"),
		DBName:      getEnv("DB_NAME", "shopkube"),
		DBUser:      getEnv("DB_USER", "shopkube"),
		DBPassword:  getEnv("DB_PASSWORD", "shopkube_pass"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://shopkube:shopkube_pass@rabbitmq:5672/"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Models
type Event struct {
	ID        int64           `json:"id"`
	Type      string          `json:"type"`
	UserID    *string         `json:"user_id,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

type CreateEventRequest struct {
	Type    string          `json:"type"`
	UserID  string          `json:"userId"`
	Payload json.RawMessage `json:"payload"`
}

type SummaryEntry struct {
	EventType string `json:"event_type"`
	Count     int64  `json:"count"`
}

var (
	db  *sql.DB
	cfg Config
	log *slog.Logger
)

// DB setup
func initDB() error {
	dsn := fmt.Sprintf("host=%s port=%s dbname=%s user=%s password=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBName, cfg.DBUser, cfg.DBPassword)

	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("opening db: %w", err)
	}

	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	for i := 0; i < 10; i++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Warn("DB ping failed, retrying...", "attempt", i+1, "error", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return fmt.Errorf("DB not reachable: %w", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS events (
			id SERIAL PRIMARY KEY,
			type VARCHAR(100) NOT NULL,
			user_id VARCHAR(255),
			payload JSONB,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
		CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
	`)
	return err
}

// Handlers
func createEventHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		jsonError(w, "type is required", http.StatusBadRequest)
		return
	}

	payload := req.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}

	var event Event
	err := db.QueryRowContext(r.Context(),
		`INSERT INTO events (type, user_id, payload) VALUES ($1, $2, $3) RETURNING id, type, user_id, payload, created_at`,
		req.Type, nullableString(req.UserID), payload,
	).Scan(&event.ID, &event.Type, &event.UserID, &event.Payload, &event.CreatedAt)

	if err != nil {
		log.Error("Failed to insert event", "error", err)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Info("Event recorded", "type", event.Type, "user_id", req.UserID)
	jsonResponse(w, event, http.StatusCreated)
}

func listEventsHandler(w http.ResponseWriter, r *http.Request) {
	eventType := r.URL.Query().Get("type")
	var rows *sql.Rows
	var err error

	if eventType != "" {
		rows, err = db.QueryContext(r.Context(),
			`SELECT id, type, user_id, payload, created_at FROM events WHERE type = $1 ORDER BY created_at DESC LIMIT 100`,
			eventType,
		)
	} else {
		rows, err = db.QueryContext(r.Context(),
			`SELECT id, type, user_id, payload, created_at FROM events ORDER BY created_at DESC LIMIT 100`,
		)
	}

	if err != nil {
		log.Error("Failed to query events", "error", err)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	events := make([]Event, 0)
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Type, &e.UserID, &e.Payload, &e.CreatedAt); err != nil {
			continue
		}
		events = append(events, e)
	}

	jsonResponse(w, events, http.StatusOK)
}

func summaryHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.QueryContext(r.Context(),
		`SELECT type, COUNT(*) as count FROM events WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY type ORDER BY count DESC`,
	)
	if err != nil {
		log.Error("Failed to query summary", "error", err)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	summary := make(map[string]int64)
	for rows.Next() {
		var eventType string
		var count int64
		if err := rows.Scan(&eventType, &count); err != nil {
			continue
		}
		summary[eventType] = count
	}

	jsonResponse(w, summary, http.StatusOK)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]string{"status": "ok", "service": "analytics-service"}, http.StatusOK)
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	if err := db.Ping(); err != nil {
		log.Error("Readiness check failed", "error", err)
		jsonResponse(w, map[string]string{"status": "unavailable", "error": "database unreachable"}, http.StatusServiceUnavailable)
		return
	}
	jsonResponse(w, map[string]string{"status": "ok"}, http.StatusOK)
}

// RabbitMQ consumer
func startConsumer(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := consume(ctx); err != nil {
			log.Warn("RabbitMQ consumer error, retrying in 5s", "error", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	}
}

func consume(ctx context.Context) error {
	conn, err := amqp.Dial(cfg.RabbitMQURL)
	if err != nil {
		return fmt.Errorf("connecting to RabbitMQ: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("opening channel: %w", err)
	}
	defer ch.Close()

	// Declare exchange
	if err := ch.ExchangeDeclare("shopkube.events", "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declaring exchange: %w", err)
	}

	// Declare queue
	q, err := ch.QueueDeclare("analytics-service", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("declaring queue: %w", err)
	}

	// Bind to all events
	if err := ch.QueueBind(q.Name, "#", "shopkube.events", false, nil); err != nil {
		return fmt.Errorf("binding queue: %w", err)
	}

	msgs, err := ch.Consume(q.Name, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("starting consumer: %w", err)
	}

	log.Info("RabbitMQ consumer started", "queue", q.Name, "exchange", "shopkube.events")

	closeCh := conn.NotifyClose(make(chan *amqp.Error, 1))

	for {
		select {
		case <-ctx.Done():
			return nil
		case amqpErr := <-closeCh:
			if amqpErr != nil {
				return fmt.Errorf("connection closed: %v", amqpErr)
			}
			return nil
		case msg, ok := <-msgs:
			if !ok {
				return fmt.Errorf("message channel closed")
			}

			var payload map[string]interface{}
			if err := json.Unmarshal(msg.Body, &payload); err != nil {
				log.Warn("Failed to parse message", "error", err)
				msg.Nack(false, false)
				continue
			}

			eventType := msg.RoutingKey
			if eventType == "" {
				eventType = "unknown"
			}

			userID := ""
			if uid, ok := payload["user_id"].(string); ok {
				userID = uid
			}

			payloadJSON, _ := json.Marshal(payload)

			_, err := db.Exec(
				`INSERT INTO events (type, user_id, payload) VALUES ($1, $2, $3)`,
				eventType, nullableString(userID), payloadJSON,
			)
			if err != nil {
				log.Error("Failed to store event from RabbitMQ", "error", err)
				msg.Nack(false, true)
				continue
			}

			log.Info("Event auto-recorded from RabbitMQ", "type", eventType, "user_id", userID)
			msg.Ack(false)
		}
	}
}

// Helpers
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func jsonResponse(w http.ResponseWriter, data interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, message string, status int) {
	jsonResponse(w, map[string]interface{}{"error": message, "code": status}, status)
}

func main() {
	cfg = loadConfig()

	// Set up slog JSON logging
	log = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(log)

	log.Info("Starting analytics-service", "port", cfg.Port)

	if err := initDB(); err != nil {
		log.Error("Failed to initialize DB", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	log.Info("Database connected and schema applied")

	// Router
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.RequestID)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, req.ProtoMajor)
			next.ServeHTTP(ww, req)
			log.Info("request",
				"method", req.Method,
				"path", req.URL.Path,
				"status", ww.Status(),
				"duration_ms", time.Since(start).Milliseconds(),
				"service", "analytics-service",
			)
		})
	})
	r.Use(middleware.Recoverer)

	r.Get("/health", healthHandler)
	r.Get("/ready", readyHandler)
	r.Post("/events", createEventHandler)
	r.Get("/events", listEventsHandler)
	r.Get("/analytics/summary", summaryHandler)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start RabbitMQ consumer in background
	ctx, cancel := context.WithCancel(context.Background())
	go startConsumer(ctx)

	// Start HTTP server
	go func() {
		log.Info("analytics-service listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("Server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Info("Shutting down...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("Forced shutdown", "error", err)
	}
	log.Info("Server stopped")
}
