import { checkDomain, filterEdgeDomains, getFioCustomers } from './fioLookup'

const testAddress = ['FIO5MctVjvoTiEFPyJYNnPerAXHWRUhDe2ZNEDCj43ngU4W5jZXzA']
const test = async (): Promise<void> => {
  // Write one case that works, and one that doesn't
  // Try to use different prompts
  // getFioCustomers()
  // filterEdgeDomains()
  // checkAddress()
  // Unit tests
  const expectedResult = await checkDomain(testAddress[0], 'fiotestnet')
  console.log(expectedResult)
  if (expectedResult !== true) throw new Error(`Check Domain ${testAddress[0]}`)

  // const expectedResult2 = await checkAddress(testAddress[1])
  // console.log(expectedResult2)
  // if (expectedResult2 !== true) throw new Error(`Check Address ${testAddress[1]}`)
}

async function main(): Promise<null> {
  await test()

  // 1. Get offset from user

  let checkFrom = parseInt(process.argv.slice(2)[0])
  checkFrom = isNaN(checkFrom) ? 135000 : checkFrom // If null, set default to

  console.log(`Checking from: ${checkFrom}`)

  // 2. Get customers in specified time-frame
  const fioCustomers = await getFioCustomers(checkFrom)

  console.log(`Number of FIO customers: ${fioCustomers.length}`)
  console.log(`Fio customers: ${JSON.stringify(fioCustomers)}`)

  // 3. Check for @edge domains
  const edgeAccounts = await filterEdgeDomains(fioCustomers)
  console.log(edgeAccounts)

  // 4. Apply Limits

  // 5. Send money

  return null
}

main().catch(e => console.log(e))
