# Elio — The calm behind your business

Elio is a framework-free SaaS MVP for small businesses. It helps owners notice important work, organize tasks, prepare customer follow-ups, review proposed actions, and understand what happened. Elio never sends an important action without a visible approval step.

## Functional MVP

- Supabase email/password authentication with persistent sessions.
- Five-step onboarding saved to a private business record.
- Protected dashboard with a deterministic daily brief from real database data.
- Customer CRUD, search, filtering, and follow-up generation flow.
- Task creation, status changes, deletion, priorities, and activity logging.
- Approval center with approve/reject state changes, related task completion, and activity logging.
- Workflow templates with activation and pause persistence.
- Product catalog with business-scoped product CRUD, stock, pricing, categories, and recorded sales.
- Transparent activity timeline, settings persistence, mobile navigation, empty states, and accessible forms.
- Connections page that honestly marks unavailable providers as Coming Soon.
- AI follow-up generation through `supabase/functions/ai-follow-up`; no OpenAI secret is sent to the browser.
- Existing pre-launch landing page and waitlist remain available at the root.

## Stack and structure

HTML5, CSS3, vanilla ES modules, Supabase Auth/Postgres/RLS, and a Supabase Edge Function for OpenAI. There is no frontend build step.

```text
login.html, signup.html, onboarding.html
app/                       protected product pages
css/                       quiet-intelligence design system
js/                        auth, Supabase client, and application code
services/                  AI, task, approval, activity, and agent services
supabase/migrations/       waitlist and MVP database migrations
supabase/functions/        secure server-side AI function
seed_demo.sql              optional development-only sample data
```

## Local setup

Run from the project root using PowerShell:

```powershell
node dev-server.mjs
```

Open `http://localhost:8000/signup.html`. Do not open ES modules using `file://`.

To exercise MCP OAuth on localhost, the static server must also be able to reach the server-side OAuth storage. In **PowerShell**, set the server-only variables before starting it (never add the service-role key to browser files):

```powershell
$env:SUPABASE_URL = 'https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = 'your-service-role-key'
node dev-server.mjs
```

Then use `http://localhost:8000/mcp`. The local server now routes discovery, registration, authorization, token, consent-detail, and MCP proxy requests through the same handlers used by Vercel. Apply migration 008 first.

## Supabase setup

1. Create or select the Elio Supabase project.
2. In Supabase Dashboard → SQL Editor, run `001_waitlist.sql` if the waitlist is needed.
3. Run `supabase/migrations/002_elio_mvp.sql`.
4. Run `supabase/migrations/003_crm_leads.sql` to enable lead records and lead sources.
5. Run `supabase/migrations/004_products.sql` to enable the product catalog and its RLS policy.
6. Confirm the public URL and anon key in `js/config.js`. Only the anon key may appear in browser code; never use `service_role` there.
6. In Authentication → URL Configuration, add the local and deployed site URLs.
7. Create a user through `signup.html`, complete onboarding, and verify that records belong only to that user’s business.

The migration enables RLS on every product table. Child records are readable and writable only when their `business_id` belongs to the authenticated user.

## AI configuration

Deploy the secure function from the project root:

```powershell
supabase functions deploy ai-follow-up
supabase secrets set OPENAI_API_KEY=your-server-side-key OPENAI_MODEL=gpt-5-mini ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

`OPENAI_API_KEY` must remain an Edge Function secret. On `localhost`, Elio automatically uses an explicitly labeled deterministic AI test service so you can validate customer, tone, follow-up, approval, execution, and activity flows before deploying the Edge Function. Deployed hosts remain real-only by default. To force a mode, set `window.ELIO_AI_MODE = 'mock'` or `'real'` before the app module loads.

## Optional development seed

After signing in and completing onboarding, run `seed_demo.sql` in Supabase SQL Editor only for a development workspace. It creates sample customers, tasks, an approval, and activity for the currently authenticated business. Do not run it against real customer data.

## Deployment and verification

Upload the complete project while preserving `app`, `css`, `js`, `services`, and `supabase` paths. Deploy the database migration before testing authenticated pages, then deploy the Edge Function and set its secret. Static syntax checks do not prove authentication, persistence, RLS, or AI deployment; test signup, onboarding, CRUD, approval resolution, logout, and follow-up generation against the deployed URL.

## MCP OAuth 2.1 deployment

1. **Supabase Dashboard → SQL Editor:** run `supabase/migrations/008_mcp_oauth_21.sql` after migrations 005–007.
2. **PowerShell:** deploy the updated MCP functions: `supabase functions deploy mcp-server --no-verify-jwt` and `supabase functions deploy mcp-admin`. `mcp-server` validates its own OAuth bearer token, so the Supabase gateway must not require a Supabase JWT before that validation can run.
3. **Vercel Project → Environment Variables:** set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Production and Preview. The service-role key is used only by the serverless OAuth endpoints; never put it in browser code.
4. **Vercel:** deploy this repository, including `api/` and `vercel.json`. The public MCP URL is `https://your-elio-domain/mcp`; it publishes OAuth protected-resource and authorization-server discovery automatically.
5. **Supabase Dashboard → Authentication → URL Configuration:** add `https://your-elio-domain/app/oauth-consent.html` and the deployed site URL to redirect URLs.

The OAuth server requires Authorization Code + PKCE S256. It supports HTTPS Client ID Metadata Documents and public Dynamic Client Registration, hashes authorization codes and tokens at rest, rotates refresh tokens, and exposes only `business.read` and explicit `business.write` scope. Revoke OAuth grants from the MCP dashboard.

## Existing waitlist

The original waitlist remains a real Supabase RPC flow. `waitlist.html` calls `join_waitlist` and redirects only after a referral code is returned. Waitlist data is not exposed through anonymous table reads.
