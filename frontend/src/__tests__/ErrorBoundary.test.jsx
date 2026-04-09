import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../components/ErrorBoundary'

function ThrowingChild({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test error message')
  return <div>Child content</div>
}

describe('ErrorBoundary', () => {
  // Suppress console.error from React error boundary
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('displays "Try again" and "Reload page" buttons', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Try again')).toBeInTheDocument()
    expect(screen.getByText('Reload page')).toBeInTheDocument()
  })

  it('resets error state when "Try again" is clicked', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    await user.click(screen.getByText('Try again'))

    // Re-render with shouldThrow=false to simulate recovery
    rerender(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('calls window.location.reload on "Reload page" click', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    await user.click(screen.getByText('Reload page'))
    expect(globalThis.location.reload).toHaveBeenCalled()
  })

  it('shows fallback message when error has no message', () => {
    function ThrowingNoMsg() {
      throw new Error()
    }
    render(
      <ErrorBoundary>
        <ThrowingNoMsg />
      </ErrorBoundary>,
    )
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
  })
})
