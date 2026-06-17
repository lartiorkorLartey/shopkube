package com.shopkube.orderservice.service;

import com.shopkube.orderservice.messaging.RabbitMQPublisher;
import com.shopkube.orderservice.model.Order;
import com.shopkube.orderservice.model.OrderItem;
import com.shopkube.orderservice.model.OrderStatus;
import com.shopkube.orderservice.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final OrderRepository orderRepository;
    private final RabbitMQPublisher publisher;

    public OrderService(OrderRepository orderRepository, RabbitMQPublisher publisher) {
        this.orderRepository = orderRepository;
        this.publisher = publisher;
    }

    @Transactional
    public Order createOrder(String userId, List<Map<String, Object>> items) {
        Order order = new Order();
        order.setUserId(userId);
        order.setStatus(OrderStatus.PENDING);

        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> itemData : items) {
            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProductId((String) itemData.get("productId"));
            item.setProductName((String) itemData.get("productName"));
            item.setQuantity((Integer) itemData.get("quantity"));

            BigDecimal unitPrice = new BigDecimal(itemData.get("unitPrice").toString());
            item.setUnitPrice(unitPrice);
            item.setSubtotal(unitPrice.multiply(BigDecimal.valueOf(item.getQuantity())));
            total = total.add(item.getSubtotal());
            order.getItems().add(item);
        }
        order.setTotalAmount(total);

        Order saved = orderRepository.save(order);
        log.info("Order created: id={} userId={} total={}", saved.getId(), userId, total);

        publisher.publishOrderCreated(saved);

        return saved;
    }

    public Optional<Order> getOrder(UUID id) {
        return orderRepository.findById(id);
    }

    public List<Order> getOrdersByUser(String userId) {
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public Optional<Order> updateStatus(UUID id, OrderStatus newStatus) {
        return orderRepository.findById(id).map(order -> {
            order.setStatus(newStatus);
            Order updated = orderRepository.save(order);
            log.info("Order {} status updated to {}", id, newStatus);
            return updated;
        });
    }
}
