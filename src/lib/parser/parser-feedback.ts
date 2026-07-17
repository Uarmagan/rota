const SERIALIZATION_FAILURE_PLACEHOLDER = '(unserializable output)'
const TRUNCATION_MARKER = '[truncated]'

export const PARSER_FEEDBACK_FRAGMENT_MAX_UNITS = 4_096

export function boundParserFeedbackFragment(fragment: string): {
  readonly text: string
  readonly truncated: boolean
} {
  if (fragment.length <= PARSER_FEEDBACK_FRAGMENT_MAX_UNITS) {
    return { text: fragment, truncated: false }
  }

  const contentLimit =
    PARSER_FEEDBACK_FRAGMENT_MAX_UNITS - TRUNCATION_MARKER.length
  let content = fragment.slice(0, contentLimit)
  const finalUnit = content.charCodeAt(content.length - 1)
  if (finalUnit >= 0xd800 && finalUnit <= 0xdbff) {
    content = content.slice(0, -1)
  }
  return {
    text: `${content}${TRUNCATION_MARKER}`,
    truncated: true,
  }
}

export function serializeParserFeedbackValue(value: unknown): {
  readonly text: string
  readonly truncated: boolean
} {
  try {
    const serialized = JSON.stringify(value)
    return boundParserFeedbackFragment(
      serialized ?? SERIALIZATION_FAILURE_PLACEHOLDER,
    )
  } catch {
    return boundParserFeedbackFragment(SERIALIZATION_FAILURE_PLACEHOLDER)
  }
}
