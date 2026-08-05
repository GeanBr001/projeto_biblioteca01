const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const db = require("../db"); // Pool do 'pg'
const upload = require("../upload");

// Leitura de produtos
router.get("/produtos", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, c.name AS category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Gestão de autores
router.get("/produtos/:id/autores", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT a.name FROM authors a
            JOIN product_authors pa ON a.id = pa.author_id
            WHERE pa.product_id = $1
        `, [req.params.id]);
        
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/autores", async (req, res) => {
    const { nome, productId } = req.body;
    if (!nome || !productId)
        return res.status(400).json({ error: "Nome e productId são obrigatórios." });

    try {
        // 1. Verifica se o autor já existe
        const existing = await db.query("SELECT id FROM authors WHERE name = $1", [nome]);
        let authorId;
        
        if (existing.rows.length > 0) {
            authorId = existing.rows[0].id;
        } else {
            // RETURNING id substitui o insertId do MySQL
            const result = await db.query(
                "INSERT INTO authors (name) VALUES ($1) RETURNING id", 
                [nome]
            );
            authorId = result.rows[0].id;
        }

        // 2. Vincula o autor ao produto.
        // O ON CONFLICT DO NOTHING do Postgres substitui o INSERT IGNORE do MySQL.
        await db.query(
            "INSERT INTO product_authors (product_id, author_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [productId, authorId]
        );

        res.json({ msg: "Autor vinculado!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cadastro de produto
router.post("/produtos", async (req, res) => {
    const { nome, descricao, estoque, preco, status, idCategoria } = req.body;
    if (!nome || preco === undefined || estoque === undefined)
        return res.status(400).json({ error: "Nome, preço e estoque são obrigatórios." });

    try {
        await db.query(
            "INSERT INTO products (name, description, stock, price, status, category_id) VALUES ($1, $2, $3, $4, $5, $6)",
            [nome, descricao || "", estoque, preco, status || "active", idCategoria || null]
        );
        res.json({ msg: "Produto cadastrado!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualiza o livro
router.put("/produtos/:id", async (req, res) => {
    const { nome, descricao, estoque, preco, status, idCategoria } = req.body;
    if (!nome || preco === undefined || estoque === undefined)
        return res.status(400).json({ error: "Nome, preço e estoque são obrigatórios." });

    try {
        await db.query(
            "UPDATE products SET name = $1, description = $2, stock = $3, price = $4, status = $5, category_id = $6 WHERE id = $7",
            [nome, descricao || "", estoque, preco, status, idCategoria || null, req.params.id]
        );
        res.json({ msg: "Produto atualizado com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Arquivos (imagens e capas)
router.put("/produtos/:id/cover", upload.single("cover"), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: "Arquivo de imagem não enviado." });

    const newPath = `/uploads/covers/${req.file.filename}`;
    try {
        const result = await db.query("SELECT cover_image FROM products WHERE id = $1", [req.params.id]);
        
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Produto não encontrado." });

        const oldPath = result.rows[0].cover_image;
        await db.query("UPDATE products SET cover_image = $1 WHERE id = $2", [newPath, req.params.id]);

        if (oldPath) {
            const abs = path.join(__dirname, "../", oldPath);
            fs.unlink(abs, err => { if (err) console.warn("Não foi possível deletar a capa antiga:", err.message); });
        }

        res.json({ msg: "Capa atualizada!", cover_image: newPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remover registro
router.delete("/produtos/:id", async (req, res) => {
    try {
        const result = await db.query("SELECT cover_image FROM products WHERE id = $1", [req.params.id]);
        
        if (result.rows.length > 0 && result.rows[0].cover_image) {
            const abs = path.join(__dirname, "../", result.rows[0].cover_image);
            fs.unlink(abs, err => { if (err) console.warn("Erro ao deletar arquivo físico:", err.message); });
        }

        await db.query("DELETE FROM products WHERE id = $1", [req.params.id]);
        res.json({ msg: "Produto removido!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;