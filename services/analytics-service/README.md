# Analytics Service

The analytics-service is a Go/Chi microservice responsible for tracking, storing, and summarizing platform events across ShopKube. It operates in two modes simultaneously: a REST API for direct event ingestion and a RabbitMQ consumer that passively captures events published by other services.

## Port

`8088`

## Technology Stack

- **Language:** Go 1.22
- **Framework:** Chi v5
- **Database:** PostgreSQL (JSONB event payloads)
- **Messaging:** RabbitMQ (topic exchange consumer)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8088` | HTTP server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `shopkube` | PostgreSQL database name |
| `DB_USER` | `shopkube` | PostgreSQL user |
| `DB_PASSWORD` | `shopkube_pass` | PostgreSQL password |
| `RABBITMQ_URL` | `amqp://shopkube:shopkube_pass@rabbitmq:5672/` | RabbitMQ connection URL |
| `LOG_LEVEL` | `info` | Logging level |

---

## API Endpoints

### Health Check

```
GET /health
```

Returns service status. Used by Kubernetes liveness probe.

```bash
curl http://localhost:8088/health
```

Response:
```json
{"service": "analytics-service", "status": "ok"}
```

---

### Readiness Check

```
GET /ready
```

Verifies database connectivity. Used by Kubernetes readiness probe.

```bash
curl http://localhost:8088/ready
```

Response (healthy):
```json
{"status": "ok"}
```

Response (unhealthy, 503):
```json
{"error": "database unreachable", "status": "unavailable"}
```

---

### Track an Event

```
POST /events
Content-Type: application/json
```

Ingests an analytics event directly via the REST API.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Event type identifier (e.g. `page.view`, `order.placed`) |
| `userId` | string | no | ID of the user who triggered the event |
| `payload` | object | no | Arbitrary JSON metadata for the event |

```bash
curl -X POST http://localhost:8088/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "page.view",
    "userId": "user-123",
    "payload": {"page": "/products", "referrer": "google"}
  }'
```

Response (201 Created):
```json
{
  "id": 1,
  "type": "page.view",
  "user_id": "user-123",
  "payload": {"page": "/products", "referrer": "google"},
  "created_at": "2026-06-17T10:00:00Z"
}
```

---

### List Events

```
GET /events
GET /events?type=<event_type>
```

Returns the 100 most recent events, optionally filtered by type.

```bash
# All recent events
curl http://localhost:8088/events

# Filter by type
curl "http://localhost:8088/events?type=order.placed"
```

Response (200 OK):
```json
[
  {
    "id": 42,
    "type": "order.placed",
    "user_id": "user-456",
    "payload": {"order_id": "ord-789", "total": 59.99},
    "created_at": "2026-06-17T09:55:00Z"
  }
]
```

---

### Analytics Summary

```
GET /analytics/summary
```

Returns a count of each event type from the last 7 days, ordered by frequency descending.

```bash
curl http://localhost:8088/analytics/summary
```

Response (200 OK):
```json
{
  "order.placed": 312,
  "page.view": 8741,
  "product.viewed": 2204,
  "user.registered": 87,
  "cart.item.added": 1553
}
```

---

## RabbitMQ Consumer

The service automatically subscribes to the `shopkube.events` topic exchange on startup and binds a durable queue named `analytics-service` using the `#` routing key wildcard. This means **every event published by any other service is captured automatically** without those services needing to know about the analytics service.

### Exchange and queue details

| Property | Value |
|----------|-------|
| Exchange | `shopkube.events` |
| Exchange type | `topic` |
| Queue name | `analytics-service` |
| Routing key binding | `#` (all topics) |
| Queue durability | durable |
| Message acknowledgment | manual (ack on success, nack+requeue on DB error) |

### Event routing key conventions used by other services

| Routing Key | Published By | Description |
|-------------|-------------|-------------|
| `user.registered` | user-service | New user sign-up |
| `order.placed` | order-service | Order successfully created |
| `order.cancelled` | order-service | Order cancelled |
| `cart.item.added` | cart-service | Item added to cart |
| `inventory.updated` | inventory-service | Stock level changed |
| `review.submitted` | review-service | Product review posted |

The consumer automatically extracts `user_id` from the message body if present, and stores the full message body as a JSONB payload alongside the routing key as the event type.

### Reconnection behavior

If the RabbitMQ connection drops, the consumer retries with a 5-second backoff. This loop runs independently of the HTTP server so a RabbitMQ outage does not affect REST API availability.

---

## Database Schema

```sql
CREATE TABLE events (
    id         SERIAL PRIMARY KEY,
    type       VARCHAR(100) NOT NULL,
    user_id    VARCHAR(255),
    payload    JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_type       ON events(type);
CREATE INDEX idx_events_created_at ON events(created_at);
```

The schema is applied automatically on startup — no manual migrations required.

---

## Docker Usage

### Build

```bash
docker build -t shopkube/analytics-service:latest .
```

### Run locally (requires reachable PostgreSQL and RabbitMQ)

```bash
docker run -p 8088:8088 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=shopkube \
  -e DB_USER=shopkube \
  -e DB_PASSWORD=shopkube_pass \
  -e RABBITMQ_URL=amqp://shopkube:shopkube_pass@host.docker.internal:5672/ \
  shopkube/analytics-service:latest
```

### Run with Docker Compose

From the repository root:

```bash
docker-compose up analytics-service
```

---

## Example Event Types

The analytics service accepts any arbitrary event type string. Recommended conventions:

```
<domain>.<action>          # e.g. order.placed
<domain>.<entity>.<action> # e.g. cart.item.added
page.<action>              # e.g. page.view
```

---

## Error Responses

All errors follow the standard ShopKube error format:

```json
{"error": "<human-readable message>", "code": <http_status_int>}
```

| Status | Meaning |
|--------|---------|
| 400 | Missing required field or invalid JSON |
| 500 | Database error |
| 503 | Database unreachable (readiness probe only) |
