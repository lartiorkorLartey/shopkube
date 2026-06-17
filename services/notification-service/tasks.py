import os
import json
import sqlite3
import logging
from datetime import datetime
from celery import Celery
from pythonjsonlogger import jsonlogger

# Logging setup
logger = logging.getLogger("notification-service.tasks")
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter("%(timestamp)s %(level)s %(name)s %(message)s"))
logger.addHandler(handler)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "amqp://shopkube:shopkube_pass@rabbitmq:5672/")
DB_PATH = os.getenv("SQLITE_DB", "/tmp/notifications.db")

celery_app = Celery("notification_tasks", broker=CELERY_BROKER_URL)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            payload TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def store_notification(user_id: str, notif_type: str, message: str, payload: dict):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO notifications (user_id, type, message, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, notif_type, message, json.dumps(payload), datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


@celery_app.task(name="tasks.send_order_notification")
def send_order_notification(order_data: dict):
    """Process an OrderCreated event and simulate sending email/SMS notification."""
    order_id = order_data.get("order_id", "unknown")
    user_id = order_data.get("user_id", "unknown")
    total = order_data.get("total_amount", 0)

    logger.info(
        "Processing order notification",
        extra={
            "service": "notification-service",
            "event_type": "order.created",
            "order_id": order_id,
            "user_id": user_id,
            "total_amount": total,
        },
    )

    # Simulate email notification
    email_message = f"Your order #{order_id} has been placed successfully. Total: ${total}"
    logger.info(
        "Sending email notification",
        extra={
            "service": "notification-service",
            "channel": "email",
            "recipient": f"user-{user_id}@example.com",
            "subject": "Order Confirmation",
            "message": email_message,
        },
    )

    # Simulate SMS notification
    sms_message = f"ShopKube: Order #{order_id[:8]} confirmed! Total: ${total}"
    logger.info(
        "Sending SMS notification",
        extra={
            "service": "notification-service",
            "channel": "sms",
            "recipient": f"+1555{user_id[:7].replace('-', '')}",
            "message": sms_message,
        },
    )

    # Store in SQLite
    store_notification(
        user_id=user_id,
        notif_type="order.created",
        message=email_message,
        payload=order_data,
    )

    return {"status": "sent", "order_id": order_id, "user_id": user_id}


@celery_app.task(name="tasks.send_generic_notification")
def send_generic_notification(user_id: str, message: str, notif_type: str = "generic"):
    """Send a generic notification to a user."""
    logger.info(
        "Sending generic notification",
        extra={
            "service": "notification-service",
            "user_id": user_id,
            "type": notif_type,
            "message": message,
        },
    )
    store_notification(user_id=user_id, notif_type=notif_type, message=message, payload={})
    return {"status": "sent", "user_id": user_id}
