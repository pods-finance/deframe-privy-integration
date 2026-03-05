import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import {
  type DeframeBytecodeResponse,
  executeEvmBytecode,
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

function toDeframeBytecodeResponse(resp: SwapBytecodeResponse): DeframeBytecodeResponse {
  return {
    feeCharged: '0',
    metadata: { isCrossChain: true, isSameChainSwap: false, crossChainQuoteId: '' },
    bytecode: resp.transactionData,
  }
}

export function useSwap(originAddress?: string) {
  const smartWallets = useSmartWallets()
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [executeLoading, setExecuteLoading] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const fetchQuote = async (params: {
    originChain: string
    tokenIn: string
    amountIn: string
    destinationChain: string
    tokenOut: string
  }) => {
    try {
      setQuoteLoading(true)
      setQuoteError(null)
      setQuote(null)

      const url = new URL('/v2/swap/quote', SWAP_API_BASE)
      url.searchParams.set('originChain', params.originChain)
      url.searchParams.set('tokenIn', params.tokenIn)
      url.searchParams.set('amountIn', params.amountIn)
      url.searchParams.set('destinationChain', params.destinationChain)
      url.searchParams.set('tokenOut', params.tokenOut)

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: SWAP_API_KEY ? { 'x-api-key': SWAP_API_KEY } : {},
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Swap quote failed (${String(res.status)}). ${body}`.trim())
      }

      const data = (await res.json()) as SwapQuoteResponse
      setQuote(data.quote)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setQuoteError(msg)
    } finally {
      setQuoteLoading(false)
    }
  }

  const executeSwap = async (params: {
    quoteId: string
    destinationAddress: string
  }) => {
    if (!originAddress?.trim()) {
      setExecuteError('Origin address (wallet) is required')
      return
    }

    try {
      setExecuteLoading(true)
      setExecuteError(null)
      setTxHash(null)

      const res = await fetch(`${SWAP_API_BASE}/v2/swap/bytecode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SWAP_API_KEY && { 'x-api-key': SWAP_API_KEY }),
        },
        body: JSON.stringify({
          destinationAddress: params.destinationAddress,
          quoteId: params.quoteId,
          originAddress: originAddress.trim(),
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Swap bytecode failed (${String(res.status)}). ${body}`.trim())
      }

      const bytecodeResp = (await res.json()) as SwapBytecodeResponse
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setExecuteError(msg)
    } finally {
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
    executeSwap,
  }
}
