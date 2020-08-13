const fs = require('fs')

const rawTxs = {
  bitrefill: {
    id: '5f1b703424c92700046f5053',
    orderId: '5f1b703424c92700046f5053',
    invoice_id: '0c75ed61-52a9-42b9-88fa-7a774f87753a',
    number: '',
    paymentReceived: true,
    expired: false,
    sent: true,
    delivered: true,
    operatorSlug: 'flightgift-eu',
    value: '165',
    valuePackage: '165',
    operator: 'flightgift-eu',
    operatorType: 'travel',
    country: 'eu',
    currency: 'EUR',
    refunded: false,
    operatorResponse: 'FC-301926',
    price: 2049700,
    merchant_price: 2049700,
    satoshiPrice: 2049700,
    altcoinPrice: '0.699557',
    usdPrice: 195.89,
    eurPrice: 168.06,
    partialPayment: false,
    receivedPaymentAltcoin: 699557,
    btcPrice: '0.020497',
    itemDesc: 'Flightgift EUR 165 EUR',
    summary: 'Flightgift EUR 165 EUR',
    willRetry: false,
    allowRetry: true,
    invoiceTime: 1595633716383,
    invoiceTimeLeft: 0,
    expirationTime: 1595634616319,
    paymentMethod: 'ethereum',
    paidAmount: 699557,
    commission: 28696,
    coinCurrency: 'ETH',
    needRefund: false,
    zeroConfStatus: 'pending',
    recommended_fee_rate: 94,
    status: 'delivered',
    pinInfo: {
      pin: 'tZ5Ts6aLLx',
      instructions:
        "Redeeming a Flightgift code can be done at https://www.flightgift.com/book/. There you can search for all available flights to your desired destination. If you've found the one you like, you simply proceed with the steps indicated. At the checkout, you will be asked to enter your Flightgift code, alongside your payment details (if necessary) and you're done!",
      other: ''
    }
  },
  bitsofgold: {
    id: '02de0a67ed',
    type: 'sell',
    attributes: {
      fee: 3.8979999999999997,
      total_fee: 19.49,
      block_hash:
        '7faca8e9b2683d764fa4a1cfbcf0288b6a5b3c1878a182027581284483d68f4c',
      timestamp: '2019-10-03T10:16:21.214+03:00',
      coin_amount: 0.05155043,
      coin_type: 'BTC',
      fiat_amount: 370.24,
      fiat_type: 'EUR'
    }
  },
  bity: {
    id: '000d0add-d9bf-48da-8367-0e04e612102d',
    customer_trading_fee: {
      amount: '0.79',
      currency: 'EUR'
    },
    input: {
      amount: '100',
      currency: 'EUR'
    },
    'non-verified_fee': {
      amount: '0.4',
      currency: 'EUR'
    },
    output: {
      amount: '0.01460007',
      currency: 'BTC'
    },
    partner_fee: {
      amount: '0',
      currency: 'EUR'
    },
    profit_sharing: {
      amount: '0.18',
      currency: 'EUR'
    },
    timestamp_created: '2020-04-04T15:31:16',
    timestamp_executed: '2020-04-07T06:15:02'
  },
  changelly: {
    id: '95q4mmh635fo8144',
    trackUrl: 'https://changelly.com/track/95q4mmh635fo8144',
    createdAt: 1582745086,
    type: 'fixed',
    moneyReceived: 1582745112,
    moneySent: 1582746171,
    rate: '121.05262896',
    payinConfirmations: '0',
    status: 'finished',
    currencyFrom: 'btc',
    currencyTo: 'xmr',
    payinAddress: '3DLEXFNRD81mES8aoHTyrstkdgNHHwGdZ1',
    payinExtraId: null,
    payinExtraIdName: null,
    payinHash:
      '0b5844b75627fa3ff1d995e209c96686d1a32926ef0edb49a91531b3048b8cb8',
    payoutHashLink:
      'https://xmrchain.net/tx/b9c80b98b833840b73aac4d5d15958bab6e464b041483624b5f57c1046f0574c',
    refundHashLink: null,
    amountExpectedFrom: '0.006',
    payoutAddress:
      '43t9RnNZvM7AtgP4Qh2LK8aQU1CqHw5oiM6NH3wzkmTsXqkfs2pQLiPAQ3mGCJCa5e3VAVEHryoL23CZCeYWMoTf6Cyv5EZ',
    payoutExtraId: null,
    payoutExtraIdName: null,
    payoutHash:
      'b9c80b98b833840b73aac4d5d15958bab6e464b041483624b5f57c1046f0574c',
    refundHash: null,
    amountFrom: '0.006',
    amountTo: '0.72631577',
    amountExpectedTo: '0.72631577',
    networkFee: '0.02',
    changellyFee: '0.5',
    apiExtraFee: '0.50',
    totalFee: '0.02',
    fiatProviderId: null,
    fiatProvider: null,
    fiatProviderRedirect: null,
    canPush: false,
    canRefund: false
  },
  changenow: {
    status: 'finished',
    payinHash:
      '0d851f2c1a10cab64317d0e1e4dbea41962b0b2f17dcba7ded1934c4fe0d32cc',
    payoutHash:
      '4e6aa4b5854e2d10937cabccb344e4cbe9f4ecc99b27c5af50f15a74ee1c9e27',
    payinAddress: 'GBEW2BYUP2PCKWVOQWL2Z2DDU6CBBYLPHDK3RR2LS4PI2CZUU5HL3GTC',
    payoutAddress: '3MQyKN5U4HizvhBzAPXqS3pdNutoJCMAHj',
    payinExtraId: '8183398766737247',
    fromCurrency: 'xlm',
    toCurrency: 'btc',
    amountSend: 252.1,
    amountReceive: 0.0021066,
    refundAddress: 'GCNINYTT7ND3OBHAZXHOZGCF7TQDGTQG5VF5H7C5HLL7NJXUQYKLGX65',
    id: '0068edd275edf9',
    updatedAt: '2020-08-12T00:45:31.079Z'
  },
  coinswitch: {
    orderId: '000103bf-3aaf-453b-ad82-b5b122994c86',
    exchangeAddress: {
      address: 'rwpMvfxoodXggJ1g4qv6MWAPQqWDwQyHUW',
      tag: '1974866370'
    },
    destinationAddress: {
      address: '33b4uRK4inAJRQy2zjTc26NfoJeFcs3nyg',
      tag: null
    },
    createdAt: 1567633103556,
    status: 'complete',
    inputTransactionHash:
      '72B2C5EECF8AD774A34A62F37E1580366C4F4138BDB7A0A68E07D240040DAB28',
    outputTransactionHash:
      '8ab7254ddc456db09e27373786d0d6d6e74b877c7a8f87e029bc67589bf07fb6',
    depositCoin: 'xrp',
    destinationCoin: 'btc',
    depositCoinAmount: 1000,
    destinationCoinAmount: 0.02421363,
    validTill: null,
    userReferenceId: null,
    expectedDepositCoinAmount: 1000,
    expectedDestinationCoinAmount: 0.0242251,
    clientFee: {
      value: 0.000060534075,
      unit: 'BTC'
    },
    callbackUrl: null
  },
  faast: {
    swap_id: '2efb8ece-9e34-48fa-8f1d-b20f48ed86e5',
    order_id: 'FAST6485410752495616FLIP1574871965375887',
    created_at: '2019-11-27T16:24:18.070Z',
    updated_at: '2019-11-27T16:36:34.975Z',
    processed_at: '2019-11-27T16:26:07.024Z',
    deposit_address: '0x7Ded59560D9e8Be8349AAC523A289969C2CfE206',
    deposit_amount: 567.434,
    deposit_currency: 'USDT',
    spot_price: 7293.74,
    price: 7370.04089769,
    price_locked_at: '2019-11-27T16:24:15.844Z',
    price_locked_until: '2019-11-27T16:39:15.844Z',
    price_quote_id: '0',
    withdrawal_address: '1D1vzye4DR4gXQ4NztM3vF43mf8utKCsa',
    withdrawal_amount: 0.07699197,
    withdrawal_currency: 'BTC',
    refund_address: '0x78908647329299F9dD79C481D5444BcCf6F8A45C',
    status: 'complete',
    notices: [],
    affiliate_name: 'Edge',
    affiliate_support_contact: 'https://support.edge.app',
    amount_deposited: 567.434,
    amount_withdrawn: 0.07699197,
    transaction_id:
      '005ef3a0b4d2c8ab2de77b855f35d2d1112cb7e9e0a6c35614496eae4de72e08'
  },
  fox: {
    orderId: '0003ca32cadebc4f5cdb4f642e7d7044aae9b7594cc8aa504535ad78a77ed68f',
    exchangeAddress: {
      address: '0xFb5AAe3A4F635388460C5D06DcA5879dbAC928FE'
    },
    qrCodeUrl: null,
    destinationAddress: {
      address: '38gbqumhu1Awiof38wvxEodXGCyyfp1yAs',
      tag: ''
    },
    userEmail: null,
    userIp: '111.65.63.22',
    createdAt: 1586469032804,
    status: 'complete',
    outputTransactionHash:
      'b79fbb184d332e999ef63da28d64c5258b3a76d141252229c91a3534a8c8069c',
    depositCoin: 'ETH',
    destinationCoin: 'BTC',
    depositCoinAmount: 0.58797,
    destinationCoinAmount: 0.01345546,
    isFixed: true,
    validTill: null,
    frontendTimeout: null,
    depositCoinReceived: 0.58797,
    partialAcceptable: false,
    depositCoinExcessAmount: 0
  },
  godex: {
    id: 130533,
    status: 'success',
    transaction_id: '5f353bb71b11b',
    coin_from: 'FIO',
    coin_to: 'XLM',
    deposit_amount: '285.44',
    real_deposit_amount_btc: '0.00910839',
    withdrawal_amount: '1041.90099941',
    deposit: 'FIO56oqXv8wA44NVci25T5wYyM6FnmTKt1VrX6cLaWx1jGwM3vUWo',
    rate: '3.65015764',
    fee: '0',
    withdrawal: 'GCM7TTLNQEDB3QO5UWVAWXDFICEVBPBTNWO6OJEVKXASV3WWQ2FG666J',
    user_id: null,
    hash_in: 'efa319d3aa158130070f87a5d7fc3cd6cfbd625fff6cb06df1ea4dca621c0c1b',
    affiliate_id: 'Ah81WLyIalYT06a2',
    created_at: '1597324216',
    profit: null,
    type: null,
    bonus: 0.00004554195,
    execution_time: null
  },
  libertyx: {
    all_transactions_count: 1,
    all_transactions_usd_sum: 20,
    date_us_eastern: '2017-02-20',
    first_transactions_count: 1,
    first_transactions_usd_sum: 20,
    new_users: 1
  },
  moonpay: {
    id: '000cec06-652e-4c84-90b4-2300a0bef0a7',
    createdAt: '2020-08-02T11:27:40.117Z',
    updatedAt: '2020-08-04T18:43:33.606Z',
    baseCurrencyAmount: 200,
    quoteCurrencyAmount: 0.01713,
    feeAmount: 9,
    extraFeeAmount: 2,
    areFeesIncluded: false,
    status: 'completed',
    walletAddress: '34ytc3ydLwVWf8qhKJKFS46e43Wb87Dnoj',
    walletAddressTag: null,
    cryptoTransactionId:
      '5bd3c6c485bc394ecdb555f48f67b270bb2fde387841744d9a1edcc891c4837f',
    failureReason: null,
    redirectUrl: null,
    returnUrl: 'https://buy.moonpay.io/transaction_receipt',
    widgetRedirectUrl: null,
    bankTransferReference: null,
    baseCurrencyId: 'edd81f1f-f735-4692-b410-6def107f17d2',
    currencyId: 'a18a8d0b-502c-48b9-ab6b-e2638fba5862',
    customerId: 'cac60490-2ef8-45ac-8992-de6995b1fc81',
    cardId: '1c322e30-6013-4075-bfd9-5a517a9f314f',
    bankAccountId: null,
    eurRate: 0.8489,
    usdRate: 1,
    gbpRate: 0.76421,
    bankDepositInformation: null,
    externalTransactionId: null,
    country: 'USA',
    state: 'LA',
    externalCustomerId: null
  },
  safello: {
    id: 'B2SG4QH',
    amount: 1200,
    commission: 12,
    cryptoCurrency: 'BTC',
    currency: 'SEK',
    completedDate: '2019-10-06T21:36:37+0000'
  },
  simplex: {
    transaction_id: 'f64b5e50-d935-11ea-b358-ed6259933d55',
    created_at: 1596863644.775,
    status_name: 'refunded',
    currency: 'USD',
    fiat_total_amount: '100.0000',
    amount_usd: '100.0000',
    amount_crypto: '0.007508240000000000',
    crypto_currency: 'BTC',
    amount_fee_in_crypto: '0.000100000000000000',
    crypto_fee_currency: 'BTC',
    order_id: '01c9d33e-a3c6-436c-8d8d-a0d6d61734e8',
    ref_id: null,
    original_http_ref_url: 'https://www.edgesecure.co/'
  },
  switchain: {
    id: 'e716f11d-2dce-3e87-8006-44173cbaa8e5',
    appId: 'd9a1184e-fb05-3205-8b48-d066909bbb48',
    pair: 'BCHABC-BTC',
    status: 'confirmed',
    rate: '0.00784153',
    type: 'precise',
    createdAt: '2020-08-10T07:01:26.552Z',
    depositTxId:
      '03318de4a9df31760e9ae1b8b5fe09dbb73bcd3ea29a2990027ac05c2ef9e470',
    depositAddress: '18mQy8sjjo9v5rjJgQKYZR7FuNTZMHDgHr',
    refundAddress: '1JS5NdcRiyJZfN7SyShDEs5Pj1zk7xow8f',
    withdrawTxId:
      '5a70b30bfdfddc6ca6246ee6f63964a5f06b6b621565e2c384ce340176dcb008',
    withdrawAddress: '3Gn3xhzsrqKSbj6WyTrR1bvmLE7ircqNaq',
    amountFrom: '0.32624'
  },
  totle: {
    address: '0x7113Dd99c79afF93d54CFa4B2885576535A132dE',
    blockHash:
      '0xbd868f94d5a8db322257ad65be94860cc0bcdbb1cc0c8cd96e5404c02d5b7a5d',
    blockNumber: 10612835,
    logIndex: 205,
    removed: false,
    transactionHash:
      '0x0c4febd2c0e25a7b5bebe2cf74582ec69b6d5757fdd23d8e1621cce59a309ba5',
    transactionIndex: 168,
    transactionLogIndex: '0x11',
    type: 'mined',
    id: 'log_d1365ac1',
    returnValues: {
      '0': '0xbf9d515e7a6e4aae9d5b3f3194357ff3df319b042a8e4b8780d592a46e43b4b1',
      '1': '0x0000000000000000000000000000000000000000',
      '2': '0xA15C7Ebe1f07CaF6bFF097D8a589fb8AC49Ae5B3',
      '3': '126780000000000000',
      '4': '15559046758019616699179',
      '5': '0x0000000000000000000000000000000000000000',
      '6': '1267800000000000',
      id: '0xbf9d515e7a6e4aae9d5b3f3194357ff3df319b042a8e4b8780d592a46e43b4b1',
      sourceAsset: '0x0000000000000000000000000000000000000000',
      destinationAsset: '0xA15C7Ebe1f07CaF6bFF097D8a589fb8AC49Ae5B3',
      sourceAmount: '126780000000000000',
      destinationAmount: '15559046758019616699179',
      feeAsset: '0x0000000000000000000000000000000000000000',
      feeAmount: '1267800000000000'
    },
    event: 'LogSwap',
    signature:
      '0x7c396f87ca37e7dab636d7ffad74fe2ef4729fda118a0a2c105bf74f4890437f',
    raw: {
      data:
        '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a15c7ebe1f07caf6bff097d8a589fb8ac49ae5b300000000000000000000000000000000000000000000000001c269bd009fc00000000000000000000000000000000000000000000000034b75263f0e5c63732b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004810eb0a57000',
      topics: [
        '0x7c396f87ca37e7dab636d7ffad74fe2ef4729fda118a0a2c105bf74f4890437f',
        '0xbf9d515e7a6e4aae9d5b3f3194357ff3df319b042a8e4b8780d592a46e43b4b1'
      ]
    }
  },
  wyre:
    'TF-28U43F9F6LX,account:AC-WDLVTD8WZJZ,COMPLETED,2019-01-27 19:27:02,2019-02-05 01:52:37,100.00000000000000000000,USD,0.02769469000000000000,BTC,'
}

// cd into src directory
// $ node makeSampleRawTxs.js
console.log('Writing file')
fs.writeFile('./sampleRawTxs.json', JSON.stringify(rawTxs, null, 2), err => {
  if (err) throw err
  console.log('File written successfully.')
})
