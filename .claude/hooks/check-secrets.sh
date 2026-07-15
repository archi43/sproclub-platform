#!/usr/bin/env bash
# Pre-commit secret guard. Fires before `git commit` (PreToolUse hook).
# Blocks the commit (exit 2) if staged changes look like they contain secrets
# or a committed .env file. Keeps credentials out of the repo, always.
set -euo pipefail

cat >/dev/null 2>&1 || true   # drain the hook event JSON on stdin

staged=$(git diff --cached --name-only 2>/dev/null || true)

# 1) Never commit real env files.
if echo "$staged" | grep -qE '(^|/)\.env($|\.)' ; then
  echo "BLOCKED: a .env file is staged. Remove it (keep secrets in .env.local, git-ignored)." >&2
  exit 2
fi

# 2) Scan staged content for common secret shapes. We flag secret VALUES, not
#    bare identifiers: env-var names (CRON_SECRET, …) legitimately appear in
#    routes, docs and the runbook — what must never land is a name ASSIGNED a
#    literal value, a private key, a JWT or a provider-prefixed key.
diff=$(git diff --cached 2>/dev/null || true)
if echo "$diff" | grep -qE "(SERVICE_ROLE_KEY|AIRTABLE_API_KEY|AIRTABLE_TOKEN|CALCOM_API_KEY|CRON_SECRET|L360_CLIENT_SECRET|RESEND_API_KEY|FILLOUT_API_KEY)['\"]?[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9+/_-]{16,}|sk_(live|prod)_[A-Za-z0-9]|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\." ; then
  echo "BLOCKED: staged changes appear to contain a secret or token. Move it to .env.local / the secret manager." >&2
  exit 2
fi

exit 0
