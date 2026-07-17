import { describe, expect, it } from 'vitest'
import {
  PARSER_FEEDBACK_FRAGMENT_MAX_UNITS,
  boundParserFeedbackFragment,
  serializeParserFeedbackValue,
} from './parser-feedback'

describe('parser feedback serialization', () => {
  it('uses the same stable placeholder for cyclic and undefined output', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic

    expect(serializeParserFeedbackValue(cyclic).text).toBe(
      '(unserializable output)',
    )
    expect(serializeParserFeedbackValue(undefined).text).toBe(
      '(unserializable output)',
    )
  })

  it('bounds serialized output before returning it', () => {
    const serialized = serializeParserFeedbackValue({
      output: `${'a'.repeat(PARSER_FEEDBACK_FRAGMENT_MAX_UNITS)}SENTINEL`,
    })

    expect(serialized.text.length).toBeLessThanOrEqual(
      PARSER_FEEDBACK_FRAGMENT_MAX_UNITS,
    )
    expect(serialized.text.endsWith('[truncated]')).toBe(true)
    expect(serialized.text).not.toContain('SENTINEL')
  })
})

describe('parser feedback truncation', () => {
  it('preserves a fragment exactly at the limit', () => {
    const fragment = 'a'.repeat(PARSER_FEEDBACK_FRAGMENT_MAX_UNITS)

    expect(boundParserFeedbackFragment(fragment)).toEqual({
      text: fragment,
      truncated: false,
    })
  })

  it('includes the marker within the limit and omits text beyond the cap', () => {
    const bounded = boundParserFeedbackFragment(
      `${'a'.repeat(PARSER_FEEDBACK_FRAGMENT_MAX_UNITS)}SENTINEL`,
    )

    expect(bounded.text.length).toBeLessThanOrEqual(
      PARSER_FEEDBACK_FRAGMENT_MAX_UNITS,
    )
    expect(bounded.text.endsWith('[truncated]')).toBe(true)
    expect(bounded.text).not.toContain('SENTINEL')
    expect(bounded.truncated).toBe(true)
  })

  it('does not retain an unmatched high surrogate at the cut boundary', () => {
    const bounded = boundParserFeedbackFragment('🚀'.repeat(3_000))
    const markerStart = bounded.text.indexOf('[truncated]')
    const finalContentUnit = bounded.text.charCodeAt(markerStart - 1)

    expect(finalContentUnit >= 0xd800 && finalContentUnit <= 0xdbff).toBe(false)
  })
})
