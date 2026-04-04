// Edge Function: validate a word against the free dictionary API
// No secrets needed — uses a public API

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const results: Record<string, boolean> = {};

    // Check each word against the free dictionary API
    for (const word of words) {
      const w = word.toLowerCase().trim();
      if (w.length < 2) {
        results[word] = false;
        continue;
      }
      try {
        const res = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`
        );
        results[word] = res.ok;
      } catch {
        // If the API is down, give benefit of the doubt
        results[word] = true;
      }
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
