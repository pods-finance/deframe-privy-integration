import { useEffect, useState } from 'react'
import { createPublicClient, http, formatUnits } from 'viem'
import {
  arbitrum,
  avalanche,
  base,
  gnosis,
  hyperEvm,
  mainnet,
  optimism,
  polygon,
} from 'viem/chains'
import type { StrategyLike, TokenConfig } from './tokensByChain'
import { buildTokensFromStrategies } from './tokensByChain'

const CHAIN_ID_TO_CHAIN = {
  1: mainnet,
  137: polygon,
  56: bsc,
  8453: base,
  42161: arbitrum,
  10: optimism,
  43114: avalanche,
  100: gnosis,
  999: hyperEvm,
} as const

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  56: 'BSC',
  8453: 'Base',
  42161: 'Arbitrum',
  10: 'Optimism',
  43114: 'Avalanche',
  100: 'Gnosis',
  999: 'HyperEVM',
}

const CHAIN_ID_TO_RPC_KEY: Record<number, string> = {
  1: 'https://eth-mainnet.g.alchemy.com/v2',
  137: 'https://polygon-mainnet.g.alchemy.com/v2',
  56: 'https://bsc-mainnet.g.alchemy.com/v2',
  8453: 'https://base-mainnet.g.alchemy.com/v2',
  42161: 'https://arb-mainnet.g.alchemy.com/v2',
  10: 'https://opt-mainnet.g.alchemy.com/v2',
  43114: 'https://avax-mainnet.g.alchemy.com/v2',
  100: 'https://gnosis-mainnet.g.alchemy.com/v2',
  999: 'https://hyperliquid-mainnet.g.alchemy.com/v2',
}

function getRpcUrlForChain(chainId: number): string | undefined {
  const key = CHAIN_ID_TO_RPC_KEY[chainId]
  if (!key) return undefined
  const baseUrl = (import.meta.env as Record<string, string | undefined>)[key]
  const apiKey = import.meta.env.VITE_APP_ALCHEMY_API_KEY
  if (typeof baseUrl !== 'string' || !baseUrl) return undefined
  if (typeof apiKey === 'string' && apiKey && baseUrl.includes('/v2')) {
    return `${baseUrl}/${apiKey}`
  }
  return baseUrl
}

const ERC20_BALANCE_OF_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export interface TokenBalance {
  token: TokenConfig
  balance: bigint
  formatted: string
}

export interface ChainBalances {
  chainId: number
  chainName: string
  tokens: TokenBalance[]
}

export function useTokenBalances(walletAddress?: string | null) {
  const [balances, setBalances] = useState<ChainBalances[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!walletAddress?.startsWith('0x')) {
      setBalances([])
      return
    }

    const addr = walletAddress as `0x${string}`

    const fetchAll = async () => {
      setLoading(true)
      setError(null)
      try {
        const baseUrl = import.meta.env.VITE_APP_DEFRAME_API_URL
        const apiKey = import.meta.env.VITE_APP_DEFRAME_API_KEY
        if (!baseUrl || !apiKey) {
          throw new Error('Missing VITE_APP_DEFRAME_API_URL or VITE_APP_DEFRAME_API_KEY')
        }

        const strategiesRes = await fetch(`${baseUrl}/strategies?limit=100`, {
          headers: { 'x-api-key': apiKey },
        })
        if (!strategiesRes.ok) {
          throw new Error(`Strategies failed (${String(strategiesRes.status)})`)
        }
        const strategiesData = (await strategiesRes.json()) as { data?: StrategyLike[] }
        const strategies: StrategyLike[] = Array.isArray(strategiesData.data) ? strategiesData.data : []
        const evmStrategies = strategies.filter(
          (s) => (s.chain ?? s.network ?? '').toLowerCase() !== 'solana'
        )
        const tokensByChain = buildTokensFromStrategies(evmStrategies)

        const results: ChainBalances[] = []

        for (const [chainIdStr, tokens] of Object.entries(tokensByChain)) {
          const chainId = Number(chainIdStr)
          if (tokens.length === 0 || !(chainId in CHAIN_ID_TO_CHAIN)) continue

          const rpcUrl = getRpcUrlForChain(chainId)
          const client = createPublicClient({
            chain: CHAIN_ID_TO_CHAIN[chainId as keyof typeof CHAIN_ID_TO_CHAIN],
            transport: rpcUrl ? http(rpcUrl) : http(),
          })

          const tokenBalances: TokenBalance[] = []

          for (const token of tokens) {
            try {
              const balance = await client.readContract({
                address: token.address,
                abi: ERC20_BALANCE_OF_ABI,
                functionName: 'balanceOf',
                args: [addr],
              })
              tokenBalances.push({
                token,
                balance,
                formatted: formatUnits(balance, token.decimals),
              })
            } catch {
              tokenBalances.push({
                token,
                balance: 0n,
                formatted: '0',
              })
            }
          }

          results.push({
            chainId,
            chainName: CHAIN_NAMES[chainId] ?? `Chain ${String(chainId)}`,
            tokens: tokenBalances,
          })
        }

        setBalances(results)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void fetchAll()
  }, [walletAddress])

  return { balances, loading, error }
}
