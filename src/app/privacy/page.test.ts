// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import PrivacyPage from './page'

afterEach(cleanup)

describe('PrivacyPage', () => {
  it('discloses the OpenAI and Vercel data boundaries', () => {
    render(createElement(PrivacyPage))

    expect(screen.getByText(/Rota does not store your search text/)).toBeTruthy()
    expect(screen.getByText(/retained for up to 30 days/)).toBeTruthy()
    expect(screen.getByText(/one-month reporting window/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'OpenAI API data controls' }).getAttribute(
        'href',
      ),
    ).toBe('https://developers.openai.com/api/docs/guides/your-data')
    expect(
      screen.getByRole('link', { name: 'Vercel privacy notice' }).getAttribute(
        'href',
      ),
    ).toBe('https://vercel.com/legal/privacy-notice')
  })
})
