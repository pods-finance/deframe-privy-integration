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

/** True when the quote is intra-chain Solana (bytecode must use the same Privy SVM address for origin + destination). */
export function isSolanaToSolanaQuote(q: SwapQuote | null | undefined): boolean {
  if (q == null) return false
  return (
    q.originChain.trim().toLowerCase() === 'solana' &&
    q.destinationChain.trim().toLowerCase() === 'solana'
  )
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
    /** Required for non–Solana-to-Solana quotes; ignored when quote is solana → solana */
    destinationAddress?: string
  }) => {
    if (!originAddress?.trim()) {
      setExecuteError('Origin address (wallet) is required')
      return
    }

    if (!quote) {
      setExecuteError('Quote is missing; get a quote first.')
      return
    }
    if (quote.quoteId !== params.quoteId) {
      setExecuteError('Quote is stale; get a new quote before executing.')
      return
    }

    const svmAddress = originAddress.trim()
    const solanaToSolana = isSolanaToSolanaQuote(quote)
    const destinationAddress = solanaToSolana
      ? svmAddress
      : (params.destinationAddress?.trim() ?? '')

    if (!solanaToSolana && !destinationAddress) {
      setExecuteError('Destination address is required')
      return
    }

    const bytecodeBody = {
      quoteId: params.quoteId,
      originAddress: svmAddress,
      destinationAddress,
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
        body: JSON.stringify(bytecodeBody),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Swap bytecode failed (${String(res.status)}). ${body}`.trim())
      }

      const payload = (await res.json()) as unknown

      if (isSolanaSwapBytecodeResponse(payload)) {
        const signingWallet = solanaWallets.find((w) => w.address === svmAddress)
        if (!signingWallet) {
          throw new Error(
            'Solana swap: wallet address must exactly match your Privy Solana wallet (same base58 string in quote, bytecode body, and signer). Select SVM in Wallets.'
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
      } else {
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
