// Edge Function: validate words against the TWL06 dictionary (server-side Trie)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── TRIE ──────────────────────────────────────────────────────────────────────
interface TrieNode {
  children: Map<string, TrieNode>;
  isTerminal: boolean;
}

function createTrieNode(): TrieNode {
  return { children: new Map(), isTerminal: false };
}

function insertWord(root: TrieNode, word: string): void {
  let node = root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (!child) {
      child = createTrieNode();
      node.children.set(ch, child);
    }
    node = child;
  }
  node.isTerminal = true;
}

function isWord(root: TrieNode, word: string): boolean {
  let node = root;
  for (const ch of word) {
    const child = node.children.get(ch);
    if (!child) return false;
    node = child;
  }
  return node.isTerminal;
}

let cachedTrie: TrieNode | null = null;
let wordListCache: string | null = null;

async function getTrie(): Promise<TrieNode> {
  if (cachedTrie) return cachedTrie;
  if (!wordListCache) {
    const res = await fetch("https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt");
    wordListCache = await res.text();
  }
  const root = createTrieNode();
  for (const line of wordListCache.split("\n")) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed.length >= 2) insertWord(root, trimmed);
  }
  cachedTrie = root;
  return root;
}

// ─── HANDLER ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const { words } = await req.json() as { words: string[] };

    if (!words || !Array.isArray(words) || words.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing words array" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const trie = await getTrie();
    const results: Record<string, boolean> = {};

    for (const word of words) {
      const w = word.trim().toUpperCase();
      results[word] = w.length >= 2 && isWord(trie, w);
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
