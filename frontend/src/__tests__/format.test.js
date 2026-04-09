import { describe, it, expect } from 'vitest'
import { formatSize, formatDate } from '../utils/format'

describe('formatSize', () => {
  it('returns "0 B" for falsy values', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(null)).toBe('0 B')
    expect(formatSize(undefined)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    expect(formatSize(500)).toBe('500 B')
  })

  it('formats kilobytes correctly', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatSize(1048576)).toBe('1.0 MB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatSize(1073741824)).toBe('1.0 GB')
  })

  it('handles large values', () => {
    const result = formatSize(5 * 1073741824)
    expect(result).toBe('5.0 GB')
  })
})

describe('formatDate', () => {
  it('returns empty string for falsy values', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate(0)).toBe('')
    expect(formatDate('')).toBe('')
  })

  it('formats ISO string timestamps', () => {
    const result = formatDate('2025-01-15T10:30:00Z')
    expect(result).toBeTruthy()
    expect(result).toContain('2025')
  })

  it('formats millisecond timestamps', () => {
    const ts = new Date('2025-06-01T12:00:00Z').getTime()
    const result = formatDate(ts)
    expect(result).toContain('2025')
  })

  it('returns empty string for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
})
