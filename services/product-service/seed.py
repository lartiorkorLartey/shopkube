import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "shopkube")

PRODUCTS = [
    # Electronics (5)
    {
        "name": "ProBook Laptop 15",
        "description": "High-performance laptop with Intel Core i7, 16GB RAM, 512GB SSD, perfect for developers and power users.",
        "price": 1299.99,
        "category": "Electronics",
        "stock": 50,
        "sku": "ELEC-LAP-001",
        "image_url": "https://example.com/images/laptop.jpg",
    },
    {
        "name": "SmartPhone X12 Pro",
        "description": "Flagship smartphone with 6.7-inch AMOLED display, 108MP camera, 5G ready, 5000mAh battery.",
        "price": 899.99,
        "category": "Electronics",
        "stock": 100,
        "sku": "ELEC-PHN-001",
        "image_url": "https://example.com/images/phone.jpg",
    },
    {
        "name": "UltraTab 10 Pro",
        "description": "10-inch tablet with Snapdragon 870, 8GB RAM, 256GB storage, ideal for work and entertainment.",
        "price": 549.99,
        "category": "Electronics",
        "stock": 75,
        "sku": "ELEC-TAB-001",
        "image_url": "https://example.com/images/tablet.jpg",
    },
    {
        "name": "SoundMax Pro Headphones",
        "description": "Premium over-ear headphones with active noise cancellation, 30-hour battery, Hi-Fi audio.",
        "price": 249.99,
        "category": "Electronics",
        "stock": 120,
        "sku": "ELEC-AUD-001",
        "image_url": "https://example.com/images/headphones.jpg",
    },
    {
        "name": "FitWatch Series 5",
        "description": "Smart watch with health monitoring, GPS, sleep tracking, AMOLED display, 7-day battery life.",
        "price": 199.99,
        "category": "Electronics",
        "stock": 90,
        "sku": "ELEC-WCH-001",
        "image_url": "https://example.com/images/watch.jpg",
    },
    # Clothing (5)
    {
        "name": "Classic Crew T-Shirt",
        "description": "100% organic cotton crew-neck t-shirt. Soft, breathable, and available in multiple colors.",
        "price": 24.99,
        "category": "Clothing",
        "stock": 300,
        "sku": "CLO-TSH-001",
        "image_url": "https://example.com/images/tshirt.jpg",
    },
    {
        "name": "SlimFit Denim Jeans",
        "description": "Premium denim slim-fit jeans with stretch fabric for comfort. Classic 5-pocket design.",
        "price": 79.99,
        "category": "Clothing",
        "stock": 150,
        "sku": "CLO-JNS-001",
        "image_url": "https://example.com/images/jeans.jpg",
    },
    {
        "name": "Urban Explorer Jacket",
        "description": "Lightweight waterproof jacket with packable design, perfect for city commutes and light hikes.",
        "price": 149.99,
        "category": "Clothing",
        "stock": 80,
        "sku": "CLO-JCK-001",
        "image_url": "https://example.com/images/jacket.jpg",
    },
    {
        "name": "CloudStep Running Shoes",
        "description": "Responsive cushioning running shoes with breathable mesh upper and durable rubber outsole.",
        "price": 119.99,
        "category": "Clothing",
        "stock": 200,
        "sku": "CLO-SHO-001",
        "image_url": "https://example.com/images/shoes.jpg",
    },
    {
        "name": "Floral Midi Dress",
        "description": "Elegant floral-print midi dress in lightweight chiffon, perfect for casual and semi-formal occasions.",
        "price": 69.99,
        "category": "Clothing",
        "stock": 110,
        "sku": "CLO-DRS-001",
        "image_url": "https://example.com/images/dress.jpg",
    },
    # Books (5)
    {
        "name": "Python for Data Science",
        "description": "Comprehensive guide to Python programming for data analysis, machine learning, and visualization.",
        "price": 49.99,
        "category": "Books",
        "stock": 200,
        "sku": "BOK-PYT-001",
        "image_url": "https://example.com/images/python-book.jpg",
    },
    {
        "name": "Kubernetes in Action, 2nd Ed.",
        "description": "The definitive guide to deploying and managing containerized applications on Kubernetes.",
        "price": 59.99,
        "category": "Books",
        "stock": 150,
        "sku": "BOK-K8S-001",
        "image_url": "https://example.com/images/k8s-book.jpg",
    },
    {
        "name": "The Go Programming Language",
        "description": "Written by the creators of Go, the authoritative resource for learning Go from fundamentals to advanced topics.",
        "price": 44.99,
        "category": "Books",
        "stock": 180,
        "sku": "BOK-GOL-001",
        "image_url": "https://example.com/images/go-book.jpg",
    },
    {
        "name": "Programming Rust, 2nd Ed.",
        "description": "Fast, safe systems programming. A hands-on guide to building reliable and efficient programs in Rust.",
        "price": 54.99,
        "category": "Books",
        "stock": 120,
        "sku": "BOK-RST-001",
        "image_url": "https://example.com/images/rust-book.jpg",
    },
    {
        "name": "Clean Code",
        "description": "A handbook of agile software craftsmanship. Learn to write readable, maintainable code.",
        "price": 39.99,
        "category": "Books",
        "stock": 250,
        "sku": "BOK-CLN-001",
        "image_url": "https://example.com/images/clean-code.jpg",
    },
    # Home & Garden (5)
    {
        "name": "BrewMaster Pro Coffee Maker",
        "description": "12-cup programmable coffee maker with built-in grinder, thermal carafe, and auto-brew scheduling.",
        "price": 129.99,
        "category": "Home & Garden",
        "stock": 60,
        "sku": "HOM-COF-001",
        "image_url": "https://example.com/images/coffee-maker.jpg",
    },
    {
        "name": "ArcLight LED Desk Lamp",
        "description": "Adjustable LED desk lamp with 5 color temperatures, USB charging port, and touch dimmer.",
        "price": 49.99,
        "category": "Home & Garden",
        "stock": 140,
        "sku": "HOM-LAM-001",
        "image_url": "https://example.com/images/lamp.jpg",
    },
    {
        "name": "Terracotta Plant Pot Set",
        "description": "Set of 3 handcrafted terracotta plant pots with drainage holes. Sizes: 4\", 6\", 8\".",
        "price": 29.99,
        "category": "Home & Garden",
        "stock": 200,
        "sku": "HOM-POT-001",
        "image_url": "https://example.com/images/plant-pot.jpg",
    },
    {
        "name": "Luxe Knit Throw Pillow",
        "description": "Chunky knit decorative pillow cover, 45x45cm. Adds warmth and texture to any living space.",
        "price": 34.99,
        "category": "Home & Garden",
        "stock": 170,
        "sku": "HOM-PIL-001",
        "image_url": "https://example.com/images/pillow.jpg",
    },
    {
        "name": "Lavender Soy Candle",
        "description": "Hand-poured lavender essential oil soy wax candle, 200g, 40+ hour burn time.",
        "price": 18.99,
        "category": "Home & Garden",
        "stock": 300,
        "sku": "HOM-CAN-001",
        "image_url": "https://example.com/images/candle.jpg",
    },
]


async def seed():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[MONGODB_DB]
    col = db["products"]

    # Clear existing products
    await col.delete_many({})
    print(f"Cleared existing products")

    now = datetime.now(timezone.utc)
    for product in PRODUCTS:
        product["created_at"] = now
        product["updated_at"] = now

    result = await col.insert_many(PRODUCTS)
    print(f"Inserted {len(result.inserted_ids)} products")

    # Show summary by category
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    async for doc in col.aggregate(pipeline):
        print(f"  {doc['_id']}: {doc['count']} products")

    client.close()
    print("Seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed())
