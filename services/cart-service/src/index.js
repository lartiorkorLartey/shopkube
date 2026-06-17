'use strict';

const Fastify = require('fastify');
const Redis = require('ioredis');

const PORT = parseInt(process.env.PORT || '8084', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CART_TTL = parseInt(process.env.CART_TTL_SECONDS || '604800', 10);

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req(req) {
        return { method: req.method, url: req.url, hostname: req.hostname };
      },
    },
  },
});

let redis;

// Connect to Redis
async function connectRedis() {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  redis.on('error', (err) => app.log.error({ err, service: 'cart-service' }, 'Redis error'));
  redis.on('connect', () => app.log.info({ service: 'cart-service' }, 'Redis connected'));
  await redis.ping();
}

// Cart key helper
const cartKey = (userId) => `cart:${userId}`;

// Get cart from Redis (returns empty cart if not found)
async function getCart(userId) {
  const raw = await redis.get(cartKey(userId));
  if (!raw) {
    return { userId, items: [], updatedAt: new Date().toISOString() };
  }
  return JSON.parse(raw);
}

// Save cart to Redis with TTL
async function saveCart(userId, cart) {
  cart.updatedAt = new Date().toISOString();
  await redis.set(cartKey(userId), JSON.stringify(cart), 'EX', CART_TTL);
}

// Routes
// GET /health
app.get('/health', async () => ({ status: 'ok', service: 'cart-service' }));

// GET /ready
app.get('/ready', async (req, reply) => {
  try {
    await redis.ping();
    return { status: 'ok' };
  } catch (err) {
    app.log.error(err, 'Readiness check failed');
    return reply.status(503).send({ status: 'unavailable', error: 'Redis unreachable' });
  }
});

// GET /cart/:userId
app.get('/cart/:userId', async (req) => {
  const { userId } = req.params;
  return getCart(userId);
});

// POST /cart/:userId/items — add or update item
app.post('/cart/:userId/items', {
  schema: {
    body: {
      type: 'object',
      required: ['productId', 'quantity', 'price', 'name'],
      properties: {
        productId: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number', minimum: 0 },
        quantity: { type: 'integer', minimum: 1 },
      },
    },
  },
}, async (req) => {
  const { userId } = req.params;
  const { productId, name, price, quantity } = req.body;

  const cart = await getCart(userId);
  const existing = cart.items.find((i) => i.productId === productId);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ productId, name, price, quantity });
  }

  await saveCart(userId, cart);
  return cart;
});

// PUT /cart/:userId/items/:productId — update quantity
app.put('/cart/:userId/items/:productId', {
  schema: {
    body: {
      type: 'object',
      required: ['quantity'],
      properties: {
        quantity: { type: 'integer' },
      },
    },
  },
}, async (req, reply) => {
  const { userId, productId } = req.params;
  const { quantity } = req.body;

  const cart = await getCart(userId);

  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => i.productId !== productId);
  } else {
    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      return reply.status(404).send({ error: 'Item not found in cart', code: 404 });
    }
    item.quantity = quantity;
  }

  await saveCart(userId, cart);
  return cart;
});

// DELETE /cart/:userId/items/:productId — remove item
app.delete('/cart/:userId/items/:productId', async (req, reply) => {
  const { userId, productId } = req.params;

  const cart = await getCart(userId);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => i.productId !== productId);

  if (cart.items.length === before) {
    return reply.status(404).send({ error: 'Item not found in cart', code: 404 });
  }

  await saveCart(userId, cart);
  return cart;
});

// DELETE /cart/:userId — clear cart
app.delete('/cart/:userId', async (req) => {
  const { userId } = req.params;
  await redis.del(cartKey(userId));
  return { userId, items: [], updatedAt: new Date().toISOString() };
});

// Start server
async function start() {
  await connectRedis();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ service: 'cart-service', port: PORT }, 'Cart service started');
}

// Graceful shutdown
const shutdown = async (signal) => {
  app.log.info({ signal }, 'Shutting down...');
  await app.close();
  await redis.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'cart-service', error: err.message }));
  process.exit(1);
});
