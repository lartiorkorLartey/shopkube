# ShopKube — Kubernetes Learning Microservices Platform

ShopKube is a polyglot e-commerce platform built for hands-on Kubernetes learning. Nine independently
deployable services, written in six different languages, communicate over REST and RabbitMQ. Run the
whole stack locally with Docker Compose, then graduate to a real Kubernetes cluster using the
included manifests.

---

## Architecture

```
                        ┌──────────────────────┐
                        │     API Gateway       │  Node.js / Express  :8080
                        └──────────┬───────────┘
                                   │
        ┌──────────┬───────────────┼───────────────┬─────────────┐
        │          │               │               │             │
  ┌─────▼───┐ ┌────▼────┐  ┌──────▼─────┐  ┌─────▼───┐ ┌──────▼──────┐
  │  User   │ │Product  │  │   Order    │  │  Cart   │ │Notification │
  │Service  │ │Service  │  │  Service   │  │ Service │ │  Service    │
  │ Go/Gin  │ │ Python/ │  │  Java/     │  │ Node.js/│ │  Python/    │
  │  :8081  │ │ FastAPI │  │ Spring Boot│  │ Fastify │ │   Celery    │
  │         │ │  :8082  │  │   :8083    │  │  :8084  │ │   :8085     │
  └─────────┘ └─────────┘  └────────────┘  └─────────┘ └─────────────┘
        │          │               │               │
  ┌─────▼──────────▼───────────────▼───────────────▼──────────────┐
  │                    Message Bus (RabbitMQ :5672)                │
  └──────────────────────────────────────────────────────────------┘
        │                          │
  ┌─────▼────┐             ┌───────▼──────┐
  │Inventory │             │    Review    │
  │ Service  │             │   Service    │
  │  Rust/   │             │  Ruby/Rails  │
  │  Actix   │             │    :8087     │
  │  :8086   │             └──────┬───────┘
  └──────────┘                    │
                           ┌──────▼───────┐
                           │  Analytics   │
                           │   Service    │
                           │   Go/Chi     │
                           │    :8088     │
                           └──────────────┘

  Shared Infrastructure
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │PostgreSQL│  │ MongoDB  │  │  Redis   │  │RabbitMQ  │
  │  :5432   │  │  :27017  │  │  :6379   │  │  :5672   │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## Services

| Service | Language / Framework | Port | Responsibility |
|---|---|---|---|
| **api-gateway** | Node.js / Express | 8080 | Route traffic to all downstream services |
| **user-service** | Go / Gin | 8081 | Authentication, registration, user profiles |
| **product-service** | Python / FastAPI | 8082 | Product catalog, search, categories |
| **order-service** | Java / Spring Boot | 8083 | Order lifecycle management |
| **cart-service** | Node.js / Fastify | 8084 | Shopping cart, Redis-backed sessions |
| **notification-service** | Python / Celery + Flask | 8085 | Email and SMS event notifications |
| **inventory-service** | Rust / Actix-web | 8086 | Stock levels and reservations |
| **review-service** | Ruby / Rails (API mode) | 8087 | Product reviews and ratings |
| **analytics-service** | Go / Chi | 8088 | Event tracking and dashboards |

---

## Infrastructure Components

| Component | Purpose |
|---|---|
| **PostgreSQL 16** | Primary relational database for user, order, inventory, and review services |
| **MongoDB 7** | Document store for the product catalog |
| **Redis 7** | Cart session storage and general-purpose caching |
| **RabbitMQ 3.13** | Async message bus for order events, notifications, and analytics |
| **Prometheus** | Metrics scraping from all services |
| **Grafana** | Pre-built dashboards for service metrics |

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Docker | >= 24 |
| Docker Compose | >= 2.20 |
| kubectl | >= 1.28 |
| kind | >= 0.22 |
| make | any recent version |

---

## Quick Start

### Option A — Docker Compose (recommended for first run)

```bash
git clone https://github.com/your-org/shopkube.git
cd shopkube

# Build all service images
make build

# Start the full stack (detached)
make up

# Seed product catalog, reviews, and inventory
bash scripts/seed-all.sh

# Smoke-test every endpoint
bash scripts/test-endpoints.sh
```

The API Gateway is available at **http://localhost:8080**.

Individual service ports are also exposed — see the Services table above.

RabbitMQ management console: **http://localhost:15672** (user: `shopkube`, pass: `shopkube_pass`)

### Option B — Kubernetes with Kind

```bash
# Create a local cluster
kind create cluster --name shopkube

# Deploy all manifests
make k8s-up

# Add the ingress hostname to /etc/hosts
echo "127.0.0.1 shopkube.local" | sudo tee -a /etc/hosts

# Access the platform via the ingress
curl http://shopkube.local/api/products
```

---

## Useful Commands

| Command | Description |
|---|---|
| `make build` | Build all Docker images |
| `make up` | Start the full stack with Docker Compose |
| `make down` | Stop and remove containers |
| `make logs SERVICE=api-gateway` | Tail logs for a specific service |
| `make k8s-up` | Deploy all manifests to the active cluster |
| `make k8s-down` | Delete the shopkube namespace and all resources |
| `make k8s-status` | Show all pods, services, and deployments in the namespace |

---

## Learning Goals

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

## Project Structure

```
shopkube/
├── CLAUDE.md
├── docker-compose.yml
├── Makefile
├── README.md
├── scripts/
│   ├── seed-all.sh          # Populate services with sample data
│   └── test-endpoints.sh    # Smoke-test every health + business endpoint
├── services/
│   ├── api-gateway/         # Node.js / Express
│   ├── user-service/        # Go / Gin
│   ├── product-service/     # Python / FastAPI
│   ├── order-service/       # Java / Spring Boot
│   ├── cart-service/        # Node.js / Fastify
│   ├── notification-service/# Python / Celery + Flask
│   ├── inventory-service/   # Rust / Actix-web
│   ├── review-service/      # Ruby / Rails
│   └── analytics-service/  # Go / Chi
└── k8s/
    ├── namespace.yaml
    ├── configmaps/
    ├── secrets/
    ├── persistent-volumes/
    ├── deployments/
    ├── services/
    ├── ingress/
    └── monitoring/
```

---

## License

MIT
