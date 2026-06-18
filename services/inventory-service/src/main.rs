use actix_web::{web, App, HttpResponse, HttpServer};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::env;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

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

fn err_response(msg: &str, code: u16) -> HttpResponse {
    match code {
        400 => HttpResponse::BadRequest().json(serde_json::json!({"error": msg, "code": code})),
        404 => HttpResponse::NotFound().json(serde_json::json!({"error": msg, "code": code})),
        409 => HttpResponse::Conflict().json(serde_json::json!({"error": msg, "code": code})),
        _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": msg, "code": code})),
    }
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({"status": "ok", "service": "inventory-service"}))
}

async fn ready(pool: web::Data<PgPool>) -> HttpResponse {
    match sqlx::query("SELECT 1").execute(pool.get_ref()).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "ok"})),
        Err(e) => {
            error!("Readiness check failed: {}", e);
            HttpResponse::ServiceUnavailable()
                .json(serde_json::json!({"status": "unavailable", "error": "database unreachable"}))
        }
    }
}

async fn get_inventory(path: web::Path<String>, pool: web::Data<PgPool>) -> HttpResponse {
    let product_id = path.into_inner();
    match sqlx::query_as::<_, InventoryItem>(
        "SELECT id, product_id, quantity, reserved FROM inventory WHERE product_id = $1",
    )
    .bind(&product_id)
    .fetch_optional(pool.get_ref())
    .await
    {
        Ok(Some(item)) => HttpResponse::Ok().json(InventoryResponse::from(item)),
        Ok(None) => err_response(&format!("product {} not found in inventory", product_id), 404),
        Err(e) => {
            error!("DB error: {}", e);
            err_response("internal server error", 500)
        }
    }
}

async fn set_inventory(
    path: web::Path<String>,
    body: web::Json<SetQuantityRequest>,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let product_id = path.into_inner();
    let quantity = body.quantity;
    if quantity < 0 {
        return err_response("quantity must be non-negative", 400);
    }
    match sqlx::query_as::<_, InventoryItem>(
        r#"INSERT INTO inventory (product_id, quantity, reserved) VALUES ($1, $2, 0)
           ON CONFLICT (product_id) DO UPDATE SET quantity = $2, updated_at = NOW()
           RETURNING id, product_id, quantity, reserved"#,
    )
    .bind(&product_id)
    .bind(quantity)
    .fetch_one(pool.get_ref())
    .await
    {
        Ok(item) => {
            info!("Inventory set: product_id={} quantity={}", product_id, quantity);
            HttpResponse::Ok().json(InventoryResponse::from(item))
        }
        Err(e) => {
            error!("DB error: {}", e);
            err_response("internal server error", 500)
        }
    }
}

async fn reserve_inventory(
    path: web::Path<String>,
    body: web::Json<ReserveRequest>,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let product_id = path.into_inner();
    let amount = body.amount;
    if amount <= 0 {
        return err_response("amount must be positive", 400);
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            error!("Failed to begin transaction: {}", e);
            return err_response("internal server error", 500);
        }
    };

    let item = sqlx::query_as::<_, InventoryItem>(
        "SELECT id, product_id, quantity, reserved FROM inventory WHERE product_id = $1 FOR UPDATE",
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
                    "error": "insufficient stock",
                    "code": 409,
                    "available": available,
                    "requested": amount,
                }));
            }
            match sqlx::query_as::<_, InventoryItem>(
                "UPDATE inventory SET reserved = reserved + $1, updated_at = NOW() \
                 WHERE product_id = $2 RETURNING id, product_id, quantity, reserved",
            )
            .bind(amount)
            .bind(&product_id)
            .fetch_one(&mut *tx)
            .await
            {
                Ok(updated) => match tx.commit().await {
                    Ok(_) => {
                        info!("Reserved {} units for product {}", amount, product_id);
                        HttpResponse::Ok().json(InventoryResponse::from(updated))
                    }
                    Err(e) => {
                        error!("Commit failed: {}", e);
                        err_response("internal server error", 500)
                    }
                },
                Err(e) => {
                    error!("DB error: {}", e);
                    err_response("internal server error", 500)
                }
            }
        }
        Ok(None) => {
            let _ = tx.rollback().await;
            err_response(&format!("product {} not found in inventory", product_id), 404)
        }
        Err(e) => {
            error!("DB error: {}", e);
            err_response("internal server error", 500)
        }
    }
}

async fn release_inventory(
    path: web::Path<String>,
    body: web::Json<ReleaseRequest>,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let product_id = path.into_inner();
    let amount = body.amount;
    if amount <= 0 {
        return err_response("amount must be positive", 400);
    }
    match sqlx::query_as::<_, InventoryItem>(
        r#"UPDATE inventory SET reserved = GREATEST(0, reserved - $1), updated_at = NOW()
           WHERE product_id = $2 RETURNING id, product_id, quantity, reserved"#,
    )
    .bind(amount)
    .bind(&product_id)
    .fetch_optional(pool.get_ref())
    .await
    {
        Ok(Some(item)) => {
            info!("Released {} units for product {}", amount, product_id);
            HttpResponse::Ok().json(InventoryResponse::from(item))
        }
        Ok(None) => err_response(&format!("product {} not found in inventory", product_id), 404),
        Err(e) => {
            error!("DB error: {}", e);
            err_response("internal server error", 500)
        }
    }
}

async fn init_db(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS inventory (
            id         SERIAL PRIMARY KEY,
            product_id VARCHAR(255) UNIQUE NOT NULL,
            quantity   INTEGER NOT NULL DEFAULT 0,
            reserved   INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )",
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
    let _ = dotenvy::dotenv();

    let log_level = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(EnvFilter::new(&log_level))
        .init();

    let port = env::var("PORT").unwrap_or_else(|_| "8086".to_string());
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://shopkube:shopkube_pass@localhost:5432/shopkube".to_string());

    info!(service = "inventory-service", port = %port, "starting");

    let pool = {
        let mut attempts = 0u32;
        loop {
            match PgPoolOptions::new().max_connections(10).connect(&database_url).await {
                Ok(p) => break p,
                Err(e) => {
                    attempts += 1;
                    if attempts >= 10 {
                        panic!("could not connect to database after 10 attempts: {}", e);
                    }
                    warn!(attempt = attempts, error = %e, "db connection failed, retrying");
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                }
            }
        }
    };

    init_db(&pool).await.expect("failed to initialize schema");
    info!("database schema ready");

    let pool = web::Data::new(pool);
    let bind_addr = format!("0.0.0.0:{}", port);
    info!(addr = %bind_addr, "listening");

    HttpServer::new(move || {
        App::new()
            .app_data(pool.clone())
            .route("/health", web::get().to(health))
            .route("/ready", web::get().to(ready))
            .route("/inventory/{product_id}", web::get().to(get_inventory))
            .route("/inventory/{product_id}", web::put().to(set_inventory))
            .route("/inventory/{product_id}/reserve", web::post().to(reserve_inventory))
            .route("/inventory/{product_id}/release", web::post().to(release_inventory))
    })
    .bind(&bind_addr)?
    .shutdown_timeout(10)
    .run()
    .await
}
