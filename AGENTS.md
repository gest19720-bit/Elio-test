# Repository Guidelines

## Project Structure & Module Organization

Elio is an HTML/CSS/JavaScript SaaS MVP with no frontend build step.

- Root HTML pages cover the landing page, waitlist, authentication, onboarding, legal pages, and success flow.
- `app/` contains authenticated product screens; `css/` contains shared, waitlist, and responsive styles.
- `js/` contains browser modules for auth, configuration, onboarding, Supabase access, and application behavior.
- `services/` contains task, approval, activity, AI, and agent service modules.
- `supabase/migrations/` contains the MVP schema and RLS policies; `supabase/functions/` contains server-side Edge Functions.
- `001_waitlist.sql` and `seed_demo.sql` support waitlist setup and optional development data. Do not use seed data against real customer data.

## Build, Test, and Development Commands

Run from the repository root in PowerShell:

```powershell
node dev-server.mjs
```

Then open `http://localhost:8000/signup.html`. Do not use `file://`, because ES modules and browser persistence need HTTP.

There is no build script or test runner. For syntax-only checks, use commands such as `node --check js/auth.js` and `node --check services/ai-service.js`. These do not verify Supabase, RLS, authentication, or deployed AI behavior.

## Coding Style & Naming Conventions

Use vanilla ES modules, two-space indentation, semicolons, and descriptive camelCase names for JavaScript functions and variables. Use kebab-case for new HTML/CSS filenames and lowercase, numerically ordered SQL migrations (for example, `supabase/migrations/002_elio_mvp.sql`). Keep UI behavior accessible and preserve existing selectors and data attributes when modifying flows.

## Testing Guidelines

No automated coverage requirement exists. Before submitting changes, run relevant `node --check` commands, load affected pages through the local server, and test the real flow. For data changes, apply migrations in Supabase and verify Auth, persistence, RLS isolation, CRUD, and logout with an account. Test AI changes through the deployed `ai-follow-up` function; keep `OPENAI_API_KEY` server-side.

## Commit & Pull Request Guidelines

This checkout has no accessible Git history, so no repository-specific commit convention can be confirmed. Use concise imperative messages such as `fix: preserve waitlist RPC errors` or `feat: add approval filtering`. Pull requests should explain the user-visible change, list database or environment setup, link related issues, and include screenshots or a short manual-test checklist for UI changes. Call out any unverified deployment or configuration explicitly.

## Security & Configuration

Use `js/config.js` or the documented Supabase setup for the project URL and anon key only. Never commit service-role keys, OpenAI secrets, or real customer data. Keep RLS enabled and route anonymous waitlist signup through `join_waitlist`; do not add public table reads.
