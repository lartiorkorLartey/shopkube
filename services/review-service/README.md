# review-service

Ruby on Rails (API mode) microservice for ShopKube. Handles product reviews and ratings, backed by PostgreSQL.

## Overview

- **Language:** Ruby 3.3
- **Framework:** Rails 7.1 (API mode)
- **Database:** PostgreSQL
- **Port:** 8087

## API Endpoints

### Health

```bash
# Liveness probe
curl http://localhost:8087/health
# {"status":"ok","service":"review-service"}

# Readiness probe (checks DB connectivity)
curl http://localhost:8087/ready
# {"status":"ok"}
```

### Reviews

#### List reviews for a product

```bash
curl "http://localhost:8087/reviews?product_id=prod-electronics-001"
```

Response:
```json
[
  {
    "id": 1,
    "user_id": "user-001",
    "product_id": "prod-electronics-001",
    "rating": 5,
    "body": "Absolutely amazing laptop!",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Create a review

```bash
curl -X POST http://localhost:8087/reviews \
  -H "Content-Type: application/json" \
  -d '{
    "review": {
      "user_id": "user-042",
      "product_id": "prod-electronics-001",
      "rating": 4,
      "body": "Great product, very satisfied with the purchase."
    }
  }'
```

Response (201 Created):
```json
{
  "id": 16,
  "user_id": "user-042",
  "product_id": "prod-electronics-001",
  "rating": 4,
  "body": "Great product, very satisfied with the purchase.",
  "created_at": "2024-06-17T12:00:00.000Z",
  "updated_at": "2024-06-17T12:00:00.000Z"
}
```

#### Delete a review

```bash
curl -X DELETE http://localhost:8087/reviews/16
# 204 No Content
```

#### Get rating summary for a product

```bash
curl http://localhost:8087/reviews/summary/prod-electronics-001
```

Response:
```json
{
  "product_id": "prod-electronics-001",
  "average_rating": 4.2,
  "total_reviews": 5
}
```

## Error Responses

All errors follow this format:

```json
{ "error": "<human-readable message>", "code": <http-status-int> }
```

| Status | Scenario |
|--------|----------|
| 400    | Missing required query parameter |
| 404    | Review not found |
| 422    | Validation failure (missing fields, rating out of 1-5 range) |
| 503    | Database unavailable (readiness probe) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection URL, e.g. `postgres://user:pass@host:5432/dbname` |
| `RAILS_ENV` | No | `development` | Rails environment (`development`, `production`, `test`) |
| `PORT` | No | `8087` | Port Puma listens on |
| `RAILS_MAX_THREADS` | No | `5` | Puma thread pool size (also sets DB pool size) |
| `RAILS_MIN_THREADS` | No | same as MAX | Puma minimum threads |
| `WEB_CONCURRENCY` | No | `2` | Number of Puma worker processes |
| `PIDFILE` | No | `tmp/pids/server.pid` | Path to Puma PID file |
| `SECRET_KEY_BASE` | Yes (production) | — | Rails secret key base |

## Running Locally

### With Docker

```bash
# Build
docker build -t review-service .

# Run (requires a reachable PostgreSQL instance)
docker run -p 8087:8087 \
  -e DATABASE_URL=postgres://postgres:password@host.docker.internal:5432/shopkube_reviews \
  -e RAILS_ENV=production \
  -e SECRET_KEY_BASE=changeme_at_least_64_chars_long_for_production_use \
  review-service
```

### With Docker Compose (from repo root)

```bash
docker-compose up review-service
```

### Bare Ruby

```bash
bundle install
export DATABASE_URL=postgres://postgres:password@localhost:5432/shopkube_reviews_development
bundle exec rails db:create db:migrate
bundle exec rails server -p 8087
```

## Seeding Data

Populates 15 sample reviews across three products (`prod-electronics-001`, `prod-clothing-001`, `prod-books-001`):

```bash
bundle exec rails db:seed
# Created 15 reviews for 3 products
```

Or inside the running container:

```bash
docker exec -it <container_id> bundle exec rails db:seed
```

## Validation Rules

The `Review` model enforces:

- `user_id` — required
- `product_id` — required
- `body` — required, non-blank text
- `rating` — required integer, must be in range 1..5

## Kubernetes Resources

Manifests live in the repo root under `k8s/`:

| File | Purpose |
|------|---------|
| `k8s/deployments/review-service.yaml` | Deployment (2 replicas, liveness/readiness probes) |
| `k8s/services/review-service.yaml` | ClusterIP Service on port 8087 |
| `k8s/configmaps/review-service-config.yaml` | Non-sensitive config (RAILS_ENV, PORT, etc.) |
| `k8s/secrets/review-service-secret.yaml` | DATABASE_URL, SECRET_KEY_BASE |

Other services reach this service at `http://review-service:8087` inside the cluster.
