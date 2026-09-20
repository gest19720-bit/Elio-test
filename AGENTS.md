# Repository Guidelines

## Project Structure & Module Organization

Elio is an HTML/CSS/JavaScript SaaS MVP with no frontend build step.

- All product files live flat at the repository root (no build step, no subfolders except `mvp/`): HTML pages (landing, waitlist, auth, onboarding, legal, success, and authenticated screens), shared styles (`variables.css`, `global.css`, `layout.css`, `components.css`, `app-responsive.css`, plus waitlist styles), and browser modules (`app.js`, `auth.js`, `auth-page.js`, `supabase-client.js`, `config.js`, and friends).
- `*-service.js` files at the root contain task, approval, activity, AI, MCP, and agent service modules.
- Numbered `00*_*.sql` files at the root are the schema migrations; `function-*.ts` files are server-side Edge Functions. `oauth-*.js` and `mcp-api.js` are the serverless OAuth/MCP endpoints behind `vercel.json` rewrites and `dev-server.mjs`.
- `mvp/` is the frozen pre-launch MVP snapshot kept for reference; do not deploy or edit it.
- `001_waitlist.sql` and `seed_demo.sql` support waitlist setup and optional development data. Do not use seed data against real customer data.

## Build, Test, and Development Commands

Run from the repository root in PowerShell:

```powershell
node dev-server.mjs
```

Then open `http://localhost:8000/signup.html`. Do not use `file://`, because ES modules and browser persistence need HTTP.

There is no build script or test runner. For syntax-only checks, use commands such as `node --check auth.js` and `node --check ai-service.js`. These do not verify Supabase, RLS, authentication, or deployed AI behavior.

## Coding Style & Naming Conventions

Use vanilla ES modules, two-space indentation, semicolons, and descriptive camelCase names for JavaScript functions and variables. Use kebab-case for new HTML/CSS filenames and lowercase, numerically ordered SQL migrations (for example, `002_elio_mvp.sql`). Keep UI behavior accessible and preserve existing selectors and data attributes when modifying flows.

## Testing Guidelines

No automated coverage requirement exists. Before submitting changes, run relevant `node --check` commands, load affected pages through the local server, and test the real flow. For data changes, apply migrations in Supabase and verify Auth, persistence, RLS isolation, CRUD, and logout with an account. Test AI changes through the deployed `ai-follow-up` function; keep `OPENAI_API_KEY` server-side.

## Commit & Pull Request Guidelines

This checkout has no accessible Git history, so no repository-specific commit convention can be confirmed. Use concise imperative messages such as `fix: preserve waitlist RPC errors` or `feat: add approval filtering`. Pull requests should explain the user-visible change, list database or environment setup, link related issues, and include screenshots or a short manual-test checklist for UI changes. Call out any unverified deployment or configuration explicitly.

## Security & Configuration

Use `config.js` or the documented Supabase setup for the project URL and anon key only. Never commit service-role keys, OpenAI secrets, or real customer data. Keep RLS enabled and route anonymous waitlist signup through `join_waitlist`; do not add public table reads.
