# Deployment

The wordz production stack: where the bits live, how they get there, and the load-bearing config that's easy to break by accident.

## Live URLs

| Component | URL | Notes |
|---|---|---|
| Frontend | https://wordz-five.vercel.app | Vercel auto-assigned `-five`; no custom domain. |
| Supabase project | https://tgancohfwqyyjnnuyokh.supabase.co | Project ref: `tgancohfwqyyjnnuyokh`. |
| Supabase dashboard | https://supabase.com/dashboard/project/tgancohfwqyyjnnuyokh | Schema, Auth, Edge Functions, logs. |
| Vercel dashboard | https://vercel.com/brendanx67s-projects/wordz | Deploys, env vars, domains. |
| Repo | https://github.com/brendanx67/wordz | Single-author CC; pushes to `master` trigger Vercel deploys. |

## Frontend (Vercel)

Auto-deploys on every push to `master`. The build command is `bun run build`, which is a chain:

```
bun run build:mcp   # rebuild public/wordz-mcp.zip from mcp-server/
tsc -b              # typecheck
vite build          # bundle
```

Vite copies everything in `public/` into `dist/` as static assets, so the freshly-rebuilt `wordz-mcp.zip` ships with the deploy without ever entering git. `public/wordz-mcp.zip` is gitignored — committing it would bloat git history, and the chained rebuild makes commits unnecessary.

Frontend env vars (set in **Vercel → Settings → Environment Variables**, applied to Production and Preview):

- `VITE_SUPABASE_URL` = `https://tgancohfwqyyjnnuyokh.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable (anon) key from Supabase

Service-role keys never go here — they belong only in Edge Function secrets.

## Backend (Supabase)

Schema and Edge Function deploys are **manual**, run from the local clone via the Supabase CLI. There's no auto-deploy webhook on the database side. One-time CLI setup is in [SETUP.md](./SETUP.md) §2.3.

```bash
# Schema migrations — applies any pending file under supabase/migrations/
supabase db push

# All three Edge Functions in one go
supabase functions deploy

# Or individually
supabase functions deploy game-api
supabase functions deploy computer-turn
supabase functions deploy validate-word
```

Migrations are applied in lexicographic filename order; the `YYYYMMDDHHMMSS_*.sql` timestamp prefix makes that match dependency order. The CLI tracks which migrations have been applied in `supabase_migrations.schema_migrations` on the remote, so re-running `db push` is safe.

## The `verify_jwt = false` rule for `game-api`

`supabase/config.toml` pins `verify_jwt = false` for the `game-api` function:

```toml
[functions.game-api]
verify_jwt = false
```

**Don't change this and don't deploy without the config.** `game-api` does its own auth via the `x-api-key` header (see `authenticateUser` in `supabase/functions/game-api/api-helpers.ts`). MCP clients can't send a Supabase JWT — they only have the application-level API key — so if the gateway requires a JWT, every MCP request 401s before reaching the handler. The CLI honors this config on every `functions deploy`. Adding `--no-verify-jwt` to the CLI command is **not** equivalent — that flag doesn't persist, so the next deploy without it would re-enable gateway JWT checks.

`computer-turn` and `validate-word` keep the default `verify_jwt = true`. Both are called from the browser, which sends a Supabase user JWT automatically.

## MCP ZIP distribution

`public/wordz-mcp.zip` is the bundle MCP users download from the lobby's "Connect an AI" panel. It's regenerated on every Vercel deploy via the `build:mcp` step in the build chain. To rebuild locally:

```bash
bun run build:mcp
```

Requires `zip` on PATH; on Windows install via `scoop install zip` (see [SETUP.md](./SETUP.md) §2.2).

## Auth configuration

Set in **Supabase Dashboard → Authentication**:

- **URL Configuration → Site URL**: `https://wordz-five.vercel.app`
- **URL Configuration → Redirect URLs**: include `https://wordz-five.vercel.app/**`, the preview-deploy wildcard `https://wordz-*-brendanx67s-projects.vercel.app/**`, and `http://localhost:3000/**` for local dev.
- **Sign In / Providers → User Signups → Confirm email**: **off**, to keep the public showcase low-friction. Re-enable if abuse becomes an issue.
