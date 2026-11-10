import { EdgeTokenId } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

/**
 * Edge chain pluginId -> Edge currency code -> Simplex `crypto_currency` code.
 *
 * Copied from edge-react-gui src/plugins/gui/providers/simplexProvider.ts
 * (SIMPLEX_ID_MAP, develop at 2e94ab0aa). Keep it in sync by hand when the app
 * adds or drops a Simplex asset; there is no runtime link to the app.
 */
const SIMPLEX_ID_MAP: Record<string, Record<string, string>> = {
  algorand: { ALGO: 'ALGO' },
  avalanche: { AVAX: 'AVAX-C' },
  binance: { BNB: 'BNB' },
  binancesmartchain: {
    BABYDOGE: 'BABYDOGE',
    BNB: 'BNB',
    CAKE: 'CAKE',
    EGC: 'EGC',
    GMT: 'GMT-SC',
    SATT: 'SATT-SC',
    USDC: 'USDC-SC',
    FDUSD: 'FDUSD-SC',
    FLOKI: 'FLOKI-SC',
    C98: 'C98-SC',
    SFP: 'SFP',
    TLOS: 'TLOS-SC',
    TWT: 'TWT',
    VINU: 'VINU-SC',
    YOSHI: 'YOSHI-SC'
  },
  bitcoin: { BTC: 'BTC' },
  bitcoincash: { BCH: 'BCH' },
  bitcoinsv: { BSV: 'BSV' },
  cardano: { ADA: 'ADA' },
  celo: {
    CELO: 'CELO',
    CEUR: 'CEUR',
    USDC: 'USDC-CELO'
  },
  digibyte: { DGB: 'DGB' },
  dogecoin: { DOGE: 'DOGE' },
  eos: { EOS: 'EOS' },
  ethereum: {
    '1EARTH': '1EARTH',
    AAVE: 'AAVE',
    AXS: 'AXS-ERC20',
    CHZ: 'CHZ',
    COMP: 'COMP',
    COTI: 'COTI-ERC20',
    CRO: 'CRO-ERC20',
    DAI: 'DAI',
    ELON: 'ELON',
    ETH: 'ETH',
    GALA: 'GALA',
    GHX: 'GHX',
    GOVI: 'GOVI',
    KCS: 'KCS',
    LINK: 'LINK',
    MANA: 'MANA',
    PEPE: 'PEPE',
    RFOX: 'RFOX',
    SAND: 'SAND',
    SATT: 'SATT-ERC20',
    SHIB: 'SHIB',
    TRU: 'TRU',
    TUSD: 'TUSD',
    UNI: 'UNI',
    UOS: 'UOS-ERC20',
    USDC: 'USDC',
    USDT: 'USDT',
    WBTC: 'WBTC',
    XYO: 'XYO'
  },
  fantom: { FTM: 'FTM' },
  filecoin: { FIL: 'FIL' },
  hedera: { HBAR: 'HBAR', USDC: 'USDC-HEDERA' },
  litecoin: { LTC: 'LTC' },
  one: { ONE: 'ONE' },
  optimism: { ETH: 'ETH-OPTIMISM', OP: 'OP', USDT: 'USDT-OPTIMISM' },
  polkadot: { DOT: 'DOT' },
  polygon: {
    GMEE: 'GMEE',
    POL: 'POL',
    USDC: 'USDC-POL',
    WETH: 'WETH-POL',
    USDT: 'USDT-POL'
  },
  qtum: { QTUM: 'QTUM' },
  ravencoin: { RVN: 'RVN' },
  ripple: { XRP: 'XRP' },
  solana: {
    KIN: 'KIN',
    MELANIA: 'MELANIA',
    SOL: 'SOL',
    TRUMP: 'TRUMP',
    USDC: 'USDC-SOL'
  },
  stellar: { USDC: 'USDC-XLM', XLM: 'XLM' },
  sui: { SUI: 'SUI', USDC: 'USDC-SUI' },
  tezos: { XTZ: 'XTZ' },
  ton: { TON: 'TON', USDT: 'USDT-TON' },
  tron: {
    BTT: 'BTT',
    KLV: 'KLV',
    TRX: 'TRX',
    USDC: 'USDC-TRC20',
    USDT: 'USDT-TRC20'
  }
}

// The Beacon Chain is retired, and BNB is the one Simplex code that appears
// under two chains, so it resolves to BNB Smart Chain alone.
const RETIRED_PLUGIN_IDS = new Set(['binance'])

/** Each chain's native currency code; these resolve to a `null` tokenId. */
const NATIVE_CURRENCY_CODES: Record<string, string> = {
  algorand: 'ALGO',
  avalanche: 'AVAX',
  binancesmartchain: 'BNB',
  bitcoin: 'BTC',
  bitcoincash: 'BCH',
  bitcoinsv: 'BSV',
  cardano: 'ADA',
  celo: 'CELO',
  digibyte: 'DGB',
  dogecoin: 'DOGE',
  eos: 'EOS',
  ethereum: 'ETH',
  fantom: 'FTM',
  filecoin: 'FIL',
  hedera: 'HBAR',
  litecoin: 'LTC',
  one: 'ONE',
  optimism: 'ETH',
  polkadot: 'DOT',
  polygon: 'POL',
  qtum: 'QTUM',
  ravencoin: 'RVN',
  ripple: 'XRP',
  solana: 'SOL',
  stellar: 'XLM',
  sui: 'SUI',
  tezos: 'XTZ',
  ton: 'TON',
  tron: 'TRX'
}

/**
 * Edge tokenIds for the Simplex tokens that are edge-currency-accountbased
 * builtin tokens. Tokens missing here have no Edge builtin, so their orders
 * get a chain but leave the tokenId unknown.
 */
const EDGE_TOKEN_IDS: Record<string, Record<string, string>> = {
  binancesmartchain: { USDC: '8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
  celo: { CEUR: 'd8763cba276a3738e6de85b4b3bf5fded6d6ca73' },
  ethereum: {
    AAVE: '7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    AXS: 'bb0e17ef65f82ab018d8edd776e8dd940327b28b',
    COMP: 'c00e94cb662c3520282e6f5717214004a7f26888',
    COTI: 'ddb3422497e61e13543bea06989c0789117555c5',
    CRO: 'a0b73e1ff0b80914ab6fe0444e65848c4c34450b',
    DAI: '6b175474e89094c44da98b954eedeac495271d0f',
    GALA: 'd1d2eb1b1e90b638588728b4130137d262c87cae',
    LINK: '514910771af9ca656af840dff83e8264ecf986ca',
    MANA: '0f5d2fb29fb7d3cfee444a200298f468908cc942',
    PEPE: '6982508145454ce325ddbe47a25d4ec3d2311933',
    SAND: '3845badade8e6dff049820680d1f14bd3903a5d0',
    SHIB: '95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
    TUSD: '0000000000085d4780b73119b644ae5ecd22b376',
    UNI: '1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    USDC: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: 'dac17f958d2ee523a2206206994597c13d831ec7',
    WBTC: '2260fac5e5542a773aa44fbcfedf7c193bc2c599'
  },
  optimism: {
    OP: '4200000000000000000000000000000000000042',
    USDT: '94b008aa00579c1307b0ef2c499ad98a8ce58e58'
  },
  polygon: {
    USDC: '3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    USDT: 'c2132d05d31c914a87c6611c10748aeb04b58e8f',
    WETH: '7ceb23fd6bc0add59e62ac25578270cff1b9f619'
  },
  solana: { USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  sui: {
    USDC:
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7usdcUSDC'
  },
  tron: {
    BTT: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4',
    USDC: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
  }
}

export interface SimplexAsset {
  chainPluginId: string
  evmChainId: number | undefined
  /** `undefined` when the token has no Edge builtin to name it. */
  tokenId: EdgeTokenId | undefined
}

const SIMPLEX_CODE_TO_ASSET = new Map<string, SimplexAsset>()
for (const chainPluginId of Object.keys(SIMPLEX_ID_MAP)) {
  if (RETIRED_PLUGIN_IDS.has(chainPluginId)) continue
  const codes = SIMPLEX_ID_MAP[chainPluginId]
  for (const currencyCode of Object.keys(codes)) {
    const tokenId =
      NATIVE_CURRENCY_CODES[chainPluginId] === currencyCode
        ? null
        : EDGE_TOKEN_IDS[chainPluginId]?.[currencyCode]
    SIMPLEX_CODE_TO_ASSET.set(codes[currencyCode].toUpperCase(), {
      chainPluginId,
      evmChainId: EVM_CHAIN_IDS[chainPluginId],
      tokenId
    })
  }
}

/** Resolve a Simplex `crypto_currency` code to its Edge chain and token. */
export function getSimplexAsset(
  cryptoCurrency: string
): SimplexAsset | undefined {
  return SIMPLEX_CODE_TO_ASSET.get(cryptoCurrency.toUpperCase())
}
