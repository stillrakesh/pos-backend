import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import fs from 'fs';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"]
  }
});

// Middleware
app.use(express.json());
app.use(cors());

// Request Logger
app.use((req, res, next) => {
  console.log(`\x1b[34m[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}\x1b[0m`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// 1. In-memory data & Persistence
const DATA_FILE = "./menu.json";
const TABLES_FILE = "./tables.json";
const ORDERS_FILE = "./orders.json";

// Shared save helpers
const saveMenu = () => fs.writeFileSync(DATA_FILE, JSON.stringify(menu, null, 2));
const saveTables = () => fs.writeFileSync(TABLES_FILE, JSON.stringify(tables, null, 2));
const saveOrders = () => fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

// Initial State Loading
let menu = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : [];
let categories = ["Main Course", "Starters", "Snacks", "Drinks", "Desserts"]; // Added defaults
let orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE)) : [];
let tables = fs.existsSync(TABLES_FILE) ? JSON.parse(fs.readFileSync(TABLES_FILE)) : [];

// Default tables if none exist
if (tables.length === 0) {
  tables = [
    { id: 1, name: "Table 1", status: "free", orders: [], pos: { x: 50, y: 50 }, type: "Main Floor" },
    { id: 2, name: "Table 2", status: "free", orders: [], pos: { x: 200, y: 50 }, type: "Main Floor" }
  ];
  saveTables();
}

// 2. APIs

// GET /menu - Return all menu items
app.get('/menu', (req, res) => {
  res.json(menu);
});

app.get("/categories", (req, res) => {
  res.json(categories);
});

app.post("/categories", (req, res) => {
  const { name } = req.body;

  if (!name) return res.status(400).json({ error: "Category required" });

  if (!categories.includes(name)) {
    categories.push(name);
  }

  res.json({ success: true, categories });
});

app.post("/menu", (req, res) => {
  console.log("📥 Incoming /menu request:", req.body);
  
  const { name, price, category, type } = req.body;

  if (!name || !price) {
    console.error("❌ Missing required fields: name or price");
    return res.status(400).json({ success: false, error: "Name and price are required" });
  }

  const newItem = {
    id: Date.now(),
    category: category || "Uncategorized",
    type: type || "General",
    ...req.body,
    inStock: req.body.inStock !== undefined ? req.body.inStock : true,
    stockQuantity: req.body.stockQuantity || 0
  };

  menu.push(newItem);
  saveMenu();

  console.log("✅ Menu item saved:", newItem);

  res.json({
    success: true,
    item: newItem
  });
});

// PUT /menu/:id - Update item
app.put('/menu/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, category } = req.body;

  const itemIndex = menu.findIndex(m => m.id === parseInt(id));
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Item not found" });
  }

  menu[itemIndex] = {
    ...menu[itemIndex],
    ...req.body
  };

  io.emit("menu_updated", menu);
  res.json(menu[itemIndex]);
});

// DELETE /menu/:id - Remove item
app.delete('/menu/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = menu.length;
  
  menu = menu.filter(m => m.id !== parseInt(id));

  if (menu.length === initialLength) {
    return res.status(404).json({ error: "Item not found" });
  }

  io.emit("menu_updated", menu);
  res.status(204).send();
});

app.get("/test-add-menu", (req, res) => {
  const newItem = {
    id: Date.now(),
    name: "Test Item",
    price: 999
  };

  menu.push(newItem);

  console.log("Added item:", newItem);

  res.json({
    message: "Item added",
    menu
  });
});

// GET /tables - Return all tables
app.get('/tables', (req, res) => {
  res.json(tables);
});

// GET /table/:id - Return a single table with its orders
app.get('/table/:id', (req, res) => {
  const tableId = parseInt(req.params.id);
  const table = tables.find(t => t.id === tableId);
  
  if (!table) return res.status(404).json({ error: "Table not found" });

  const tableOrders = orders.filter(o => o.tableId === tableId);

  res.json({
    table,
    orders: tableOrders
  });
});

app.post("/tables", (req, res) => {
  const newTable = {
    id: Date.now(),
    ...req.body,
    status: req.body.status || "free",
    orders: []
  };

  tables.push(newTable);
  saveTables();

  console.log("TABLE ADDED:", newTable);

  res.json({
    success: true,
    item: newTable
  });
});

// PATCH /tables/:id - Update table (status, etc.)
app.patch('/tables/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const table = tables.find(t => t.id === parseInt(id));
  if (!table) {
    return res.status(404).json({ error: "Table not found" });
  }

  // Update all fields provided in request
  Object.assign(table, req.body);
  saveTables();

  io.emit("table_updated", table);
  res.json(table);
});

// DELETE /tables/:id - Remove table
app.delete('/tables/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = tables.length;
  
  tables = tables.filter(t => t.id !== parseInt(id));
  saveTables();

  if (tables.length === initialLength) {
    return res.status(404).json({ error: "Table not found" });
  }

  // When a table is deleted, we notify the clients that a change happened.
  // We emit null or an empty update for that ID, or just emit the whole list.
  // For consistency with real-time UI, I'll emit "table_deleted" or just "table_updated" with the list.
  // I'll emit the new list to ensure UI sync.
  io.emit("table_updated", { deletedId: parseInt(id), tables }); 
  res.status(204).send();
});

// GET /orders - Return all orders
app.get("/orders", (req, res) => {
  res.json(orders);
});

// POST /table/:id/clear - Clear orders and free table
app.post("/table/:id/clear", (req, res) => {
  const tableId = parseInt(req.params.id);
  const table = tables.find(t => t.id === tableId);
  
  if (!table) return res.status(404).json({ error: "Table not found" });

  // 1. Remove orders for this table from global list
  orders = orders.filter(o => o.tableId !== tableId);
  saveOrders();

  // 2. Reset table status
  table.status = "free";
  table.orders = [];
  saveTables();

  io.emit("table_updated", table);
  res.json({ success: true, table });
});



// POST /orders - Create new order
app.post("/orders", (req, res) => {
  // Support both 'tableId' and 'table' for backward compatibility
  const rawTableId = req.body.tableId || req.body.table;
  const { items } = req.body;

  if (!rawTableId) {
    return res.status(400).json({ error: "Table ID is required" });
  }

  const newOrder = {
    id: Date.now(),
    tableId: parseInt(rawTableId),
    items,
    status: "running"
  };

  orders.push(newOrder);
  saveOrders();

  // 🔥 mark table as occupied
  const table = tables.find(t => t.id === parseInt(rawTableId));
  if (table) {
    table.status = "occupied";
    if (!table.orders) table.orders = [];
    table.orders.push(newOrder);
    saveTables();
    
    // Emit real-time table update
    io.emit("table_updated", table);
  }

  // Emit real-time order creation
  io.emit('order_created', newOrder);

  res.json({
    success: true,
    order: newOrder
  });
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
  saveOrders();

  // Also update the order status within the tables array
  tables.forEach(t => {
    const tableOrderIndex = t.orders.findIndex(o => o.id === id);
    if (tableOrderIndex !== -1) {
      t.orders[tableOrderIndex].status = status;
      saveTables();
      // Emit table_updated whenever an internal order changes status
      io.emit("table_updated", t);
    }
  });

  // Emit real-time order update
  io.emit('order_updated', updatedOrder);

  res.json(updatedOrder);
});

// 3. Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`\x1b[36mℹ Client Connected: ${socket.id}\x1b[0m`);
  
  socket.on('disconnect', () => {
    console.log(`\x1b[33mℹ Client Disconnected: ${socket.id}\x1b[0m`);
  });
});

// 4. Server setup
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

  console.log(`\n\x1b[32m🚀 Restaurant POS Backend Standardized & Running\x1b[0m`);
  console.log(`\x1b[35mLocal:   http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[35mNetwork: http://${localIP}:${PORT}\x1b[0m`);
  console.log(`\n\x1b[33mUse the Network URL to connect your Captain App and Table devices!\x1b[0m\n`);
  console.log(`Press Ctrl+C to stop\n`);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('\x1b[31m💥 CRITICAL SERVER ERROR:\x1b[0m', err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});
