# Product Service

The Product Service manages the ShopKube product catalog. It provides CRUD operations for products and supports filtering by category and full-text search by name or description. Backed by MongoDB via the async Motor driver.

- **Language:** Python 3.12
- **Framework:** FastAPI
- **Database:** MongoDB
- **Port:** 8082

---

## API Endpoints

### Health & Readiness

```bash
# Liveness probe
curl http://localhost:8082/health

# Readiness probe (checks MongoDB connectivity)
curl http://localhost:8082/ready
```

**Responses:**
```json
{ "status": "ok", "service": "product-service" }
{ "status": "ok" }
```

---

### List Products

`GET /products`

Optional query parameters:

| Parameter  | Type   | Description                                      |
|------------|--------|--------------------------------------------------|
| `category` | string | Filter by category (case-insensitive, partial)   |
| `search`   | string | Search name and description (case-insensitive)   |

```bash
# All products
curl http://localhost:8082/products

# Filter by category
curl "http://localhost:8082/products?category=Electronics"

# Search by keyword
curl "http://localhost:8082/products?search=laptop"

# Combine filters
curl "http://localhost:8082/products?category=Books&search=rust"
```

**Response:** `200 OK` — array of product objects.

```json
[
  {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "ProBook Laptop 15",
    "description": "High-performance laptop with Intel Core i7...",
    "price": 1299.99,
    "category": "Electronics",
    "stock": 50,
    "sku": "ELEC-LAP-001",
    "image_url": "https://example.com/images/laptop.jpg",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

---

### Get Product by ID

`GET /products/{product_id}`

```bash
curl http://localhost:8082/products/664f1a2b3c4d5e6f7a8b9c0d
```

**Response:** `200 OK` — single product object.

**Errors:**
- `400` — invalid product ID format
- `404` — product not found

---

### Create Product

`POST /products`

```bash
curl -X POST http://localhost:8082/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wireless Keyboard",
    "description": "Compact wireless keyboard with backlit keys and 12-month battery life.",
    "price": 79.99,
    "category": "Electronics",
    "stock": 60,
    "sku": "ELEC-KBD-002",
    "image_url": "https://example.com/images/keyboard.jpg"
  }'
```

**Response:** `201 Created` — the created product object with generated `id`, `created_at`, and `updated_at`.

**Errors:**
- `422` — validation error (missing required fields)

---

### Update Product

`PUT /products/{product_id}`

All fields are optional. Only provided fields are updated.

```bash
# Update price and stock
curl -X PUT http://localhost:8082/products/664f1a2b3c4d5e6f7a8b9c0d \
  -H "Content-Type: application/json" \
  -d '{
    "price": 1199.99,
    "stock": 45
  }'

# Update description only
curl -X PUT http://localhost:8082/products/664f1a2b3c4d5e6f7a8b9c0d \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description with new details."
  }'
```

**Response:** `200 OK` — the updated product object.

**Errors:**
- `400` — invalid product ID or no fields provided
- `404` — product not found

---

### Delete Product

`DELETE /products/{product_id}`

```bash
curl -X DELETE http://localhost:8082/products/664f1a2b3c4d5e6f7a8b9c0d
```

**Response:** `204 No Content`

**Errors:**
- `400` — invalid product ID format
- `404` — product not found

---

## Environment Variables

| Variable      | Default                        | Description                        |
|---------------|--------------------------------|------------------------------------|
| `MONGODB_URL` | `mongodb://localhost:27017`    | MongoDB connection string          |
| `MONGODB_DB`  | `shopkube`                     | MongoDB database name              |
| `PORT`        | `8082`                         | Port the service listens on        |
| `LOG_LEVEL`   | `INFO`                         | Logging level (DEBUG/INFO/WARNING) |

---

## Running Locally

### Prerequisites

- Python 3.12+
- MongoDB running on `localhost:27017` (or set `MONGODB_URL`)

### Install and run

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py

# Or via uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8082 --reload
```

### Seed sample data

Inserts 20 products across 4 categories (Electronics, Clothing, Books, Home & Garden). Clears existing products first.

```bash
python seed.py

# With a custom MongoDB URL
MONGODB_URL=mongodb://user:pass@host:27017 python seed.py
```

Expected output:

```
Cleared existing products
Inserted 20 products
  Electronics: 5 products
  Clothing: 5 products
  Books: 5 products
  Home & Garden: 5 products
Seeding complete!
```

---

## Running with Docker

### Build

```bash
docker build -t shopkube/product-service:latest .
```

### Run

```bash
docker run -d \
  --name product-service \
  -p 8082:8082 \
  -e MONGODB_URL=mongodb://mongo:27017 \
  -e MONGODB_DB=shopkube \
  shopkube/product-service:latest
```

### Run with Docker Compose

From the project root:

```bash
docker-compose up product-service
```

### Seed data inside Docker

```bash
docker run --rm \
  -e MONGODB_URL=mongodb://mongo:27017 \
  shopkube/product-service:latest \
  python seed.py
```

---

## Interactive API Docs

When the service is running, FastAPI provides auto-generated docs:

- Swagger UI: [http://localhost:8082/docs](http://localhost:8082/docs)
- ReDoc: [http://localhost:8082/redoc](http://localhost:8082/redoc)

---

## Error Response Format

All errors follow the standard ShopKube format:

```json
{
  "detail": "<error message>"
}
```

HTTP status codes used:

| Code | Meaning              |
|------|----------------------|
| 200  | OK                   |
| 201  | Created              |
| 204  | No Content (delete)  |
| 400  | Bad Request          |
| 404  | Not Found            |
| 422  | Validation Error     |
| 503  | Service Unavailable  |
