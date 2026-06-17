#!/usr/bin/env bash
set -euo pipefail

echo "=== ShopKube Seed Script ==="

BASE_URL="${BASE_URL:-http://localhost}"

# Wait for services
echo "Waiting for services to be healthy..."
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088; do
  until curl -sf "${BASE_URL}:${port}/health" > /dev/null 2>&1; do
    echo "  Waiting for service on port ${port}..."
    sleep 2
  done
  echo "  Service on port ${port} is up"
done

# Seed products
echo ""
echo "Seeding product catalog..."
docker compose exec -T product-service python seed.py
echo "Products seeded."

# Seed reviews
echo ""
echo "Seeding reviews..."
docker compose exec -T review-service bundle exec rails db:seed RAILS_ENV=production
echo "Reviews seeded."

# Seed inventory for product IDs
echo ""
echo "Seeding inventory..."
# Get first few product IDs and create inventory records
PRODUCT_IDS=$(curl -sf "${BASE_URL}:8082/products" | python3 -c "
import json, sys
products = json.load(sys.stdin)
for p in products[:10]:
    print(p['id'])
" 2>/dev/null || echo "")

if [ -n "$PRODUCT_IDS" ]; then
  while IFS= read -r pid; do
    curl -sf -X PUT "${BASE_URL}:8086/inventory/${pid}" \
      -H 'Content-Type: application/json' \
      -d "{\"quantity\": 100}" > /dev/null
    echo "  Inventory set for product ${pid}"
  done <<< "$PRODUCT_IDS"
fi

echo ""
echo "=== Seeding complete! ==="
