# AGENTS.md - Developer & Agent Guide

## Project Overview
**Contracts Firebase** is a contract management system tailored for a travel agency (**Jollift Travel**). It manages the entire lifecycle of sales contracts, from drafting and approval to client signing and archiving.

## Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Templating**: EJS (Server-side rendering)
- **Database**: PostgreSQL (via Supabase)
- **UI Framework**: Bootstrap 5
- **Authentication**: Session-based (`express-session`)

## Critical Rules
1.  **Language**: All User Interface (UI) text **MUST** be in **Traditional Chinese (繁體中文 - Taiwan)**.
    -   Use `zh-Hant` for HTML attributes.
    -   Currency format: TWD/NT$ (e.g., NT$ 10,000).
2.  **No SPA Frameworks**: Do not introduce React, Vue, or build steps (Webpack/Vite). Keep the logic simple with Vanilla JS in EJS templates.
3.  **Database**: Do not mix `local` and `production` database schemas. Use migrations (if available) or SQL scripts for schema changes.

## Architecture

### Directory Structure
-   `src/server.js`: Application entry point.
-   `src/controllers/`: Business logic.
    -   `authController.js`: Login/Logout.
    -   `salesController.js`: Salesperson workflows.
    -   `managerController.js`: Manager approval workflows.
    -   `publicController.js`: Client-facing signing pages.
-   `src/models/`: Database access layer (PostgreSQL).
-   `src/views/`: EJS Templates.
    -   `sales/`: Views for salespeople.
    -   `manager/`: Views for managers.
    -   `partials/`: Shared components (header, footer, navbar).

### Core Workflows

#### 1. Contract Lifecycle
1.  **Draft**: Salesperson creates a contract.
2.  **Pending Approval**: Salesperson submits for manager review.
3.  **Pending Signature** (Approved): Manager approves. Salesperson generates a signing link.
    -   **Short Link**: Accessible via `/s/:code`.
    -   **Verification Code**: 6-digit code requried for client identity verification (hashed in DB).
4.  **Signed**: Client signs the contract (Digital Signature).
5.  **Rejected**: Manager rejects the contract (returns to Draft/Edit).
6.  **Cancelled**: Salesperson or Manager cancels the contract.

#### 2. Face-to-Face Signing
-   Allows salespeople to bypass the verification code step when meeting clients in person.
-   Triggered via `?mode=face-to-face` on the signing URL.
-   **Security**: Only works if the user is authenticated as a Salesperson or Manager in the current browser session.

#### 3. Roles & Permissions
-   **Admin**: Full access.
-   **Manager**: Can view all contracts, approve/reject contracts.
-   **Salesperson**: Can create/edit their own contracts, view their own dashboard.

## Environment Variables (.env)
Required variables:
-   `DATABASE_URL`: PostgreSQL connection string (Use IPv4 Transaction Pooler for Supabase).
-   `SESSION_SECRET`: Secret for session signing.
-   `JWT_SECRET`: Secret for tokens (if used).

## Common Issues & Troubleshooting
-   **Supabase IPv6 Errors**: If you see `ECONNREFUSED` with an IPv6 address, ensure the `DATABASE_URL` uses the IPv4 pooler hostname (e.g., `aws-0-ap-northeast-1.pooler.supabase.com`) or force IPv4 in `db.js`.
-   **EJS Syntax**: Be careful with `<%= %>` (escape) vs `<%- %>` (unescape). Use valid JavaScript inside tags.

## Code Style
-   Use `const` and `async/await`.
-   Error handling: Wrap controller logic in `try/catch` blocks.
-   Logging: Use `console.error` for errors, keep debug logs minimal in production.
