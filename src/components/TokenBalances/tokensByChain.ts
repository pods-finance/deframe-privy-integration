/**
 * Tokens por rede - derivados de asset e underlyingAsset das estratégias em /strategies.
 */

export interface TokenConfig {
  address: `0x${string}`
  symbol: string
  decimals: number
}

/** Estratégia mínima para extrair tokens (evita import circular com useStrategies). */
export interface StrategyLike {
  asset?: string
  underlyingAsset?: string
  assetName?: string
  assetDecimals?: number
  underlyingDecimals?: number
  chain?: string
  network?: string
  chainId?: number | string
  networkId?: number | string
  [key: string]: unknown
}

const NETWORK_NAME_TO_CHAIN_ID: Record<string, number> = {
  mainnet: 1,
  ethereum: 1,
  eth: 1,
  polygon: 137,
  matic: 137,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  avax: 43114,
  gnosis: 100,
  hyperevm: 999,
}

function getChainIdFromStrategy(s: StrategyLike): number | undefined {
  const cid = s.chainId ?? s.networkId
  if (cid != null) {
    const n = typeof cid === 'number' ? cid : Number(cid)
    if (!Number.isNaN(n)) return n
  }
  const network = (s.chain ?? s.network ?? '').toLowerCase()
  if (!network) return undefined
  return NETWORK_NAME_TO_CHAIN_ID[network]
}

function isValidEvmAddress(addr: unknown): addr is `0x${string}` {
  return typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
}

/**
 * Constrói lista de tokens únicos por chain a partir das estratégias.
 * Inclui asset e underlyingAsset; evita duplicatas por endereço na mesma chain.
 */
export function buildTokensFromStrategies(strategies: StrategyLike[]): Record<number, TokenConfig[]> {
  const byChain = new Map<number, Map<string, TokenConfig>>()

  for (const s of strategies) {
    const chainId = getChainIdFromStrategy(s)
    if (chainId === undefined) continue

    const assetDec = typeof s.assetDecimals === 'number' ? s.assetDecimals : 18
    const underlyingDec = typeof s.underlyingDecimals === 'number' ? s.underlyingDecimals : 18
    const baseSymbol = typeof s.assetName === 'string' ? s.assetName : 'TOKEN'

    const addToken = (address: unknown, sym: string, dec: number) => {
      if (!isValidEvmAddress(address)) return
      const addr = address.toLowerCase()
      let chainMap = byChain.get(chainId)
      if (!chainMap) {
        chainMap = new Map()
        byChain.set(chainId, chainMap)
      }
      if (!chainMap.has(addr)) {
        chainMap.set(addr, {
          address,
          symbol: sym,
          decimals: dec,
        })
      }
    }

    addToken(s.asset, baseSymbol, assetDec)
    addToken(s.underlyingAsset, baseSymbol, underlyingDec)
  }

  const result: Record<number, TokenConfig[]> = {}
  for (const [chainId, map] of byChain) {
    result[chainId] = Array.from(map.values())
  }
  return result
}
