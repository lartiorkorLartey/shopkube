# Cart Service

Node.js / Fastify shopping cart service backed by Redis.

## Port

`8084`

## Storage

Redis — keys: `cart:{userId}`, TTL: 7 days (604800 seconds by default).

Each cart is stored as a single JSON value under the key. There is no separate index; fetching
a non-existent cart returns an empty cart rather than an error.

## Cart Structure

```json
{
  "userId": "user-123",
  "items": [
    { "productId": "prod-abc", "name": "Widget", "price": 9.99, "quantity": 2 }
  ],
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /cart/:userId | Get cart contents |
| POST | /cart/:userId/items | Add item (or increment quantity if already present) |
| PUT | /cart/:userId/items/:productId | Set item quantity (0 or negative removes the item) |
| DELETE | /cart/:userId/items/:productId | Remove a single item |
| DELETE | /cart/:userId | Clear entire cart |
| GET | /health | Liveness check |
| GET | /ready | Readiness check (pings Redis) |

## Example Requests

### Get cart

```bash
curl http://localhost:8084/cart/user-123
```

### Add item to cart

```bash
curl -X POST http://localhost:8084/cart/user-123/items \
  -H "Content-Type: application/json" \
  -d '{"productId":"prod-abc","name":"Widget","price":9.99,"quantity":2}'
```

### Update item quantity

```bash
curl -X PUT http://localhost:8084/cart/user-123/items/prod-abc \
  -H "Content-Type: application/json" \
  -d '{"quantity":5}'
```

Set `quantity` to `0` or any negative integer to remove the item.

### Remove a single item

```bash
curl -X DELETE http://localhost:8084/cart/user-123/items/prod-abc
```

### Clear the entire cart

```bash
curl -X DELETE http://localhost:8084/cart/user-123
```

### Health check

```bash
curl http://localhost:8084/health
# {"status":"ok","service":"cart-service"}
```

### Readiness check

```bash
curl http://localhost:8084/ready
# {"status":"ok"}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8084 | Listen port |
| REDIS_URL | redis://localhost:6379 | Redis connection URL |
| CART_TTL_SECONDS | 604800 | Cart key expiry in seconds (7 days) |
| LOG_LEVEL | info | Fastify/pino log level |

## Docker

### Build

```bash
docker build -t shopkube/cart-service .
```

### Run (requires a reachable Redis instance)

```bash
docker run --rm -p 8084:8084 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  shopkube/cart-service
```

### Run with Docker Compose (from repo root)

```bash
docker-compose up cart-service
```

## Local Development

```bash
# Install dependencies
npm install

# Start with live-reload (requires nodemon)
npm run dev

# Or start normally
npm start
```

A local Redis instance must be available at `redis://localhost:6379` (or set `REDIS_URL`).

```bash
# Quick Redis via Docker
docker run -d -p 6379:6379 redis:7-alpine
```

## Error Responses

All errors follow the format:

```json
{ "error": "<message>", "code": <http-status-int> }
```

Common status codes:

| Code | Meaning |
|------|---------|
| 400 | Validation error (missing/invalid body fields) |
| 404 | Item not found in cart |
| 503 | Redis unavailable (readiness probe only) |
