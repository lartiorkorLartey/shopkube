# API Gateway

Node.js / Express reverse proxy that routes all external traffic to the appropriate downstream service.

## Port

8080

## Routes

| Path | Upstream Service | Port |
|------|-----------------|------|
| `/api/users/*` | user-service | 8081 |
| `/api/products/*` | product-service | 8082 |
| `/api/orders/*` | order-service | 8083 |
| `/api/cart/*` | cart-service | 8084 |
| `/api/reviews/*` | review-service | 8087 |
| `/api/analytics/*` | analytics-service | 8088 |

## Special Endpoints

- `GET /health` — liveness check: returns `{ "status": "ok", "service": "api-gateway" }`
- `GET /ready` — readiness check: pings all downstream `/health` endpoints and returns aggregate status

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Listen port |
| `USER_SERVICE_URL` | `http://user-service:8081` | User service base URL |
| `PRODUCT_SERVICE_URL` | `http://product-service:8082` | Product service base URL |
| `ORDER_SERVICE_URL` | `http://order-service:8083` | Order service base URL |
| `CART_SERVICE_URL` | `http://cart-service:8084` | Cart service base URL |
| `REVIEW_SERVICE_URL` | `http://review-service:8087` | Review service base URL |
| `ANALYTICS_SERVICE_URL` | `http://analytics-service:8088` | Analytics service base URL |

## Middleware

- **morgan** — structured JSON request logging (method, URL, status, response time, remote address)
- **express-rate-limit** — 100 requests per 15 minutes per IP; responds with `429` when exceeded

## Error Responses

All errors follow the standard envelope:

```json
{ "error": "<message>", "code": <http_status_int> }
```

Proxy errors to unreachable upstreams return `502 Bad Gateway`.

## Local Development

```bash
npm install
npm run dev
```

The dev script uses `nodemon` for automatic restarts on file changes.

Override upstream URLs via environment variables to point at locally running services:

```bash
USER_SERVICE_URL=http://localhost:8081 \
PRODUCT_SERVICE_URL=http://localhost:8082 \
npm run dev
```

## Docker

```bash
# Build
docker build -t shopkube/api-gateway .

# Run
docker run -p 8080:8080 shopkube/api-gateway

# Run with custom upstream URLs
docker run -p 8080:8080 \
  -e USER_SERVICE_URL=http://host.docker.internal:8081 \
  -e PRODUCT_SERVICE_URL=http://host.docker.internal:8082 \
  shopkube/api-gateway
```

## Kubernetes

The gateway is deployed as a `LoadBalancer` (or `NodePort`) service so it is reachable from outside the cluster. All other services use `ClusterIP`. Refer to `k8s/deployments/api-gateway.yaml` and `k8s/services/api-gateway.yaml`.
