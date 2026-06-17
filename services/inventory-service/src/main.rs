use actix_web::{web, App, HttpResponse, HttpServer};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use serde::{Deserialize, Serialize};
use std::env;
use tracing::{info, error, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct InventoryItem {
    id: i32,
    product_id: String,
    quantity: i32,
    reserved: i32,
}

#[derive(Debug, Serialize)]
struct InventoryResponse {
    product_id: String,
    quantity: i32,
    reserved: i32,
    available: i32,
}

impl From<InventoryItem> for InventoryResponse {
    fn from(item: InventoryItem) -> Self {
        let available = item.quantity - item.reserved;
        InventoryResponse {
            product_id: item.product_id,
            quantity: item.quantity,
            reserved: item.reserved,
            available,
        }
    }
}

#[derive(Debug, Deserialize)]
struct SetQuantityRequest {
    quantity: i32,
}

#[derive(Debug, Deserialize)]
struct ReserveRequest {
    amount: i32,
}

#[derive(Debug, Deserialize)]
struct ReleaseRequest {
    amount: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorResponse {
    error: String,
    code: u16,
}

struct AppState {
    pool: PgPool,
}

// GET /health
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "inventory-service"
    }))
}

// GET /ready
async fn ready(data: web::Data<AppState>) -> HttpResponse {
    match sqlx::query("SELECT 1").execute(&data.pool).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Err(e) => {
            error!("Readiness check failed: {}", e);
            HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "status": "unavailable",
                "error": "database unreachable"
            }))
        }
    }
}

// GET /inventory/{product_id}
async fn get_inventory(
    path: web::Path<String>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let product_id = path.into_inner();

    let result = sqlx::query_as::<_, InventoryItem>(
        "SELECT id, product_id, quantity, reserved FROM inventory WHERE product_id = $1"
    )
    .bind(&product_id)
    .fetch_optional(&data.pool)
    .await;

    match result {
        Ok(Some(item)) => HttpResponse::Ok().json(InventoryResponse::from(item)),
        Ok(None) => HttpResponse::NotFound().json(ErrorResponse {
            error: format!("Product {} not found in inventory", product_id),
            code: 404,
        }),
        Err(e) => {
            error!("DB error getting inventory for {}: {}", product_id, e);
            HttpResponse::InternalServerError().json(ErrorResponse {
                error: "Internal server error".to_string(),
                code: 500,
            })
        }
    }
}

// PUT /inventory/{product_id}
async fn set_inventory(
    path: web::Path<String>,
    body: web::Json<SetQuantityRequest>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let product_id = path.into_inner();
    let quantity = body.quantity;

    if quantity < 0 {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "Quantity must be non-negative".to_string(),
            code: 400,
        });
    }

    let result = sqlx::query_as::<_, InventoryItem>(
        r#"
        INSERT INTO inventory (product_id, quantity, reserved)
        VALUES ($1, $2, 0)
        ON CONFLICT (product_id) DO UPDATE
          SET quantity = $2, updated_at = NOW()
        RETURNING id, product_id, quantity, reserved
        "#
    )
    .bind(&product_id)
    .bind(quantity)
    .fetch_one(&data.pool)
    .await;

    match result {
        Ok(item) => {
            info!("Inventory set: product_id={} quantity={}", product_id, quantity);
            HttpResponse::Ok().json(InventoryResponse::from(item))
        }
        Err(e) => {
            error!("DB error setting inventory for {}: {}", product_id, e);
            HttpResponse::InternalServerError().json(ErrorResponse {
                error: "Internal server error".to_string(),
                code: 500,
            })
        }
    }
}

// POST /inventory/{product_id}/reserve
async fn reserve_inventory(
    path: web::Path<String>,
    body: web::Json<ReserveRequest>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let product_id = path.into_inner();
    let amount = body.amount;

    if amount <= 0 {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "Amount must be positive".to_string(),
            code: 400,
        });
    }

    // Use a transaction so the SELECT FOR UPDATE and UPDATE are atomic
    let mut tx = match data.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            error!("Failed to begin transaction: {}", e);
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "Internal server error".to_string(),
                code: 500,
            });
        }
    };

    let item = sqlx::query_as::<_, InventoryItem>(
        "SELECT id, product_id, quantity, reserved FROM inventory WHERE product_id = $1 FOR UPDATE"
    )
    .bind(&product_id)
    .fetch_optional(&mut *tx)
    .await;

    match item {
        Ok(Some(inv)) => {
            let available = inv.quantity - inv.reserved;
            if available < amount {
                let _ = tx.rollback().await;
                return HttpResponse::Conflict().json(serde_json::json!({
                    "error": "Insufficient stock",
                    "code": 409,
                    "available": available,
                    "requested": amount
                }));
            }

            let result = sqlx::query_as::<_, InventoryItem>(
                "UPDATE inventory SET reserved = reserved + $1, updated_at = NOW() \
                 WHERE product_id = $2 RETURNING id, product_id, quantity, reserved"
            )
            .bind(amount)
            .bind(&product_id)
            .fetch_one(&mut *tx)
            .await;

            match result {
                Ok(updated) => {
                    if let Err(e) = tx.commit().await {
                        error!("Failed to commit reservation transaction: {}", e);
                        return HttpResponse::InternalServerError().json(ErrorResponse {
                            error: "Internal server error".to_string(),
                            code: 500,
                        });
                    }
                    info!("Reserved {} units for product {}", amount, product_id);
                    HttpResponse::Ok().json(InventoryResponse::from(updated))
                }
                Err(e) => {
                    error!("DB error reserving inventory: {}", e);
                    HttpResponse::InternalServerError().json(ErrorResponse {
                        error: "Internal server error".to_string(),
                        code: 500,
                    })
                }
            }
        }
        Ok(None) => {
            let _ = tx.rollback().await;
            HttpResponse::NotFound().json(ErrorResponse {
                error: format!("Product {} not found in inventory", product_id),
                code: 404,
            })
        }
        Err(e) => {
            error!("DB error: {}", e);
            HttpResponse::InternalServerError().json(ErrorResponse {
                error: "Internal server error".to_string(),
                code: 500,
            })
        }
    }
}

// POST /inventory/{product_id}/release
async fn release_inventory(
    path: web::Path<String>,
    body: web::Json<ReleaseRequest>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let product_id = path.into_inner();
    let amount = body.amount;

    if amount <= 0 {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "Amount must be positive".to_string(),
            code: 400,
        });
    }

    let result = sqlx::query_as::<_, InventoryItem>(
        r#"
        UPDATE inventory
        SET reserved = GREATEST(0, reserved - $1), updated_at = NOW()
        WHERE product_id = $2
        RETURNING id, product_id, quantity, reserved
        "#
    )
    .bind(amount)
    .bind(&product_id)
    .fetch_optional(&data.pool)
    .await;

    match result {
        Ok(Some(item)) => {
            info!("Released {} units for product {}", amount, product_id);
            HttpResponse::Ok().json(InventoryResponse::from(item))
        }
        Ok(None) => HttpResponse::NotFound().json(ErrorResponse {
            error: format!("Product {} not found in inventory", product_id),
            code: 404,
        }),
        Err(e) => {
            error!("DB error releasing inventory: {}", e);
            HttpResponse::InternalServerError().json(ErrorResponse {
                error: "Internal server error".to_string(),
                code: 500,
            })
        }
    }
}

async fn init_db(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS inventory (
            id          SERIAL PRIMARY KEY,
            product_id  VARCHAR(255) UNIQUE NOT NULL,
            quantity    INTEGER NOT NULL DEFAULT 0,
            reserved    INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // Load .env if present (ignore error if not found)
    let _ = dotenvy::dotenv();

    // Structured JSON logging
    let log_level = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&log_level)),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let port = env::var("PORT").unwrap_or_else(|_| "8086".to_string());
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgres://shopkube:shopkube_pass@localhost:5432/shopkube".to_string()
    });

    info!(
        service = "inventory-service",
        port = %port,
        "Starting inventory service"
    );

    // Connect to PostgreSQL with retry backoff
    let pool = {
        let mut attempts = 0u32;
        loop {
            match PgPoolOptions::new()
                .max_connections(10)
                .connect(&database_url)
                .await
            {
                Ok(p) => break p,
                Err(e) => {
                    attempts += 1;
                    if attempts >= 10 {
                        panic!(
                            "Could not connect to database after 10 attempts: {}",
                            e
                        );
                    }
                    warn!(
                        attempt = attempts,
                        error = %e,
                        "DB connection failed, retrying in 2s"
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                }
            }
        }
    };

    init_db(&pool)
        .await
        .expect("Failed to initialize database schema");
    info!(
        service = "inventory-service",
        "Database schema initialized"
    );

    let state = web::Data::new(AppState { pool });
    let bind_addr = format!("0.0.0.0:{}", port);

    info!(
        service = "inventory-service",
        addr = %bind_addr,
        "Listening"
    );

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .app_data(web::JsonConfig::default().error_handler(|err, _req| {
                let response = HttpResponse::BadRequest().json(ErrorResponse {
                    error: format!("Invalid JSON: {}", err),
                    code: 400,
                });
                actix_web::error::InternalError::from_response(err, response).into()
            }))
            .route("/health", web::get().to(health))
            .route("/ready", web::get().to(ready))
            .route("/inventory/{product_id}", web::get().to(get_inventory))
            .route("/inventory/{product_id}", web::put().to(set_inventory))
            .route(
                "/inventory/{product_id}/reserve",
                web::post().to(reserve_inventory),
            )
            .route(
                "/inventory/{product_id}/release",
                web::post().to(release_inventory),
            )
    })
    .bind(&bind_addr)?
    .shutdown_timeout(10)
    .run()
    .await
}
