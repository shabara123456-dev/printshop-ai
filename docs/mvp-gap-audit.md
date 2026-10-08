# PrintShop AI MVP — completion status

Brand/storefront update 2026-10-03: the web brand is now **INKORA**, with a public customer-facing catalog and original product-specific SVG concept art. See [INKORA build notes](inkora-build-notes.md). The artwork is not real photography. Migrations through `20261003001600` are applied and verified in the linked Supabase project.

This audit separates code that is ready in the repository from the account setup required to run external services.

## Implemented in this repository

| Area | Ready locally |
|---|---|
| Customer interface | React/Vite catalog, deterministic backend quote flow, quote accept/decline, order tracking timeline, English/Arabic, RTL, design brief, private reference-file upload, private final artwork review and customer approval |
| Manager interface | Live operations dashboard, analytics screen, product/variant setup, approved shop price-rule management, customer directory, quote inbox, orders, inventory, production controls, design review, Hermes chat, marketing draft generation and approval |
| Backend | Authenticated Node API, business-role checks, deterministic pricing, quote/order state machines, inventory ledger RPCs, production workflow, signed-in storage metadata checks, Hermes-only language tasks, marketing audit/usage logging |
| Supabase | Schema, RLS, seeded market references, approved EGP 2,100 base rule limited to 1,000 stickers at 10×8 cm, plus the EGP 50 shop-design fee on that exact rule. |
| Hermes | The backend HTTP client and restricted MCP tools are implemented. Routine stock/sales/production/order lookups use verified backend data without an LLM call. The local Hermes HTTP gateway is currently stopped, so manager AI chat needs it started to work. |
| n8n assets | Importable workflow JSON for low-stock/order-ready/approved-marketing event emails and the scheduled daily report; API events are protected by a shared secret. |

## External configuration status

- Migrations through `20261003001600` were applied and verified on 2026-10-03. Migration `0009` repairs demo price/order seeding; `0010` adds explicitly illustrative material-use mappings so demo quote acceptance can reserve stock and create production jobs; `0015` adds the approved EGP 50 shop-design fee to the sticker example; `0016` applies it to all 163 active price rules for products supporting shop design. New manager-created price rules default to the same fee.
- **Current n8n state (rechecked 2026-10-08):** four imported workflows are present, but all are inactive; the instance has zero saved credentials and zero executions. Earlier notes claiming successful email tests do not describe the current Docker instance. Configure credentials, activate workflows, and verify fresh executions before calling automation operational. An encrypted workflow/credential backup is stored locally under the gitignored `n8n/backups/` directory.
- The repository contains a custom React/Vite app. It is not connected to Lovable.
- The Gemini compatibility proxy syntax error was fixed and its health endpoint returns HTTP 200 from n8n's Docker network. n8n Assistant is still blocked because the sandbox tenant quota is two and both sandbox slots are occupied; the existing sessions were preserved.
- Payment, social-media publishing, production hosting, and domain setup are not enabled. Manager product/pricing controls are implemented locally; audited price-rule writes require migration `20261003000700` before production use. The approved marketing post is persisted in the approval queue and is not auto-published.

## MVP demo path

1. Sign in as customer; quote exactly 1,000 waterproof vinyl stickers at 10×8 cm and verify the backend total of EGP 2,100.
2. Accept the quote; it creates an order. Submit a design brief and optional reference files.
3. As manager, review the quote/order, move the design request through review/design, attach final artwork and submit it for customer review.
4. As customer, approve or request a revision. Manager advances production through prepress, printing, finishing, quality check, ready, and delivered.
5. Manager creates an independent campaign brief, optionally selects a catalog product, and generates a caption. Optional campaign artwork uses Gemini when its server key is configured. The manager approves or rejects the asset; approval records an `approved` marketing post for a future configured publisher.
6. Configure the current n8n instance's SMTP and Header Auth credentials, activate the daily, weekly, monthly, and event workflows, then verify fresh executions and delivered emails before relying on automation.

See [mvp-final-setup.md](mvp-final-setup.md) for one grouped setup pass, and [n8n-workflows.md](n8n-workflows.md) for import/configuration steps.
