// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SiteFooter } from './site-footer'

afterEach(cleanup)

describe('SiteFooter', () => {
  it('keeps the simulation disclosure and privacy link quiet but visible', () => {
    render(createElement(SiteFooter))

    expect(
      screen.getByText(
        'Simulated flights and fares. Rota is a demonstration, not a booking service.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe(
      '/privacy',
    )
  })
})
