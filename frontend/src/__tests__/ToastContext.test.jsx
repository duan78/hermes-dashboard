import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '../contexts/ToastContext'

function ToastUser({ message, type }) {
  const { toast } = useToast()
  return <button onClick={() => toast[type || 'info'](message || 'Hello')}>Show toast</button>
}

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders children', () => {
    render(
      <ToastProvider>
        <div>Child</div>
      </ToastProvider>,
    )
    expect(screen.getByText('Child')).toBeInTheDocument()
  })

  it('shows a toast message', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <ToastUser message="Test notification" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('Show toast'))
    expect(screen.getByText('Test notification')).toBeInTheDocument()
  })

  it('auto-removes toast after duration', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <ToastUser message="Will disappear" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('Show toast'))
    expect(screen.getByText('Will disappear')).toBeInTheDocument()

    vi.advanceTimersByTime(5000)
    await waitFor(() => {
      expect(screen.queryByText('Will disappear')).not.toBeInTheDocument()
    })
  })

  it('removes toast on close button click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <ToastUser message="Close me" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('Show toast'))
    const closeBtn = screen.getByRole('button', { name: '' })
    // The × button next to the toast
    const closeButtons = screen.getAllByText('\u00D7')
    await user.click(closeButtons[0])
    await waitFor(() => {
      expect(screen.queryByText('Close me')).not.toBeInTheDocument()
    })
  })

  it('shows success toast with correct styling', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <ToastUser message="Done!" type="success" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('Show toast'))
    const toast = screen.getByText('Done!').closest('.toast')
    expect(tooth).toHaveClass('toast-success')
  })

  it('throws when useToast is used outside ToastProvider', () => {
    // Suppress React error boundary
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ToastUser />)).toThrow('useToast must be used within ToastProvider')
  })
})
