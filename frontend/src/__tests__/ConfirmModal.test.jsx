import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmModal from '../components/ConfirmModal'

describe('ConfirmModal', () => {
  const defaultProps = {
    message: 'Are you sure?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('renders the message', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('renders default title "Confirm"', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('renders custom title', () => {
    render(<ConfirmModal {...defaultProps} title="Delete item" />)
    expect(screen.getByText('Delete item')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />)
    await user.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />)
    await user.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when overlay clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />)
    await user.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows custom confirm label', () => {
    render(<ConfirmModal {...defaultProps} confirmLabel="Delete" />)
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('disables buttons when loading', () => {
    render(<ConfirmModal {...defaultProps} loading={true} />)
    expect(screen.getByText('Cancel')).toBeDisabled()
    expect(screen.getByText('Confirm')).toBeDisabled()
  })

  it('calls onCancel on Escape key', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not apply danger class when danger=false', () => {
    render(<ConfirmModal {...defaultProps} danger={false} />)
    const btn = screen.getByText('Confirm')
    expect(btn.className).not.toContain('btn-danger')
  })
})
