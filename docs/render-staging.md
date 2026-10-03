# Public staging deployment on Render

This Blueprint deploys the Vite customer/manager app as a public static site and the Node API as a separate public web service. Supabase remains the database and private file store. The code repository can remain private while the site is public.

## Before creating the Blueprint

1. Create a GitHub repository and push this project to it. Keep the repository private unless you explicitly want the source code public.
2. Confirm `.env`, `apps/web/.env`, and `n8n/.env` are ignored by Git. Never commit those files or paste their values into an issue or chat.
3. Connect the repository to Render and create a Blueprint from its `render.yaml` file.
4. Render will request the Supabase URL and keys for both services. Copy the values directly from your local environment files into Render's private environment-variable form. The Supabase service-role/secret key belongs only on the API service. The browser publishable key is public by design; it must be protected by the project's RLS policies.
5. Wait for both services to deploy. The Blueprint wires the static site's public URL into API CORS and the API's public URL into the frontend build.

## Supabase Auth URL configuration

In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the deployed store URL and add that URL to the redirect allow list. Use the exact `https://...onrender.com` address shown by Render. Keep localhost entries if they are still needed for development.

## This is a public demo/staging deployment

- Render's Free API instance can sleep after 15 minutes without traffic, so the first request after inactivity can take about a minute. It is suitable for previewing, not reliable business operations.
- The database is the existing Supabase project and currently contains fictional seed/demo business data. Public visitors can use customer signup and demo flows; review the Supabase project and disable public signup or demo write flows if you do not want internet visitors creating records.
- Online payments, customer AI design generation, paid design-edit checkout, social publishing, and production operations are not enabled by this deployment.
- Hermes currently runs by launching a local CLI process from the API. That CLI and its provider setup are not present in Render, so the Hermes chat is not a working cloud feature yet.
- n8n is currently configured on the owner's local Docker setup. Its schedules and webhook notifications do not run reliably as part of this Render deployment; deploy/migrate n8n and its encrypted credentials separately before relying on automation.
- No real customer data, production price rules, or unreviewed private designs should be placed in this demo Supabase project.

## Updating the public app

After deployment, push a commit to the Git branch connected to Render. Render rebuilds the static site and API from that commit. Keep application secrets in Render's service settings, not in GitHub.
