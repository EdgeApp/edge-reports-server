const fs = require('fs')

const rawTxs = {
  banxa: {
    account_id: 'bf14184a13e6634ca1cf13e5ab81bf31',
    account_reference: 'bb01658f-3aad-4259-8055-5ac9af56400c',
    coin_amount: 0.01814859,
    coin_code: 'BTC',
    commission: 0,
    country: 'AU',
    created_at: '26-Aug-2019 11:04:36',
    created_date: '26-Aug-2019',
    fee: 0,
    fee_tax: 0,
    fiat_amount: 300,
    fiat_code: 'AUD',
    id: '99564de7ee841c67eac10485eaa84e0e',
    merchant_commission: 0.02,
    merchant_fee: 5.6899999999999995,
    meta_data: null,
    order_type: 'CRYPTO-BUY',
    payment_fee: 9.59,
    payment_fee_tax: 0,
    payment_type: 'Blueshyft Online',
    ref: 347810,
    status: 'expired',
    tx_confirms: 0,
    tx_hash: null,
    wallet_address: '3MdZFWVnafQT5RadRh1aEWweEr7pMqNub2',
    wallet_address_tag: null
  },
  bitaccess: {
    available_actions: [],
    client_id: '5726293401272320',
    created_at: '2020-09-13T16:34:24.733Z',
    deposit_address: '1AZ16MKNJMT1WBaNS42jhBb1NLtqEx3taM',
    deposit_amount: 0.01093701,
    deposit_currency: 'BTC',
    location_address: '1552 Beechview Avenue, Pittsburgh, PA, USA',
    location_coordinates: {
      latitude: 40.4107381,
      longitude: -80.02498469999999
    },
    location_name: 'Dollar Eagle Discounts',
    machine_id: 'coincloud570',
    operator_margin_percentage: 11,
    order_code: 'QR447RWH',
    price: 9143.27,
    refund_address: '3Aeni3pSUcfWFJTzdiET66kFpsdmhwsEzm',
    spot_price: 10273.34,
    status: 'complete',
    trade_type: 'sell',
    transaction_id:
      'lwid:978ac7116aacbc7761bb4d472c7e9de6aff30b2c2d300a0319438774102e7784',
    tx_hash: '2fbd5a9b07e585a5f05ab0b32e2f0205c4ee3599087884a52a1a9c977a4047cf',
    updated_at: '2020-09-13T20:03:48.122Z',
    withdrawal_amount: 100,
    withdrawal_currency: 'USD'
  },
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
  changehero: {
    id: '3j1b4ad1o9j47ivy6a',
    status: 'finished',
    currencyFrom: 'edg',
    currencyTo: 'eth',
    payinHash:
      '0xc280caf791ea6d27fa138c3cc987dc5721e24f91ebfd2effdd71378bcaf57974',
    payoutHash:
      '0x00e9ff9308be15b04c2503faebac556d4c3f108e16d3076adda2579d47450409',
    refundHash: null,
    payinAddress: '0x174d9c4aa22991dcc40afb7dd73a377a978c6d28',
    payinExtraId: null,
    payoutAddress: '0x074d9c4aa22890dcc40afb7dd73b377a978c5d29',
    payoutExtraId: null,
    amountExpectedFrom: '1000',
    amountExpectedTo: '0.02',
    amountFrom: '1094.0000000000000000000000',
    amountTo: '0.0215934600000000000000',
    refundReason: null,
    networkFee: '0.0005500000000000000000',
    createdAt: 1556480419
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
  letsexchange: {
    id: 154332,
    status: 'success',
    transaction_id: '60b0cca8704a0',
    coin_from: 'THETA',
    coin_to: 'BTC',
    deposit_amount: '14.798',
    real_deposit_amount_btc: '0.00910839',
    withdrawal_amount: '0.00260474',
    deposit: '0x330d44d55c1c39c2ae4d5b5e9500ea93fa351864',
    rate: '0.00017601',
    fee: '0',
    withdrawal: '19imrZggdYBrPvWKsAsu9Dtd1HM6yqrxzf',
    user_id: null,
    hash_in: 'efa319d3aa158130070f87a5d7fc3cd6cfbd625fff6cb06df1ea4dca621c0c1b',
    affiliate_id: 'TEFfWjFDyDkhnrlR',
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
  paytrie: {
    inputAddress: '0x0000000000000000000000000000000000000000',
    inputAmount: 99,
    inputCurrency: 'USDT',
    inputTXID: '82485b03-72c8-454b-ad68-06235f3eb2e6',
    outputAddress: '0x0000000000000000000000000000000000000000',
    outputAmount: 73.55,
    outputCurrency: 'CAD',
    timestamp: '2020-06-10T21:45:29.573Z'
  },
  safello: {
    id: 'B2SG4QH',
    amount: 1200,
    commission: 12,
    cryptoCurrency: 'BTC',
    currency: 'SEK',
    completedDate: '2019-10-06T21:36:37+0000'
  },
  shapeshift: {
    apiKey: null,
    clientId: '3a49c306-8c52-42a2-b7cf-bda4e4aa6d7d',
    customerRate: '0.005424494647968590',
    foxBack: '8.495636796136773800',
    foxBalance: null,
    foxUsed: '0E-18',
    freeRate: '0.005451753415043809',
    hasConfirmations: true,
    inputAddress: 'MEMzQ1tBKpBWmEh4RL6Lqjv3DCr2JNWmVu',
    inputAmount: 35.123,
    inputCurrency: 'LTC',
    inputTXID:
      'c1ee666969b4373fb51663428487ce132f6016a9611f0533305684a85b2a4143',
    links: {
      inputAddress:
        'https://chainz.cryptoid.info/ltc/address.dws?MEMzQ1tBKpBWmEh4RL6Lqjv3DCr2JNWmVu',
      outputAddress:
        'https://blockchain.info/address/3Lio47Zp319iAxKwBLtsh3jLXTN2jVq2zS',
      inputTXID:
        'https://chainz.cryptoid.info/ltc/tx.dws?c1e…3428487ce132f6016a9611f0533305684a85b2a4143',
      outputTXID:
        'https://blockchain.info/tx/e8f092a3f5f2c8b2…e7f68b7ea9d150f11805297787bb54c86073a856f3'
    },
    minerFee: 0.000285,
    orderId: '00edbf23-927a-4ebc-a4b1-5c6d527391c6',
    outputAddress: '3Lio47Zp319iAxKwBLtsh3jLXTN2jVq2zS',
    outputAmount: '0.19023953',
    outputCurrency: 'BTC',
    outputTXID:
      'e8f092a3f5f2c8b2114012e7f68b7ea9d150f11805297787bb54c86073a856f3',
    retailRate: '0.005424494647968590',
    shiftRate: '0.00542449',
    ssTXID: '5eadc7f476c36500223a7ed4',
    status: 'complete',
    thenUSD: { BTC: '8870.65', LTC: '48.376487180120000' },
    timestamp: 1588447220.978,
    type: 'PRECISE',
    userId: 'e274af63-2a26-45bb-b6a6-202332dd9a2c'
  },
  sideshift: {
    id: 'c421de9317bc18ab76ba',
    createdAt: '2020-10-07T15:04:07.846Z',
    expiresAt: '2020-10-07T15:19:07.104Z',
    depositMethodId: 'bch',
    settleMethodId: 'xmr',
    depositAsset: 'BCH',
    settleAsset: 'XMR',
    depositAddress: {
      address: 'bitcoincash:qzaz9m2nku3m8hrq55lfgn5sxghzvg4xpsm85cr6h2'
    },
    refundAddress: null,
    settleAddress: {
      address:
        '45AZiUFxa5hGwvMChQmdfjNr6HbktbtwhNhpsT4HYosQARXfJ5xWFwrSN7VWyk7ZFoLEYPUq7Qw2RRTTCfEVQFRG75QSUiC'
    },
    extra: {},
    affiliateId: 'Coq58fefL',
    invoiceAmount: '0.03685881',
    depositMin: '0.03685881',
    depositMax: '0.03685881',
    type: 'fixed',
    settleAmount: '0.07353',
    settleRate: '1.99491',
    settleRateNominal: '219.16435588652246556599',
    settleRateSpread: '0.01',
    sessionId: null,
    quoteId: '1a618edd-f0f3-4c31-9f84-a0555e6974dc'
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
  transak: {
    addressAdditionalData: {
      name: 'dest_tag',
      display_name: 'Destination Tag',
      shapeshift_name: 'destTag',
      okex_tag_name: 'tag',
      value: ''
    },
    amountPaid: 2996,
    autoExpiresAt: '2020-06-28T08:58:02+00:00',
    completedAt: '2020-06-28T08:59:10.436Z',
    conversionPrice: 0.07145002100579088,
    createdAt: '2020-06-28T08:28:02.066Z',
    cryptoAmount: 212.590249,
    cryptocurrency: 'XRP',
    fiatAmount: 2996,
    fiatCurrency: 'INR',
    fromWalletAddress: false,
    id: '005d4082-005c-4f1a-9f38-769d94716c5c',
    isBuyOrSell: 'BUY',
    network: false,
    paymentOption: [],
    paymentOptionId: 'upi',
    referenceCode: 992266,
    status: 'COMPLETED',
    totalFeeInCrypto: 1.4825918891855807,
    0: { currency: 'INR', provider: 'upi', name: 'UPI', fields: Array(2) },
    1: {
      currency: 'INR',
      provider: 'bankaccount',
      name: 'Bank Transfer',
      fields: Array(5)
    },
    length: 2,
    totalFeeInFiat: 20.63,
    transactionHash:
      '6D8C23029788B6099F88D4742E1FAB02669F6E647471D920F3A55ABC13758B5C',
    transactionLink: false,
    updatedAt: '2020-06-28T08:30:56.350Z',
    walletAddress: 'rfLWQuNNn529xZdimkUoHeAhzYcQiCFMCA',
    walletLink: false
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
