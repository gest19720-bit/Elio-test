# Composio Google Workspace setup

Elio now uses a server-side Composio session scoped to the signed-in Supabase user. Gmail, Google Calendar, and Google Sheets are available as individual connections. The browser never receives the Composio project key or provider token.

## Supabase Dashboard → SQL Editor

Run `009_composio_sessions.sql` once.

## Vercel project settings

Add these server-side environment variables:

- `COMPOSIO_API_KEY`: the Platform project key from Composio Dashboard → Getting Started.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Redeploy after saving them. Do not put the Composio key in browser code or `.env.example` values.

All four variables are required by `/api/composio`. A missing `SUPABASE_ANON_KEY` prevents Elio from verifying the signed-in user before it can contact Composio.

## Connect and test

1. Sign in to Elio and open Connections.
2. Select Connect on Gmail, Google Calendar, or Google Sheets and approve the managed Composio connection.
3. Return to Elio and refresh the page. A connected app enables its Discover read-only tools button.

The endpoint accepts `status`, `authorize`, and `search`. It does not expose provider-tool execution yet: write actions must be added later through Elio approvals and a server-side allowlist.
