const express = require("express");
const router = express.Router();
const db = require("../db"); // Pool do 'pg'

// Autenticação de usuário
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password)
        return res.status(400).json({ error: "Email e senha são obrigatórios." });

    try {
        // Busca o usuário apenas se ele estiver com a conta ativa
        const result = await db.query(
            "SELECT id, name, email, role FROM customers WHERE email = $1 AND password = $2 AND active = TRUE",
            [email, password]
        );

        if (result.rows.length === 0)
            return res.status(401).json({ error: "Email ou senha inválidos." });

        res.json({ user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Gestão de cadastro
router.post("/clientes", async (req, res) => {
    const { nome, email, telefone, password, role, endereco } = req.body;

    // Validação básica pra não deixar passar campo nulo
    if (!nome || !email || !password || !endereco?.rua || !endereco?.cidade || !endereco?.estado || !endereco?.cep)
        return res.status(400).json({ error: "Campos obrigatórios faltando." });

    const client = await db.connect();

    try {
        await client.query("BEGIN"); // Inicia transação

        // Salva o endereço e recupera o ID retornado
        const resAddr = await client.query(
            "INSERT INTO addresses (zip_code, neighborhood, city, state, number, street) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [endereco.cep, endereco.bairro || "", endereco.cidade, endereco.estado, endereco.numero || "", endereco.rua]
        );

        const idEndereco = resAddr.rows[0].id;

        await client.query(
            "INSERT INTO customers (name, email, phone, password, role, address_id) VALUES ($1, $2, $3, $4, $5, $6)",
            [nome, email, telefone || "", password, role || "client", idEndereco]
        );

        await client.query("COMMIT");
        res.json({ msg: "Cliente cadastrado!" });
    } catch (error) {
        await client.query("ROLLBACK");
        // No Postgres, 23505 indica violação de constraint ÚNICA (ex: email duplicado)
        if (error.code === "23505")
            return res.status(409).json({ error: "Email já cadastrado." });
            
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Leitura
router.get("/clientes", async (req, res) => {
    try {
        // JOIN para trazer os dados do cliente junto com o endereço
        const result = await db.query(`
            SELECT c.id, c.name, c.email, c.phone, c.role, c.active, c.address_id,
                   a.street, a.city, a.state, a.zip_code, a.neighborhood, a.number
            FROM customers c
            LEFT JOIN addresses a ON c.address_id = a.id
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualização dos dados do cliente
router.put("/clientes/:id", async (req, res) => {
    const { nome, email, telefone, role, rua, numero, bairro, cidade, estado, cep } = req.body;

    if (!email) return res.status(400).json({ error: "Email é obrigatório." });

    try {
        // Atualiza os dados básicos do perfil
        await db.query(
            "UPDATE customers SET name = $1, email = $2, phone = $3, role = $4 WHERE id = $5",
            [nome, email, telefone || "", role || "client", req.params.id]
        );

        // Se mandou dados de endereço, atualiza a tabela vinculada
        if (rua || cidade || estado || cep) {
            const result = await db.query("SELECT address_id FROM customers WHERE id = $1", [req.params.id]);
            if (result.rows.length > 0 && result.rows[0].address_id) {
                await db.query(
                    "UPDATE addresses SET street = $1, number = $2, neighborhood = $3, city = $4, state = $5, zip_code = $6 WHERE id = $7",
                    [rua || "", numero || "", bairro || "", cidade || "", estado || "", cep || "", result.rows[0].address_id]
                );
            }
        }
        res.json({ msg: "Dados atualizados!" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(409).json({ error: "Email já cadastrado." });
            
        res.status(500).json({ error: error.message });
    }
});

// Remover registro de cliente
router.delete("/clientes/:id", async (req, res) => {
    const client = await db.connect();

    try {
        const result = await client.query("SELECT address_id FROM customers WHERE id = $1", [req.params.id]);
        
        if (result.rows.length > 0) {
            const idEndereco = result.rows[0].address_id;

            await client.query("BEGIN");

            // Apaga o cliente primeiro e depois o endereço
            await client.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
            if (idEndereco) {
                await client.query("DELETE FROM addresses WHERE id = $1", [idEndereco]);
            }

            await client.query("COMMIT");
            res.json({ msg: "Cliente e endereço removidos!" });
        } else {
            res.status(404).json({ error: "Cliente não encontrado" });
        }
    } catch (error) {
        await client.query("ROLLBACK");
        // Tratamento de erro quando há restrição de chave estrangeira com pedidos vinculados
        res.status(500).json({ error: "Erro ao excluir: o cliente possui pedidos vinculados." });
    } finally {
        client.release();
    }
});

module.exports = router;