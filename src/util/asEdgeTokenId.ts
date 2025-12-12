import { asEither, asNull, asString } from 'cleaners'

export type EdgeTokenId = string | null
export const asEdgeTokenId = asEither(asString, asNull)

export type TokenType =
  | 'simple'
  | 'evm'
  | 'cosmos'
  | 'xrpl'
  | 'colon-delimited'
  | 'lowercase'
  | null

export const tokenTypes: Record<string, TokenType> = {
  abstract: 'evm',
  algorand: 'simple',
  arbitrum: 'evm',
  avalanche: 'evm',
  axelar: 'cosmos',
  base: 'evm',
  binance: null,
  binancesmartchain: 'evm',
  bitcoin: null,
  bitcoincash: null,
  bitcoingold: null,
  bitcoinsv: null,
  bobevm: 'evm',
  botanix: 'evm',
  cardano: null,
  celo: 'evm',
  coreum: 'cosmos',
  cosmoshub: 'cosmos',
  dash: null,
  digibyte: null,
  dogecoin: null,
  eboost: null,
  ecash: null,
  eos: null,
  ethereum: 'evm',
  ethereumclassic: 'evm',
  ethereumpow: 'evm',
  fantom: 'evm',
  feathercoin: null,
  filecoin: null,
  filecoinfevm: 'evm',
  fio: null,
  groestlcoin: null,
  hedera: null,
  hyperevm: 'evm',
  liberland: 'simple',
  litecoin: null,
  monero: null,
  optimism: 'evm',
  osmosis: 'cosmos',
  piratechain: null,
  pivx: null,
  polkadot: null,
  polygon: 'evm',
  pulsechain: 'evm',
  qtum: null,
  ravencoin: null,
  ripple: 'xrpl',
  rsk: 'evm',
  smartcash: null,
  solana: 'simple',
  sonic: 'evm',
  stellar: null,
  sui: 'colon-delimited',
  telos: null,
  tezos: null,
  thorchainrune: 'cosmos',
  ton: null,
  tron: 'simple',
  ufo: null,
  vertcoin: null,
  wax: null,
  zano: 'lowercase',
  zcash: null,
  zcoin: null,
  zksync: 'evm'
}

export type CurrencyCodeToAssetMapping = Record<
  string,
  { pluginId: string; tokenId: EdgeTokenId }
>

export type ChainNameToPluginIdMapping = Record<string, string>

export const createTokenId = (
  pluginType: TokenType,
  currencyCode: string,
  contractAddress?: string | null
): EdgeTokenId => {
  if (contractAddress == null) {
    return null
  }
  switch (pluginType) {
    // Use contract address as-is:
    case 'simple': {
      return contractAddress
    }

    // EVM token support:
    case 'evm': {
      return contractAddress.toLowerCase().replace(/^0x/, '')
    }

    // Cosmos token support:
    case 'cosmos': {
      // Regexes inspired by a general regex in https://github.com/cosmos/cosmos-sdk
      // Broken up to more tightly enforce the rules for each type of asset so the entered value matches what a node would expect
      const ibcDenomRegex = /^ibc\/[0-9A-F]{64}$/
      const nativeDenomRegex = /^(?!ibc)[a-z][a-z0-9/]{2,127}/

      if (
        contractAddress == null ||
        (!ibcDenomRegex.test(contractAddress) &&
          !nativeDenomRegex.test(contractAddress))
      ) {
        throw new Error('Invalid contract address')
      }

      return contractAddress.toLowerCase().replace(/\//g, '')
    }

    // XRP token support:
    case 'xrpl': {
      let currency: string
      if (currencyCode.length > 3) {
        const hexCode = Buffer.from(currencyCode, 'utf8').toString('hex')
        currency = hexCode.toUpperCase().padEnd(40, '0')
      } else {
        currency = currencyCode
      }

      return `${currency}-${contractAddress}`
    }

    // Sui token support:
    case 'colon-delimited': {
      return contractAddress.replace(/:/g, '')
    }

    case 'lowercase': {
      return contractAddress.toLowerCase()
    }

    default: {
      // No token support:
      // these chains don't support tokens
      throw new Error('Tokens are not supported for this chain')
    }
  }
}
