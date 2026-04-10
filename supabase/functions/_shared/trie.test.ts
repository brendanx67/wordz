import { describe, test, expect } from "bun:test";
import {
  buildTrie,
  createTrieNode,
  getNode,
  insertWord,
  isWord,
} from "./trie.ts";

// NOTE: buildTrie() caches the result in a module-level variable the first
// time it is called. The test that exercises it is therefore placed LAST so
// earlier tests run against fresh, unpolluted tries built with
// createTrieNode() + insertWord() directly.

describe("trie", () => {
  test("insertWord + isWord: exact word only, not prefixes or extensions", () => {
    const root = createTrieNode();
    insertWord(root, "HELLO");
    expect(isWord(root, "HELLO")).toBe(true);
    expect(isWord(root, "HELL")).toBe(false); // prefix, not terminal
    expect(isWord(root, "HELLOS")).toBe(false); // not inserted
    expect(isWord(root, "WORLD")).toBe(false);
  });

  test("shared prefixes: CAT, CATS, CAR all resolve; shared ancestors are not terminal", () => {
    const root = createTrieNode();
    insertWord(root, "CAT");
    insertWord(root, "CATS");
    insertWord(root, "CAR");
    expect(isWord(root, "CAT")).toBe(true);
    expect(isWord(root, "CATS")).toBe(true);
    expect(isWord(root, "CAR")).toBe(true);
    expect(isWord(root, "CA")).toBe(false); // shared prefix, not a word
    expect(isWord(root, "CARS")).toBe(false); // never inserted
    expect(isWord(root, "CATT")).toBe(false);
  });

  test("getNode: returns terminal node for known words, non-terminal for prefixes, null for unknown", () => {
    const root = createTrieNode();
    insertWord(root, "CAT");
    insertWord(root, "CATS");

    const catNode = getNode(root, "CAT");
    expect(catNode).not.toBeNull();
    expect(catNode!.isTerminal).toBe(true);

    const caNode = getNode(root, "CA");
    expect(caNode).not.toBeNull();
    expect(caNode!.isTerminal).toBe(false);

    expect(getNode(root, "XYZ")).toBeNull();
    expect(getNode(root, "CATT")).toBeNull();
  });

  test("empty string is not a word", () => {
    const root = createTrieNode();
    insertWord(root, "CAT");
    expect(isWord(root, "")).toBe(false);
  });

  test("single-character words: insertWord accepts them, buildTrie filters them", () => {
    const root = createTrieNode();
    insertWord(root, "A");
    expect(isWord(root, "A")).toBe(true);
  });

  test("case sensitivity: trie stores uppercase, lowercase lookups fail", () => {
    const root = createTrieNode();
    insertWord(root, "HELLO");
    expect(isWord(root, "HELLO")).toBe(true);
    expect(isWord(root, "hello")).toBe(false);
    expect(isWord(root, "Hello")).toBe(false);
  });

  test("many words: insert 1000 words and verify all are findable", () => {
    const root = createTrieNode();
    const words: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const w = "W" + i.toString(36).toUpperCase().padStart(4, "A");
      words.push(w);
      insertWord(root, w);
    }
    for (const w of words) {
      expect(isWord(root, w)).toBe(true);
    }
    expect(isWord(root, "NOTAWORD")).toBe(false);
  });

  // Placed LAST so the global buildTrie cache is not polluted for earlier tests.
  test("buildTrie: parses newlines, uppercases, filters words shorter than 2 chars", () => {
    const root = buildTrie("cat\nCATS\ncar\na\n  dogs  \nZ\n\nhello\n");
    // Length >= 2 AND uppercased:
    expect(isWord(root, "CAT")).toBe(true);
    expect(isWord(root, "CATS")).toBe(true);
    expect(isWord(root, "CAR")).toBe(true);
    expect(isWord(root, "DOGS")).toBe(true); // whitespace trimmed
    expect(isWord(root, "HELLO")).toBe(true);
    // Filtered out:
    expect(isWord(root, "A")).toBe(false); // too short
    expect(isWord(root, "Z")).toBe(false); // too short
    // Lowercase lookup fails (trie is uppercase-only):
    expect(isWord(root, "cat")).toBe(false);
  });
});
