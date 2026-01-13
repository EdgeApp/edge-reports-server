export const EVM_CHAIN_IDS: Record<string, number> = {
  abstract: 2741,
  arbitrum: 42161,
  avalanche: 43114,
  base: 8453,
  binancesmartchain: 56,
  bobevm: 60808,
  botanix: 3637,
  celo: 42220,
  ethereum: 1,
  ethereumclassic: 61,
  ethereumpow: 10001,
  fantom: 250,
  filecoinfevm: 314,
  hyperevm: 999,
  optimism: 10,
  polygon: 137,
  pulsechain: 369,
  rsk: 30,
  sonic: 146,
  zksync: 324
}

export const REVERSE_EVM_CHAIN_IDS: Record<number, string> = Object.entries(
  EVM_CHAIN_IDS
).reduce((acc, [key, value]) => {
  acc[value] = key
  return acc
}, {})

export const reverseEvmChainId = (evmChainId?: number): string | undefined =>
  evmChainId != null ? REVERSE_EVM_CHAIN_IDS[evmChainId] : undefined
