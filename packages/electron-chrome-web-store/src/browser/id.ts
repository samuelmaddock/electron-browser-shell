import { createHash } from 'node:crypto'

/**
 * Converts a normal hexadecimal string into the alphabet used by extensions.
 * We use the characters 'a'-'p' instead of '0'-'f' to avoid ever having a
 * completely numeric host, since some software interprets that as an IP address.
 *
 * @param id - The hexadecimal string to convert. This is modified in place.
 */
export function convertHexadecimalToIDAlphabet(id: string) {
  let result = ''
  for (const ch of id) {
    const val = parseInt(ch, 16)
    if (!isNaN(val)) {
      result += String.fromCharCode('a'.charCodeAt(0) + val)
    } else {
      result += 'a'
    }
  }
  return result
}

function generateIdFromHash(hash: Buffer): string {
  const hashedId = hash.subarray(0, 16).toString('hex')
  return convertHexadecimalToIDAlphabet(hashedId)
}

export function generateId(input: string): string {
  const hash = createHash('sha256').update(input, 'base64').digest()
  return generateIdFromHash(hash)
}
