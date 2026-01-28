import { useCallback, useEffect, useRef, useState } from 'react'
import type { Strategy as StrategyModel } from './useStrategies'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

interface Params {
  strategy: StrategyModel
  selectedAction: string
  walletAddress: string
  fetchStrategyDetails: (strategyId: string, wallet: string) => Promise<unknown>
}

interface DeframeTokenAmount {
  value: string
  decimals: number
  humanized: string
  symbol: string
}

interface DeframeHistoricItem {
  payload: {
    amount: DeframeTokenAmount
    amountBeforeFees: string
    fromAddress: string
    transactionHash: string
    blockNumber: number
    logIndex: number
    strategyId: string
  }
  action: string
  createdAt: string
  deletedAt: string | null
  source: string
  updatedAt: string
  wallet: string
}

interface DeframeSpotPosition {
  currentPosition: DeframeTokenAmount
  underlyingBalanceUSD: number
  inceptionApy: number
  avgApy: number
  apy: number
  profit: DeframeTokenAmount
  principal: DeframeTokenAmount
}

interface DeframeStrategyDetailsResponse {
  historic: DeframeHistoricItem[]
  spotPosition: DeframeSpotPosition
  strategy: StrategyModel
}

interface DeframeBytecodeResponse {
  feeCharged: string
  metadata: {
    isCrossChain: boolean
    isSameChainSwap: boolean
    crossChainQuoteId: string
  }
  bytecode: {
    to: string
    value: string
    data: string
    chainId: string
  }[]
}

export function useStrategy({ strategy, selectedAction, walletAddress, fetchStrategyDetails }: Params) {
  const options = Array.isArray(strategy.availableActions) ? strategy.availableActions : []
  const [details, setDetails] = useState<DeframeStrategyDetailsResponse | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const isFetched = useRef(false)
const { getClientForChain } = useSmartWallets();

  const [amount, setAmount] = useState('')
  const [bytecodes, setBytecodes] = useState<DeframeBytecodeResponse | null>(null)
  const [bytecodesLoading, setBytecodesLoading] = useState(false)
  const [bytecodesError, setBytecodesError] = useState<string | null>(null)

  const refreshDetails = useCallback(async (): Promise<void> => {
    if (!walletAddress) return
    try {
      setDetailsLoading(true)
      const next = await fetchStrategyDetails(strategy.id, walletAddress)
      setDetails(next as DeframeStrategyDetailsResponse | null)
    } finally {
      setDetailsLoading(false)
    }
  }, [fetchStrategyDetails, strategy.id, walletAddress])

  useEffect(() => {
    if (!walletAddress) return
    if (isFetched.current) return
    isFetched.current = true

    void refreshDetails()
  }, [refreshDetails, walletAddress])

  let avgApy: number | null = null
  if (details) {
    avgApy = typeof details.spotPosition.avgApy === 'number' ? details.spotPosition.avgApy : null
  }
  const avgApyPct = avgApy === null ? null : avgApy * 100

  const underlyingDecimals =
    typeof strategy.underlyingDecimals === 'number'
      ? strategy.underlyingDecimals
      : typeof strategy.assetDecimals === 'number'
        ? strategy.assetDecimals
        : null

  const fetchBytecodes = async (): Promise<void> => {
    try {
      setBytecodesLoading(true)
      setBytecodesError(null)

      const baseUrl = import.meta.env.VITE_APP_DEFRAME_API_URL
      const apiKey = import.meta.env.VITE_APP_DEFRAME_API_KEY

      if (!baseUrl || !apiKey) {
        throw new Error('Missing VITE_APP_DEFRAME_API_URL or VITE_APP_DEFRAME_API_KEY')
      }
      if (!walletAddress) {
        throw new Error('Missing wallet address')
      }
      if (!selectedAction) {
        throw new Error('Select an action')
      }
      if (!amount.trim()) {
        throw new Error('Enter an amount')
      }

      const url = new URL(`/strategies/${encodeURIComponent(strategy.id)}/bytecode`, baseUrl)
      url.searchParams.set('action', selectedAction)
      url.searchParams.set('wallet', walletAddress)
      url.searchParams.set('amount', amount.trim())

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
        },
      })

      if (!res.ok) {
        const body = await res.text().catch(() => {
          return ''
        })
        throw new Error(`Deframe /bytecode failed (${String(res.status)}). ${body}`.trim())
      }

      const bytecodeResponse = (await res.json()) as DeframeBytecodeResponse
      setBytecodes(bytecodeResponse)
      const chainClient = await getClientForChain({
          id: Number(bytecodeResponse.bytecode[0].chainId)
      });
      if (!chainClient) {
        throw new Error('Chain client not found')
      }
      const calls = bytecodeResponse.bytecode.map((b) => {
        return {
          to: b.to as `0x${string}`,
          data: b.data as `0x${string}`,
          value: BigInt(b.value),
        }
      })

      const tx = await chainClient.sendTransaction({
        calls,
      })
      console.log({tx})
    } catch (e) {
      setBytecodesError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBytecodesLoading(false)
    }
  }

  return {
    options,
    details,
    detailsLoading,
    refreshDetails,
    avgApyPct,
    underlyingDecimals,
    amount,
    setAmount,
    bytecodes,
    bytecodesLoading,
    bytecodesError,
    fetchBytecodes,
  }
}

