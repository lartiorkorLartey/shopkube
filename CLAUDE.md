# CLAUDE.md — Kubernetes Learning Microservices App

## Project Overview

This is a **polyglot microservices application** designed for Kubernetes learning and practice.
The app simulates an **e-commerce platform** (ShopKube) with independently deployable services
written in different languages and frameworks. Each service is intentionally self-contained so
you can study, break, scale, and debug them in isolation.

---

## Architecture Summary

```
                          ┌─────────────────────┐
                          │    API Gateway        │  Node.js / Express
                          │    (Port 8080)        │
                          └────────┬────────────--┘
                                   │
          ┌──────────┬─────────────┼──────────────┬────────────┐
          │          │             │              │            │
    ┌─────▼───┐ ┌────▼────┐ ┌─────▼────┐ ┌──────▼──┐ ┌──────▼──────┐
    │  User   │ │Product  │ │  Order   │ │  Cart   │ │Notification │
    │Service  │ │Service  │ │ Service  │ │ Service │ │  Service    │
    │(Go/Gin) │ │(Python/ │ │ (Java/  │ │(Node.js/│ │ (Python/    │
    │         │ │FastAPI) │ │ Spring) │ │Express) │ │ Celery)     │
    └─────────┘ └─────────┘ └──────---┘ └─────────┘ └─────────────┘
          │          │             │              │
    ┌─────▼──────────▼─────────────▼──────────────▼────────────┐
    │                      Message Bus (RabbitMQ)               │
    └──────────────────────────────────────────────────────────-┘
          │                        │
    ┌─────▼────┐           ┌───────▼──────┐
    │ Inventory│           │   Review     │
    │ Service  │           │   Service    │
    │ (Rust/   │           │  (Ruby/Rails)│
    │ Actix)   │           │              │
    └──────────┘           └──────────────┘
                                   │
                           ┌───────▼──────┐
                           │  Analytics   │
                           │  Service     │
                           │ (Go/Chi)     │
                           └──────────────┘
```

---

## Services

| # | Service | Language | Framework | Port | Responsibility |
|---|---------|----------|-----------|------|----------------|
| 1 | **api-gateway** | Node.js | Express | 8080 | Route traffic to all services |
| 2 | **user-service** | Go | Gin | 8081 | Auth, registration, profiles |
| 3 | **product-service** | Python | FastAPI | 8082 | Product catalog, search |
| 4 | **order-service** | Java | Spring Boot | 8083 | Order lifecycle management |
| 5 | **cart-service** | Node.js | Fastify | 8084 | Shopping cart (Redis-backed) |
| 6 | **notification-service** | Python | Celery + Flask | 8085 | Email/SMS event notifications |
| 7 | **inventory-service** | Rust | Actix-web | 8086 | Stock levels, reservations |
| 8 | **review-service** | Ruby | Rails (API mode) | 8087 | Product reviews & ratings |
| 9 | **analytics-service** | Go | Chi | 8088 | Event tracking, dashboards |

---

## Infrastructure Components

| Component | Purpose |
|-----------|---------|
| **PostgreSQL** | Primary DB for user, order, review services |
| **MongoDB** | Product catalog storage |
| **Redis** | Cart session storage, caching |
| **RabbitMQ** | Async messaging between services |
| **Prometheus** | Metrics scraping |
| **Grafana** | Metrics dashboards |

---

## Repository Structure

```
shopkube/
├── CLAUDE.md
├── services/
│   ├── api-gateway/          # Node.js/Express
│   ├── user-service/         # Go/Gin
│   ├── product-service/      # Python/FastAPI
│   ├── order-service/        # Java/Spring Boot
│   ├── cart-service/         # Node.js/Fastify
│   ├── notification-service/ # Python/Celery
│   ├── inventory-service/    # Rust/Actix-web
│   ├── review-service/       # Ruby/Rails
│   └── analytics-service/   # Go/Chi
├── k8s/
│   ├── namespace.yaml
│   ├── configmaps/
│   ├── secrets/
│   ├── deployments/
│   ├── services/
│   ├── ingress/
│   └── monitoring/
├── docker-compose.yml        # Local dev without K8s
└── README.md
```

---

## Code Standards Per Service

### Every service MUST have:
1. `Dockerfile` — multi-stage build, non-root user
2. `README.md` — setup, env vars, API endpoints
3. Health check endpoint: `GET /health` → `{ "status": "ok", "service": "<name>" }`
4. Readiness probe endpoint: `GET /ready`
5. Structured JSON logging
6. Graceful shutdown handling
7. Environment-based configuration (no hardcoded values)

### Every service API MUST follow:
- RESTful conventions
- Return `application/json`
- Include error responses: `{ "error": "<message>", "code": <int> }`
- Use HTTP status codes correctly

---

## Kubernetes Manifests

Each service needs these K8s resources in `k8s/`:

### Deployment (`k8s/deployments/<service>.yaml`)
- `replicas: 2`
- Resource requests and limits defined
- `livenessProbe` on `/health`
- `readinessProbe` on `/ready`
- Environment variables from ConfigMaps and Secrets

### Service (`k8s/services/<service>.yaml`)
- Type: `ClusterIP` (internal) for all services except api-gateway
- api-gateway: Type `LoadBalancer` or `NodePort`

### ConfigMap (`k8s/configmaps/<service>-config.yaml`)
- Non-sensitive configuration

### Secret (`k8s/secrets/<service>-secret.yaml`)
- Passwords, API keys (use placeholder values)

---

## Local Development

### Option A — Docker Compose (recommended for first run)
```bash
docker-compose up --build
```

### Option B — Kubernetes with Kind
```bash
kind create cluster --name shopkube
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmaps/
kubectl apply -f k8s/secrets/
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
```

---

## Learning Goals This App Covers

- [ ] Deploying multi-container apps to Kubernetes
- [ ] ConfigMaps and Secrets management
- [ ] Service discovery and DNS within a cluster
- [ ] Horizontal Pod Autoscaling (HPA)
- [ ] Rolling updates and rollbacks
- [ ] Liveness and readiness probes
- [ ] Persistent Volumes for stateful services
- [ ] Inter-service communication (sync REST + async messaging)
- [ ] Ingress controllers and routing
- [ ] Monitoring with Prometheus and Grafana
- [ ] Namespace isolation

---

## Notes for Claude Code

- Generate ALL services completely — do not stub or skip implementation
- Each service must be independently runnable (`docker build` and `docker run` should work)
- Use realistic but simple business logic — this is for learning, not production
- Seed data scripts are welcome (e.g. populate products, create test users)
- Keep dependencies minimal per service — avoid unnecessary complexity
- All inter-service HTTP calls should use service DNS names (e.g. `http://user-service:8081`)
- Prefer environment variables for all service URLs and credentials