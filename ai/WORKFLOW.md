# Wordz Multi-Agent Workflow

Three actors collaborate on this project:

- **BS** (browser session) — Claude inside the Anthropic Claude Ship sandbox. Sole code author. Works on `/home/claude/project`.
- **CC** (local Claude Code) — Claude running as a CLI on the developer's Windows machine. Verification, review, issue management, GitHub push. Works on `C:\proj\wordz` and `C:\proj\ai\.tmp\`.
- **The developer (Brendan)** — bridges the two sandboxes. Triggers publishes, directs sprints, holds long-term context.

For the full history of how this workflow was discovered, see `C:\proj\ai\.tmp\wordz-eap-field-report.md`.

---

## Architecture

```
┌──────────────────────────────────────┐                ┌──────────────────────────────────────┐
│   BS (Claude Ship sandbox)           │                │   Local Claude Code (Windows)        │
│                                      │                │                                      │
│  ┌────────────────────────────────┐  │                │  ┌────────────────────────────────┐  │
│  │ /home/claude/project           │  │                │  │ C:\proj\wordz                  │  │
│  │ (persistent working tree)      │  │                │  │ (persistent clone, VS Code)    │  │
│  │ - sole code authoring          │  │                │  │ - read / review / IDE          │  │
│  │ - dev server on port 3000      │  │                │  │ - git pull only, never commit  │  │
│  └─────────┬──────────────────────┘  │                │  └─────────▲──────────────────────┘  │
│            │ git clone                │                │            │ git pull               │
│            ▼                          │                │            │                       │
│  ┌────────────────────────────────┐  │                │  ┌─────────┴──────────────────────┐  │
│  │ /tmp/wordz-source-build        │  │                │  │ C:\proj\ai\.tmp\snapN\         │  │
│  │ (marshalling area)             │  │                │  │ (marshalling area)             │  │
│  │ - clean clone for ZIP build    │  │                │  │ - extract incoming ZIP         │  │
│  │ - throwaway                    │  │                │  │ - verify + git push to GitHub  │  │
│  └─────────┬──────────────────────┘  │                │  │ - throwaway                    │  │
│            │ zip + publish           │                │  └─────────▲──────────────────────┘  │
└────────────┼──────────────────────────┘                │            │ curl + unzip          │
             │                                          └────────────┼──────────────────────┘
             ▼                                                       │
   ┌────────────────────────────────┐                                │
   │ Vercel CDN                     │────────────────────────────────┘
   │ public/wordz-source.zip        │               download
   └────────────────────────────────┘
                                                 ┌───────────────────────────────────────┐
                                                 │  github.com/brendanx67/wordz          │
                                                 │  - master, append-only                │
                                                 │  - issues driving the work            │
                                                 │  - CI runs bun test on every push     │
                                                 └───────▲──────────────┬────────────────┘
                                                         │              │
                                                         │ git push     │ WebFetch issue JSON
                                                         │ (CC only)    │ (BS only, read-only)
                                                         │              │
                                                    (from snapN)   (back to BS)
```

---

## Channels

### BS → CC: source ZIP (the primary code shipment)

BS publishes via the sandbox UI. The ZIP lands on Vercel CDN at `/wordz-source.zip`. CC downloads with cache-bust, extracts to `ai/.tmp/snapN/`, verifies, and pushes to GitHub from the extracted `.git/`.

**Critical: the ZIP must contain `.git/`.** The `build:source` script in `package.json` uses a clean-clone approach:

```bash
git clone . /tmp/wordz-source-build \
  && cd /tmp/wordz-source-build \
  && zip -rq "$OLDPWD/public/wordz-source.zip" . \
  && rm -rf /tmp/wordz-source-build
```

This preserves the full commit history so CC can push BS's actual commits to GitHub with their original SHAs and authorship. **CC is a courier, not an author.** CC never creates commits for application code.

If the ZIP is produced by `git archive` (which strips `.git/`), CC has no way to push BS's commits and must re-author them — this breaks the audit trail and misattributes BS's work.

### CC → GitHub: git push (the archive step)

CC pushes from the marshalling directory, not from `C:\proj\wordz`:

```bash
cd C:/proj/ai/.tmp/snapN
git remote add github git@github.com:brendanx67/wordz.git
git push github master
```

Fast-forward only. Append-only master. After pushing, the persistent clone catches up:

```bash
cd C:/proj/wordz && git pull --ff-only origin master
```

### CC → BS: GitHub Issues (instructions and specs)

CC files issues via `gh issue create --body-file`. BS reads them via `WebFetch https://api.github.com/repos/brendanx67/wordz/issues/N`. Issue bodies are the source of truth for feature specs, not markdown files in the repo.

### CC ↔ BS: Wordz chat (coordination)

Short coordination messages go through the Wordz MCP chat system (suggestions channel). Design content goes in GitHub issues, not chat — chat is for signals like "you're cleared to start #N" or "check the issue comment for design feedback."

### CC → BS: patch channel (new, for CC-authored changes)

When CC needs to contribute code changes (config fixes, doc corrections, migration SQL, tests), CC pushes a branch and BS applies it as a patch:

**CC side:**
```bash
cd C:/proj/wordz
git checkout -b cc/description-of-change
# make changes, commit
git push origin cc/description-of-change
```

**CC posts to chat:**
> BS — apply this patch:
> ```
> curl -sL https://github.com/brendanx67/wordz/compare/master...cc/description-of-change.patch | git apply
> ```
> Changed files: [list]. Here's what it does: [short description].

**BS side:**
```bash
curl -sL https://github.com/brendanx67/wordz/compare/master...cc/description-of-change.patch | git apply
```

The changes land in BS's working tree as unstaged modifications. BS reviews, adjusts if needed, and commits to its own master.

**Fallback — raw file fetch** (if `git apply` fails due to context mismatch):
```bash
curl -sL https://raw.githubusercontent.com/brendanx67/wordz/cc/branch-name/path/to/file > path/to/file
```

**Fallback — single-commit patch:**
```
https://github.com/brendanx67/wordz/commit/{sha}.patch
```

---

## Roles

| Role | Responsibility |
|---|---|
| **BS** | Sole code author. All features, fixes, refactors, schema changes. Reads issues. Implements. Bundles per-issue commits with `Fixes #N`. Ships ZIP via publish. |
| **CC** | Downloads ZIP. Verifies content against the issue spec. Pushes BS's commits to GitHub (courier, not author). Posts verification comments on auto-closed issues. Files new issues. Contributes patches via branches (see patch channel above). |
| **GitHub** | Authoritative archive. Linear history. Issue tracker. CI runner. |
| **The developer** | Bridges the two sandboxes. Triggers publishes. Directs sprints. Holds long-term context and intent. |

---

## Load-bearing conventions

1. **Append-only master.** No rebases, squashes, amends, or force-pushes. The one allowed cleanup force-push has been used; there are no more.

2. **One issue, one bundled commit, `Fixes #N`.** GitHub auto-closes the issue on push. Multi-commit pushes from interactive testing are fine per the workflow recalibration (2026-04-08), but each commit still references the relevant issue.

3. **`build:source` uses clean clone, not `git archive`.** The ZIP must contain `.git/`. See "BS → CC" channel above.

4. **Two clones per side.** Persistent working tree + throwaway marshalling area. Never verify in the persistent tree; never push from it.

5. **CC never commits to `C:\proj\wordz`.** The persistent clone is for `git pull` and VS Code reading only. All pushes originate from marshalling directories.

6. **Issue bodies are the spec.** Not markdown files in the repo, not chat messages. The one exception is this file (`ai/WORKFLOW.md`), which documents the process itself.

7. **Chat is for coordination, issues are for content.** A 600-word design analysis belongs in an issue comment, not a chat message.

8. **Verification comments use `--body-file`.** Write to `ai/.tmp/issue-N-close-comment.md`, then `gh issue comment N --body-file`. Inline `--body` strings get mangled by shell escaping.
