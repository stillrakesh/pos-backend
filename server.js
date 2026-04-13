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
app.use(express.json());
app.use(cors());

// 1. In-memory data
let orders = [];

let menu = [];

let tables = [
  { id: 1, status: "VACANT", orders: [] },
  { id: 2, status: "VACANT", orders: [] },
  { id: 3, status: "VACANT", orders: [] }
];

// 2. APIs

// GET /menu - Return all menu items
app.get('/menu', (req, res) => {
  res.json(menu);
});

app.post("/menu", (req, res) => {
  const newItem = {
    id: Date.now(),
    name: req.body.name,
    price: req.body.price,
    category: req.body.category || "Uncategorized"
  };

  menu.push(newItem);

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
    name: name || menu[itemIndex].name,
    price: price || menu[itemIndex].price,
    category: category || menu[itemIndex].category
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

// POST /tables - Add new table
app.post('/tables', (req, res) => {
  const { id } = req.body;
  
  const newTable = {
    id: id || (tables.length > 0 ? Math.max(...tables.map(t => t.id)) + 1 : 1),
    status: "VACANT",
    orders: []
  };

  if (tables.find(t => t.id === newTable.id)) {
    return res.status(400).json({ error: "Table ID already exists" });
  }

  tables.push(newTable);
  io.emit("table_updated", newTable);
  res.status(201).json(newTable);
});

// PATCH /tables/:id - Update table (status, etc.)
app.patch('/tables/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const table = tables.find(t => t.id === parseInt(id));
  if (!table) {
    return res.status(404).json({ error: "Table not found" });
  }

  if (status) table.status = status;

  io.emit("table_updated", table);
  res.json(table);
});

// DELETE /tables/:id - Remove table
app.delete('/tables/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = tables.length;
  
  tables = tables.filter(t => t.id !== parseInt(id));

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
app.get('/orders', (req, res) => {
  res.json(orders);
});

// POST /orders - Create new order
app.post('/orders', (req, res) => {
  const { table, items } = req.body;

  if (!table || !items) {
    return res.status(400).json({ error: "Table ID and items are required" });
  }

  const newOrder = {
    id: uuidv4(),
    table: parseInt(table),
    items,
    status: 'NEW',
    timestamp: new Date().toISOString()
  };

  orders.push(newOrder);

  // Assign to table and change status
  const targetTable = tables.find(t => t.id === parseInt(table));
  if (targetTable) {
    targetTable.status = "OCCUPIED";
    targetTable.orders.push(newOrder);
    
    // Emit real-time table update
    io.emit("table_updated", targetTable);
  }

  // Emit real-time order creation
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

  // Also update the order status within the tables array
  tables.forEach(t => {
    const tableOrderIndex = t.orders.findIndex(o => o.id === id);
    if (tableOrderIndex !== -1) {
      t.orders[tableOrderIndex].status = status;
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
