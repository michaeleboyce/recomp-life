/**
 * Stable 53-bit string hash (cyrb53) for deterministic ids. Synchronous and
 * dependency-free so it runs identically in the browser, on the Mac and in
 * tests. Not cryptographic; it only has to make ids repeatable.
 */
export function hashString(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return n.toString(16).padStart(14, '0')
}

/**
 * Id from the source app and the original row's content (the fields, so line
 * endings do not matter). `occurrence` separates byte-identical rows within
 * one session (two identical sets in a row), keeping ids unique and repeatable.
 */
export function rowId(
  app: string,
  kind: 'session' | 'set' | 'cardio',
  content: string,
  occurrence = 0,
): string {
  return `${app}-${kind}-${hashString(`${app}\u001f${kind}\u001f${content}\u001f${occurrence}`)}`
}
