import { program } from 'commander'

import {
  filterAddress,
  getFioTransactions,
  getRewards,
  sendRewards
} from './fioLookup'

async function main(): Promise<null> {
  program
    .option('-d, --dev', 'Run without sending money')
    .option(
      '-s, --start <date>',
      'Start checking for purchases from specified date',
      `${new Date('2019-01-01')}`
    )
    .option(
      '-e, --end <date>',
      'End checking for purchases from specified date',
      `${new Date()}`
    )
    .option('-c, --currency <type>', 'Currency to run promotion for', 'fio')

  program.parse(process.argv)
  program.start = new Date(program.start).toISOString()
  program.end = new Date(program.end).toISOString()
  const devMode: boolean = program.dev == null ? false : program.dev
  const currency = program.currency

  if (devMode) console.log(`Dev mode is on`)
  console.log(`Start date: ${program.start}`)
  console.log(`End date: ${program.end}`)

  // 2. Get FIO customers in specified time-frame
  const fioTransactions = await getFioTransactions(program.start, program.end)
  // console.log(`Fio transactions: ${JSON.stringify(fioTransactions)}`)

  // 3. Filter for @edge domains
  const edgeFioTransactions = await filterAddress(fioTransactions)
  // console.log(`@Edge Fio transactions: ${JSON.stringify(edgeFioTransactions)}`)

  // 4. Add up purchases up to 40 FIO
  const rewards = await getRewards(edgeFioTransactions)

  // 5. Send money
  await sendRewards(rewards, currency, devMode)

  return null
}

main().catch(e => console.log(e))
