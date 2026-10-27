// Statement bytes → text. Greek bank exports come as UTF-8 (often with a BOM),
// UTF-16 (Excel "Unicode text") or the old Windows Greek code page.

export type StatementEncoding = 'utf-8' | 'utf-16le' | 'windows-1253'

export function decodeStatement(bytes: Uint8Array): { text: string; encoding: StatementEncoding } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
  const utf8 = new TextDecoder('utf-8').decode(body)
  // A byte that is not valid UTF-8 becomes U+FFFD: the file is in the Greek code page
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' }
  return { text: new TextDecoder('windows-1253').decode(body), encoding: 'windows-1253' }
}
