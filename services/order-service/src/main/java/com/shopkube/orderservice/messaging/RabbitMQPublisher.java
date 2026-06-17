package com.shopkube.orderservice.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopkube.orderservice.config.RabbitMQConfig;
import com.shopkube.orderservice.model.Order;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class RabbitMQPublisher {

    private static final Logger log = LoggerFactory.getLogger(RabbitMQPublisher.class);

    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    public RabbitMQPublisher(RabbitTemplate rabbitTemplate, ObjectMapper objectMapper) {
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper;
    }

    public void publishOrderCreated(Order order) {
        try {
            Map<String, Object> event = new HashMap<>();
            event.put("event_type", "order.created");
            event.put("order_id", order.getId().toString());
            event.put("user_id", order.getUserId());
            event.put("total_amount", order.getTotalAmount());
            event.put("status", order.getStatus().name());
            event.put("created_at", order.getCreatedAt().toString());

            String message = objectMapper.writeValueAsString(event);

            rabbitTemplate.convertAndSend(
                RabbitMQConfig.EXCHANGE_NAME,
                RabbitMQConfig.ORDER_CREATED_ROUTING_KEY,
                message
            );

            log.info("Published OrderCreated event for order {}", order.getId());
        } catch (Exception e) {
            log.error("Failed to publish OrderCreated event: {}", e.getMessage());
        }
    }
}
