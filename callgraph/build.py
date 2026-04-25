#!/usr/bin/env python3
"""
Generate the wordz callgraph HTML from snapshots.json.

Shared pipeline lives in the pwiz-ai repo at ai/scripts/callgraph/core.py.
That repo must be checked out as a sibling directory next to wordz — the
same layout the project uses for local development (C:\\proj\\ai, C:\\proj\\wordz).

Usage:
    python build.py [path/to/snapshots.json]

Default snapshots.json path is the one produced by the extractor under
ai/.tmp/wordz-timeline/out/snapshots.json. Writes callgraph-YYYY-MM-DD.html +
callgraph-latest.html alongside this script.

Regenerating requires the sibling ai/ checkout. The generated HTML + data
files are fully self-contained (aside from d3 from the CDN) and can be served
from anywhere (raw.githack, jsdelivr, GitHub Pages, local file://).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

# --- Locate the shared core -------------------------------------------------
HERE = Path(__file__).resolve().parent                # wordz/callgraph
AI_REPO = HERE.parent.parent / "ai"                   # sibling checkout
SHARED = AI_REPO / "scripts"
if not (SHARED / "callgraph" / "core.py").exists():
    print(f"Shared core not found at {SHARED / 'callgraph' / 'core.py'}")
    print("Check out brendanx67/pwiz-ai as a sibling of this repo.")
    sys.exit(1)
sys.path.insert(0, str(SHARED))

from callgraph import core  # noqa: E402


DEFAULT_SNAPSHOTS = (
    AI_REPO / ".tmp" / "wordz-timeline" / "out" / "snapshots.json"
)
WORDZ_REPO = HERE.parent                              # for per-commit lines/tests


# ---------------------------------------------------------------------------
# wordz project config
# ---------------------------------------------------------------------------

CONFIG = core.ProjectConfig(
    name="wordz",
    # Matches the branded styling in the wordz UI and the panel title.
    display_name="WORDZ",
    page_title="WORDZ — Call Graph Evolution",
    github_base="https://github.com/brendanx67/wordz",
    commits_url="https://github.com/brendanx67/wordz/commits/main",
    readme_url="https://github.com/brendanx67/wordz#readme",
    group_colors={
        # shadcn-style primitives under src/components/ui/ split out so they
        # carry their own "UI" label separate from gameplay components.
        "components-ui":"#f6a8ae",
        "components":   "#e06c75",
        "hooks":        "#61afef",
        "lib":          "#98c379",
        "pages":        "#d19a66",
        "app":          "#c678dd",
        "mcp-server":   "#56b6c2",
        "supabase":     "#e5c07b",
        "tests":        "#abb2bf",
        "folders":      "#546e7a",
    },
    kind_to_type={
        "function":  "function",
        "method":    "method",
        "class":     "class",
        "interface": "class",
        "type":      "class",
        "file":      "mixin",
        "folder":    "class",
    },
    group_labels={
        "components-ui":"UI",
        "components":   "Components",
        "hooks":        "Hooks",
        "lib":          "Lib",
        "pages":        "Pages",
        "app":          "App",
        "mcp-server":   "MCP Server",
        "supabase":     "Supabase",
        "tests":        "Tests",
        "folders":      None,
    },
    # Anchor the big clusters to their own sides so the graph tells a
    # clearer spatial story. MCP is its own world → pin it at the left edge.
    # Components + UI stay together near the middle (edges between them
    # keep them close, but separate labels make UI readable).
    group_x_bias={
        "mcp-server":   -0.22,
        "supabase":     -0.12,
        "components":    0.02,
        "components-ui": 0.14,
        "pages":         0.20,
        "tests":         0.28,
    },
    group_y_bias={
        "app":          -0.22,   # entry point up top
        "pages":        -0.10,
        "hooks":        -0.05,
        "components":    0.02,
        "components-ui": 0.02,
        "lib":           0.15,
        "supabase":      0.22,
        "tests":         0.26,
    },
    # Freeze the playback at the end of the original week-one burst so later
    # tooling commits (callgraph itself, docs cleanups) don't distort the
    # "first week of development" story. Update this when BS adds a feature
    # that should make it into the narrative.
    end_commit_sha="8bfc4b5",
)


# Any node whose file lives under src/components/ui/ is a shadcn-style
# primitive — reclassify it into its own group so it gets the "UI" label.
UI_PATH_PREFIX = "src/components/ui/"


def relabel_ui_nodes(nodes: dict) -> int:
    """Mutate nodes in place; return how many were moved into components-ui."""
    moved = 0
    for n in nodes.values():
        if (n.get("group") == "components"
                and n.get("file", "").startswith(UI_PATH_PREFIX)):
            n["group"] = "components-ui"
            moved += 1
    return moved


def friend_id(full_id: str, nmeta: dict) -> str:
    """wordz: path for folders/files, else parent.name or name."""
    if nmeta["kind"] in ("folder", "file"):
        return nmeta["file"]
    if nmeta.get("parent"):
        return f"{nmeta['parent']}.{nmeta['name']}"
    return nmeta["name"]


# ---------------------------------------------------------------------------
# Per-commit stats (lineCount, testCount) — computed via git
# ---------------------------------------------------------------------------

def count_lines_at_commit(sha: str) -> int:
    res = subprocess.run(
        ["git", "-C", str(WORDZ_REPO), "ls-tree", "-r", sha],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        return 0
    total = 0
    for line in res.stdout.splitlines():
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        meta, path = parts
        if not (path.endswith(".ts") or path.endswith(".tsx")):
            continue
        if path.startswith("node_modules/") or "/dist/" in path:
            continue
        _mode, typ, blob_sha = meta.split()
        if typ != "blob":
            continue
        blob = subprocess.run(
            ["git", "-C", str(WORDZ_REPO), "cat-file", "-p", blob_sha],
            capture_output=True,
        )
        total += blob.stdout.count(b"\n")
    return total


def count_tests_at_commit(sha: str) -> int:
    res = subprocess.run(
        ["git", "-C", str(WORDZ_REPO), "ls-tree", "-r", "--name-only", sha],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        return 0
    count = 0
    for p in res.stdout.splitlines():
        if (p.endswith(".test.ts") or p.endswith(".test.tsx")
                or (p.startswith("tests/")
                    and (p.endswith(".ts") or p.endswith(".tsx")))):
            count += 1
    return count


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SNAPSHOTS
    if not src.exists():
        print(f"snapshots.json not found at {src}")
        sys.exit(1)

    data = json.loads(src.read_text(encoding="utf-8"))
    p = data["projects"]["wordz"]
    print(f"Reading {src}")

    moved = relabel_ui_nodes(p["nodes"])
    if moved:
        print(f"  reclassified {moved} shadcn UI nodes into components-ui group")

    # Honor end_commit_sha early — no point computing line counts for commits
    # we're about to drop.
    commits = p["commits"]
    original_count = len(commits)
    if CONFIG.end_commit_sha:
        cut = next((i for i, c in enumerate(commits)
                    if c["sha"].startswith(CONFIG.end_commit_sha)), None)
        if cut is None:
            print(f"  end_commit_sha {CONFIG.end_commit_sha!r} not found — aborting")
            sys.exit(1)
        commits = commits[: cut + 1]
        p["commits"] = commits
        print(f"  truncated at {CONFIG.end_commit_sha} "
              f"(kept {len(commits)} of {original_count} commits)")

    # Enrich commits with lineCount/testCount before the compact build — the
    # optional fields get forwarded into each snapshot.
    print(f"  counting lines/tests across {len(commits)} commits...")
    for i, c in enumerate(commits):
        if i % 20 == 0:
            print(f"    {i}/{len(commits)}")
        c["lineCount"] = count_lines_at_commit(c["sha"])
        c["testCount"] = count_tests_at_commit(c["sha"])

    registry, timeline = core.build_registry_and_timeline(
        p["commits"], p["nodes"], p["edges"], CONFIG, friend_id,
    )
    print(f"  {len(p['commits'])} commits, {len(registry)} unique nodes, "
          f"{len(timeline)} snapshots")

    core.write_data_files(HERE, registry, timeline, chunk_count=1)

    base = core.BASE_HTML.read_text(encoding="utf-8")
    html = core.patch_html(base, CONFIG)
    dated = core.write_dated_html(HERE, html, CONFIG.name)
    total = sum(f.stat().st_size for f in HERE.iterdir() if f.is_file())
    print(f"  wrote {dated.name} ({total:,} bytes total)")


if __name__ == "__main__":
    main()
