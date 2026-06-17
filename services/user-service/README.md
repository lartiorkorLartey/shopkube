# user-service

The **user-service** handles user registration, authentication, and profile management for ShopKube. It is written in Go using the Gin web framework and stores user data in PostgreSQL. JWT tokens are issued on login and required for protected endpoints.

---

## Port

**8081**

---

## API Endpoints

| Method | Path               | Auth Required | Description                     |
|--------|--------------------|---------------|---------------------------------|
| GET    | /health            | No            | Liveness check                  |
| GET    | /ready             | No            | Readiness check (DB ping)       |
| POST   | /users/register    | No            | Register a new user             |
| POST   | /users/login       | No            | Login and receive a JWT token   |
| GET    | /users/:id         | Yes (JWT)     | Get a user's profile            |
| PUT    | /users/:id         | Yes (JWT)     | Update a user's display name    |

### Request / Response shapes

#### POST /users/register

Request body:
```json
{
  "email": "alice@example.com",
  "password": "supersecret123",
  "name": "Alice"
}
```

Response `201 Created`:
```json
{
  "id": 1,
  "email": "alice@example.com",
  "name": "Alice",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### POST /users/login

Request body:
```json
{
  "email": "alice@example.com",
  "password": "supersecret123"
}
```

Response `200 OK`:
```json
{
  "token": "<JWT>",
  "user": {
    "id": 1,
    "email": "alice@example.com",
    "name": "Alice",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### GET /users/:id

Header: `Authorization: Bearer <JWT>`

Response `200 OK`:
```json
{
  "id": 1,
  "email": "alice@example.com",
  "name": "Alice",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### PUT /users/:id

Header: `Authorization: Bearer <JWT>`

Request body:
```json
{
  "name": "Alice Smith"
}
```

Response `200 OK`:
```json
{
  "id": 1,
  "email": "alice@example.com",
  "name": "Alice Smith",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### GET /health

Response `200 OK`:
```json
{ "status": "ok", "service": "user-service" }
```

#### GET /ready

Response `200 OK` (when DB is reachable):
```json
{ "status": "ok" }
```

Response `503 Service Unavailable` (when DB is down):
```json
{ "status": "unavailable", "error": "database unreachable" }
```

### Error responses

All errors follow this shape:
```json
{ "error": "<message>", "code": <http-status-int> }
```

---

## Environment Variables

| Variable      | Default              | Description                              |
|---------------|----------------------|------------------------------------------|
| `PORT`        | `8081`               | Port the service listens on              |
| `DB_HOST`     | `localhost`          | PostgreSQL host                          |
| `DB_PORT`     | `5432`               | PostgreSQL port                          |
| `DB_NAME`     | `shopkube`           | PostgreSQL database name                 |
| `DB_USER`     | `shopkube`           | PostgreSQL user                          |
| `DB_PASSWORD` | `shopkube_pass`      | PostgreSQL password                      |
| `JWT_SECRET`  | `changeme-jwt-secret`| Secret used to sign JWT tokens           |
| `LOG_LEVEL`   | `info`               | Log verbosity (`info` or `debug`)        |
| `GIN_MODE`    | `release`            | Gin mode (`release` or `debug`)          |

---

## Local Development

### Prerequisites

- Go 1.22+
- PostgreSQL 14+ running locally (or via Docker)

### Start a local PostgreSQL instance

```bash
docker run -d \
  --name shopkube-postgres \
  -e POSTGRES_DB=shopkube \
  -e POSTGRES_USER=shopkube \
  -e POSTGRES_PASSWORD=shopkube_pass \
  -p 5432:5432 \
  postgres:16-alpine
```

### Run the service

```bash
cd services/user-service
go mod download
go run main.go
```

The schema (`users` table) is created automatically on startup.

### Run with custom config

```bash
PORT=9090 DB_HOST=myhost JWT_SECRET=my-secret go run main.go
```

---

## Docker Usage

### Build the image

```bash
docker build -t shopkube/user-service:latest .
```

### Run the container

```bash
docker run -d \
  --name user-service \
  -p 8081:8081 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=shopkube \
  -e DB_USER=shopkube \
  -e DB_PASSWORD=shopkube_pass \
  -e JWT_SECRET=my-secure-secret \
  shopkube/user-service:latest
```

### Docker Compose (full stack)

From the repo root:

```bash
docker-compose up --build user-service
```

---

## Example curl Requests

### Register a user

```bash
curl -s -X POST http://localhost:8081/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"supersecret123","name":"Alice"}' | jq .
```

### Login

```bash
TOKEN=$(curl -s -X POST http://localhost:8081/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"supersecret123"}' | jq -r '.token')
echo "Token: $TOKEN"
```

### Get profile (authenticated)

```bash
curl -s http://localhost:8081/users/1 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Update display name (authenticated)

```bash
curl -s -X PUT http://localhost:8081/users/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Smith"}' | jq .
```

### Health check

```bash
curl -s http://localhost:8081/health | jq .
```

### Readiness check

```bash
curl -s http://localhost:8081/ready | jq .
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

The table is created automatically on first startup. Passwords are hashed with bcrypt (cost 12) and are never returned in any API response.

---

## Security Notes

- Passwords are hashed with bcrypt at cost factor 12 before storage.
- JWT tokens expire after 24 hours.
- Users can only read or update their own profile — attempting to access another user's ID returns `403 Forbidden`.
- The `JWT_SECRET` environment variable **must** be changed from the default before any production or shared deployment.
