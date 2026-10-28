
jest.mock("../src/db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const pool = require("../src/db");
const app = require("../src/app");

describe("MiniPay transaction API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.connect.mockReset();
  });

  test("creates a valid transaction", async () => {
    const transaction = {
      id: "1",
      amount: "499.00",
      currency: "INR",
      status: "PENDING",
      idempotency_key: "test-key-1",
    };

    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [transaction] });

    const response = await request(app)
      .post("/api/transactions")
      .set("Idempotency-Key", "test-key-1")
      .send({ amount: 499, currency: "INR" });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("PENDING");
    expect(response.body.id).toBe("1");
  });

  test("rejects a negative amount", async () => {
    const response = await request(app)
      .post("/api/transactions")
      .set("Idempotency-Key", "test-key-2")
      .send({ amount: -10, currency: "INR" });

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("returns the existing transaction for a retry", async () => {
    const transaction = {
      id: "1",
      amount: "499.00",
      currency: "INR",
      status: "PENDING",
      idempotency_key: "test-key-1",
    };

    pool.query.mockResolvedValueOnce({ rows: [transaction] });

    const response = await request(app)
      .post("/api/transactions")
      .set("Idempotency-Key", "test-key-1")
      .send({ amount: 499, currency: "INR" });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("1");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("rejects reuse of a key with a different amount", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: "1",
        amount: "499.00",
        currency: "INR",
        status: "PENDING",
        idempotency_key: "test-key-1",
      }],
    });

    const response = await request(app)
      .post("/api/transactions")
      .set("Idempotency-Key", "test-key-1")
      .send({ amount: 999, currency: "INR" });

    expect(response.status).toBe(409);
  });

  test("retrieves an existing transaction by ID", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: "1",
        amount: "499.00",
        currency: "INR",
        status: "PENDING",
        idempotency_key: "test-key-1",
      }],
    });

    const response = await request(app)
      .get("/api/transactions/1");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("1");
  });

  test("returns 404 for a missing transaction", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get("/api/transactions/999999");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Transaction not found");
  });

  test("updates a pending transaction to SUCCESS", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: "1",
            amount: "499.00",
            currency: "INR",
            status: "SUCCESS",
            idempotency_key: "test-key-1",
          }],
        }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn(),
    };

    pool.connect.mockResolvedValueOnce(client);

    const response = await request(app)
      .patch("/api/transactions/1/status")
      .send({ status: "SUCCESS" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("SUCCESS");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test("rejects an invalid transaction status", async () => {
    const response = await request(app)
      .patch("/api/transactions/1/status")
      .send({ status: "PROCESSING" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Status must be SUCCESS or FAILED"
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
