# INKORA — AI Store Operating System

**Run your store from one place.** INKORA brings a customer storefront, business operations, AI assistance, and workflow automation together in one platform. It is designed for businesses selling many kinds of products, with printing as its first specialized example.

[Open the live INKORA store](https://printshop-ai.shabara123456.workers.dev/)

## What INKORA does

### For customers

- Browse the store and explore products.
- Configure products, request prices, and place orders.
- Upload artwork or request help with a design.
- Follow order progress from their account.

### For managers

- Manage products, approved prices, orders, customers, inventory, and production.
- Review business activity and prepare marketing campaigns.
- Generate campaign images and edit each post before approval.
- Ask the AI assistant business questions or request supported changes in natural language.
- Receive configured operational notifications and scheduled reports by email.

Managers can use the dashboard directly or ask the assistant to help. AI actions go through INKORA’s permission checks and business rules before any supported change is made.

## How it works

```text
Customer storefront ──┐
                      ├── INKORA API ── Supabase
Manager dashboard ────┘       │
                              ├── Gemini through Hermes and MCP
                              └── n8n workflows ── Email and notifications
```

- **INKORA backend** validates requests and owns business rules for products, pricing, orders, and inventory.
- **Supabase** stores application data, authentication, and files.
- **Hermes with Gemini and MCP tools** provides natural-language assistance. It uses approved application tools rather than unrestricted database access.
- **n8n** runs configured event workflows, notifications, and scheduled email reports.
- **Cloudflare Workers AI** generates optional campaign images; generated artwork is stored with the marketing draft for manager review.

Prices, stock, order state, permissions, and business metrics are decided by application code and stored data—not by an LLM.

## Demo

Open the [live site](https://printshop-ai.shabara123456.workers.dev/) and try this flow:

1. Browse products in the customer storefront.
2. Select a product and configure an available option to view its price.
3. Sign in with a manager account to review orders, inventory, production, and marketing.
4. Create a marketing campaign, generate artwork, edit its posts, and review them before approval.
5. Ask the manager assistant a business question or request a supported dashboard change.

The catalog includes editable sample content for demonstration. Configure the business’s real products, prices, and stock before using it to take real orders.

## Technology

- React, TypeScript, and Vite
- Node.js API
- Supabase PostgreSQL, Auth, Storage, and Row Level Security
- Hermes, Gemini, and Model Context Protocol (MCP)
- n8n workflow automation
- Cloudflare Workers and Workers AI

## Run locally

Requirements: Node.js 22.17 or later, a Supabase project, and the environment files described in the examples.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env`, and `apps/web/.env.example` to `apps/web/.env`. Add the required project configuration to the appropriate file. Keep server secrets in the root `.env`; never place service-role, Hermes, Gemini, or n8n secrets in the frontend environment.

3. Start the API from the repository root:

   ```powershell
   npm start
   ```

4. In a second terminal, start the web app:

   ```powershell
   npm run dev:web
   ```

5. Open [http://localhost:5173](http://localhost:5173).

For local checks, run:

```powershell
npm test
npm run typecheck
npm run build:web
```

Deploy the web app and API Worker with:

```powershell
npm run deploy:cloudflare
```

## Project guides

- [Architecture](docs/architecture.md)
- [n8n workflows](docs/n8n-workflows.md)
- [Hermes integration](docs/hermes-integration.md)
- [Final setup guide](docs/mvp-final-setup.md)

## Security

Authentication and role checks are enforced by the backend and Supabase policies. Private customer files are stored separately from public storefront assets. API keys and service credentials belong in server-side environment variables or encrypted deployment secrets; never commit them to the repository.
