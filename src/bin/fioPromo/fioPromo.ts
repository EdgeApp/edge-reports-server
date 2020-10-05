import { program } from 'commander'

import {
  filterDomain,
  getFioTransactions,
  getRewards,
  sendRewards
} from './fioLookup'

async function main(): Promise<null> {
  program
    .option('-d, --dev', 'Run without sending money')
    .option('-c, --currency <type>', 'Currency to run promotion for', 'fio')

  program.parse(process.argv)

  const devMode: boolean = program.dev == null ? false : program.dev
  const currency = program.currency

  if (devMode) console.log(`Dev mode is on`)

  // 2. Get FIO customers in specified time-frame
  const fioTransactions = await getFioTransactions(checkFrom)

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
