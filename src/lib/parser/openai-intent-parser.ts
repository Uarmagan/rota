import { openai } from '@ai-sdk/openai'
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
} from 'ai'
import {
  isResolvedDestination,
  parseResultSchema,
  type ParseResult,
  type TripIntent,
} from '../schema/trip-intent'
import { buildSystemPrompt, buildUserMessage } from './prompt'
import { ParserError, type IntentParser, type ParserContext } from './intent-parser'
import {
  boundParserFeedbackFragment,
  serializeParserFeedbackValue,
} from './parser-feedback'

interface ParserOptions {
  model?: string
}

// Caps the complete structured response, independently of its field-level bounds.
export const PARSER_MAX_OUTPUT_TOKENS = 1_024

interface GateFailure {
  failedOutput: string
  issues: string
  terminal: boolean
}

export class OpenAIIntentParser implements IntentParser {
  readonly modelId: string
  lastAttemptCount = 0

  constructor(
    private readonly context: ParserContext,
    options: ParserOptions = {},
  ) {
    this.modelId = options.model ?? process.env.ROTA_MODEL ?? 'gpt-5.6-luna'
  }

  async parse(currentIntent: TripIntent, utterance: string): Promise<ParseResult> {
    const system = buildSystemPrompt(this.context)
    const initialUserMessage = buildUserMessage(
      currentIntent,
      utterance,
      this.context.today,
    )
    let feedback: GateFailure | null = null
    let lastFailureMessage = 'unknown validation error'

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      this.lastAttemptCount = attempt
      try {
        const generated: { readonly output: unknown } = await generateText({
          model: openai(this.modelId),
          system,
          messages: feedback
            ? [
                { role: 'user', content: initialUserMessage },
                { role: 'assistant', content: feedback.failedOutput },
                {
                  role: 'user',
                  content:
                    'The previous output was invalid. Return a corrected COMPLETE ' +
                    `ParseResult. Validation issues:\n${feedback.issues}`,
                },
              ]
            : [{ role: 'user', content: initialUserMessage }],
          output: Output.object({ schema: parseResultSchema }),
          maxOutputTokens: PARSER_MAX_OUTPUT_TOKENS,
          maxRetries: 1,
          providerOptions: {
            openai: {
              reasoningEffort: 'none',
              strictJsonSchema: true,
            },
          },
        })

        const gate = parseResultSchema.safeParse(generated.output)
        if (!gate.success) {
          lastFailureMessage = formatZodIssues(gate.error.issues)
          feedback = {
            failedOutput: serializeParserFeedbackValue(generated.output).text,
            issues: lastFailureMessage,
            terminal: false,
          }
        } else {
          const membershipIssue = findMembershipIssue(
            gate.data,
            this.context.supportedPlaces.map((place) => place.iata),
          )
          if (!membershipIssue) {
            return {
              ...gate.data,
              unhandled: gate.data.unhandled?.trim() || null,
            }
          }
          lastFailureMessage = membershipIssue
          feedback = {
            failedOutput: serializeParserFeedbackValue(generated.output).text,
            issues: membershipIssue,
            terminal: false,
          }
        }
      } catch (error) {
        if (isBudgetExhausted(error)) {
          throw new ParserError(
            'budget_exhausted',
            'The model provider quota is exhausted',
          )
        } else if (NoObjectGeneratedError.isInstance(error)) {
          lastFailureMessage = boundedErrorMessage(
            error.cause instanceof Error ? error.cause : error,
          )
          const failedOutput = boundParserFeedbackFragment(
            error.text ?? '(no output)',
          ).text
          feedback = {
            failedOutput,
            issues: lastFailureMessage,
            terminal: isTerminalParseFailure(error.finishReason, failedOutput),
          }
        } else if (NoOutputGeneratedError.isInstance(error)) {
          throw new ParserError(
            'invalid_output',
            boundedText(`Parser produced no output: ${boundedErrorMessage(error)}`),
          )
        } else {
          throw new ParserError(
            'transport',
            boundedText(`Parser request failed: ${boundedErrorMessage(error)}`),
          )
        }
      }

      if (feedback.terminal) break
    }

    throw new ParserError(
      'invalid_output',
      boundedText(`Parser output failed validation: ${lastFailureMessage}`),
    )
  }
}

function isTerminalParseFailure(
  finishReason: string | undefined,
  text: string | undefined,
): boolean {
  if (finishReason !== undefined && finishReason !== 'stop') return true
  if (!text) return true
  const trimmed = text.trimStart()
  return !(
    trimmed.startsWith('{') ||
    (trimmed.startsWith('```') && trimmed.includes('{'))
  )
}

function findMembershipIssue(
  result: ParseResult,
  supportedIataCodes: readonly string[],
): string | null {
  const destination = isResolvedDestination(result.intent.destination)
    ? result.intent.destination
    : null
  for (const place of [result.intent.origin, destination]) {
    if (place && !supportedIataCodes.includes(place.iata)) {
      return (
        boundedText(
          `IATA code ${place.iata} is not in the supported list: ` +
            supportedIataCodes.join(', '),
        )
      )
    }
  }
  return null
}

function formatZodIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  const formatted = issues.map((issue) => {
    const path = boundedText(issue.path.map(String).join('.') || 'output')
    return `${path}: ${boundedText(issue.message)}`
  })
  return boundedText(formatted.join('\n'))
}

function boundedErrorMessage(error: unknown): string {
  try {
    return boundedText(error instanceof Error ? error.message : String(error))
  } catch {
    return '(unavailable error message)'
  }
}

function boundedText(fragment: string): string {
  return boundParserFeedbackFragment(fragment).text
}

const BUDGET_ERROR_PATTERN =
  /insufficient_quota|billing_hard_limit_reached|usage_limit_reached|exceeded your current quota|credit balance/i

function isBudgetExhausted(error: unknown): boolean {
  const candidates = RetryError.isInstance(error) ? error.errors : [error]
  return candidates.some((candidate) => {
    if (!APICallError.isInstance(candidate)) return false
    return [candidate.data, candidate.responseBody, candidate.message].some(
      (value) => BUDGET_ERROR_PATTERN.test(serialized(value)),
    )
  })
}

function serialized(value: unknown): string {
  if (typeof value === 'string') return boundedText(value)
  return serializeParserFeedbackValue(value).text
}
