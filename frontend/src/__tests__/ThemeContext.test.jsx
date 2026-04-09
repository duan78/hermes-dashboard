import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, ThemeToggle, useTheme } from '../contexts/ThemeContext'

function ThemeDisplay() {
  const { theme } = useTheme()
  return <span data-testid="theme">{theme}</span>
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to dark theme when no stored preference', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('uses stored theme from localStorage', () => {
    localStorage.setItem('hermes_theme', 'light')
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('sets data-theme attribute on document element', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggles theme and persists to localStorage', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeDisplay />
        <ThemeToggle />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    await user.click(screen.getByText('Light Mode'))
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(localStorage.setItem).toHaveBeenCalledWith('hermes_theme', 'light')
  })

  it('ThemeToggle shows Sun icon in dark mode', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument()
  })

  it('ThemeToggle shows Moon icon in light mode', () => {
    localStorage.setItem('hermes_theme', 'light')
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument()
  })
})
