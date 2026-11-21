#!/usr/bin/env python3
"""
Walk wordz commit history and emit per-commit snapshots of functions,
classes, hooks, and call/JSX-use edges.

Usage:
    python extract.py

Output (next to this file, ignored by git): out/snapshots.json, the input
build.py reads. The walk covers every commit on master; build.py decides
where the story stops.

Needs: pip install tree-sitter tree-sitter-typescript
"""

import json
import subprocess
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

import tree_sitter_typescript as tsts
from tree_sitter import Language, Parser

SCRIPT_DIR = Path(__file__).resolve().parent
OUT = SCRIPT_DIR / "out" / "snapshots.json"

REPO = SCRIPT_DIR.parent                              # the wordz checkout this file is in
REFS = ["master"]
PATH_FILTER = "."
EXTENSIONS_TS = {".ts"}
EXTENSIONS_TSX = {".tsx"}

# Prefix-matched groups. Order matters (first match wins).
GROUPS = [
    ("src/components/",     "components"),
    ("src/hooks/",          "hooks"),
    ("src/lib/",            "lib"),
    ("src/pages/",          "pages"),
    ("src/",                "app"),          # src/App.tsx, src/main.tsx, ...
    ("mcp-server/",         "mcp-server"),
    ("supabase/functions/", "supabase"),
    ("tests/",              "tests"),
]

TS_LANG = Language(tsts.language_typescript())
TSX_LANG = Language(tsts.language_tsx())


FOLDER_GROUP = "folders"


def group_for(path: str) -> str | None:
    for prefix, name in GROUPS:
        if path.startswith(prefix):
            return name
    return None


def ancestor_dirs(path: str) -> list[str]:
    parts = path.split("/")
    if len(parts) <= 1:
        return []
    return ["/".join(parts[:i]) for i in range(len(parts) - 1, 0, -1)]


# ---------------------------------------------------------------------------
# git
# ---------------------------------------------------------------------------

def git(*args: str) -> bytes:
    res = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed:\n"
            f"{res.stderr.decode('utf-8', errors='replace')}"
        )
    return res.stdout


def git_text(*args: str) -> str:
    return git(*args).decode("utf-8", errors="replace")


def list_commits() -> list[dict]:
    seen = OrderedDict()
    for ref in REFS:
        out = git_text("log", ref, "--format=%H\t%ct\t%an\t%s", "--", PATH_FILTER)
        for line in out.splitlines():
            if not line.strip():
                continue
            sha, ts, author, msg = line.split("\t", 3)
            if sha not in seen:
                seen[sha] = {"sha": sha, "ts": int(ts),
                             "author": author, "msg": msg}
    commits = list(seen.values())
    commits.sort(key=lambda c: c["ts"])
    return commits


def ls_tree(sha: str) -> list[tuple[str, str]]:
    out = git_text("ls-tree", "-r", sha)
    items = []
    for line in out.splitlines():
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        meta, path = parts
        mode, typ, blob_sha = meta.split()
        if typ == "blob":
            items.append((blob_sha, path))
    return items


# ---------------------------------------------------------------------------
# Parsing — TypeScript / TSX
# ---------------------------------------------------------------------------

def _text(node, src: bytes) -> str:
    return src[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _fn_key(parent: str | None, name: str) -> str:
    return f"{parent}::{name}" if parent else name


def _callee_name(node, src: bytes) -> str | None:
    """Resolve the callee expression of a call_expression to a simple name."""
    if node is None:
        return None
    t = node.type
    if t == "identifier":
        return _text(node, src)
    if t == "member_expression":
        # obj.method or this.method — capture the property
        prop = node.child_by_field_name("property")
        if prop is not None and prop.type in ("property_identifier", "identifier"):
            return _text(prop, src)
    if t == "this":
        return None
    return None


def _jsx_callee(node, src: bytes) -> str | None:
    """For JSX elements, return the component name if it's a custom
    (capitalized) identifier. DOM elements like <div> are property_identifier
    in lowercase — skip those."""
    if node is None:
        return None
    t = node.type
    if t == "identifier":
        name = _text(node, src)
        if name and name[0].isupper():
            return name
    if t == "member_expression":
        prop = node.child_by_field_name("property")
        if prop is not None:
            name = _text(prop, src)
            if name and name[0].isupper():
                return name
    return None


def parse_ts(src: bytes, is_tsx: bool):
    """Returns (nodes, edges)."""
    lang = TSX_LANG if is_tsx else TS_LANG
    parser = Parser(lang)
    tree = parser.parse(src)

    nodes: list[dict] = []
    edges: list[tuple[str, str]] = []
    seen: set[tuple[str, str, str | None]] = set()

    def add_node(kind: str, name: str, parent: str | None,
                 has_body: bool) -> str | None:
        key = (kind, name, parent)
        if key in seen:
            return _fn_key(parent, name) if has_body else None
        seen.add(key)
        fn_key = _fn_key(parent, name) if has_body else None
        nodes.append({
            "kind": kind, "name": name, "parent": parent,
            "fn_key": fn_key,
        })
        return fn_key

    def rec(node, type_stack: list, current_fn: str | None):
        t = node.type

        # Top-level function: function foo() { ... } or export function foo
        if t == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = _text(name_node, src)
                parent = type_stack[-1] if type_stack else None
                fn_key = add_node("function", name, parent, has_body=True)
                body = node.child_by_field_name("body")
                if body is not None and fn_key is not None:
                    rec(body, type_stack, fn_key)
                return

        # class declaration
        if t == "class_declaration":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = _text(name_node, src)
                parent = type_stack[-1] if type_stack else None
                add_node("class", name, parent, has_body=False)
                type_stack.append(name)
                for c in node.children:
                    rec(c, type_stack, current_fn)
                type_stack.pop()
                return

        if t == "interface_declaration":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = _text(name_node, src)
                add_node("interface", name, None, has_body=False)
            return

        if t == "type_alias_declaration":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = _text(name_node, src)
                add_node("type", name, None, has_body=False)
            return

        # Method inside class body
        if t == "method_definition":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = _text(name_node, src)
                parent = type_stack[-1] if type_stack else None
                fn_key = add_node("method", name, parent, has_body=True)
                body = node.child_by_field_name("body")
                if body is not None and fn_key is not None:
                    rec(body, type_stack, fn_key)
                return

        # const X = () => ..., const X = function() {...}, const X = async () => ...
        if t == "variable_declarator":
            name_node = node.child_by_field_name("name")
            value_node = node.child_by_field_name("value")
            if (name_node is not None and value_node is not None
                    and name_node.type == "identifier"
                    and value_node.type in ("arrow_function", "function_expression")):
                name = _text(name_node, src)
                # Only register at file scope (not nested declarations)
                if current_fn is None and not type_stack:
                    fn_key = add_node("function", name, None, has_body=True)
                    body = value_node.child_by_field_name("body")
                    if body is not None and fn_key is not None:
                        rec(body, type_stack, fn_key)
                    return
                # else fall through (still recurse into body with current_fn)

        # Call expression
        if t == "call_expression" and current_fn is not None:
            func = node.child_by_field_name("function")
            callee = _callee_name(func, src)
            if callee:
                edges.append((current_fn, callee))
            # Recurse into args
            for c in node.children:
                rec(c, type_stack, current_fn)
            return

        # JSX element usage - treat <Component> as a call edge to Component
        if t in ("jsx_opening_element", "jsx_self_closing_element") and current_fn is not None:
            # Child field "name" holds the tag
            name_node = node.child_by_field_name("name")
            callee = _jsx_callee(name_node, src)
            if callee:
                edges.append((current_fn, callee))
            # don't recurse into element attributes for call edges
            return

        # Default: recurse
        for c in node.children:
            rec(c, type_stack, current_fn)

    rec(tree.root_node, type_stack=[], current_fn=None)
    return nodes, edges


# ---------------------------------------------------------------------------
# Extraction loop
# ---------------------------------------------------------------------------

def main():
    commits = list_commits()
    print(f"Found {len(commits)} commits in wordz", file=sys.stderr)

    # node id -> metadata
    nodes: OrderedDict = OrderedDict()
    # blob_sha -> (nodes, edges)
    blob_cache: dict[str, tuple[list, list]] = {}
    groups: OrderedDict = OrderedDict()

    # Edge keys are (from, to, kind) so containment vs call are separable
    edge_state: dict[tuple[str, str, str], list[int | None]] = {}
    prev_present_nodes: set[str] = set()
    prev_present_edges: set[tuple[str, str, str]] = set()

    commit_records: list[dict] = []

    for idx, commit in enumerate(commits):
        sha = commit["sha"]
        if idx % 10 == 0:
            print(f"  commit {idx+1}/{len(commits)} {sha[:8]}", file=sys.stderr)
        tree = ls_tree(sha)
        present_nodes: set[str] = set()
        per_file_nodes: dict[str, list[dict]] = {}
        per_file_edges: dict[str, list[tuple[str, str]]] = {}
        # Synthetic file & folder scaffolding for this commit
        present_file_nodes: dict[str, str] = {}   # path -> file-node-id
        present_folders: set[str] = set()         # folder-node-ids
        containment: set[tuple[str, str]] = set()  # parent -> child

        for blob_sha, path in tree:
            ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
            if ext not in EXTENSIONS_TS and ext not in EXTENSIONS_TSX:
                continue
            grp = group_for(path)
            if grp is None:
                continue
            # skip node_modules/test-results/etc by path prefix (already excluded
            # by GROUPS definition)
            if grp not in groups:
                groups[grp] = {"label": grp}

            if blob_sha not in blob_cache:
                try:
                    content = git("cat-file", "-p", blob_sha)
                    parsed_nodes, parsed_edges = parse_ts(
                        content, is_tsx=(ext == ".tsx")
                    )
                except Exception as e:
                    print(f"  parse error in {path}@{sha[:8]}: {e}",
                          file=sys.stderr)
                    parsed_nodes, parsed_edges = [], []
                blob_cache[blob_sha] = (parsed_nodes, parsed_edges)

            pn, pe = blob_cache[blob_sha]
            file_nodes_info = []

            # Synthetic "file" node for this path (even if it has no parsed
            # contents, so empty files still show up).
            file_node_id = f"file::{path}"
            if file_node_id not in nodes:
                nodes[file_node_id] = {
                    "group": grp, "file": path,
                    "kind": "file",
                    "name": path.rsplit("/", 1)[-1],
                    "parent": None,
                    "first_idx": idx, "last_idx": None,
                }
            present_nodes.add(file_node_id)
            present_file_nodes[path] = file_node_id

            for node in pn:
                parent = node["parent"]
                parent_suffix = f"::{parent}" if parent else ""
                node_id = (f"{grp}::{path}::{node['kind']}"
                           f"{parent_suffix}::{node['name']}")
                if node_id not in nodes:
                    nodes[node_id] = {
                        "group": grp, "file": path,
                        "kind": node["kind"], "name": node["name"],
                        "parent": parent,
                        "first_idx": idx, "last_idx": None,
                    }
                present_nodes.add(node_id)
                file_nodes_info.append({**node, "id": node_id})
                # Containment: file -> symbol
                containment.add((file_node_id, node_id))
            per_file_nodes[path] = file_nodes_info
            per_file_edges[path] = pe

            # Walk ancestors and register folder nodes + containment
            anc = ancestor_dirs(path)
            if anc:
                containment.add((f"folder::{anc[0]}", file_node_id))
                present_folders.add(anc[0])
                for i in range(len(anc) - 1):
                    containment.add((f"folder::{anc[i+1]}",
                                     f"folder::{anc[i]}"))
                    present_folders.add(anc[i+1])
                present_folders.add(anc[-1])

        # Register folder nodes in the node table
        for fpath in present_folders:
            fid = f"folder::{fpath}"
            if fid not in nodes:
                nodes[fid] = {
                    "group": FOLDER_GROUP,
                    "file": fpath + "/",
                    "kind": "folder",
                    "name": fpath.split("/")[-1] + "/",
                    "parent": None,
                    "first_idx": idx, "last_idx": None,
                }
            present_nodes.add(fid)
        if FOLDER_GROUP not in groups and present_folders:
            groups[FOLDER_GROUP] = {"label": FOLDER_GROUP}

        # Build fn_key -> id map per file
        fnkey_by_file_and_key: dict[tuple[str, str], str] = {}
        for path, file_nodes in per_file_nodes.items():
            for fn in file_nodes:
                if fn.get("fn_key") is not None:
                    fnkey_by_file_and_key[(path, fn["fn_key"])] = fn["id"]

        # Build callee name -> candidate ids (callable nodes = function/method)
        callee_index: dict[str, list[str]] = defaultdict(list)
        for node_id, nmeta in nodes.items():
            if node_id in present_nodes and nmeta["kind"] in (
                "function", "method"
            ):
                callee_index[nmeta["name"]].append(node_id)
        # Also treat "class" as callable target for JSX usage (<Component />)
        class_index: dict[str, list[str]] = defaultdict(list)
        for node_id, nmeta in nodes.items():
            if node_id in present_nodes and nmeta["kind"] in (
                "class", "function"
            ):
                class_index[nmeta["name"]].append(node_id)

        present_edges: set[tuple[str, str, str]] = set()
        # Containment edges first (folders / files -> children)
        for parent, child in containment:
            present_edges.add((parent, child, "contains"))

        for path, edge_list in per_file_edges.items():
            for fn_key, callee_name in edge_list:
                from_id = fnkey_by_file_and_key.get((path, fn_key))
                if from_id is None:
                    continue
                # Try function/method index first, then class (for JSX <Comp />)
                candidates = callee_index.get(callee_name, []) or \
                             class_index.get(callee_name, [])
                if not candidates:
                    continue
                from_file = nodes[from_id]["file"]
                from_group = nodes[from_id]["group"]
                same_file = [c for c in candidates if nodes[c]["file"] == from_file]
                same_group = [c for c in candidates if nodes[c]["group"] == from_group]
                picks = same_file or same_group or candidates
                if len(picks) > 6:
                    continue  # too ambiguous
                for to_id in picks[:3]:
                    if from_id != to_id:
                        present_edges.add((from_id, to_id, "call"))

        # Node lifecycle
        for nid in (prev_present_nodes - present_nodes):
            if nodes[nid]["last_idx"] is None:
                nodes[nid]["last_idx"] = idx
        for nid in present_nodes:
            if nodes[nid]["last_idx"] is not None:
                nodes[nid]["last_idx"] = None

        # Edge lifecycle
        for e in present_edges:
            if e not in edge_state:
                edge_state[e] = [idx, None]
            elif edge_state[e][1] is not None:
                edge_state[e][1] = None
        for e in (prev_present_edges - present_edges):
            if edge_state[e][1] is None:
                edge_state[e][1] = idx

        prev_present_nodes = present_nodes
        prev_present_edges = present_edges

        commit_records.append({
            "sha": sha, "ts": commit["ts"],
            "msg": commit["msg"][:120], "author": commit["author"],
        })

    for nmeta in nodes.values():
        nmeta.pop("fn_key", None)

    edges_out = [
        {"from": f, "to": t, "kind": k,
         "first_idx": s[0], "last_idx": s[1]}
        for (f, t, k), s in edge_state.items()
    ]

    data = {
        "projects": {
            "wordz": {
                "label": "wordz",
                "commits": commit_records,
                "groups": groups,
                "nodes": nodes,
                "edges": edges_out,
            }
        }
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")

    print(f"\nWrote {OUT}", file=sys.stderr)
    print(f"  {len(commit_records)} commits, {len(nodes)} nodes, "
          f"{len(edges_out)} edges, {len(groups)} groups", file=sys.stderr)


if __name__ == "__main__":
    main()
