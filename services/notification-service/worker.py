import os
import json
import time
import logging
import pika
from pythonjsonlogger import jsonlogger

logger = logging.getLogger("notification-service.consumer")
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter("%(timestamp)s %(level)s %(name)s %(message)s"))
logger.addHandler(handler)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://shopkube:shopkube_pass@rabbitmq:5672/")
EXCHANGE_NAME = "shopkube.events"
QUEUE_NAME = "notification-service"
ROUTING_KEY = "order.created"


def callback(ch, method, properties, body):
    try:
        data = json.loads(body)
        logger.info(
            "Received message",
            extra={
                "service": "notification-service",
                "routing_key": method.routing_key,
                "order_id": data.get("order_id"),
            },
        )
        # Import here to avoid circular imports at module load
        from tasks import send_order_notification
        send_order_notification.delay(data)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        logger.error("Error processing message", extra={"error": str(e)})
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def connect_and_consume():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            params.heartbeat = 60
            params.blocked_connection_timeout = 300

            connection = pika.BlockingConnection(params)
            channel = connection.channel()

            # Declare exchange (idempotent)
            channel.exchange_declare(
                exchange=EXCHANGE_NAME,
                exchange_type="topic",
                durable=True,
            )

            # Declare and bind queue
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            channel.queue_bind(
                exchange=EXCHANGE_NAME,
                queue=QUEUE_NAME,
                routing_key=ROUTING_KEY,
            )

            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

            logger.info(
                "RabbitMQ consumer started",
                extra={
                    "service": "notification-service",
                    "exchange": EXCHANGE_NAME,
                    "queue": QUEUE_NAME,
                    "routing_key": ROUTING_KEY,
                },
            )
            channel.start_consuming()

        except pika.exceptions.AMQPConnectionError as e:
            logger.warning(
                "RabbitMQ connection failed, retrying in 5s",
                extra={"service": "notification-service", "error": str(e)},
            )
            time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Consumer shutting down", extra={"service": "notification-service"})
            break
        except Exception as e:
            logger.error(
                "Unexpected error in consumer",
                extra={"service": "notification-service", "error": str(e)},
            )
            time.sleep(5)


if __name__ == "__main__":
    connect_and_consume()
