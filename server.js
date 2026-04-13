import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
let orders = [];

// REST API Endpoints

// GET /orders - Return all orders
app.get('/orders', (req, res) => {
  res.json(orders);
});

// POST /orders - Create new order
app.post('/orders', (req, res) => {
  const { table_number, items } = req.body;

  if (!table_number || !items) {
    return res.status(400).json({ error: "Table number and items are required" });
  }

  const newOrder = {
    id: uuidv4(),
    table_number,
    items,
    status: 'NEW',
    timestamp: new Date().toISOString()
  };

  orders.push(newOrder);

  // Emit real-time event
  io.emit('order_created', newOrder);

  res.status(201).json(newOrder);
});

// PATCH /orders/:id - Update order status
app.patch('/orders/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['NEW', 'PREPARING', 'READY', 'SERVED'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid or missing status" });
  }

  const orderIndex = orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Order not found" });
  }

  orders[orderIndex].status = status;
  const updatedOrder = orders[orderIndex];

  // Emit real-time event
  io.emit('order_updated', updatedOrder);

  res.json(updatedOrder);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`\x1b[36mConnected: ${socket.id}\x1b[0m`);
  
  socket.on('disconnect', () => {
    console.log(`\x1b[33mDisconnected: ${socket.id}\x1b[0m`);
  });
});

// Server setup
const PORT = 3000;
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`\n\x1b[32m🚀 Restaurant POS Backend Server Running\x1b[0m`);
  console.log(`\x1b[35mLocal:   http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[35mNetwork: http://0.0.0.0:${PORT}\x1b[0m`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
