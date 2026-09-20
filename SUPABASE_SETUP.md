# Elio waitlist: Supabase setup

## 1. Supabase Dashboard → SQL Editor

Open `001_waitlist.sql`, copy the entire file, and run it in the **Elio** Supabase project.

This creates:

- `public.waitlist_users`, with email uniqueness and private row-level security.
- `public.join_waitlist(...)`, the only anonymous operation exposed to the browser.
- Atomic referral-code creation and referral crediting.

Do not add a public `select`, `update`, or `delete` policy. Waitlist data should be read from the Supabase dashboard or a future protected admin tool.

## 2. Source file → `supabase.js`

From **Project Settings → API**, copy the Elio project's **Project URL** and **anon public key** into:

```js
const ELIO_SUPABASE_URL = "https://your-project.supabase.co";
const ELIO_SUPABASE_ANON_KEY = "your-anon-public-key";
```

The anon key is safe for browser use when RLS is configured. Never paste the `service_role` key into this project, HTML, JavaScript, or local storage.

## 3. PowerShell → local test server

Run this from the project folder:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/waitlist.html`, complete a test signup, and verify the new row in **Table Editor → waitlist_users**. Test the same email again to confirm the duplicate-email message.

## 4. Production checklist

- Configure the deployed site URL in **Authentication → URL Configuration** only if you later add Supabase Auth; the waitlist itself does not require accounts.
- Replace the placeholder values in `supabase.js` before deployment.
- Keep `001_waitlist.sql` as the source of truth for future changes.

## Elio MVP AI setup

Run `002_elio_mvp.sql` in the Supabase Dashboard SQL Editor after the waitlist migration. It creates the business-scoped product tables, RLS policies, activity/approval records, and the per-user AI quota function.

Then run `003_crm_leads.sql` to enable the Lead status and lead-source field for the CRM.

Then run `004_products.sql` to create the business-scoped product catalog, stock, pricing, sales fields, and RLS policy.

From **PowerShell** at the project root, deploy the secure AI function:

```powershell
supabase functions deploy ai-follow-up
supabase secrets set OPENAI_API_KEY=your-server-side-key OPENAI_MODEL=gpt-5-mini ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

The browser sends only an authenticated customer ID and follow-up context. The Edge Function loads the business, customer, related tasks, and recent activity through the authenticated Supabase client before calling OpenAI. The function returns structured JSON for review; it never sends or executes an action directly.

## Elio MCP infrastructure

Run `006_mcp_infrastructure.sql` in Supabase Dashboard → SQL Editor after `005_mcp_connections.sql`.

Deploy both Edge Functions with JWT verification disabled for `mcp-server` (it authenticates its own bearer client tokens) and enabled for `mcp-admin` (it requires the signed-in Elio user session). Set `MCP_ENCRYPTION_KEY` as an Edge Function secret before creating external connections. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side; it must never be placed in browser files.

The Elio MCP endpoint is `https://<project-ref>.supabase.co/functions/v1/mcp-server`. The MCP page is `mcp.html`. The server exposes business-scoped tools, resources, and prompts; write capabilities are denied unless explicitly enabled in the page. External MCP credentials are encrypted in the `mcp-admin` Edge Function and are not selected by the browser.
- Export or review waitlist data through a protected admin process; never expose the table to anonymous reads.
