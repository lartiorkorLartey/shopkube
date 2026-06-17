# Order Service

The Order Service manages the full lifecycle of customer orders for ShopKube. It persists orders and their line items to PostgreSQL and fires an `order.created` event to RabbitMQ whenever a new order is placed so downstream services (notification, inventory, analytics) can react asynchronously.

- Language: Java 21
- Framework: Spring Boot 3.2 / Spring Data JPA / Spring AMQP
- Database: PostgreSQL
- Message broker: RabbitMQ (topic exchange)
- Port: **8083**

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Create a new order |
| `GET` | `/orders/{id}` | Fetch a single order by UUID |
| `GET` | `/orders/user/{userId}` | List all orders for a user (newest first) |
| `PUT` | `/orders/{id}/status` | Update the status of an order |
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe (checks DB connectivity) |

---

## Order Statuses

```
PENDING -> CONFIRMED -> SHIPPED -> DELIVERED
                   \-> CANCELLED
```

---

## Request / Response Examples

### Create an order

**Request**
```http
POST /orders
Content-Type: application/json

{
  "userId": "user-abc-123",
  "items": [
    {
      "productId": "prod-001",
      "productName": "Wireless Keyboard",
      "quantity": 2,
      "unitPrice": 49.99
    },
    {
      "productId": "prod-007",
      "productName": "USB-C Hub",
      "quantity": 1,
      "unitPrice": 29.95
    }
  ]
}
```

**Response** `201 Created`
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "userId": "user-abc-123",
  "status": "PENDING",
  "totalAmount": 129.93,
  "items": [
    {
      "id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      "productId": "prod-001",
      "productName": "Wireless Keyboard",
      "quantity": 2,
      "unitPrice": 49.99,
      "subtotal": 99.98
    },
    {
      "id": "4ae35f21-9b2a-4e8c-b041-0c6e4f5a1234",
      "productId": "prod-007",
      "productName": "USB-C Hub",
      "quantity": 1,
      "unitPrice": 29.95,
      "subtotal": 29.95
    }
  ],
  "createdAt": "2026-06-17T14:30:00",
  "updatedAt": "2026-06-17T14:30:00"
}
```

---

### Get an order by ID

**Request**
```http
GET /orders/3fa85f64-5717-4562-b3fc-2c963f66afa6
```

**Response** `200 OK`
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "userId": "user-abc-123",
  "status": "CONFIRMED",
  "totalAmount": 129.93,
  "items": [...],
  "createdAt": "2026-06-17T14:30:00",
  "updatedAt": "2026-06-17T14:35:00"
}
```

**Not found** `404 Not Found`
```json
{ "error": "Order not found", "code": 404 }
```

---

### List orders for a user

**Request**
```http
GET /orders/user/user-abc-123
```

**Response** `200 OK`
```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "userId": "user-abc-123",
    "status": "DELIVERED",
    "totalAmount": 129.93,
    "items": [...],
    "createdAt": "2026-06-17T14:30:00",
    "updatedAt": "2026-06-18T10:00:00"
  }
]
```

---

### Update order status

**Request**
```http
PUT /orders/3fa85f64-5717-4562-b3fc-2c963f66afa6/status
Content-Type: application/json

{ "status": "CONFIRMED" }
```

**Response** `200 OK`
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "userId": "user-abc-123",
  "status": "CONFIRMED",
  "totalAmount": 129.93,
  "items": [...],
  "createdAt": "2026-06-17T14:30:00",
  "updatedAt": "2026-06-17T14:35:00"
}
```

**Invalid status value** `400 Bad Request`
```json
{ "error": "Invalid status value", "code": 400 }
```

---

### Health check

**Request**
```http
GET /health
```

**Response** `200 OK`
```json
{ "status": "ok", "service": "order-service" }
```

---

### Readiness probe

**Request**
```http
GET /ready
```

**Response** `200 OK` (database reachable)
```json
{ "status": "ok" }
```

**Response** `503 Service Unavailable` (database unreachable)
```json
{ "status": "unavailable", "error": "database unreachable" }
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8083` | HTTP port the service listens on |
| `DB_HOST` | `localhost` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `shopkube` | Database name |
| `DB_USER` | `shopkube` | Database username |
| `DB_PASSWORD` | `shopkube_pass` | Database password |
| `RABBITMQ_HOST` | `localhost` | RabbitMQ hostname |
| `RABBITMQ_PORT` | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_USER` | `shopkube` | RabbitMQ username |
| `RABBITMQ_PASSWORD` | `shopkube_pass` | RabbitMQ password |

---

## Running with Docker

### Build the image

```bash
docker build -t shopkube/order-service:latest .
```

### Run standalone (requires external PostgreSQL and RabbitMQ)

```bash
docker run -p 8083:8083 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=shopkube \
  -e DB_USER=shopkube \
  -e DB_PASSWORD=shopkube_pass \
  -e RABBITMQ_HOST=host.docker.internal \
  -e RABBITMQ_USER=shopkube \
  -e RABBITMQ_PASSWORD=shopkube_pass \
  shopkube/order-service:latest
```

### Run with Docker Compose (from repo root)

```bash
docker-compose up --build order-service
```

---

## Running Locally (without Docker)

Prerequisites: Java 21, Maven 3.9+, a running PostgreSQL instance, a running RabbitMQ instance.

```bash
# Export environment variables (or rely on defaults)
export DB_HOST=localhost
export RABBITMQ_HOST=localhost

# Build and run
mvn spring-boot:run
```

---

## RabbitMQ Events

### Exchange

| Property | Value |
|----------|-------|
| Name | `shopkube.events` |
| Type | Topic |
| Durable | true |

### Published events

#### `order.created`

Routing key: `order.created`

Published immediately after a new order is persisted.

```json
{
  "event_type": "order.created",
  "order_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "user_id": "user-abc-123",
  "total_amount": 129.93,
  "status": "PENDING",
  "created_at": "2026-06-17T14:30:00"
}
```

Consumed by:
- **notification-service** — sends order confirmation email/SMS to the customer
- **inventory-service** — reserves stock for each line item
- **analytics-service** — records the purchase event for dashboards

---

## Database Schema

Hibernate manages the schema automatically (`ddl-auto: update`). The two tables created are:

```sql
CREATE TABLE orders (
    id          UUID PRIMARY KEY,
    user_id     VARCHAR NOT NULL,
    status      VARCHAR NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL
);

CREATE TABLE order_items (
    id           UUID PRIMARY KEY,
    order_id     UUID NOT NULL REFERENCES orders(id),
    product_id   VARCHAR NOT NULL,
    product_name VARCHAR NOT NULL,
    quantity     INTEGER NOT NULL,
    unit_price   NUMERIC(10,2) NOT NULL,
    subtotal     NUMERIC(10,2) NOT NULL
);
```

---

## Error Responses

All errors follow the standard ShopKube envelope:

```json
{ "error": "<human-readable message>", "code": <HTTP status code> }
```

| HTTP Status | When |
|-------------|------|
| `400` | Missing or invalid request fields |
| `404` | Order UUID not found |
| `503` | Database unavailable (readiness probe only) |
