import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { queryChangeNow } from '../../partners/changenow'
import { PluginParams, StandardTx } from '../../types'
const asGetFioNames = asObject({
  fio_addresses: asArray(asUnknown)
})
const asFioAddress = asObject({
  fio_address: asString
})

const noNamesMessage: string = 'No FIO names'

// Returns all customers from ChangeNow who have purchased FIO
export async function getFioCustomers(checkFrom): Promise<StandardTx[]> {
  // Get public keys from offset
  const config: PluginParams = {
    settings: {
      offset: checkFrom
    },
    apiKeys: {
      changenowApiKey:
        '19556aef5cd0a1e8090d30540f93b456b76cda1aecf2c864cb66d89b7815c941'
    }
  }

  const txnList = await queryChangeNow(config)

  // Return list of Fio Customers
  return txnList.transactions.filter(
    transaction => transaction.payoutCurrency === 'FIO'
  )
}

export async function filterEdgeDomains(
  fioList: StandardTx[]
): Promise<string[]> {
  const domainList: string[] = []

  for (const { payoutAddress } of fioList) {
    console.log(`Payout address is: ${payoutAddress}`)
    if (payoutAddress == null) continue
    const result = await checkDomain(payoutAddress)

    console.log(`Checking address: ${payoutAddress}`)
    console.log(`Result: ${result}`)

    if (result) domainList.push(payoutAddress)
  }
  return domainList // only FIO addresses with an @edge Fio domain
}

// Does FIO public address have specified domain?
export const checkDomain = async (
  pubkey: string | undefined,
  domain: string | undefined = 'edge' // By default check for @edge domains
): Promise<boolean> => {
  console.log(`Pubkey to check: ${pubkey}`)

  const apiUrl: string = 'http://testnet.fioprotocol.io/v1/chain/get_fio_names'
  // const mainNet = 'https://reg.fioprotocol.io/public-api/'
  const result = (
    await fetch(`${apiUrl}`, {
      method: 'POST',
      body: JSON.stringify({ fio_public_key: pubkey })
    })
  ).json() // Get body

  console.log(Object.entries(await result))
  console.log(Object.entries(await result).toString())

  if (
    Object.entries(await result)
      .toString()
      .includes(noNamesMessage)
  ) {
    // No FIO names
    return false
  } else {
    const fioNames = asGetFioNames(await result)

    console.log(fioNames)

    for (const fioName of fioNames.fio_addresses) {
      const cleanFioName = asFioAddress(fioName)
      if (cleanFioName.fio_address.includes(`@${domain}`)) {
        return true
      }
    }
    return false
  }
}
