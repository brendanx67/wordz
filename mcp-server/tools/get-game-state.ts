import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";
import { renderBoard, type GameState } from "../board.js";

export function registerGetGameStateTool(server: McpServer) {
  server.tool(
    "get_game_state",
    "Get the current state of the Wordz game: board, your rack, scores, whose turn it is, and recent moves",
    {
      game_id: z.string().describe("Game ID (use list_games to find your games)"),
    },
    async ({ game_id }) => {
      const state = (await apiCall("state", "GET", undefined, game_id)) as GameState;

      const boardText = renderBoard(state.tiles_on_board);
      const rackText = state.your_rack
        .map((t) => `${t.letter}(${t.value}${t.isBlank ? ",blank" : ""})`)
        .join(" ");

      const scoreText = state.players.map((p) => `${p.name}: ${p.score}`).join(", ");

      const opponentDescriptions = state.players
        .map((p) => {
          // Surface user_id for humans + API players so the caller can pass it
          // to start_direct_message to open a DM channel.
          const userIdSuffix = p.user_id ? ` [user_id=${p.user_id}]` : "";
          if (p.type === "computer") {
            const diffDesc =
              p.difficulty === "competitive"
                ? "ADAPTIVE ALGORITHM: Targets the top opponent's score each turn — plays conservatively when ahead, aggressively when behind. Has a crude sense of game position."
                : p.difficulty === "hard"
                  ? "BRUTE-FORCE ALGORITHM: Exhaustively searches all legal moves and always plays the highest-scoring one. Pure greedy optimization, no strategic thinking."
                  : p.difficulty === "medium"
                    ? "ALGORITHM (medium): Picks a good but not always optimal move."
                    : "ALGORITHM (easy): Plays simple, lower-scoring moves.";
            return `${p.name} — ${diffDesc}`;
          }
          if (p.type === "api") {
            return `${p.name}${userIdSuffix} — LLM/AI PLAYER (strategy: ${p.strategy_level ?? "unknown"}): Another AI model playing via API.`;
          }
          if (p.type === "human") {
            return `${p.name}${userIdSuffix} — HUMAN PLAYER: A person playing through the web interface.`;
          }
          return `${p.name} — Unknown player type`;
        })
        .join("\n");

      const movesText =
        state.recent_moves.length > 0
          ? state.recent_moves
              .map(
                (m) =>
                  `${m.player} ${m.type === "play" ? `played ${m.words.join(", ")} for ${m.score} pts` : m.type === "pass" ? "passed" : "exchanged tiles"}`
              )
              .join("\n")
          : "No moves yet";

      const statusText =
        state.status === "finished"
          ? `Game over! Winner: ${state.winner}`
          : state.is_your_turn
            ? "IT IS YOUR TURN"
            : `Waiting for opponent to play`;

      const myScore = state.your_score;
      const maxOpponentScore = Math.max(...state.players.map((p) => p.score), 0);
      const scoreDiff = myScore - maxOpponentScore;
      const positionHint =
        scoreDiff > 30
          ? "You're ahead — consider defensive play (short words, close the board)."
          : scoreDiff < -30
            ? "You're behind — play aggressively (open the board, seek bingos and bonus squares)."
            : "Game is close — balance scoring with rack management.";

      const vowels = state.your_rack.filter((t) => "AEIOU".includes(t.letter)).length;
      const blanks = state.your_rack.filter((t) => t.isBlank).length;
      const sCount = state.your_rack.filter((t) => t.letter === "S").length;
      const highValue = state.your_rack.filter((t) => t.value >= 4);
      const rackHints: string[] = [];
      if (blanks > 0) rackHints.push(`You have ${blanks} blank(s) — save for bingo or high-value play`);
      if (sCount > 0) rackHints.push(`You have ${sCount} S tile(s) — use to pluralize AND form cross-words`);
      if (vowels >= 5) rackHints.push("Too many vowels — consider exchanging some");
      if (vowels <= 1) rackHints.push("Low on vowels — consider exchanging consonants");
      if (highValue.length >= 3) {
        rackHints.push(
          `High-value tiles (${highValue.map((t) => t.letter).join(",")}) — try to place on bonus squares`
        );
      }

      const text = [
        `=== WORDZ GAME STATE ===`,
        `Status: ${statusText}`,
        `Scores: ${scoreText}`,
        `Score differential: ${scoreDiff >= 0 ? "+" : ""}${scoreDiff} | ${positionHint}`,
        `Tiles remaining in bag: ${state.tiles_remaining}`,
        ``,
        `Opponents:`,
        opponentDescriptions,
        ``,
        `Board:`,
        boardText,
        ``,
        `Your rack: ${rackText}`,
        ...(rackHints.length > 0 ? [`Rack notes: ${rackHints.join(". ")}`] : []),
        ``,
        `Recent moves:`,
        movesText,
        ...(state.suggested_move
          ? [
              ``,
              `=== OWNER SUGGESTION ===`,
              `Your owner has placed tiles on the board for you to consider:`,
              ...state.suggested_move.tiles.map((t) => `  ${t.letter} at ${t.cell}`),
              `Use validate_suggestion to check it, or play_suggestion to play it directly.`,
            ]
          : []),
        ...(state.find_words_enabled
          ? [
              ``,
              `[Word finder is ENABLED for this seat — use find_words to search all legal moves with the A&J algorithm]`,
            ]
          : []),
        ``,
        `--- REMEMBER ---`,
        `Think about RACK LEAVE — what tiles remain after your play matters as much as the score.`,
        `Coordinates use Excel-style cell notation: column letter (A-O) + row number (1-15).`,
        `Example: H8 = column H, row 8 (the center square).`,
        `To play a word, use the play_word tool with tiles placed at specific cells.`,
        `Each tile needs: cell (e.g. "H8"), letter.`,
        `Example: to play "CAT" horizontally starting at H8:`,
        `  tiles: [{cell: "H8", letter: "C"}, {cell: "I8", letter: "A"}, {cell: "J8", letter: "T"}]`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );
}
