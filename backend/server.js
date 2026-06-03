const express = require("express");
const cors = require("cors");
const path = require("path");

const productRoutes = require("./routes/productRoutes");
const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");

const app = express();
app.use(cors());
app.use(express.json());

// exemplo de uso desse middlewrea: GET http://localhost:3000/uploads/covers/cover.jpg
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// rotas
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);

app.listen(3000, () => console.log("Servidor rodando em http://localhost:3000"));

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Servir arquivos do frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rota para Home Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/home.html'));
});

// Rota para painel/biblioteca
app.get('/biblioteca', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Rota para login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});