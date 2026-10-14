import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// jsdom has no layout and Vitest runs with css disabled, so placement is guarded on the stylesheet text.
const css = readFileSync('src/styles/index.css', 'utf8')

function ruleBody(selector: string, from = 0): string {
  const start = css.indexOf(`${selector} {`, from)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('toast placement', () => {
  it('anchors the stack to the bottom-right with no top offset', () => {
    const base = ruleBody('.toast-viewport')
    expect(base).toMatch(/\bbottom:/)
    expect(base).toMatch(/\bright:/)
    expect(base).not.toMatch(/\btop:/)
  })

  it('keeps the full-width bottom rule at 600px and below', () => {
    const media = css.indexOf('@media (max-width: 600px)')
    expect(media).toBeGreaterThanOrEqual(0)
    const small = ruleBody('.toast-viewport', media)
    expect(small).toMatch(/bottom: calc\(var\(--space-3\) \+ env\(safe-area-inset-bottom\)\)/)
    expect(small).toMatch(/left: var\(--space-3\)/)
    expect(small).toMatch(/width: auto/)
  })
})
