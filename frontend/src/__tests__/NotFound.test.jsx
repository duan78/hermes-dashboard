import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import NotFound from '../pages/NotFound'
import { renderWithProviders } from '../test/test-utils'

describe('NotFound', () => {
  it('renders 404 heading', () => {
    renderWithProviders(<NotFound />)
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('Page not found')).toBeInTheDocument()
  })

  it('renders descriptive message', () => {
    renderWithProviders(<NotFound />)
    expect(screen.getByText(/doesn't exist or has been moved/)).toBeInTheDocument()
  })

  it('renders Go Back and Overview links', () => {
    renderWithProviders(<NotFound />)
    expect(screen.getByText('Go Back')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
  })

  it('Overview link points to /', () => {
    renderWithProviders(<NotFound />)
    const link = screen.getByText('Overview').closest('a')
    expect(link).toHaveAttribute('href', '/')
  })
})
