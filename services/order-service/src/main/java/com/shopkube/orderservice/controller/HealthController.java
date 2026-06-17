package com.shopkube.orderservice.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Map;

@RestController
public class HealthController {

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "order-service"));
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, String>> ready() {
        try (Connection conn = dataSource.getConnection()) {
            conn.isValid(2);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("status", "unavailable", "error", "database unreachable"));
        }
    }
}
