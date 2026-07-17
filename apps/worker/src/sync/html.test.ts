import { describe, expect, it } from 'vitest'
import { htmlToText, sanitizeHtml } from './html'

describe('sanitizeHtml', () => {
  it('drops script/style/iframe containers and their contents', () => {
    const out = sanitizeHtml(
      '<p>hi</p><script>alert(1)</script><style>.x{}</style><iframe src="evil"></iframe>',
    )
    expect(out).toContain('<p>hi</p>')
    expect(out).not.toContain('alert')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<style')
  })

  it('strips inline event handlers and neutralizes script/data URLs', () => {
    const out = sanitizeHtml(
      `<a href="javascript:steal()" onclick="x()">click</a><img src="data:text/html,evil">`,
    )
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('data:text/html')
    expect(out).toContain('click')
  })

  it('removes external-resource singletons', () => {
    const out = sanitizeHtml('<link rel="stylesheet" href="x.css"><meta charset="utf-8"><p>ok</p>')
    expect(out).not.toContain('<link')
    expect(out).not.toContain('<meta')
    expect(out).toContain('<p>ok</p>')
  })
})

describe('htmlToText', () => {
  it('extracts readable text, honoring block breaks and entities', () => {
    const text = htmlToText('<p>Hello&nbsp;world</p><br><div>line&amp;two</div><script>x</script>')
    expect(text).toContain('Hello world')
    expect(text).toContain('line&two')
    expect(text).not.toContain('<')
    expect(text).not.toContain('script')
  })
})
