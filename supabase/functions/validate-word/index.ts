// Edge Function: validate words against the TWL06 dictionary (server-side Trie)
import { buildTrie, isWord } from "./_shared/trie.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let wordListCache: string | null = null;

async function getTrie() {
  if (!wordListCache) {
    const res = await fetch("https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt");
    wordListCache = await res.text();
  }
  return buildTrie(wordListCache);
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
