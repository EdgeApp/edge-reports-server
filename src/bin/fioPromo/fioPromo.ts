import yargs from 'yargs'

import {
  filterDomain,
  getFioTransactions,
  getRewards,
  sendRewards
} from './fioLookup'

const DEFAULT_STARTDATE = new Date('2019-01-01')

// End time arguments
// Info server - serves up static info to client app. Checks eery hour and finds all seed servers
// Have list of servers that our EDGE's. If those are down or out of sync, send slack error
// Couch DB

// Logging srver - dedicated server that can be quired which can be sent JSON files
// Make sense of massive JSON file

// Info 1 services. Dynamic ethereum fee api

// React native, supporting automated testing

async function main(): Promise<null> {
  // 1. Get input from user
  const argv = yargs
    .option('devMode', {
      alias: 'd',
      description: 'Run without sending money',
      type: 'boolean'
    })
    .option('startDate', {
      alias: 's',
      description: 'Start checking for purchases from specified date',
      type: 'date'
    })
    .option('endDate', {
      alias: 'e',
      description: 'End checking for purchases from specified date',
      type: 'date'
    })
    .option('currency', {
      alias: 'c',
      description: 'Currency to run promotion for',
      type: 'string'
    })
    .help()
    .alias('help', 'h').argv

  const startDate = new Date(
    argv.startDate == null ? DEFAULT_STARTDATE : argv.startDate
  ) // If not specified, set to default
  const endDate = new Date(argv.endDate == null ? new Date() : argv.endDate) // If not specified, set to today
  const devMode: boolean = argv.devMode == null ? false : argv.devMode
  const currency = argv.currency

  if (devMode) console.log(`Dev mode is on`)
  console.log(`Start date: ${startDate}`)
  console.log(`End date: ${endDate}`)

  // 2. Get FIO customers in specified time-frame
  const fioTransactions = await getFioTransactions(startDate, endDate)

  console.log(`Number of FIO transactions: ${fioTransactions.length}`)
  // console.log(`Fio transactions: ${JSON.stringify(fioTransactions)}`)

  // 3. Filter for @edge domains
  const edgeFioTransactions = await filterDomain(fioTransactions)
  console.log(edgeFioTransactions)

  // 4. Add up purchases up to 40 FIO
  const rewards = getRewards(edgeFioTransactions)
  console.log(`Rewards are: ${JSON.stringify(rewards)}`)

  // 5. Send money
  const txIds = await sendRewards(rewards, currency, devMode)
  console.log(`Sent reward transaction IDs: ${txIds}`)

  return null
}

main().catch(e => console.log(e))
