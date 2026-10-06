// Match patterns and globs as used by content scripts and user scripts.
// https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

const ALL_URLS_SCHEMES = new Set(['http:', 'https:', 'file:', 'ftp:', 'ws:', 'wss:'])
const PATTERN_RE = /^(\*|https?|file|ftp|wss?|urn):\/\/(\*|\*\.[^/*]+|[^/*]*)(\/.*)$/

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Converts a glob to an anchored RegExp. `*` matches any run of characters;
 * `?` matches one character only for include/exclude globs, and is literal in
 * match pattern paths.
 */
const globToRegExp = (glob: string, wildcards: '*' | '*?') => {
  let source = ''
  for (const ch of glob) {
    if (ch === '*') source += '.*'
    else if (ch === '?' && wildcards === '*?') source += '.'
    else source += escapeRegExp(ch)
  }
  return new RegExp(`^${source}$`)
}

export function matchesPattern(pattern: string, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (pattern === '<all_urls>') return ALL_URLS_SCHEMES.has(parsed.protocol)

  const match = PATTERN_RE.exec(pattern)
  if (!match) return false
  const [, scheme, host, path] = match

  const protocol = parsed.protocol.slice(0, -1)
  if (scheme === '*' ? protocol !== 'http' && protocol !== 'https' : scheme !== protocol) {
    return false
  }

  if (scheme !== 'file' && host !== '*') {
    const hostname = parsed.hostname
    if (host.startsWith('*.')) {
      const base = host.slice(2)
      if (hostname !== base && !hostname.endsWith(`.${base}`)) return false
    } else if (hostname !== host) {
      return false
    }
  }

  return globToRegExp(path, '*').test(parsed.pathname + parsed.search)
}

export function matchesGlob(glob: string, url: string): boolean {
  return globToRegExp(glob, '*?').test(url)
}

export interface UrlFilter {
  matches?: string[]
  excludeMatches?: string[]
  includeGlobs?: string[]
  excludeGlobs?: string[]
}

/** Whether a script with the given filter should run on `url`. */
export function urlMatchesFilter(filter: UrlFilter, url: string): boolean {
  if (!filter.matches?.some((p) => matchesPattern(p, url))) return false
  if (filter.includeGlobs?.length && !filter.includeGlobs.some((g) => matchesGlob(g, url))) {
    return false
  }
  if (filter.excludeMatches?.some((p) => matchesPattern(p, url))) return false
  if (filter.excludeGlobs?.some((g) => matchesGlob(g, url))) return false
  return true
}
