import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fs from 'fs'
import fetch from 'node-fetch'
import path from 'path'

import { queryChangeNow } from '../../partners/changenow'
import { PluginParams, StandardTx } from '../../types'
import { defaultSettings } from './fioInfo'

let addressList: string[] = []
try {
  const buffer = fs.readFileSync(path.join(__dirname, '../../../twitterex.txt'))
  const file = buffer.toString('utf8')
  addressList = file.split('\n')
} catch (e) {
  console.log(e)
}

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
const {
  maxFioReward,
  fioMultiple,
  currency,
  currencyCode,
  endpoint,
  networks
} = defaultSettings

const configFile: string = fs.readFileSync(
  `${__dirname}/../../../config.json`,
  'utf8'
)
const config = JSON.parse(configFile)

// Returns all customers from ChangeNow who have purchased FIO
export async function getFioTransactions(
  dateFrom: Date,
  dateTo: Date
): Promise<StandardTx[]> {
  // Get public keys from offset
  const pluginConfig: PluginParams = {
    settings: { dateFrom, dateTo, to: currencyCode },
    apiKeys: {
      changenowApiKey: config.changenowApiKey
    }
  }

  const txnList = await queryChangeNow(pluginConfig)
  // Return list of Fio Customers
  return txnList.transactions
}

export async function filterAddress(
  fioList: StandardTx[]
): Promise<StandardTx[]> {
  const txList: StandardTx[] = []

  for (const tx of fioList) {
    const { payoutAddress } = tx
    if (payoutAddress == null) continue
    const result = await checkAddress(payoutAddress)
    if (result) txList.push(tx)
  }
  return txList // only FIO addresses with an @edge Fio domain
}

// Does FIO public address have specified domain?
export const checkAddress = async (
  pubkey: string | undefined,
  urls: string = networks
): Promise<boolean> => {
  let fioInfo
  let error = ''
  console.log(`Checking ${pubkey}`)
  for (const apiUrl of urls) {
    try {
      const result = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ fio_public_key: pubkey })
      })

      fioInfo = await result.json()
      error = ''
      break
    } catch (e) {
      error = e
      console.log(e)
    }
  }
  if (error !== '') throw error
  if (
    Object.entries(fioInfo)
      .toString()
      .includes(noNamesMessage)
  ) {
    // No FIO names
    return false
  } else {
    // Has FIO names
    const fioNames = asGetFioNames(fioInfo)

    for (const fioName of fioNames.fio_addresses) {
      const cleanFioName = asFioAddress(fioName)
      if (addressList.includes(cleanFioName.fio_address)) {
        return true
      }
    }
    return false
  }
}

// Takes a list of public keys to be checked and returns a 2D array with keys and values
export const getRewards = (
  txList: StandardTx[],
  rewardMax: number = maxFioReward
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

  let totalReward = 0
  // Make sure every reward is under maximum
  for (const reward in rewards) {
    if (rewards[reward] >= rewardMax) {
      rewards[reward] = rewardMax
    }
    totalReward += rewards[reward]
  }

  console.log(`Total Rewards are: ${totalReward}`)
  return rewards
}

// Accept AddressReward interface
export const sendRewards = async (
  rewardList: AddressReward,
  rewardCurrency: string = currency,
  devMode: boolean = false
): Promise<void> => {
  const txIdList: string[] = []

  const localhost = `http://localhost:8080`

  for (const address in rewardList) {
    const sendAmount = (fioMultiple * rewardList[address]).toString()

    let transaction = {
      txid: `dev mode - address: ${address}, amount: ${sendAmount}`
    }

    if (!devMode) {
      try {
        console.log(`Reward for ${address} is: ${rewardList[address]}`)
        const result = await fetch(
          `${localhost}/spend/?type=${rewardCurrency}`,
          {
            headers: {
              'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
              spendTargets: [
                {
                  nativeAmount: `${sendAmount}`,
                  publicAddress: `${address}`
                }
              ]
            })
          }
        )

        transaction = await result.json()

        console.log(`Transaction is: ${JSON.stringify(transaction)}`)
      } catch (e) {
        console.log(e)
      }
    }
    console.log(`Sent reward transaction IDs: ${transaction.txid}`)
    txIdList.push(transaction.txid)
  }
}
