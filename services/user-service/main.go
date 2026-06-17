package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

// Config holds app configuration from environment
type Config struct {
	Port       string
	DBHost     string
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string
	JWTSecret  string
	LogLevel   string
}

func loadConfig() Config {
	return Config{
		Port:       getEnv("PORT", "8081"),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBName:     getEnv("DB_NAME", "shopkube"),
		DBUser:     getEnv("DB_USER", "shopkube"),
		DBPassword: getEnv("DB_PASSWORD", "shopkube_pass"),
		JWTSecret:  getEnv("JWT_SECRET", "changeme-jwt-secret"),
		LogLevel:   getEnv("LOG_LEVEL", "info"),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// User represents the users table
type User struct {
	ID           int       `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Name         string    `json:"name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Request/Response types
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name" binding:"required"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type UpdateRequest struct {
	Name string `json:"name" binding:"required"`
}

type UserResponse struct {
	ID        int       `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type LoginResponse struct {
	Token string       `json:"token"`
	User  UserResponse `json:"user"`
}

type Claims struct {
	UserID int    `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

var (
	db        *sql.DB
	cfg       Config
	jwtSecret []byte
)

func initDB() error {
	dsn := fmt.Sprintf("host=%s port=%s dbname=%s user=%s password=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBName, cfg.DBUser, cfg.DBPassword)

	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("opening db: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Ping with retry
	for i := 0; i < 10; i++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Warn().Err(err).Int("attempt", i+1).Msg("DB ping failed, retrying...")
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return fmt.Errorf("db not reachable: %w", err)
	}

	// Create table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			name VARCHAR(255) NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	return err
}

func generateToken(userID int, email string) (string, error) {
	claims := Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   strconv.Itoa(userID),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// JWT middleware
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid authorization header", "code": 401})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token", "code": 401})
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("email", claims.Email)
		c.Next()
	}
}

// Handlers
func registerHandler(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": 400})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		log.Error().Err(err).Msg("bcrypt failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error", "code": 500})
		return
	}

	var user User
	err = db.QueryRow(
		`INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at, updated_at`,
		req.Email, string(hash), req.Name,
	).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered", "code": 409})
			return
		}
		log.Error().Err(err).Msg("insert user failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error", "code": 500})
		return
	}

	log.Info().Int("user_id", user.ID).Str("email", user.Email).Msg("user registered")
	c.JSON(http.StatusCreated, UserResponse{ID: user.ID, Email: user.Email, Name: user.Name, CreatedAt: user.CreatedAt})
}

func loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": 400})
		return
	}

	var user User
	err := db.QueryRow(
		`SELECT id, email, password_hash, name, created_at FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.CreatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials", "code": 401})
		return
	}
	if err != nil {
		log.Error().Err(err).Msg("db query failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error", "code": 500})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials", "code": 401})
		return
	}

	token, err := generateToken(user.ID, user.Email)
	if err != nil {
		log.Error().Err(err).Msg("token generation failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error", "code": 500})
		return
	}

	log.Info().Int("user_id", user.ID).Msg("user logged in")
	c.JSON(http.StatusOK, LoginResponse{
		Token: token,
		User:  UserResponse{ID: user.ID, Email: user.Email, Name: user.Name, CreatedAt: user.CreatedAt},
	})
}

func getUserHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id", "code": 400})
		return
	}

	// Check that requesting user can only access their own profile
	requestingUserID, _ := c.Get("userID")
	if requestingUserID.(int) != id {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden", "code": 403})
		return
	}

	var user User
	err = db.QueryRow(
		`SELECT id, email, name, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found", "code": 404})
		return
	}
	if err != nil {
		log.Error().Err(err).Msg("db query failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error", "code": 500})
		return
	}

	c.JSON(http.StatusOK, UserResponse{ID: user.ID, Email: user.Email, Name: user.Name, CreatedAt: user.CreatedAt})
}

func updateUserHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id", "code": 400})
		return
	}

	requestingUserID, _ := c.Get("userID")
	if requestingUserID.(int) != id {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden", "code": 403})
		return
	}

	var req UpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": 400})
		return
	}

	var user User
	err = db.QueryRow(
		`UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, created_at`,
		req.Name, id,
	).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found", "code": 404})
		return
	}
	if err != nil {
		log.Error().Err(err).Msg("update failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error", "code": 500})
		return
	}

	c.JSON(http.StatusOK, UserResponse{ID: user.ID, Email: user.Email, Name: user.Name, CreatedAt: user.CreatedAt})
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "user-service"})
}

func readyHandler(c *gin.Context) {
	if err := db.Ping(); err != nil {
		log.Error().Err(err).Msg("readiness check failed")
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable", "error": "database unreachable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func main() {
	cfg = loadConfig()
	jwtSecret = []byte(cfg.JWTSecret)

	// Configure zerolog
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.LogLevel == "debug" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	// Set Gin to release mode in production
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	log.Info().Str("service", "user-service").Str("port", cfg.Port).Msg("starting")

	if err := initDB(); err != nil {
		log.Fatal().Err(err).Msg("failed to initialize database")
	}
	defer db.Close()
	log.Info().Msg("database connected and schema applied")

	router := gin.New()
	router.Use(gin.Recovery())

	// Request logging middleware
	router.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", c.Writer.Status()).
			Dur("latency", time.Since(start)).
			Str("service", "user-service").
			Msg("request")
	})

	// Routes
	router.GET("/health", healthHandler)
	router.GET("/ready", readyHandler)

	users := router.Group("/users")
	{
		users.POST("/register", registerHandler)
		users.POST("/login", loginHandler)
		users.GET("/:id", authMiddleware(), getUserHandler)
		users.PUT("/:id", authMiddleware(), updateUserHandler)
	}

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Info().Str("port", cfg.Port).Msg("user-service listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Info().Msg("shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("forced shutdown")
	}
	log.Info().Msg("server stopped")
}
