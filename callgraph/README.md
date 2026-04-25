# callgraph — wordz

Animated playback of wordz's week-one development burst: how the app grew
from the initial commit through deployment, feature iteration, mobile
polish, and MCP integration. 146 commits, ~524 unique nodes.

## Viewing

Open [`callgraph-latest.html`](callgraph-latest.html) in a browser
(`file://` works — everything inline). Click the large centered Play
button to watch it run. Transport (`⏮ ▶ ⏭ 1×`) plus the scrubber
let you navigate frame-by-frame; Space toggles play, arrows step, the
speed button cycles through 0.5× / 1× / 2× / 4×.

For a shareable URL, serve through a host that sets the right MIME type
for HTML — e.g. `raw.githack.com` or `jsdelivr.net`.
`raw.githubusercontent.com` does **not** render HTML (serves it as
`text/plain`).

## Files

- **`callgraph-latest.html`** — stable entry point, overwritten on every
  rebuild.
- **`callgraph-YYYY-MM-DD.html`** — dated snapshot for history.
- **`callgraph-manifest.js`** + **`callgraph-data-0.js`** — the timeline
  data. Must live next to the HTML.
- **`build.py`** — generator. Loads `snapshots.json`, reclassifies
  `src/components/ui/*` into a separate `components-ui` group, truncates
  at `end_commit_sha` so the story stays about week-one (later tooling
  commits are excluded), and writes HTML + data via the shared core.

## Regenerating

```
python build.py
```

Requires:

1. `snapshots.json` from the extractor (default path:
   `../../ai/.tmp/wordz-timeline/out/snapshots.json`).
2. The **shared core** from the `pwiz-ai` repo checked out as a sibling
   directory. `build.py` imports from `../../ai/scripts/callgraph/`. If
   you only have this `wordz` clone, clone `pwiz-ai` next to it:

   ```
   git clone git@github.com:ProteoWizard/pwiz-ai.git ../ai
   ```

Per-commit line and test counts use local `git` against the current
`wordz` checkout — no network.

## Shared core

Lives in the `pwiz-ai` tooling repo at
[`scripts/callgraph/`](https://github.com/ProteoWizard/pwiz-ai/tree/master/scripts/callgraph).
That's the renderer, template, transport, overlays, and stats-panel logic;
this directory is the wordz-specific adapter.
