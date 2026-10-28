# MiniPay — Payment Transaction Tracker

A lightweight REST API for managing simulated payment transactions, built with Node.js, Express, and PostgreSQL.

## Features

- Create and retrieve payment transactions through REST APIs.
- Track transaction statuses: `PENDING`, `SUCCESS`, and `FAILED`.
- Use idempotency keys to prevent duplicate transactions on retries.
- Validate payment amounts, currencies, and transaction status updates.
- Persist transactions in PostgreSQL with database constraints.
- Test API behavior with Jest and Supertest.

## Tech Stack

- Node.js and Express.js
- PostgreSQL
- Jest and Supertest
- Postman

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Check API health |
| POST | `/api/transactions` | Create a simulated transaction |
| GET | `/api/transactions/:id` | Retrieve a transaction |
| PATCH | `/api/transactions/:id/status` | Update a pending transaction |

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file with your PostgreSQL connection settings. See `.env.example` for the required variables.

3. Create the `minipay_db` database and run the SQL schema to create the `transactions` table.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Run automated tests:

   ```bash
   npm test
   ```

## Testing

Automated tests cover transaction creation, input validation, idempotent retries, transaction retrieval, and status updates.

## Scope

MiniPay is an educational project that simulates payment transaction management. It does not process real payments or store card details.
