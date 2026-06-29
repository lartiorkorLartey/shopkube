import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, List

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pythonjsonlogger import jsonlogger

# Logging setup
logger = logging.getLogger("product-service")
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter("%(timestamp)s %(level)s %(name)s %(message)s"))
logger.addHandler(handler)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

# Config
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "shopkube")
PORT = int(os.getenv("PORT", "8082"))

# MongoDB client (module-level)
mongo_client: Optional[AsyncIOMotorClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client
    mongo_client = AsyncIOMotorClient(MONGODB_URL, serverSelectionTimeoutMS=10000)
    await mongo_client.admin.command("ping")
    logger.info("Connected to MongoDB", extra={"service": "product-service"})
    yield
    mongo_client.close()
    logger.info("MongoDB connection closed", extra={"service": "product-service"})


app = FastAPI(
    title="ShopKube Product Service",
    description="Product catalog management",
    version="1.0.0",
    lifespan=lifespan,
)


def get_collection():
    return mongo_client[MONGODB_DB]["products"]


# Helper to convert ObjectId
def product_from_doc(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


# Pydantic models
class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    category: str
    stock: int = 0
    sku: str
    image_url: str = ""


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    stock: Optional[int] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None


class ProductResponse(BaseModel):
    id: str
    name: str
    description: str
    price: float
    category: str
    stock: int
    sku: str
    image_url: str
    created_at: datetime
    updated_at: datetime


# Endpoints
@app.get("/health")
async def health():
    return {"status": "ok", "service": "product-service"}


@app.get("/ready")
async def ready():
    try:
        await mongo_client.admin.command("ping")
        return {"status": "ok"}
    except Exception as e:
        logger.error("Readiness check failed", extra={"error": str(e)})
        raise HTTPException(status_code=503, detail="MongoDB unreachable")


@app.get("/products", response_model=List[ProductResponse])
async def list_products(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    col = get_collection()
    query = {}
    if category:
        query["category"] = {"$regex": category, "$options": "i"}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    cursor = col.find(query).sort("created_at", -1).limit(100)
    docs = await cursor.to_list(length=100)
    return [product_from_doc(d) for d in docs]


@app.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    col = get_collection()
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product ID")
    doc = await col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_from_doc(doc)


@app.post("/products", response_model=ProductResponse, status_code=201)
async def create_product(product: ProductCreate):
    col = get_collection()
    now = datetime.now(timezone.utc)
    doc = product.model_dump()
    doc["created_at"] = now
    doc["updated_at"] = now
    result = await col.insert_one(doc)
    created = await col.find_one({"_id": result.inserted_id})
    logger.info("Product created", extra={"product_id": str(result.inserted_id), "name": product.name})
    return product_from_doc(created)


@app.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product: ProductUpdate):
    col = get_collection()
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product ID")

    update_data = {k: v for k, v in product.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await col.find_one_and_update(
        {"_id": oid},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_from_doc(result)


@app.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: str):
    col = get_collection()
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product ID")
    result = await col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    logger.info("Product deleted", extra={"product_id": product_id})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="info")
