import { openai } from '@ai-sdk/openai'
import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from 'ai'
import { parseResultSchema, type ParseResult, type TripIntent } from '../schema/trip-intent'
import { buildSystemPrompt, buildUserMessage } from './prompt'
import { ParserError, type IntentParser, type ParserContext } from './intent-parser'

interface ParserOptions {
  model?: string
}

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
            failedOutput: JSON.stringify(generated.output),
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
            failedOutput: JSON.stringify(generated.output),
            issues: membershipIssue,
            terminal: false,
          }
        }
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          lastFailureMessage =
            error.cause instanceof Error ? error.cause.message : error.message
          feedback = {
            failedOutput: error.text ?? '(no output)',
            issues: lastFailureMessage,
            terminal: isTerminalParseFailure(error.finishReason, error.text),
          }
        } else if (NoOutputGeneratedError.isInstance(error)) {
          throw new ParserError(
            'invalid_output',
            `Parser produced no output: ${error.message}`,
          )
        } else {
          throw new ParserError(
            'transport',
            `Parser request failed: ${errorMessage(error)}`,
          )
        }
      }

      if (feedback.terminal) break
    }

    throw new ParserError(
      'invalid_output',
      `Parser output failed validation: ${lastFailureMessage}`,
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
  for (const place of [result.intent.origin, result.intent.destination]) {
    if (place && !supportedIataCodes.includes(place.iata)) {
      return (
        `IATA code ${place.iata} is not in the supported list: ` +
        supportedIataCodes.join(', ')
      )
    }
  }
  return null
}

function formatZodIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || 'output'}: ${issue.message}`)
    .join('\n')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
