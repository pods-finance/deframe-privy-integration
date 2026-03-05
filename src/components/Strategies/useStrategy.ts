import { useCallback, useEffect, useRef, useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana'
import type { WalletEnvironment } from '../Wallets/useWallets'
import {
  type DeframeBytecodeResponse,
  executeStrategyTx,
} from './executeStrategyTx'
import type { Strategy as StrategyModel } from './useStrategies'

interface Params {
  strategy: StrategyModel
  selectedAction: string
  walletAddress: string
  fetchStrategyDetails: (strategyId: string, wallet: string) => Promise<unknown>
  walletEnvironment?: WalletEnvironment
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

export function useStrategy({
  strategy,
  selectedAction,
  walletAddress,
  fetchStrategyDetails,
  walletEnvironment = 'EVM',
}: Params) {
  const options = Array.isArray(strategy.availableActions) ? strategy.availableActions : []
  const [details, setDetails] = useState<DeframeStrategyDetailsResponse | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const isFetched = useRef(false)
  const smartWallets = useSmartWallets()
  const signAndSend = useSignAndSendTransaction()
  const solanaWalletsData = useWallets()
  const solanaWallets = solanaWalletsData.wallets
  const solanaWallet =
    solanaWallets.find((w) => w.address === walletAddress) ?? solanaWallets[0]

  const [amount, setAmount] = useState('')
  const [fromTokenAddress, setFromTokenAddress] = useState('')
  const [fromChainId, setFromChainId] = useState('')
  const [toTokenAddress, setToTokenAddress] = useState('')
  const [toChainId, setToChainId] = useState('')
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
      if (fromTokenAddress.trim()) url.searchParams.set('fromTokenAddress', fromTokenAddress.trim())
      if (fromChainId.trim()) url.searchParams.set('fromChainId', fromChainId.trim())
      if (toTokenAddress.trim()) url.searchParams.set('toTokenAddress', toTokenAddress.trim())
      if (toChainId.trim()) url.searchParams.set('toChainId', toChainId.trim())

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

      const tx = await executeStrategyTx(
        bytecodeResponse,
        walletEnvironment,
        {
          getClientForChain: (params) =>
            smartWallets.getClientForChain(params),
        },
        {
          signAndSendTransaction: (input) => {
            const wallet = input.wallet as Parameters<typeof signAndSend.signAndSendTransaction>[0]['wallet']
            return signAndSend.signAndSendTransaction({
              transaction: input.transaction,
              wallet,
              chain: input.chain ?? 'solana:mainnet',
              options: input.options ?? { skipPreflight: true },
            })
          },
          solanaWallet,
        } as import('./executeStrategyTx').SolanaExecutorDeps
      )
      console.log({ tx })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      setBytecodesError(message)
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
    fromTokenAddress,
    setFromTokenAddress,
    fromChainId,
    setFromChainId,
    toTokenAddress,
    setToTokenAddress,
    toChainId,
    setToChainId,
    bytecodes,
    bytecodesLoading,
    bytecodesError,
    fetchBytecodes,
  }
}

