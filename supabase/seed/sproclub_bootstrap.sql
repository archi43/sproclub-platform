-- =============================================================================
-- Bootstrap seed — SproCLUB is the first organization (tenant).
-- Run ONCE, after migrations 0001 → 0003, against the SproCLUB project.
-- Idempotent: safe to re-run. No secret is stored here — the Airtable token
-- lives in the secret manager and is referenced by `secret_ref`.
-- =============================================================================

insert into organizations (slug, name, custom_domain)
  values ('sproclub', 'SproCLUB', 'intranet.sproclub.com')
on conflict (slug) do nothing;

insert into connector_configs (org_id, kind, config, secret_ref, enabled)
  values (
    (select id from organizations where slug = 'sproclub'),
    'airtable',
    '{"baseId":"appHmDCjHyGyOK7hM"}'::jsonb,
    'secret://sproclub/airtable_token',   -- pointer only; the real token is in the secret manager
    true
  )
on conflict (org_id, kind) do update
  set config = excluded.config,
      secret_ref = excluded.secret_ref,
      enabled = excluded.enabled;
