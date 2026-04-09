import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { renderWithProviders } from '../test/test-utils'

// Mock WebSocket to avoid real connections
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ current: null })),
}))

// Mock the API calls App makes on mount
vi.mock('../api', () => ({
  api: {
    fineTuneAvailable: vi.fn().mockResolvedValue({ available: false }),
    getConfigSections: vi.fn().mockResolvedValue({ toolsets: [] }),
  },
}))

describe('App', () => {
  it('renders sidebar with navigation links', () => {
    renderWithProviders(<App />)
    expect(screen.getByText('Hermes Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders Overview page at root route', async () => {
    renderWithProviders(<App />, { route: '/' })
    // The main content area exists
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders mobile toggle button', () => {
    renderWithProviders(<App />)
    expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument()
  })

  it('toggles sidebar on mobile menu click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)
    const toggle = screen.getByLabelText('Toggle menu')
    await user.click(toggle)
    // Sidebar should have 'open' class
    const sidebar = document.querySelector('.sidebar')
    expect(sidebar).toHaveClass('open')
  })

  it('hides feature-gated nav items by default', () => {
    renderWithProviders(<App />)
    // MOA and Fine-Tune are feature-gated
    expect(screen.queryByText('MOA')).not.toBeInTheDocument()
    expect(screen.queryByText('Fine-Tune')).not.toBeInTheDocument()
  })

  it('shows feature-gated items when feature is enabled', async () => {
    const { api } = await import('../api')
    api.fineTuneAvailable.mockResolvedValueOnce({ available: true })
    api.getConfigSections.mockResolvedValueOnce({ toolsets: ['moa'] })

    renderWithProviders(<App />)

    await waitFor(() => {
      expect(screen.getByText('Fine-Tune')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('MOA')).toBeInTheDocument()
    })
  })

  it('renders navigation links with correct hrefs', () => {
    renderWithProviders(<App />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/config')
    expect(hrefs).toContain('/sessions')
    expect(hrefs).toContain('/tools')
  })
})
