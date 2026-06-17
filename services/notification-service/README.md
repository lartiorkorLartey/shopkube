# Notification Service

Part of the **ShopKube** polyglot microservices platform. This service handles asynchronous
notifications triggered by events across the system (order confirmations, shipping updates, etc.).

## Architecture

The service runs three processes under a single container managed by **supervisord**:

```
┌─────────────────────────────────────────────────────────┐
│                  notification-service                   │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Flask API  │  │ Celery Worker│  │ RabbitMQ      │  │
│  │  (app.py)   │  │  (tasks.py)  │  │ Consumer      │  │
│  │  Port 8085  │  │              │  │ (worker.py)   │  │
│  └──────┬──────┘  └──────▲───────┘  └──────┬────────┘  │
│         │                │                 │           │
│         └────────────────┴─────────────────┘           │
│                        SQLite                          │
│                  (/tmp/notifications.db)                │
└─────────────────────────────────────────────────────────┘
         ▲                                   ▲
         │ HTTP                              │ AMQP
    Other services                       RabbitMQ
                                      (order.created)
```

- **Flask API** (`app.py`) — exposes REST endpoints for reading stored notifications
- **Celery Worker** (`tasks.py`) — executes notification tasks asynchronously (email + SMS simulation)
- **RabbitMQ Consumer** (`worker.py`) — subscribes to `shopkube.events` exchange, routing key `order.created`, and dispatches Celery tasks
- **SQLite** — lightweight persistence for notification history; shared between all three processes via `/tmp/notifications.db`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — returns `{ "status": "ok", "service": "notification-service" }` |
| GET | `/ready` | Readiness probe — returns `{ "status": "ok" }` |
| GET | `/notifications/<user_id>` | Retrieve the last 50 notifications for a user |

### Example: Fetch notifications

```bash
curl http://localhost:8085/notifications/user-123
```

Response:

```json
{
  "userId": "user-123",
  "count": 2,
  "notifications": [
    {
      "id": 2,
      "user_id": "user-123",
      "type": "order.created",
      "message": "Your order #abc-def has been placed successfully. Total: $49.99",
      "payload": {
        "order_id": "abc-def-ghi",
        "user_id": "user-123",
        "total_amount": 49.99
      },
      "created_at": "2026-06-17T10:23:45.123456"
    }
  ]
}
```

### Error response format

```json
{ "error": "<message>", "code": 500 }
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8085` | Flask API listen port |
| `CELERY_BROKER_URL` | `amqp://shopkube:shopkube_pass@rabbitmq:5672/` | Celery broker (RabbitMQ AMQP URL) |
| `RABBITMQ_URL` | `amqp://shopkube:shopkube_pass@rabbitmq:5672/` | RabbitMQ URL for the consumer |
| `SQLITE_DB` | `/tmp/notifications.db` | Path to the SQLite notification store |
| `LOG_LEVEL` | `INFO` | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

## RabbitMQ Event Contract

The consumer subscribes to:

- **Exchange**: `shopkube.events` (type: `topic`, durable)
- **Queue**: `notification-service` (durable)
- **Routing key**: `order.created`

Expected message payload (JSON):

```json
{
  "order_id": "string",
  "user_id": "string",
  "total_amount": 49.99
}
```

## Celery Tasks

| Task name | Description |
|-----------|-------------|
| `tasks.send_order_notification` | Processes an `order.created` event; logs simulated email + SMS and persists to SQLite |
| `tasks.send_generic_notification` | Sends a generic notification to any user by ID |

## Local Development

### Docker (standalone)

```bash
# Build
docker build -t shopkube/notification-service .

# Run (requires RabbitMQ accessible at rabbitmq:5672)
docker run -p 8085:8085 \
  -e CELERY_BROKER_URL=amqp://shopkube:shopkube_pass@<rabbitmq-host>:5672/ \
  -e RABBITMQ_URL=amqp://shopkube:shopkube_pass@<rabbitmq-host>:5672/ \
  shopkube/notification-service
```

### Docker Compose (full stack)

From the repo root:

```bash
docker-compose up --build
```

### Run processes individually (without Docker)

```bash
pip install -r requirements.txt

# Terminal 1 — Flask API
python app.py

# Terminal 2 — Celery worker
celery -A tasks worker --loglevel=info --concurrency=2

# Terminal 3 — RabbitMQ consumer
python worker.py
```

## Kubernetes

The service is deployed via:

- `k8s/deployments/notification-service.yaml` — Deployment with `replicas: 2`, liveness/readiness probes
- `k8s/services/notification-service.yaml` — ClusterIP service on port 8085
- `k8s/configmaps/notification-service-config.yaml` — Non-sensitive config (log level, ports)
- `k8s/secrets/notification-service-secret.yaml` — RabbitMQ credentials

DNS name within the cluster: `http://notification-service:8085`

## Logging

All three processes emit structured JSON logs using `python-json-logger`. Each log line includes:

- `timestamp`
- `level`
- `name` (logger name, e.g. `notification-service.tasks`)
- `message`
- Service-specific fields (`service`, `order_id`, `user_id`, `channel`, etc.)

Example log output:

```json
{"timestamp": "2026-06-17T10:23:45.123Z", "level": "INFO", "name": "notification-service.tasks", "message": "Processing order notification", "service": "notification-service", "event_type": "order.created", "order_id": "abc-def", "user_id": "user-123", "total_amount": 49.99}
```
