const express = require("express");
const router = express.Router();
const db = require("../db"); // Importa o pool do 'pg'

// Criação de pedidos
router.post("/pedidos", async (req, res) => {
    const { idClientes, valor_total, itens, tipo_pagamento } = req.body;
    
    // Abrimos um cliente individual do pool para controlar a transação
    const client = await db.connect();

    try {
        await client.query("BEGIN"); // Inicia a transação

        // 1. Cria o pedido e retorna o ID gerado usando RETURNING
        const resPedido = await client.query(
            "INSERT INTO orders (total_value, status, ordered_at, customer_id) VALUES ($1, 'processing', NOW(), $2) RETURNING id",
            [valor_total, idClientes]
        );

        const idPedido = resPedido.rows[0].id;

        // 2. Insere os itens do pedido
        for (let item of itens) {
            await client.query(
                "INSERT INTO order_items (quantity, unit_price, product_id, order_id) VALUES ($1, $2, $3, $4)",
                [item.quantidade, item.preco, item.idProduto, idPedido]
            );
        }

        // 3. Insere o pagamento
        await client.query(
            "INSERT INTO payments (method, status, order_id) VALUES ($1, 'pending', $2)",
            [tipo_pagamento, idPedido]
        );

        await client.query("COMMIT"); // Confirma todas as operações
        res.json({ msg: "Pedido e Pagamento registrados!", idPedido });
    } catch (error) {
        await client.query("ROLLBACK"); // Desfaz alterações caso ocorra erro
        res.status(500).json({ error: error.message });
    } finally {
        client.release(); // Libera o cliente de volta para o pool
    }
});

// Consulta de dados
router.get("/pedidos/cliente/:id", async (req, res) => {
    try {
        // No pg, a propriedade .rows traz os registros retornados
        const result = await db.query(
            "SELECT * FROM orders WHERE customer_id = $1",
            [req.params.id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manutenção de status
router.put("/pedidos/:id/status", async (req, res) => {
    const { status } = req.body;
    try {
        await db.query(
            "UPDATE orders SET status = $1 WHERE id = $2",
            [status, req.params.id]
        );
        res.json({ msg: "Status do pedido atualizado!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Exclusão de registros
router.delete("/pedidos/:id", async (req, res) => {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        // Remove pagamentos, itens e o pedido dentro da transação
        await client.query("DELETE FROM payments WHERE order_id = $1", [req.params.id]);
        await client.query("DELETE FROM order_items WHERE order_id = $1", [req.params.id]);
        await client.query("DELETE FROM orders WHERE id = $1", [req.params.id]);

        await client.query("COMMIT");
        res.json({ msg: "Pedido e dados relacionados excluídos!" });
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;