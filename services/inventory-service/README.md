# inventory-service

Stock level management and reservation system for ShopKube. Written in Rust using Actix-web and PostgreSQL.

## Port

`8086`

## Responsibilities

- Track stock quantities per product
- Reserve stock when an order is placed (preventing overselling)
- Release reserved stock when an order is cancelled or fulfilled
- Report available quantity (total minus reserved)

## Database Schema

```sql
CREATE TABLE inventory (
    id          SERIAL PRIMARY KEY,
    product_id  VARCHAR(255) UNIQUE NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 0,   -- total units in stock
    reserved    INTEGER NOT NULL DEFAULT 0,   -- units held by pending orders
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_product_id ON inventory(product_id);
```

`available = quantity - reserved`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8086` | HTTP listen port |
| `DATABASE_URL` | `postgres://shopkube:shopkube_pass@localhost:5432/shopkube` | PostgreSQL connection string |
| `LOG_LEVEL` | `info` | Log verbosity (`trace`, `debug`, `info`, `warn`, `error`) |
| `RUST_LOG` | — | Fine-grained tracing filter (overrides `LOG_LEVEL`) |

## API Endpoints

### Health & Readiness

```
GET /health   — liveness probe; always returns 200 if the process is alive
GET /ready    — readiness probe; returns 200 only when the DB is reachable
```

### Inventory

#### Get stock levels for a product

```
GET /inventory/{productId}
```

Response `200 OK`:
```json
{
  "product_id": "prod-abc123",
  "quantity": 100,
  "reserved": 10,
  "available": 90
}
```

Response `404 Not Found`:
```json
{ "error": "Product prod-abc123 not found in inventory", "code": 404 }
```

#### Set (upsert) stock quantity for a product

```
PUT /inventory/{productId}
Content-Type: application/json

{ "quantity": 150 }
```

Creates the record if it does not exist; updates `quantity` if it does.
Reserved count is never modified by this endpoint.

Response `200 OK`:
```json
{
  "product_id": "prod-abc123",
  "quantity": 150,
  "reserved": 10,
  "available": 140
}
```

#### Reserve stock (e.g. when an order is placed)

```
POST /inventory/{productId}/reserve
Content-Type: application/json

{ "amount": 3 }
```

Atomically checks available stock and increments `reserved` by `amount`.
Returns `409 Conflict` when available stock is insufficient.

Response `200 OK`:
```json
{
  "product_id": "prod-abc123",
  "quantity": 150,
  "reserved": 13,
  "available": 137
}
```

Response `409 Conflict`:
```json
{
  "error": "Insufficient stock",
  "code": 409,
  "available": 2,
  "requested": 3
}
```

#### Release reserved stock (e.g. on order cancellation)

```
POST /inventory/{productId}/release
Content-Type: application/json

{ "amount": 3 }
```

Decrements `reserved` by `amount` (floored at 0 to guard against double-release).

Response `200 OK`:
```json
{
  "product_id": "prod-abc123",
  "quantity": 150,
  "reserved": 10,
  "available": 140
}
```

## curl Examples

```bash
BASE=http://localhost:8086

# Health check
curl "$BASE/health"

# Readiness check
curl "$BASE/ready"

# Seed a product with 100 units
curl -X PUT "$BASE/inventory/prod-abc123" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 100}'

# Check stock
curl "$BASE/inventory/prod-abc123"

# Reserve 5 units (order placed)
curl -X POST "$BASE/inventory/prod-abc123/reserve" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5}'

# Release 2 units (partial cancellation)
curl -X POST "$BASE/inventory/prod-abc123/release" \
  -H "Content-Type: application/json" \
  -d '{"amount": 2}'
```

## Running with Docker

### Build

```bash
docker build -t inventory-service:latest .
```

### Run (standalone, requires a reachable PostgreSQL instance)

```bash
docker run -p 8086:8086 \
  -e DATABASE_URL="postgres://shopkube:shopkube_pass@host.docker.internal:5432/shopkube" \
  inventory-service:latest
```

### Run with Docker Compose (recommended)

From the repository root:

```bash
docker-compose up --build inventory-service
```

## Running Locally (without Docker)

Requires the Rust toolchain (`rustup`) and a running PostgreSQL instance.

```bash
# From this directory
export DATABASE_URL="postgres://shopkube:shopkube_pass@localhost:5432/shopkube"
cargo run
```

The service automatically creates the `inventory` table and index on first start.

## Kubernetes

See `k8s/deployments/inventory-service.yaml`, `k8s/services/inventory-service.yaml`,
`k8s/configmaps/inventory-service-config.yaml`, and `k8s/secrets/inventory-service-secret.yaml`.

Inter-service calls from other pods should use:

```
http://inventory-service:8086
```
