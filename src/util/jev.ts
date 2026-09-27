import {
  asJSON,
  asMaybe,
  asNumber,
  asObject,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import nodeFetch from 'node-fetch'

export interface JevChoiceQuestion {
  type: 'choice'
  instructions: string
  /** Choice names mapped to when each applies */
  criteria: { [choice: string]: string }
}

export interface JevScoreQuestion {
  type: 'score'
  instructions: string
  /** Ordered level descriptions; a level's position is its score */
  criteria: string[]
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion

const asJevChoiceAnswer = asObject({
  type: asValue('choice'),
  choice: asString,
  confidence: asNumber
})

const asJevScoreAnswer = asObject({
  type: asValue('score'),
  score: asNumber,
  confidence: asNumber
})

const asJevResponse = asJSON(
  asObject({
    answers: asObject(asUnknown)
  })
)

export type JevChoiceAnswer = ReturnType<typeof asJevChoiceAnswer>
export type JevScoreAnswer = ReturnType<typeof asJevScoreAnswer>

export interface JevAnswers {
  [name: string]: unknown
}

/** The part of fetch the client uses, so tests can supply a fake */
export type JevFetch = (
  url: string,
  init: {
    method: 'POST'
    headers: { [name: string]: string }
    body: string
    timeout: number
  }
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export interface JevClientOptions {
  /** TypeSafe API key; the client answers nothing without one */
  apiKey?: string
  url: string
  model: string
  timeoutMs: number
  /** Receives one line per failed call */
  warn?: (message: string) => void
  fetch?: JevFetch
}

export interface JevClient {
  /**
   * Asks named questions about one piece of text. Resolves to the answers
   * keyed by question name, or undefined when the call fails for any
   * reason, so callers can fall back to mechanical behavior.
   */
  ask: (
    state: string,
    questions: { [name: string]: JevQuestion }
  ) => Promise<JevAnswers | undefined>
}

export function makeJevClient(options: JevClientOptions): JevClient {
  const { apiKey, url, model, timeoutMs, warn = () => {} } = options
  const fetch: JevFetch = options.fetch ?? nodeFetch

  return {
    async ask(state, questions) {
      if (apiKey == null || apiKey === '') {
        warn('Jev skipped: no API key')
        return
      }
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model, state, questions }),
          timeout: timeoutMs
        })
        const text = await response.text()
        if (!response.ok) {
          warn(`Jev call failed: HTTP ${response.status} ${text.slice(0, 200)}`)
          return
        }
        return asJevResponse(text).answers
      } catch (error) {
        warn(`Jev call failed: ${String(error)}`)
      }
    }
  }
}

/** Reads a choice answer, or undefined when absent or malformed */
export const jevChoice = (
  answers: JevAnswers | undefined,
  name: string
): JevChoiceAnswer | undefined => asMaybe(asJevChoiceAnswer)(answers?.[name])

/** Reads a score answer, or undefined when absent or malformed */
export const jevScore = (
  answers: JevAnswers | undefined,
  name: string
): JevScoreAnswer | undefined => asMaybe(asJevScoreAnswer)(answers?.[name])
