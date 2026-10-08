-- Keep n8n's internal tables separate from the public API schemas.
-- n8n connects with the Supabase database role configured in Render and owns
-- its internal tables in this schema. No browser-facing Supabase role receives
-- access to the schema.
CREATE SCHEMA IF NOT EXISTS inkora_n8n AUTHORIZATION postgres;

REVOKE ALL ON SCHEMA inkora_n8n FROM PUBLIC;
REVOKE ALL ON SCHEMA inkora_n8n FROM anon, authenticated, service_role;
GRANT USAGE, CREATE ON SCHEMA inkora_n8n TO postgres;
