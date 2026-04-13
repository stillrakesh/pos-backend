# Restaurant POS Backend (Lightweight)

A fast, in-memory backend for restaurant POS systems.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

## Features
- **REST API**: Create and manage orders.
- **In-Memory**: No database setup required.
- **Real-time**: Socket.IO events for instant updates.
- **Network-Ready**: Binds to `0.0.0.0` for local network access.

## API Reference

### Orders
- `GET /orders`: List all orders.
- `POST /orders`: Create new order.
  - Body: `{ "table_number": 5, "items": [{"name": "Pizza", "quantity": 1}] }`
- `PATCH /orders/:id`: Update status.
  - Body: `{ "status": "PREPARING" }`
  - Valid statuses: `NEW`, `PREPARING`, `READY`, `SERVED`

## Socket.IO Events
- `order_created`: Emitted when a new order is posted.
- `order_updated`: Emitted when an order status is updated.
