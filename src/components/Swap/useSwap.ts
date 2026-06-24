import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana'
import {
  type DeframeBytecodeResponse,
  executeEvmBytecode,
  executeSolanaBytecode,
} from '../Strategies/executeStrategyTx'

const SWAP_API_BASE = import.meta.env.VITE_APP_DEFRAME_API_URL || 'http://localhost:4001'
const SWAP_API_KEY = import.meta.env.VITE_APP_DEFRAME_API_KEY || ''

export interface SwapQuote {
  quoteId: string
  customer: string
  originChain: string
  destinationChain: string
  tokenIn: {
    contract: string
    symbol: string
    decimals: number
    amount: string
    chainId: number
  }
  tokenOut: {
    contract: string
    symbol: string
    decimals: number
    amount: string
    minAmountOut?: string
    expectedAmountOut?: string
    chainId: number
  }
  deadline: string
  provider: string
  status: string
  [key: string]: unknown
}

export interface SwapQuoteResponse {
  quote: SwapQuote
  chainId?: number | string
  type?: string
  transactionData?:
    | {
        to: string
        value: string
        data: string
        chainId: string
      }[]
    | {
        rawTransaction?: string
      }
  rawSwapData?: {
    transaction?: string
  }
}

export interface SwapBytecodeResponse {
  chainId: number
  transactionData: {
    to: string
    value: string
    data: string
    chainId: string
  }[],
}

interface SolanaSwapBytecodeResponse {
  type?: string
  chainId?: string
  transactionData?: {
    rawTransaction?: string
  }
  rawSwapData?: {
    transaction?: string
  }
}

function toDeframeBytecodeResponse(resp: SwapBytecodeResponse): DeframeBytecodeResponse {
  return {
    feeCharged: '0',
    metadata: { isCrossChain: true, isSameChainSwap: false, crossChainQuoteId: '' },
    bytecode: resp.transactionData,
  }
}

function toHex(bytes: Uint8Array): string {
  let out = '0x'
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0')
  }
  return out
}

function isSolanaSwapBytecodeResponse(resp: unknown): resp is SolanaSwapBytecodeResponse {
  if (!resp || typeof resp !== 'object') return false
  const maybe = resp as SolanaSwapBytecodeResponse
  return maybe.type === 'intra-chain-solana' || maybe.chainId === 'solana'
}

export function isSolanaToSolanaChains(originChain: string, destinationChain: string): boolean {
  return (
    originChain.trim().toLowerCase() === 'solana' &&
    destinationChain.trim().toLowerCase() === 'solana'
  )
}

/** True when the quote is intra-chain Solana (bytecode must use the same Privy SVM address for origin + destination). */
export function isSolanaToSolanaQuote(q: SwapQuote | null | undefined): boolean {
  if (q == null) return false
  return isSolanaToSolanaChains(q.originChain, q.destinationChain)
}

function hasBytecodePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  if (isSolanaSwapBytecodeResponse(payload)) return true
  const maybe = payload as SwapBytecodeResponse
  return Array.isArray(maybe.transactionData) && maybe.transactionData.length > 0
}

export function useSwap(originAddress?: string) {
  const smartWallets = useSmartWallets()
  const signAndSend = useSignAndSendTransaction()
  const solanaWalletsData = useWallets()
  const solanaWallets = solanaWalletsData.wallets
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [executeLoading, setExecuteLoading] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const executeBytecodePayload = async (payload: unknown, svmAddress: string) => {
    if (isSolanaSwapBytecodeResponse(payload)) {
      const signingWallet = solanaWallets.find((w) => w.address === svmAddress)
      if (!signingWallet) {
        throw new Error(
          'Solana swap: wallet address must exactly match your Privy Solana wallet (same base58 string in quote and signer). Select SVM in Wallets.'
        )
      }

      const rawTransaction =
        payload.transactionData?.rawTransaction ??
        payload.rawSwapData?.transaction

      if (!rawTransaction) {
        throw new Error('Swap SVM response missing transactionData.rawTransaction')
      }

      const solanaResp: DeframeBytecodeResponse = {
        feeCharged: '0',
        metadata: {
          isCrossChain: false,
          isSameChainSwap: true,
          crossChainQuoteId: '',
        },
        bytecode: [],
        transaction: rawTransaction,
      }

      const result = await executeSolanaBytecode(solanaResp, {
        signAndSendTransaction: (input) => {
          return signAndSend.signAndSendTransaction({
            transaction: input.transaction,
            wallet: input.wallet,
            chain: input.chain ?? 'solana:mainnet',
            options: input.options ?? { skipPreflight: true },
          })
        },
        solanaWallet: signingWallet,
      })

      setTxHash(toHex(result.signature))
      return
    }

    const bytecodeResp = payload as SwapBytecodeResponse
    const deframeResp = toDeframeBytecodeResponse(bytecodeResp)

    const tx = await executeEvmBytecode(deframeResp, {
      getClientForChain: (p) => smartWallets.getClientForChain(p),
    })

    const hash = typeof tx === 'object' && tx !== null && 'hash' in tx
      ? (tx as { hash: string }).hash
      : typeof tx === 'string'
        ? tx
        : null
    setTxHash(hash)
  }

  const fetchQuote = async (params: {
    originChain: string
    tokenIn: string
    amountIn: string
    destinationChain: string
    tokenOut: string
    /** Required for non–Solana-to-Solana swaps; ignored when origin and destination chain are both solana */
    destinationAddress?: string
  }) => {
    if (!originAddress?.trim()) {
      setQuoteError('Origin address (wallet) is required')
      return
    }

    const svmAddress = originAddress.trim()
    const solanaToSolana = isSolanaToSolanaChains(params.originChain, params.destinationChain)
    const destinationAddress = solanaToSolana
      ? svmAddress
      : (params.destinationAddress?.trim() ?? '')

    if (!solanaToSolana && !destinationAddress) {
      setQuoteError('Destination address is required')
      return
    }

    let quoteReceived = false

    try {
      setQuoteLoading(true)
      setQuoteError(null)
      setExecuteError(null)
      setTxHash(null)
      setQuote(null)

      const url = new URL('/v2/swap/quote', SWAP_API_BASE)
      url.searchParams.set('originChain', params.originChain)
      url.searchParams.set('tokenIn', params.tokenIn)
      url.searchParams.set('amountIn', params.amountIn)
      url.searchParams.set('destinationChain', params.destinationChain)
      url.searchParams.set('tokenOut', params.tokenOut)
      url.searchParams.set('originAddress', svmAddress)
      url.searchParams.set('destinationAddress', destinationAddress)

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: SWAP_API_KEY ? { 'x-api-key': SWAP_API_KEY } : {},
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Swap quote failed (${String(res.status)}). ${body}`.trim())
      }

      const data = (await res.json()) as SwapQuoteResponse
      const { quote: quoteData, ...bytecodeFields } = data

      if (!hasBytecodePayload(bytecodeFields)) {
        throw new Error('Swap quote response missing bytecode payload')
      }

      setQuote(quoteData)
      quoteReceived = true

      setQuoteLoading(false)
      setExecuteLoading(true)

      await executeBytecodePayload(bytecodeFields, svmAddress)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      if (quoteReceived) {
        setExecuteError(msg)
      } else {
        setQuoteError(msg)
      }
    } finally {
      setQuoteLoading(false)
      setExecuteLoading(false)
    }
  }

  return {
    quote,
    quoteLoading,
    quoteError,
    fetchQuote,
    executeLoading,
    executeError,
    txHash,
  }
}
