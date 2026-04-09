import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Must import api before mocking to get the module reference
const { api } = await import('../api')

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  async function mockFetchResponse(status, body) {
    const response = { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body), statusText: 'Error' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    return response
  }

  it('sends requests with JSON content type', async () => {
    await mockFetchResponse(200, { data: 'test' })
    await api.getOverview()
    expect(fetch).toHaveBeenCalledWith(
      '/api/overview',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('includes Bearer token from localStorage', async () => {
    localStorage.setItem('hermes_token', 'my-jwt')
    await mockFetchResponse(200, {})
    await api.getOverview()
    expect(fetch).toHaveBeenCalledWith(
      '/api/overview',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      }),
    )
  })

  it('returns JSON on successful response', async () => {
    await mockFetchResponse(200, { version: '1.0.0' })
    const result = await api.getConfig()
    expect(result).toEqual({ version: '1.0.0' })
  })

  it('dispatches auth-required event on 401', async () => {
    const dispatchSpy = vi.spyOn(globalThis, 'dispatchEvent')
    await mockFetchResponse(401, { detail: 'Unauthorized' })
    await expect(api.getConfig()).rejects.toThrow('Unauthorized')
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    const event = dispatchSpy.mock.calls[0][0]
    expect(event.type).toBe('auth-required')
  })

  it('throws with error detail on non-ok response', async () => {
    await mockFetchResponse(500, { detail: 'Internal Server Error' })
    await expect(api.getConfig()).rejects.toThrow('Internal Server Error')
  })

  it('throws with error field when detail is missing', async () => {
    await mockFetchResponse(400, { error: 'Bad request' })
    await expect(api.getConfig()).rejects.toThrow('Bad request')
  })

  it('falls back to statusText when body parse fails', async () => {
    const response = { ok: false, status: 502, statusText: 'Bad Gateway', json: vi.fn().mockRejectedValue(new Error('parse error')) }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(api.getConfig()).rejects.toThrow('Bad Gateway')
  })

  it('sends POST requests with body', async () => {
    await mockFetchResponse(200, {})
    await api.saveConfig('yaml: content')
    expect(fetch).toHaveBeenCalledWith(
      '/api/config',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ yaml: 'yaml: content' }),
      }),
    )
  })

  it('encodes query parameters correctly', async () => {
    await mockFetchResponse(200, [])
    await api.searchSessions('hello world')
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=hello%20world',
      expect.any(Object),
    )
  })

  it('sends DELETE requests correctly', async () => {
    await mockFetchResponse(200, {})
    await api.deleteSession('abc-123')
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/abc-123',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
