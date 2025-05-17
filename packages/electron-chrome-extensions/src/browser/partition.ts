import { session } from 'electron'

type SessionPartitionResolver = (partition: string) => Electron.Session

let resolvePartitionImpl: SessionPartitionResolver = (partition) => session.fromPartition(partition)

/**
 * Overrides the default `session.fromPartition()` behavior for retrieving Electron Sessions.
 * This allows using custom identifiers (e.g., profile IDs) to find sessions, enabling features like
 * `<browser-actions>` to work with non-standard session management schemes.
 * @param handler A function that receives a string identifier and returns the corresponding Electron `Session`.
 */
export function setSessionPartitionResolver(resolver: SessionPartitionResolver) {
  resolvePartitionImpl = resolver
}

export function resolvePartition(partition: string) {
  return resolvePartitionImpl(partition)
}
