import { div } from 'biggystring'
import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'
import Web3 from 'web3'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, safeParseFloat } from '../util'

const asCurrentBlockResult = asNumber

const asTokenResult = asObject({
  tokens: asArray(
    asObject({
      decimals: asNumber,
      symbol: asString,
      address: asString
    })
  )
})

const asContractResult = asObject({
  contracts: asArray(
    asObject({
      type: asNumber,
      address: asString
    })
  )
})

const asSwapCollectionResult = asArray(
  asObject({ returnValues: asObject({ id: asString }) })
)

const asSwapEventsResult = asArray(asUnknown)

const asSingleSwapEvent = asObject({
  returnValues: asObject({
    sourceAsset: asString,
    destinationAsset: asString,
    sourceAmount: asString,
    destinationAmount: asString
  }),
  blockNumber: asNumber,
  transactionHash: asString
})

const asBlockTimestampResult = asObject({
  timestamp: asNumber
})

const asRecieptResult = asObject({
  transactionHash: asString,
  from: asString,
  to: asString
})

const PRIMARY_ABI: any = [
  {
    constant: true,
    inputs: [],
    name: 'tokenTransferProxy',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  },
  {
    constant: false,
    inputs: [],
    name: 'unpause',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  },
  {
    constant: false,
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: true,
    inputs: [{ name: '', type: 'address' }],
    name: 'signers',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  },
  {
    constant: false,
    inputs: [],
    name: 'pause',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  },
  {
    constant: false,
    inputs: [
      { name: '_token', type: 'address' },
      { name: '_amount', type: 'uint256' }
    ],
    name: 'withdrawToken',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: false,
    inputs: [{ name: '_amount', type: 'uint256' }],
    name: 'withdrawETH',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: false,
    inputs: [{ name: '_newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: '_tokenTransferProxy', type: 'address' },
      { name: '_signer', type: 'address' }
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  { payable: true, stateMutability: 'payable', type: 'fallback' },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'bytes32' },
      { indexed: true, name: 'partnerContract', type: 'address' },
      { indexed: true, name: 'user', type: 'address' }
    ],
    name: 'LogSwapCollection',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'bytes32' },
      { indexed: false, name: 'sourceAsset', type: 'address' },
      { indexed: false, name: 'destinationAsset', type: 'address' },
      { indexed: false, name: 'sourceAmount', type: 'uint256' },
      { indexed: false, name: 'destinationAmount', type: 'uint256' },
      { indexed: false, name: 'feeAsset', type: 'address' },
      { indexed: false, name: 'feeAmount', type: 'uint256' }
    ],
    name: 'LogSwap',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: 'a', type: 'string' },
      { indexed: false, name: 'b', type: 'uint256' },
      { indexed: false, name: 'c', type: 'bytes32' }
    ],
    name: 'Log',
    type: 'event'
  },
  { anonymous: false, inputs: [], name: 'Paused', type: 'event' },
  { anonymous: false, inputs: [], name: 'Unpaused', type: 'event' },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'previousOwner', type: 'address' }],
    name: 'OwnershipRenounced',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'previousOwner', type: 'address' },
      { indexed: true, name: 'newOwner', type: 'address' }
    ],
    name: 'OwnershipTransferred',
    type: 'event'
  },
  {
    constant: false,
    inputs: [
      {
        components: [
          {
            components: [
              {
                components: [
                  { name: 'sourceToken', type: 'address' },
                  { name: 'destinationToken', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                  { name: 'isSourceAmount', type: 'bool' },
                  {
                    components: [
                      { name: 'exchangeHandler', type: 'address' },
                      { name: 'encodedPayload', type: 'bytes' }
                    ],
                    name: 'orders',
                    type: 'tuple[]'
                  }
                ],
                name: 'trades',
                type: 'tuple[]'
              },
              { name: 'minimumExchangeRate', type: 'uint256' },
              { name: 'minimumDestinationAmount', type: 'uint256' },
              { name: 'sourceAmount', type: 'uint256' },
              { name: 'tradeToTakeFeeFrom', type: 'uint256' },
              { name: 'takeFeeFromSource', type: 'bool' },
              { name: 'redirectAddress', type: 'address' },
              { name: 'required', type: 'bool' }
            ],
            name: 'swaps',
            type: 'tuple[]'
          },
          { name: 'partnerContract', type: 'address' },
          { name: 'expirationBlock', type: 'uint256' },
          { name: 'id', type: 'bytes32' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' }
        ],
        name: 'swaps',
        type: 'tuple'
      }
    ],
    name: 'performSwapCollection',
    outputs: [],
    payable: true,
    stateMutability: 'payable',
    type: 'function'
  },
  {
    constant: false,
    inputs: [{ name: 'newSigner', type: 'address' }],
    name: 'addSigner',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: false,
    inputs: [{ name: 'signer', type: 'address' }],
    name: 'removeSigner',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    constant: false,
    inputs: [
      { name: 'a', type: 'string' },
      { name: 'b', type: 'uint256' },
      { name: 'c', type: 'bytes32' }
    ],
    name: 'log',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  }
]

export async function queryTotle(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const nodeEndpoint = pluginParams.apiKeys.nodeEndpoint // Grab node endpoint from 'reports_apps' database
  const web3 = new Web3(nodeEndpoint) // Create new Web3 instance using node endpoint
  const ssFormatTxs: StandardTx[] = []
  let partnerContractAddress
  let offset = 7000000
  const currentBlock = asCurrentBlockResult(await web3.eth.getBlockNumber())
  if (typeof pluginParams.settings.offset === 'number') {
    offset = pluginParams.settings.offset
  }
  if (typeof pluginParams.apiKeys.partnerContractAddress === 'string') {
    partnerContractAddress = pluginParams.apiKeys.partnerContractAddress
  } else {
    return {
      settings: { offset },
      transactions: []
    }
  }

  try {
    const { tokens } = asTokenResult(
      await fetch('https://api.totle.com/tokens').then(
        async res => await res.json()
      )
    )

    const { contracts } = asContractResult(
      await fetch('https://api.totle.com/contracts').then(
        async res => await res.json()
      )
    )

    const primaries = contracts.filter(({ type }) => type === 1)

    for (const { address: primaryAddress } of primaries) {
      const primary = new web3.eth.Contract(PRIMARY_ABI, primaryAddress)
      // returns all events that used our apikey
      const swapCollectionEvents = asSwapCollectionResult(
        await primary.getPastEvents('LogSwapCollection', {
          filter: { partnerContract: partnerContractAddress },
          fromBlock: offset,
          toBlock: 'latest'
        })
      )
      // .map returns just transactions ids from event object, .filter removes duplicates
      const payloadIds = swapCollectionEvents
        .map(e => e.returnValues.id)
        .filter((id, i, self) => self.indexOf(id) === i)
      for (const id of payloadIds) {
        // returns all events involving this specific transaction id
        const swapEvents = asSwapEventsResult(
          await primary.getPastEvents('LogSwap', {
            filter: { id },
            fromBlock: offset,
            toBlock: 'latest'
          })
        )
        for (const rawSwapEvent of swapEvents) {
          const swapEvent = asSingleSwapEvent(rawSwapEvent)
          const {
            sourceAsset,
            destinationAsset,
            sourceAmount,
            destinationAmount
          } = swapEvent.returnValues

          const sourceToken = tokens.find(
            t => t.address.toLowerCase() === sourceAsset.toLowerCase()
          )
          const destinationToken = tokens.find(
            t => t.address.toLowerCase() === destinationAsset.toLowerCase()
          )

          // if the token on the transaction doesnt exist within the list of recognized tokens
          if (
            typeof sourceToken === 'undefined' ||
            typeof destinationToken === 'undefined'
          )
            continue

          // finding timestamp based on blockNumber
          const { timestamp } = asBlockTimestampResult(
            await web3.eth.getBlock(swapEvent.blockNumber)
          )

          // get the source and destination from the transaction hash
          const receipt = asRecieptResult(
            await web3.eth.getTransactionReceipt(swapEvent.transactionHash)
          )

          const ssTx: StandardTx = {
            status: 'complete',
            orderId: receipt.transactionHash,
            countryCode: null,
            depositTxid: receipt.transactionHash,
            depositAddress: receipt.from,
            depositCurrency: sourceToken.symbol,
            depositAmount: safeParseFloat(
              div(
                sourceAmount.toString(),
                (10 ** sourceToken.decimals).toString(),
                10,
                10
              )
            ),
            direction: null,
            exchangeType: 'swap',
            paymentType: null,
            payoutTxid: receipt.transactionHash,
            payoutAddress: receipt.to,
            payoutCurrency: destinationToken.symbol,
            payoutAmount: safeParseFloat(
              div(
                destinationAmount.toString(),
                (10 ** destinationToken.decimals).toString(),
                10,
                10
              )
            ),
            timestamp: timestamp,
            isoDate: new Date(timestamp * 1000).toISOString(),
            usdValue: -1,
            rawTx: rawSwapEvent
          }
          ssFormatTxs.push(ssTx)
          datelog(`TOTLE: Currently saved ${ssFormatTxs.length} transactions.`)
        }
      }
    }
  } catch (err) {
    datelog(err)
  }

  const out: PluginResult = {
    settings: { offset: currentBlock },
    transactions: ssFormatTxs
  }
  return out
}

export const totle: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryTotle,
  // results in a PluginResult
  pluginName: 'Totle',
  pluginId: 'totle'
}
