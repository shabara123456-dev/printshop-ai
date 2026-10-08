# PrintShop AI — one grouped MVP setup pass

Code changes can be prepared locally first. When ready to connect the demo services, complete these setup items together.

## Supabase

From the project root:

```powershell
npx supabase@latest db push --dry-run --linked
npx supabase@latest db push --linked
```

The linked project was verified on 2026-10-03 with all local migrations through `20261003001000` applied. For later schema edits, inspect the dry-run output and review each migration before applying it. The migration history includes the private `design-files` bucket/policies, atomic marketing approval, catalog seed repair, demo records, and illustrative material requirements.

Create/sign in to the owner account in the app first, then use Supabase SQL Editor to run `supabase/setup_manager.sql` after replacing the email placeholder with the account email. This sets only that existing account's role. Do not use fictional demo contacts as real customer accounts.

## n8n and notifications

1. The current local n8n instance contains four imported workflows (daily, weekly, monthly, and event notifications); all are inactive. Do not import duplicates.
2. Current instance audit shows zero saved SMTP/Header Auth credentials and zero executions. Configure credentials in n8n, test email and webhook delivery, then activate the workflows. Earlier setup notes referred to another instance/state and are superseded by this check.
3. Keep Docker Desktop and n8n running for schedules and event delivery. After changing workflow settings, publish the updated workflow and verify a fresh execution and delivered email.

## Start and check the app

```powershell
npm install
npm start
```

In a second PowerShell window:

```powershell
npm run dev:web
```

Open `http://localhost:5173`. For deployment, set the same server-only variables on the API host and `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` in the web build environment. Never put the Supabase secret, Hermes key, or n8n shared secret in frontend variables. Marketing artwork uses the optional free AI Horde volunteer queue (`MARKETING_IMAGE_PROVIDER=ai_horde`); no image API key is required, though `AI_HORDE_API_KEY` can raise queue priority. Requests can wait or fail when volunteer workers are busy. Campaign prompts go to third-party workers, so exclude private customer data. Apply migration `20261003001300_independent_marketing_campaigns.sql`; generated artwork is private in Supabase Storage and drafts require manager approval.

Payments, social publishing, public hosting, and Lovable source linking require separate account choices and are not automatically created by this repository.
