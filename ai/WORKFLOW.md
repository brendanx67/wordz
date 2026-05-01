# Wordz Development Workflow

Wordz is developed by a single author: Claude Code (CC) running on the developer's local machine, working from the persistent clone at `C:\proj\wordz`. The developer (Brendan) directs the work, reviews changes, and pushes the buttons that authorize commits and deploys.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Local Claude Code (Windows)                 │
│                                              │
│  C:\proj\wordz                               │
│  - clone of brendanx67/wordz                 │
│  - authoring, commits, push                  │
│                                              │
└────────────┬─────────────────────────────────┘
             │ git push origin master
             ▼
┌──────────────────────────────────────────────┐
│  github.com/brendanx67/wordz                 │
│  - master, append-only                       │
│  - issues drive the work                     │
│  - CI runs bun run test on every push        │
└────┬────────────────────────────────────┬────┘
     │ webhook                            │ webhook
     ▼                                    ▼
┌────────────────────┐        ┌──────────────────────────┐
│  Vercel            │        │  (Supabase has no        │
│  - auto-deploy     │        │   deploy webhook —       │
│    wordz-five      │        │   schema and Edge        │
│    .vercel.app     │        │   Function deploys are   │
│  - serves frontend │        │   manual via supabase    │
│  - hosts MCP +     │        │   CLI; see SETUP.md)     │
│    source ZIPs     │        │                          │
└────────────────────┘        └──────────────────────────┘

┌──────────────────────────────────────────────┐
│  Supabase: tgancohfwqyyjnnuyokh              │
│  - Postgres (games, players, moves, chat)    │
│  - Auth (email/password)                     │
│  - Edge Functions (game-api, computer-turn,  │
│    validate-word)                            │
└──────────────────────────────────────────────┘
```

GitHub is the authoritative archive. Vercel auto-deploys the frontend on every push to `master`. Supabase schema and Edge Function deploys are manual — they happen when CC runs `supabase db push` and `supabase functions deploy` from the local clone after the relevant migration / function code is committed.

## Conventions

1. **Append-only master.** No rebases, squashes, amends, or force-pushes. History is shared with downstream tooling (Vercel, CI) and a non-fast-forward push will lose work.

2. **One issue, one bundled commit, `Fixes #N` (or `(#N)`).** GitHub auto-closes the issue on push when the trailer line uses the `Fixes` keyword. Multi-commit pushes are fine for larger work; each commit should still reference the relevant issue.

3. **Issue bodies are the spec.** Not markdown files in the repo, not chat messages. `ai/WORKFLOW.md` (this file) is the one exception — it documents the process itself.

4. **Chat is for coordination, issues are for content.** Design discussions, multi-paragraph analysis, decisions — those go in issue comments. Chat is for short signals and AI↔human game communication.

5. **Verification comments use `--body-file`.** Write to `C:\proj\ai\.tmp\wordz-issue-N-close-comment.md` (the cross-project scratch dir — see "Working directory" below), then `gh issue comment N --body-file <path>`. Inline `--body` strings get mangled by shell escaping on Windows.

6. **Run `bun run build` before committing.** The dev server doesn't run `tsc`, so type errors only surface here. CI runs the same command.

7. **CC commits include a `Co-Authored-By: Claude Opus …` trailer** so the human/AI authorship pattern is clear in `git log`. The user is the primary author of every commit; the trailer flags AI participation.

## Local development cycle

```
1. Pick or file a GitHub issue.
2. Read CLAUDE.md and any relevant skill / module docs.
3. Edit code in C:\proj\wordz.
4. bun run test                 # unit tests, ~300ms
5. bun run build                # typecheck + frontend bundle
6. (optional) bun run dev       # eyeball changes at localhost:3000
7. git add -p / git commit      # human-authored or CC-authored
8. git push origin master       # triggers Vercel deploy + CI
```

Schema or Edge Function changes add a manual deploy step:

```
9.  supabase db push             # if migrations changed
10. supabase functions deploy    # if functions changed
```

The Supabase CLI's auth and link state is per-machine and is set up once via `supabase login` and `supabase link` (see SETUP.md).

## Working directory: `C:\proj\ai\.tmp\` (cross-project)

Temporary working files (issue drafts, verification comments, diagnostic dumps, downloaded reports) go in **`C:\proj\ai\.tmp\`** — that's the sibling `ai/` repo's `.tmp/`, not a folder inside `wordz/`. It's the cross-project scratch space the developer uses for everything; sharing one location keeps all in-flight artifacts findable from any session.

**Do not** create `C:\proj\wordz\ai\.tmp\` — that path doesn't exist and shouldn't. If a tool or skill writes there by default, redirect it to `C:\proj\ai\.tmp\`. Likewise avoid `ai/tmp` (no leading dot) or `/tmp`.

Prefix wordz-related files with `wordz-` (e.g. `wordz-issue-21-body.md`) so they're easy to spot among artifacts from other projects.

## History

Wordz was originally developed by two collaborating Claude agents — BS (browser session) inside the Anthropic Claude Ship sandbox, and CC (local Claude Code) on the developer's Windows machine — using a source-ZIP courier protocol over the Vercel CDN. The Claude Ship EAP wound down in late April 2026; issue #20 tracked the migration to user-owned Vercel + Supabase and the transition to the single-author model documented above. The git log preserves BS's commits up through that handover.
