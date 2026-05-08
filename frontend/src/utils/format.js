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
    // Auto-detect seconds vs milliseconds: if the number is < 1e12 it's in seconds
    let ms = ts
    if (typeof ms === 'number' && ms < 1e12) {
      ms = ms * 1000
    } else if (typeof ms === 'string') {
      const parsed = parseFloat(ms)
      if (!isNaN(parsed) && parsed < 1e12) {
        ms = parsed * 1000
      }
    }
    const d = new Date(ms)
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Format a timestamp as time only (HH:MM).
 */
export function formatTime(ts) {
  if (!ts) return ''
  try {
    // Auto-detect seconds vs milliseconds
    let ms = ts
    if (typeof ms === 'number' && ms < 1e12) ms = ms * 1000
    else if (typeof ms === 'string') {
      const parsed = parseFloat(ms)
      if (!isNaN(parsed) && parsed < 1e12) ms = parsed * 1000
    }
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Format a relative time string (e.g. "2h ago", "3d ago").
 */
export function formatRelative(ts) {
  if (!ts) return ''
  try {
    const now = Date.now()
    // Auto-detect seconds vs milliseconds
    let ms = ts
    if (typeof ms === 'number' && ms < 1e12) ms = ms * 1000
    else if (typeof ms === 'string') {
      const parsed = parseFloat(ms)
      if (!isNaN(parsed) && parsed < 1e12) ms = parsed * 1000
    }
    const then = new Date(ms).getTime()
    const diff = Math.max(0, now - then)
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return formatDate(ts)
  } catch {
    return ''
  }
}
