/**
 * Format a byte count into a human-readable size string.
 * Handles B, KB, MB, GB.
 */
export function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Format a timestamp into a human-readable date + time string.
 * Auto-detects seconds vs milliseconds for numeric timestamps.
 */
export function formatDate(ts) {
  if (!ts) return ''
  try {
    const d = ts > 1e12 ? new Date(ts) : new Date(ts)
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}
