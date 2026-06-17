#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"

  actual=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  if [ "$actual" = "$expected_status" ]; then
    echo "  PASS  $name ($url)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name ($url) — got $actual, expected $expected_status"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== ShopKube Endpoint Tests ==="
echo ""

echo "--- Health Checks ---"
check "api-gateway /health"          "${BASE_URL}:8080/health"
check "user-service /health"         "${BASE_URL}:8081/health"
check "product-service /health"      "${BASE_URL}:8082/health"
check "order-service /health"        "${BASE_URL}:8083/health"
check "cart-service /health"         "${BASE_URL}:8084/health"
check "notification-service /health" "${BASE_URL}:8085/health"
check "inventory-service /health"    "${BASE_URL}:8086/health"
check "review-service /health"       "${BASE_URL}:8087/health"
check "analytics-service /health"    "${BASE_URL}:8088/health"

echo ""
echo "--- Readiness Checks ---"
check "api-gateway /ready"           "${BASE_URL}:8080/ready"
check "user-service /ready"          "${BASE_URL}:8081/ready"
check "product-service /ready"       "${BASE_URL}:8082/ready"
check "cart-service /ready"          "${BASE_URL}:8084/ready"

echo ""
echo "--- Business Endpoints ---"
check "products list"                "${BASE_URL}:8082/products"
check "products by category"         "${BASE_URL}:8082/products?category=Electronics"
check "reviews list"                 "${BASE_URL}:8087/reviews?product_id=test-product-1"
check "cart get (new)"               "${BASE_URL}:8084/cart/test-user-1"
check "analytics summary"            "${BASE_URL}:8088/analytics/summary"

# Test via gateway
echo ""
echo "--- Via API Gateway ---"
check "gateway -> products"          "${BASE_URL}:8080/api/products"
check "gateway -> cart"              "${BASE_URL}:8080/api/cart/test-user-1"
check "gateway -> reviews"           "${BASE_URL}:8080/api/reviews?product_id=test-product-1"
check "gateway -> analytics"         "${BASE_URL}:8080/api/analytics/summary"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
