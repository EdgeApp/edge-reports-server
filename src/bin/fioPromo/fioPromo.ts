
import {
  filterDomain,
  getFioTransactions,
  getRewards,
  sendRewards
} from './fioLookup'

const DEFAULT_OFFSET = 135000 // Latest is 139000

async function main(): Promise<null> {
  // 1. Get offset from user
  let checkFrom = parseInt(process.argv[2]) // Getting first arg from
  console.log(checkFrom)
  checkFrom = isNaN(checkFrom) ? DEFAULT_OFFSET : checkFrom // If null, set to default

  console.log(`Checking from: ${checkFrom}`)

  // 2. Get FIO customers in specified time-frame
  const fioTransactions = await getFioTransactions(checkFrom)

  console.log(`Number of FIO transactions: ${fioTransactions.length}`)
  console.log(`Fio transactions: ${JSON.stringify(fioTransactions)}`)

  // 3. Filter for @edge domains
  const edgeFioTransactions = await filterDomain(fioTransactions, 'edge')
  console.log(edgeFioTransactions)

  // 4. Add up purchases up to 40 FIO
  const rewards = getRewards(edgeFioTransactions)
  console.log(`Rewards are: ${JSON.stringify(rewards)}`)

  // 5. Send money
  // sendRewards(rewards)

  return null
}

main().catch(e => console.log(e))
