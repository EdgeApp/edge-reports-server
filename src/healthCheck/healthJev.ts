import { jevChoice, JevClient, JevQuestion, jevScore } from '../util/jev'
import { HealthAlert, HealthReport, sortAlerts } from './healthMetrics'
import {
  ERROR_CLASSES,
  formatAlertLine,
  parseErrorClass
} from './healthSummary'

const URGENCY_LEVELS = [
  'Informational: can wait for the next weekly review',
  'Needs attention this week',
  'Needs attention today: partner revenue reporting is missing or wrong',
  'Urgent: several partners or chains are affected at once'
]

/**
 * Applies Jev to the text parts of a report: a Choice classifying each
 * errored partner's error strings, and one Score over the alert bundle to
 * order it. Every call fails open: an unanswered classification stays
 * unclassified and unanswered scores keep the mechanical order.
 */
export async function applyJev(
  report: HealthReport,
  client: JevClient
): Promise<HealthReport> {
  const alerts: HealthAlert[] = report.alerts.map(alert => ({ ...alert }))

  await Promise.all(
    alerts
      .filter(alert => alert.type === 'queryErrors')
      .map(async alert => {
        const answers = await client.ask(errorState(alert), {
          errorClass: errorClassQuestion
        })
        alert.errorClass = parseErrorClass(
          jevChoice(answers, 'errorClass')?.choice
        )
      })
  )

  if (alerts.length > 0) {
    const bundle = alerts
      .map((alert, index) => `${index + 1}. ${formatAlertLine(alert, alerts)}`)
      .join('\n')
    const questions: { [name: string]: JevQuestion } = {}
    alerts.forEach((alert, index) => {
      questions[`alert_${index + 1}`] = {
        type: 'score',
        instructions: `How urgent is alert ${index +
          1} in this health check bundle for the team that runs the Edge reports server?`,
        criteria: URGENCY_LEVELS
      }
    })
    const answers = await client.ask(bundle, questions)
    alerts.forEach((alert, index) => {
      alert.urgency = jevScore(answers, `alert_${index + 1}`)?.score
    })
  }

  return { ...report, alerts: sortAlerts(alerts) }
}

const errorClassQuestion: JevQuestion = {
  type: 'choice',
  instructions:
    'Which class best explains why this partner reporting query keeps failing?',
  criteria: {
    authExpired: ERROR_CLASSES.authExpired.description,
    rateLimited: ERROR_CLASSES.rateLimited.description,
    schemaChanged: ERROR_CLASSES.schemaChanged.description,
    partnerOutage: ERROR_CLASSES.partnerOutage.description,
    network: ERROR_CLASSES.network.description,
    unknown: ERROR_CLASSES.unknown.description
  }
}

function errorState(alert: HealthAlert): string {
  const errors = (alert.recentErrors ?? []).map(error => `- ${error}`)
  return [
    `Partner ${alert.partnerId ?? ''} (plugin ${alert.pluginId ??
      ''}) in app ${alert.appId ?? ''} failed ${alert.errorStreak ??
      0} consecutive query cycles.`,
    'Recent error strings, newest first:',
    ...errors
  ].join('\n')
}
