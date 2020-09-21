import { StandardTx } from '../../types'
import {
  checkDomain,
  filterDomain,
  getFioTransactions,
  getRewards
} from './fioLookup'

const DEFAULT_OFFSET = 135000 // Latest is 139000

const testAddress = [
  'FIO5MctVjvoTiEFPyJYNnPerAXHWRUhDe2ZNEDCj43ngU4W5jZXzA',
  'FIO8TPpos3a8TVp9k4KaByrTw5sh2N1QuS4ro4gc4ooBczEPvTNNU'
]
const test = async (): Promise<void> => {
  // Write one case that works, and one that doesn't
  // Try to use different prompts
  // getFioCustomers()
  // filterEdgeDomains()
  // checkAddress()
  // Unit tests
  const expectedResult = await checkDomain(testAddress[0], 'fiotestnet')
  console.log(expectedResult)
  if (expectedResult !== false)
    throw new Error(`Check Domain ${testAddress[0]}`)

  const expectedResult2 = await checkDomain(testAddress[1])
  console.log(expectedResult2)
  if (expectedResult2 !== false)
    throw new Error(`Check Address ${testAddress[1]}`)

  // Test getRewards()
  // Example Standard Tx
  const tPayoutAddresses: StandardTx[] = [
    {
      status: 'complete',
      orderId:
        'a8b6d763d35d3b753fb987493adef15c3d5d47b77b7e98e0fb2aefacff7ddc81',
      depositTxid:
        'a8b6d763d35d3b753fb987493adef15c3d5d47b77b7e98e0fb2aefacff7ddc81',
      depositAddress: 'qp3xryh97c7wnqyz0k5csc38fuwa2m3acszwvurnuf',
      depositCurrency: 'BCH',
      depositAmount: 0.13699,
      payoutTxid:
        '7fa2600f4b14a7e7b093e4ec3d65a9409681de6b48a26b5559e89b31b9eead58',
      payoutAddress: 'FIO8bToxvXGj1kK2W5yQoTxvhbrHRRtXu8EHokoaeB9mb9NFrAXu9',
      payoutCurrency: 'FIO',
      payoutAmount: 124.40797699,
      timestamp: 1598908235.759,
      isoDate: '2020-08-31T21:10:35.759Z',
      usdValue: undefined,
      rawTx: {
        status: 'finished',
        payinHash:
          'a8b6d763d35d3b753fb987493adef15c3d5d47b77b7e98e0fb2aefacff7ddc81',
        payoutHash:
          '7fa2600f4b14a7e7b093e4ec3d65a9409681de6b48a26b5559e89b31b9eead58',
        payinAddress: 'qp3xryh97c7wnqyz0k5csc38fuwa2m3acszwvurnuf',
        payoutAddress: 'FIO8bToxvXGj1kK2W5yQoTxvhbrHRRtXu8EHokoaeB9mb9NFrAXu9',
        fromCurrency: 'bch',
        toCurrency: 'fio',
        amountSend: 0.13699,
        amountReceive: 124.40797699,
        refundAddress: '1Q2ELFFGHSRTBsu5iyy7SsPHzxTn3EF91s',
        id: '448d034310d690',
        updatedAt: '2020-08-31T21:10:35.759Z'
      }
    }
  ]

  console.log(getRewards(tPayoutAddresses))


}

async function main(): Promise<null> {
  await test()

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

  return null
}

main().catch(e => console.log(e))
