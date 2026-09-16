-- External MCP credentials are server-only. Keep an explicit deny policy for exposed-schema defense in depth.
drop policy if exists "No browser access to external MCP credentials" on public.mcp_external_connections;
create policy "No browser access to external MCP credentials"
  on public.mcp_external_connections for all to authenticated
  using (false) with check (false);
