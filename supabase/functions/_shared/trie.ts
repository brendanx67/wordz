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

export function getNode(root: TrieNode, prefix: string): TrieNode | null {
  let node = root
  for (const ch of prefix) {
    const child = node.children.get(ch)
    if (!child) return null
    node = child
  }
  return node
}

// Server-side: build trie from embedded word list
let cachedTrie: TrieNode | null = null

export function buildTrie(wordList: string): TrieNode {
  if (cachedTrie) return cachedTrie
  const root = createTrieNode()
  const words = wordList.split('\n')
  for (const word of words) {
    const trimmed = word.trim().toUpperCase()
    if (trimmed.length >= 2) {
      insertWord(root, trimmed)
    }
  }
  cachedTrie = root
  return root
}
