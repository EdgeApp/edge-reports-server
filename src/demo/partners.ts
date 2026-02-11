import { amountQuoteFiatPlugin } from '../../plugins/gui/amountQuotePlugin'
import type { GuiPlugin, GuiPluginRow } from '../../types/GuiPluginTypes'

export const guiPlugins: Record<string, GuiPlugin> = {
  ach: {
    pluginId: 'amountquote',
    storeId: '',
    baseUri: '',
    lockUriPath: true,
    nativePlugin: amountQuoteFiatPlugin,
    forceFiatCurrencyCode: 'iso:USD',
    displayName: 'ACH Bank Transfer'
  },
  banxa: {
    pluginId: 'banxa',
    storeId: 'com.libertyx',
    baseUri: 'https://libertyx.com/a',
    displayName: 'LibertyX',
    originWhitelist: ['https://libertyx.com'],
    permissions: ['location']
  },
  bitsofgold: {
    type: 'fiat',
    color: '#EEC544'
  },
  bity: {
    type: 'fiat',
    color: '#285FF6'
  },
  bitrefill: {
    type: 'fiat',
    color: '#EA332E'
  },
  changehero: {
    type: 'fiat',
    color: '#4D90EF'
  },
  exolix: {
    type: 'fiat',
    color: '#8BEDC2'
  },
  godex: {
    type: 'fiat',
    color: '#8F852'
  },
  ioniagiftcards: {
    type: 'fiat',
    color: '#2D2450'
  },
  ioniavisarewards: {
    type: 'fiat',
    color: '#6381F5'
  },
  kado: {
    type: 'fiat',
    color: '#9AB4F9'
  },
  letsexchange: {
    type: 'swap',
    color: '#00FF00'
  },
  libertyx: {
    type: 'fiat',
    color: '#2551E8'
  },
  lifi: {
    type: 'swap',
    color: '#EBB8FA'
  },
  maya: {
    type: 'swap',
    color: '#000055'
  },
  moonpay: {
    pluginId: 'moonpay',
    storeId: 'io.moonpay',
    baseUri: 'https://api.moonpay.io',
    baseQuery: {
      apiKey: 'pk_live_Y1vQHUgfppB4oMEZksB8DYNQAdA4sauy'
    },
    displayName: 'MoonPay',
    permissions: ['camera']
  },
  paybis: {
    type: 'fiat',
    color: '#FFB400'
  },
  paytrie: {
    type: 'fiat',
    color: '#99A5DE'
  },
  paypal: {
    type: 'fiat',
    color: '#00457C'
  },
  pix: {
    type: 'fiat',
    color: '#32BCAD'
  },
  revolut: {
    type: 'fiat',
    pluginId: 'revolut',
    // API endpoint: /v1/revolut/
    // Plugin implementation: src/partners/revolut.ts
    // Uses same structure as moonpay with:
    //   - Transaction querying with pagination (50 items per page, lookback ~1.5 years)
    //   - Rate limiting (429) with 5s retry
    //   - Standard transaction format transformation to StandardTx
    //   - Supports buy/sell/neutral/transfer operations
    //   - Detects card payments, transfers, top-ups, exchanges, refunds
    // API placeholder key: TODO_CONFIGURE_API_KEY (set via app config or env var)
    // For production use, configure revolutApiKey in reports_apps DB
  },
  safello: {
    type: 'fiat',
    color: deprecated
  },
  shapeshift: {
    type: 'swap',
    color: deprecated
  },
  sideshift: {
    type: 'swap',
    color: '#E35852'
  },
  simplex: {
    type: 'fiat',
    color: '#D12D4A'
  },
  swapuz: {
    type: 'swap',
    color: '#56BD7C'
  },
  thorchain: {
    type: 'swap',
    color: '#6ADAC5'
  },
  totle: {
    type: 'swap',
    color: deprecated
  },
  transak: {
    type: 'fiat',
    color: '#356AD8'
  },
  wyre: {
    type: 'fiat',
    color: deprecated
  },
  xanpool: {
    type: 'fiat',
    color: '#46228B'
  }
} as const customPluginRow: GuiPluginRow = {
  pluginId: 'custom',
  deepPath: '',
  deepQuery: {},

  title: 'Custom Dev',
  description: '',
  partnerIconPath: undefined,
  paymentTypeLogoKey: 'paynow',
  paymentTypes: [],
  cryptoCodes: []
}
