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
- AI follow-up generation through `function-ai-follow-up.ts`; no OpenAI secret is sent to the browser.
- Existing pre-launch landing page and waitlist remain available at the root.

## Stack and structure

HTML5, CSS3, vanilla ES modules, Supabase Auth/Postgres/RLS, and a Supabase Edge Function for OpenAI. There is no frontend build step.

```text
index.html, login.html, signup.html, onboarding.html
activity.html … workflows.html   protected product pages (all at root)
variables.css … app-responsive.css  quiet-intelligence design system
app.js, auth.js, supabase-client.js  application code at root
*-service.js               AI, task, approval, activity, and agent services
002_*.sql … 008_*.sql      MVP database migrations
function-*.ts              server-side Edge Functions
mvp/                       original pre-launch MVP snapshot (do not deploy)
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
3. Run `002_elio_mvp.sql`.
4. Run `003_crm_leads.sql` to enable lead records and lead sources.
5. Run `004_products.sql` to enable the product catalog and its RLS policy.
6. Confirm the public URL and anon key in `config.js`. Only the anon key may appear in browser code; never use `service_role` there.
6. In Authentication → URL Configuration, add the local and deployed site URLs.
7. Create a user through `signup.html`, complete onboarding, and verify that records belong only to that user’s business.

The migration enables RLS on every product table. Child records are readable and writable only when their `business_id` belongs to the authenticated user.

## AI configuration

In this flattened checkout the Edge Functions live at the repository root as `function-ai-assistant.ts` and `function-ai-follow-up.ts` (no `supabase/functions/` directory). The Supabase CLI deploys from a `supabase/functions/<function-name>/index.ts` layout, so stage the two files before deploying:

```powershell
# One-time: link the CLI to your Supabase project
supabase link --project-ref <your-project-ref>

# Stage the flattened function sources into the CLI layout
New-Item -ItemType Directory -Force supabase/functions/ai-assistant, supabase/functions/ai-follow-up | Out-Null
Copy-Item function-ai-assistant.ts supabase/functions/ai-assistant/index.ts
Copy-Item function-ai-follow-up.ts supabase/functions/ai-follow-up/index.ts

# Deploy and set server-side secrets
supabase functions deploy ai-assistant
supabase functions deploy ai-follow-up
supabase secrets set OPENAI_API_KEY=your-server-side-key OPENAI_MODEL=gpt-5-mini ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

(The staging files are build artifacts; they are not part of the repo and can be deleted after deploying.)

`OPENAI_API_KEY` must remain an Edge Function secret. Elio does not simulate AI responses: if either function or its server-side configuration is unavailable, the UI keeps the owner’s request intact and shows a safe retry message.

## Optional development seed

After signing in and completing onboarding, run `seed_demo.sql` in Supabase SQL Editor only for a development workspace. It creates sample customers, tasks, an approval, and activity for the currently authenticated business. Do not run it against real customer data.

## Deployment and verification

Upload the complete project from the root (all pages, styles, scripts, migrations, and Edge Functions now live at the top level). Deploy the database migration before testing authenticated pages, then deploy the Edge Function and set its secret. Static syntax checks do not prove authentication, persistence, RLS, or AI deployment; test signup, onboarding, CRUD, approval resolution, logout, and follow-up generation against the deployed URL.

## MCP OAuth 2.1 deployment

1. **Supabase Dashboard → SQL Editor:** run `008_mcp_oauth_21.sql` after migrations 005–007. In this flattened checkout, numbered SQL migrations are in the project root.
2. **PowerShell:** deploy the updated MCP functions: `supabase functions deploy mcp-server --no-verify-jwt` and `supabase functions deploy mcp-admin`. `mcp-server` validates its own OAuth bearer token, so the Supabase gateway must not require a Supabase JWT before that validation can run.
3. **Vercel Project → Environment Variables:** set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `MCP_PUBLIC_ORIGIN=https://your-elio-domain` for Production and Preview. The service-role key is used only by the serverless OAuth endpoints; never put it in browser code.
4. **Vercel:** deploy this repository, including the root OAuth handlers, `mcp-api.js`, and `vercel.json`. The Vercel configuration explicitly includes flat static files with `@vercel/static` and builds only OAuth/MCP handlers with `@vercel/node`; no API folder is required. The public MCP URL is `https://your-elio-domain/mcp`.
5. **Supabase Dashboard → Authentication → URL Configuration:** add `https://your-elio-domain/oauth-consent.html` and the deployed site URL to redirect URLs.

The OAuth server requires Authorization Code + PKCE S256. It supports HTTPS Client ID Metadata Documents and public Dynamic Client Registration, hashes authorization codes and tokens at rest, rotates refresh tokens, and exposes only `business.read` and explicit `business.write` scope. Set `MCP_PUBLIC_ORIGIN` as a Supabase Edge Function secret too, and set `MCP_ENCRYPTION_KEY` (at least 32 characters) if you use the external-MCP credential store. Revoke OAuth grants from the MCP dashboard.

## Existing waitlist

The original waitlist remains a real Supabase RPC flow. `waitlist.html` calls `join_waitlist` and redirects only after a referral code is returned. Waitlist data is not exposed through anonymous table reads.
