'use strict';

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;

// Service URLs from environment
const services = {
  user:      process.env.USER_SERVICE_URL      || 'http://user-service:8081',
  product:   process.env.PRODUCT_SERVICE_URL   || 'http://product-service:8082',
  order:     process.env.ORDER_SERVICE_URL     || 'http://order-service:8083',
  cart:      process.env.CART_SERVICE_URL      || 'http://cart-service:8084',
  review:    process.env.REVIEW_SERVICE_URL    || 'http://review-service:8087',
  analytics: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8088',
};

// JSON request logging via morgan
morgan.token('body', (req) => JSON.stringify(req.body));
app.use(morgan((tokens, req, res) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: parseInt(tokens.status(req, res)),
    responseTime: parseFloat(tokens['response-time'](req, res)),
    remoteAddr: tokens['remote-addr'](req, res),
    service: 'api-gateway',
  });
}));

// Rate limiter: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.', code: 429 },
});
app.use(limiter);

// Proxy helper
function makeProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, req, res) => {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'api-gateway',
          message: 'Proxy error',
          error: err.message,
          target,
        }));
        if (!res.headersSent) {
          res.status(502).json({ error: 'Bad gateway', code: 502 });
        }
      },
    },
  });
}

// Routes - proxy to downstream services
app.use('/api/users',     makeProxy(services.user,      { '^/api/users': '/users' }));
app.use('/api/products',  makeProxy(services.product,   { '^/api/products': '/products' }));
app.use('/api/orders',    makeProxy(services.order,     { '^/api/orders': '/orders' }));
app.use('/api/cart',      makeProxy(services.cart,      { '^/api/cart': '/cart' }));
app.use('/api/reviews',   makeProxy(services.review,    { '^/api/reviews': '/reviews' }));
app.use('/api/analytics', makeProxy(services.analytics, { '^/api/analytics': '/analytics' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Readiness check - ping all downstream services
app.get('/ready', async (req, res) => {
  const checks = await Promise.allSettled(
    Object.entries(services).map(async ([name, url]) => {
      const resp = await axios.get(`${url}/health`, { timeout: 3000 });
      return { name, status: resp.data.status };
    })
  );

  const results = {};
  let allHealthy = true;
  for (const check of checks) {
    if (check.status === 'fulfilled') {
      results[check.value.name] = 'ok';
    } else {
      const name = Object.keys(services)[checks.indexOf(check)];
      results[name] = 'unavailable';
      allHealthy = false;
    }
  }

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json({ status: allHealthy ? 'ok' : 'degraded', services: results });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', code: 404 });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'api-gateway',
    message: `API Gateway listening on port ${PORT}`,
  }));
});

// Graceful shutdown
const shutdown = () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'api-gateway',
    message: 'Shutting down gracefully...',
  }));
  server.close(() => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'api-gateway',
      message: 'Server closed',
    }));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
