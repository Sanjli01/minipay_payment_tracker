
const express = require("express");
const pool = require("./db");

const app = express();

app.use(express.json());

// Health-check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to MiniPay API",
    status: "running",
  });
});

// Create a simulated payment transaction
app.post("/api/transactions", async (req, res) => {
  try {
    const { amount, currency = "INR" } = req.body;
    const idempotencyKey = req.get("Idempotency-Key");

    // Validate amount
    if (
      amount === undefined ||
      amount === null ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        error: "Amount must be a positive number",
      });
    }

    // Validate currency
    if (
      typeof currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(currency)
    ) {
      return res.status(400).json({
        error: "Currency must be a 3-letter code",
      });
    }

    // Validate idempotency key
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > 255
    ) {
      return res.status(400).json({
        error: "A valid Idempotency-Key header is required",
      });
    }

    // Check whether this request was already processed
    const existing = await pool.query(
      "SELECT * FROM transactions WHERE idempotency_key = $1",
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const transaction = existing.rows[0];

      // Prevent reusing a key for a different payment
      if (
        Number(transaction.amount) !== amount ||
        transaction.currency !== currency.toUpperCase()
      ) {
        return res.status(409).json({
          error: "Idempotency key was already used for a different request",
        });
      }

      return res.status(200).json(transaction);
    }

    // Create a new transaction
    const result = await pool.query(
      `INSERT INTO transactions (amount, currency, idempotency_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [amount, currency.toUpperCase(), idempotencyKey]
    );

    if (result.rows.length > 0) {
      return res.status(201).json(result.rows[0]);
    }

    // Another concurrent request may have used the same key
    const retry = await pool.query(
      "SELECT * FROM transactions WHERE idempotency_key = $1",
      [idempotencyKey]
    );

    if (retry.rows.length === 0) {
      return res.status(500).json({
        error: "Unable to create or retrieve transaction",
      });
    }

    const transaction = retry.rows[0];

    if (
      Number(transaction.amount) !== amount ||
      transaction.currency !== currency.toUpperCase()
    ) {
      return res.status(409).json({
        error: "Idempotency key was already used for a different request",
      });
    }

    return res.status(200).json(transaction);
  } catch (error) {
    console.error("Create transaction error:", error.message);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});




app.get("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id) || id === "0") {
      return res.status(400).json({
        error: "Transaction ID must be a positive integer",
      });
    }

    const result = await pool.query(
      "SELECT * FROM transactions WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Transaction not found",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Get transaction error:", error.message);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});




app.patch("/api/transactions/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  // 1. Validate transaction ID before connecting to the database
  if (!/^\d+$/.test(id) || id === "0") {
    return res.status(400).json({
      error: "Transaction ID must be a positive integer",
    });
  }

  // 2. Validate status before connecting to the database
  if (!["SUCCESS", "FAILED"].includes(status)) {
    return res.status(400).json({
      error: "Status must be SUCCESS or FAILED",
    });
  }

  let client;

  try {
    // 3. Acquire a database connection only after validation
    client = await pool.connect();

    await client.query("BEGIN");

    // 4. Update only transactions that are still pending
    const result = await client.query(
      `UPDATE transactions
       SET status = $1
       WHERE id = $2 AND status = 'PENDING'
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      const existing = await client.query(
        "SELECT status FROM transactions WHERE id = $1",
        [id]
      );

      await client.query("ROLLBACK");

      if (existing.rows.length === 0) {
        return res.status(404).json({
          error: "Transaction not found",
        });
      }

      return res.status(409).json({
        error: "Transaction is no longer pending",
        currentStatus: existing.rows[0].status,
      });
    }

    // 5. Commit the successful update
    await client.query("COMMIT");

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Update status error:", error.message);

    return res.status(500).json({
      error: "Internal server error",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});




module.exports = app;
