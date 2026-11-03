// Host permission helpers for chrome.permissions.
// https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
// https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

import { ALL_URLS_SCHEMES, PATTERN_RE } from './match-pattern'

/**
 * Whether a manifest `permissions` entry is a host permission (a match
 * pattern or `<all_urls>`) rather than an API permission. In manifest V2,
 * host permissions are declared inside `permissions`.
 */
export function isHostPattern(entry: unknown): entry is string {
  return typeof entry === 'string' && (entry === '<all_urls>' || PATTERN_RE.test(entry))
}

/** Splits manifest permission entries into API permissions and host patterns. */
export function splitPermissions(entries: readonly unknown[]): {
  permissions: string[]
  origins: string[]
} {
  const permissions: string[] = []
  const origins: string[] = []
  for (const entry of entries) {
    if (isHostPattern(entry)) origins.push(entry)
    else if (typeof entry === 'string') permissions.push(entry)
  }
  return { permissions, origins }
}

const ALL_URLS_SCHEME_NAMES = new Set([...ALL_URLS_SCHEMES].map((s) => s.slice(0, -1)))

const parse = (pattern: string) => {
  const match = PATTERN_RE.exec(pattern)
  return match ? { scheme: match[1], host: match[2] } : undefined
}

const schemeCovers = (granted: string, requested: string) => {
  if (granted === requested) return true
  return granted === '*' && (requested === 'http' || requested === 'https')
}

const hostCovers = (granted: string, requested: string) => {
  if (granted === '*' || granted === requested) return true
  if (!granted.startsWith('*.')) return false
  const base = granted.slice(2)
  const host = requested.startsWith('*.') ? requested.slice(2) : requested
  return host === base || host.endsWith(`.${base}`)
}

/**
 * Whether the granted host pattern covers every URL the requested pattern
 * covers. Chrome ignores the path of host permissions, so only scheme and
 * host are compared.
 */
export function patternCovers(granted: string, requested: string): boolean {
  if (granted === requested) return true
  if (requested === '<all_urls>') return false

  const req = parse(requested)
  if (!req) return false

  if (granted === '<all_urls>') {
    return req.scheme === '*' || ALL_URLS_SCHEME_NAMES.has(req.scheme)
  }

  const grant = parse(granted)
  if (!grant || !schemeCovers(grant.scheme, req.scheme)) return false
  if (req.scheme === 'file') return true
  return hostCovers(grant.host, req.host)
}

/** Whether some pattern in `granted` covers `requested`. */
export function originCovered(granted: readonly string[], requested: string): boolean {
  return granted.some((pattern) => patternCovers(pattern, requested))
}
