import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fs from 'fs'
import fetch from 'node-fetch'

import { queryChangeNow } from '../../partners/changenow'
import { PluginParams, StandardTx } from '../../types'

const asGetFioNames = asObject({
  fio_addresses: asArray(asUnknown)
})
const asFioAddress = asObject({
  fio_address: asString
})

interface AddressReward {
  [payoutAddress: string]: number
}

const noNamesMessage: string = 'No FIO names'
const MAX_FIO_REWARD = 40
const DEFAULT_DOMAIN = 'edge'

// const testNet = 'http://testnet.fioprotocol.io/v1/chain'
const NETWORK = 'https://fio.cryptolions.io:443/v1/chain'

const configFile: string = fs.readFileSync(
  `${__dirname}/../../../config.json`,
  'utf8'
)
const config = JSON.parse(configFile)

// Returns all customers from ChangeNow who have purchased FIO
export async function getFioTransactions(checkFrom): Promise<StandardTx[]> {
  // Get public keys from offset
  const pluginConfig: PluginParams = {
    settings: {
      offset: checkFrom
    },
    apiKeys: {
      changenowApiKey: config.changenowApiKey
    }
  }

  const txnList = await queryChangeNow(pluginConfig)
  // Return list of Fio Customers
  return txnList.transactions.filter(
    transaction => transaction.payoutCurrency === 'FIO'
  )
}

export async function filterDomain( // Test
  fioList: StandardTx[],
  domain: string = DEFAULT_DOMAIN // By default check for @edge domains
): Promise<StandardTx[]> {
  const txList: StandardTx[] = []

  for (const tx of fioList) {
    const { payoutAddress } = tx
    if (payoutAddress == null) continue
    const result = await checkDomain(payoutAddress, domain)
    if (result) txList.push(tx)
  }
  return txList // only FIO addresses with an @edge Fio domain
}

// Does FIO public address have specified domain?
export const checkDomain = async (
  pubkey: string | undefined,
  domain: string = DEFAULT_DOMAIN, // By default check for @edge domains
  network: string = NETWORK
): Promise<boolean> => {
  const endPoint = '/get_fio_names'

  // const tapiUrl = testNet + endPoint
  const apiUrl = network + endPoint
  const result = await fetch(`${apiUrl}`, {
    method: 'POST',
    body: JSON.stringify({ fio_public_key: pubkey })
  })

  const fioInfo = await result.json()

  if (
    Object.entries(fioInfo)
      .toString()
      .includes(noNamesMessage)
  ) {
    // No FIO names
    return false
  } else {
    const fioNames = asGetFioNames(fioInfo)

    for (const fioName of fioNames.fio_addresses) {
      const cleanFioName = asFioAddress(fioName)
      if (cleanFioName.fio_address.includes(`@${domain}`)) {
        return true
      }
    }
    return false
  }
}

// Takes a list of public keys to be checked and returns a 2D array with keys and values
export const getRewards = (
  txList: StandardTx[],
  rewardMax: number = MAX_FIO_REWARD
): AddressReward => {
  const rewards: AddressReward = {}

  // Get possible reward amounts
  for (const tx of txList) {
    const { payoutAddress, payoutAmount } = tx
    if (payoutAddress == null) continue
    // If it's the first time we are using the payoutAddress
    if (rewards[payoutAddress] == null) {
      rewards[payoutAddress] = payoutAmount // Set the new key to the payoutAmount
      // If the payoutAddress exists previously,
    } else {
      rewards[payoutAddress] += payoutAmount // Add the payoutAmount to the previously defined key
    }
  }

  // Make sure every reward is under maximum
  for (const reward in rewards) {
    if (rewards[reward] >= rewardMax) {
      rewards[reward] = rewardMax
    }
  }

  return rewards
}

// Accept AddressReward interface
export const sendRewards = async (
  rewardList: AddressReward,
  rewardCurrency: string = 'fio'
): Promise<string[]> => {

  const txIdList:string[] = []
  
  for (const reward in rewardList) {
    console.log(rewardList)
    const transaction = await fetch(`http://localhost:8080/spend/?type=${rewardCurrency}`, {
      body: JSON.stringify({
        spendTargets: [{ reward: Object.keys(reward) }] // amount: address
      }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })

    txIdList.push(transaction.txid)

  }
  return txIdList
  // return ['example hash']
}
