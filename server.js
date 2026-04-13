import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

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
let tables = [
  { id: 1, status: "VACANT", orders: [] },
  { id: 2, status: "VACANT", orders: [] },
  { id: 3, status: "VACANT", orders: [] }
];

let menu = [
  { id: 1, name: "Pizza", price: 250 },
  { id: 2, name: "Burger", price: 150 }
];

// REST API Endpoints

// GET /tables - Return all tables
app.get('/tables', (req, res) => {
  res.json(tables);
});

// GET /menu - Return all menu items
app.get('/menu', (req, res) => {
  res.json({ menu });
});

// GET /orders - Return all orders
app.get('/orders', (req, res) => {
  res.json({ orders });
});

// POST /orders - Create new order
app.post('/orders', (req, res) => {
  const { table_number, items } = req.body;

  if (!table_number || !items) {
    return res.status(400).json({ error: "Table number and items are required" });
  }

  const savedOrder = {
    id: uuidv4(),
    table_number,
    items,
    status: 'NEW',
    timestamp: new Date().toISOString()
  };

  orders.push(savedOrder);

  // Update table status
  const table = tables.find(t => t.id === parseInt(req.body.table));
  if (table) {
    table.status = "OCCUPIED";
    table.orders.push(savedOrder);
    io.emit("table_updated", table);
  }

  // Emit real-time event for order
  io.emit('order_created', savedOrder);

  res.status(201).json(savedOrder);
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

httpServer.listen(PORT, '0.0.0.0', () => {
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }

  console.log(`\n\x1b[32m🚀 Restaurant POS Backend Server Running\x1b[0m`);
  console.log(`\x1b[35mLocal:   http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[35mNetwork: http://${localIP}:${PORT}\x1b[0m`);
  console.log(`\n\x1b[33mUse the Network URL to connect from your Captain App!\x1b[0m\n`);
  console.log(`Press Ctrl+C to stop\n`);
});
