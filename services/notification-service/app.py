import os
import json
import sqlite3
import logging
from flask import Flask, jsonify

from pythonjsonlogger import jsonlogger

logger = logging.getLogger("notification-service.api")
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter("%(timestamp)s %(level)s %(name)s %(message)s"))
logger.addHandler(handler)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

PORT = int(os.getenv("PORT", "8085"))
DB_PATH = os.getenv("SQLITE_DB", "/tmp/notifications.db")

app = Flask(__name__)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
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


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "notification-service"})


@app.route("/ready")
def ready():
    return jsonify({"status": "ok"})


@app.route("/notifications/<user_id>")
def get_notifications(user_id):
    try:
        init_db()
        conn = get_db()
        rows = conn.execute(
            "SELECT id, user_id, type, message, payload, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (user_id,),
        ).fetchall()
        conn.close()

        notifications = []
        for row in rows:
            n = dict(row)
            if n.get("payload"):
                try:
                    n["payload"] = json.loads(n["payload"])
                except Exception:
                    pass
            notifications.append(n)

        return jsonify({"userId": user_id, "notifications": notifications, "count": len(notifications)})
    except Exception as e:
        logger.error("Error fetching notifications", extra={"error": str(e), "user_id": user_id})
        return jsonify({"error": "Internal server error", "code": 500}), 500


if __name__ == "__main__":
    init_db()
    logger.info("Notification Flask API starting", extra={"port": PORT, "service": "notification-service"})
    app.run(host="0.0.0.0", port=PORT, debug=False)
