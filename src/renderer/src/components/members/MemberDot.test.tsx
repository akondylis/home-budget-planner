import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberDot } from './MemberDot'

describe('MemberDot', () => {
  it('should draw the colour as a hidden mark next to the name, so colour is never the only cue', () => {
    const html = renderToStaticMarkup(<MemberDot colour="purple" name="Μαρία" />)
    expect(html).toContain('bg-purple-500')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('Μαρία')
  })

  it('should draw only the dot when no name is given', () => {
    const html = renderToStaticMarkup(<MemberDot colour="green" size="md" />)
    expect(html).toContain('h-3.5 w-3.5')
    expect(html).not.toContain('truncate')
  })
})
