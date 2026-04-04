// Trie data structure for efficient word lookup and prefix checking
// Used by the AI move generator (Appel & Jacobsen algorithm)

export interface TrieNode {
  children: Map<string, TrieNode>
  isTerminal: boolean
}

export function createTrieNode(): TrieNode {
  return { children: new Map(), isTerminal: false }
}

export function insertWord(root: TrieNode, word: string): void {
  let node = root
  for (const ch of word) {
    let child = node.children.get(ch)
    if (!child) {
      child = createTrieNode()
      node.children.set(ch, child)
    }
    node = child
  }
  node.isTerminal = true
}

export function isWord(root: TrieNode, word: string): boolean {
  let node = root
  for (const ch of word) {
    const child = node.children.get(ch)
    if (!child) return false
    node = child
  }
  return node.isTerminal
}

export function isPrefix(root: TrieNode, prefix: string): boolean {
  let node = root
  for (const ch of prefix) {
    const child = node.children.get(ch)
    if (!child) return false
    node = child
  }
  return true
}

export function getNode(root: TrieNode, prefix: string): TrieNode | null {
  let node = root
  for (const ch of prefix) {
    const child = node.children.get(ch)
    if (!child) return null
    node = child
  }
  return node
}

let cachedTrie: TrieNode | null = null
let loadingPromise: Promise<TrieNode> | null = null

export async function loadDictionary(): Promise<TrieNode> {
  if (cachedTrie) return cachedTrie
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const response = await fetch('/twl06.txt')
    const text = await response.text()
    const root = createTrieNode()
    const words = text.split('\n')
    for (const word of words) {
      const trimmed = word.trim().toUpperCase()
      if (trimmed.length >= 2) {
        insertWord(root, trimmed)
      }
    }
    cachedTrie = root
    return root
  })()

  return loadingPromise
}
