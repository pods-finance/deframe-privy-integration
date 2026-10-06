import { useCallback, useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana'
import {
  type DeframeBytecodeResponse,
  executeEvmBytecode,
  executeSolanaBytecode,
} from '../Strategies/executeStrategyTx'
import { asRecord, deframeApiHeaders, deframeApiUrl, extractApiError, parseResponseBody } from './rampApi'
import {
  addressForChain,
  isBrlOfframp,
  isFiatChain,
  isSolanaChain,
  isUsdOfframp,
  type RampPin,
  type RampRoute,
} from './rampRoutes'

export interface UsdBankFields {
  bankAccountNumber: string
  bankRoutingNumber: string
  bankBeneficiaryName: string
  bankName: string
  beneficiaryStreetLine1: string
  beneficiaryCity: string
  beneficiaryState: string
  beneficiaryPostalCode: string
  beneficiaryCountry: string
}

export const DEFAULT_USD_BANK: UsdBankFields = {
  bankAccountNumber: '',
  bankRoutingNumber: '',
  bankBeneficiaryName: '',
  bankName: '',
  beneficiaryStreetLine1: '',
  beneficiaryCity: '',
  beneficiaryState: '',
  beneficiaryPostalCode: '',
  beneficiaryCountry: '',
}

export interface RampQuoteResult {
  httpStatus: number
  body: unknown
  errorCode?: string
  errorMessage?: string
  provider?: string
  rampProvider?: string
  pin: RampPin | 'unknown'
  executeError?: string
  txHash?: string
  executed?: boolean
}

export interface FetchRampQuoteParams {
  route: RampRoute
  pin: RampPin | 'unknown'
  /** Raw amountIn override (token decimals / 2 for fiat). Falls back to route.amountIn. */
  amountIn?: string
  /** Context wallet used when an address override is empty. */
  originAddress?: string
  /** Replaces the resolved origin on the quote when non-empty. Signing stays on the context wallet. */
  originAddressOverride?: string
  /** Replaces the resolved destination on the quote when non-empty. Omitted when the destination chain is fiat. */
  destinationAddressOverride?: string
  evmAddress?: string
  solanaAddress?: string
  pixKey?: string
  thirdParty?: boolean
  usdBank?: UsdBankFields
  /** Basis points. Omitted from the quote when unset so the API keeps its stored default. */
  markupBps?: number
}

interface EvmTxItem {
  to: string
  value: string
  data: string
  chainId: string
}

function readQuoteField(body: unknown, field: 'provider' | 'rampProvider'): string | undefined {
  const record = asRecord(body)
  if (!record) return undefined
  const fromQuote = asRecord(record.quote)?.[field]
  if (typeof fromQuote === 'string') return fromQuote
  const top = record[field]
  return typeof top === 'string' ? top : undefined
}

function isSolanaTxPayload(body: unknown): boolean {
  const record = asRecord(body)
  if (!record) return false
  if (record.type === 'intra-chain-solana' || record.chainId === 'solana') return true
  const txData = asRecord(record.transactionData)
  return typeof txData?.rawTransaction === 'string'
}

function hasExecutableBytecode(body: unknown): boolean {
  if (isSolanaTxPayload(body)) return true
  const record = asRecord(body)
  const txData = record?.transactionData
  return Array.isArray(txData) && txData.length > 0
}

function toHex(bytes: Uint8Array): string {
  let out = '0x'
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0')
  }
  return out
}

function extractTxHash(tx: unknown): string | null {
  if (typeof tx === 'string') return tx
  const record = asRecord(tx)
  const hash = record?.hash
  return typeof hash === 'string' ? hash : null
}

function toEvmBytecode(body: unknown): DeframeBytecodeResponse {
  const record = asRecord(body)
  const items = Array.isArray(record?.transactionData)
    ? (record.transactionData as EvmTxItem[])
    : []
  return {
    feeCharged: '0',
    metadata: { isCrossChain: true, isSameChainSwap: false, crossChainQuoteId: '' },
    bytecode: items.map((item) => ({
      to: item.to,
      value: item.value,
      data: item.data,
      chainId: item.chainId,
    })),
  }
}

export function useRampQuote() {
  const smartWallets = useSmartWallets()
  const signAndSend = useSignAndSendTransaction()
  const { wallets: solanaWallets } = useWallets()
  const [results, setResults] = useState<Partial<Record<string, RampQuoteResult>>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [executingKey, setExecutingKey] = useState<string | null>(null)

  const executePayload = useCallback(
    async (body: unknown, originChain: string, svmAddress: string) => {
      if (isSolanaTxPayload(body) || isSolanaChain(originChain)) {
        const signingWallet = solanaWallets.find((w) => w.address === svmAddress)
        if (!signingWallet) {
          throw new Error(
            'Solana offramp: select your Privy Solana wallet (SVM) — originAddress must match the signer.',
          )
        }
        const record = asRecord(body)
        const txData = asRecord(record?.transactionData)
        const rawSwap = asRecord(record?.rawSwapData)
        const rawTransaction =
          (typeof txData?.rawTransaction === 'string' ? txData.rawTransaction : undefined) ??
          (typeof rawSwap?.transaction === 'string' ? rawSwap.transaction : undefined)
        if (!rawTransaction) {
          throw new Error('Ramp Solana response missing transactionData.rawTransaction')
        }
        const result = await executeSolanaBytecode(
          {
            feeCharged: '0',
            metadata: {
              isCrossChain: false,
              isSameChainSwap: true,
              crossChainQuoteId: '',
            },
            bytecode: [],
            transaction: rawTransaction,
          },
          {
            signAndSendTransaction: (input) =>
              signAndSend.signAndSendTransaction({
                transaction: input.transaction,
                wallet: input.wallet,
                chain: input.chain ?? 'solana:mainnet',
                options: input.options ?? { skipPreflight: true },
              }),
            solanaWallet: signingWallet,
          },
        )
        return toHex(result.signature)
      }

      const tx = await executeEvmBytecode(toEvmBytecode(body), {
        getClientForChain: (p) => smartWallets.getClientForChain(p),
      })
      return extractTxHash(tx)
    },
    [signAndSend, smartWallets, solanaWallets],
  )

  const fetchQuote = useCallback(
    async (params: FetchRampQuoteParams) => {
      const { route, pin } = params
      const resultKey = `${route.id}:${pin}`
      const fallback = params.originAddress?.trim() ?? ''
      const contextOrigin = addressForChain(
        route.originChain,
        params.evmAddress,
        params.solanaAddress,
        fallback,
      )
      const contextDestination = addressForChain(
        route.destinationChain,
        params.evmAddress,
        params.solanaAddress,
        fallback,
      )
      const originAddress = params.originAddressOverride?.trim() || contextOrigin
      const destinationAddress =
        params.destinationAddressOverride?.trim() || contextDestination

      if (!originAddress && !isFiatChain(route.originChain)) {
        setResults((prev) => ({
          ...prev,
          [resultKey]: {
            httpStatus: 0,
            body: { error: { code: 'WALLET_REQUIRED', message: 'Origin wallet is required' } },
            errorCode: 'WALLET_REQUIRED',
            errorMessage: 'Origin wallet is required',
            pin,
          },
        }))
        return
      }

      if (isBrlOfframp(route) && !params.pixKey?.trim()) {
        setResults((prev) => ({
          ...prev,
          [resultKey]: {
            httpStatus: 0,
            body: {
              error: { code: 'PIX_KEY_REQUIRED', message: 'PIX key is required for BRL offramp' },
            },
            errorCode: 'PIX_KEY_REQUIRED',
            errorMessage: 'PIX key is required for BRL offramp',
            pin,
          },
        }))
        return
      }

      if (!isFiatChain(route.destinationChain) && !destinationAddress) {
        setResults((prev) => ({
          ...prev,
          [resultKey]: {
            httpStatus: 0,
            body: {
              error: {
                code: 'DESTINATION_REQUIRED',
                message: 'Destination wallet is required for this rail',
              },
            },
            errorCode: 'DESTINATION_REQUIRED',
            errorMessage: 'Destination wallet is required for this rail',
            pin,
          },
        }))
        return
      }

      const trimmedAmount = params.amountIn?.trim()
      const amountIn =
        trimmedAmount !== undefined && trimmedAmount.length > 0 ? trimmedAmount : route.amountIn

      const url = deframeApiUrl('/v2/swap/quote')
      url.searchParams.set('originChain', route.originChain)
      url.searchParams.set('tokenIn', route.tokenIn)
      url.searchParams.set('amountIn', amountIn)
      url.searchParams.set('destinationChain', route.destinationChain)
      url.searchParams.set('tokenOut', route.tokenOut)
      if (originAddress) url.searchParams.set('originAddress', originAddress)
      if (!isFiatChain(route.destinationChain) && destinationAddress) {
        url.searchParams.set('destinationAddress', destinationAddress)
      }
      if (isBrlOfframp(route) && params.pixKey?.trim()) {
        url.searchParams.set('pixKey', params.pixKey.trim())
        url.searchParams.set('thirdParty', String(params.thirdParty === true))
      }
      if (route.usdPaymentMethod) {
        url.searchParams.set('usdPaymentMethod', route.usdPaymentMethod)
      }
      if (isUsdOfframp(route)) {
        const bank = params.usdBank ?? DEFAULT_USD_BANK
        url.searchParams.set('bankAccountNumber', bank.bankAccountNumber)
        url.searchParams.set('bankRoutingNumber', bank.bankRoutingNumber)
        url.searchParams.set('bankBeneficiaryName', bank.bankBeneficiaryName)
        url.searchParams.set('bankName', bank.bankName)
        url.searchParams.set('beneficiaryStreetLine1', bank.beneficiaryStreetLine1)
        url.searchParams.set('beneficiaryCity', bank.beneficiaryCity)
        url.searchParams.set('beneficiaryState', bank.beneficiaryState)
        url.searchParams.set('beneficiaryPostalCode', bank.beneficiaryPostalCode)
        url.searchParams.set('beneficiaryCountry', bank.beneficiaryCountry)
      }
      if (params.markupBps !== undefined) {
        url.searchParams.set('markupBps', String(params.markupBps))
      }
      if (pin === 'avenia' || pin === 'unblockpay') {
        url.searchParams.set('rampProvider', pin)
      } else if (pin === 'unknown') {
        url.searchParams.set('rampProvider', 'not-a-real-provider')
      }

      let quoteBody: unknown = null
      let quoteOk = false

      try {
        setLoadingKey(resultKey)
        setExecutingKey(null)
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: deframeApiHeaders(),
        })
        const body = await parseResponseBody(res)
        quoteBody = body
        const { code, message } = extractApiError(body)
        const baseResult: RampQuoteResult = {
          httpStatus: res.status,
          body,
          errorCode: code,
          errorMessage: message,
          provider: readQuoteField(body, 'provider'),
          rampProvider: readQuoteField(body, 'rampProvider'),
          pin,
        }
        setResults((prev) => ({ ...prev, [resultKey]: baseResult }))

        if (res.status !== 200 || code) {
          return
        }

        quoteOk = true

        if (!hasExecutableBytecode(body)) {
          // Onramp / payment-instruction only — no Privy sign step.
          return
        }

        setLoadingKey(null)
        setExecutingKey(resultKey)
        const signerAddress = isSolanaChain(route.originChain)
          ? (params.solanaAddress?.trim() ?? contextOrigin)
          : (params.evmAddress?.trim() ?? contextOrigin)
        const hash = await executePayload(body, route.originChain, signerAddress)
        setResults((prev) => ({
          ...prev,
          [resultKey]: {
            ...baseResult,
            executed: true,
            txHash: hash ?? undefined,
          },
        }))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        if (quoteOk && quoteBody != null) {
          setResults((prev) => ({
            ...prev,
            [resultKey]: {
              httpStatus: 200,
              body: quoteBody,
              provider: readQuoteField(quoteBody, 'provider'),
              rampProvider: readQuoteField(quoteBody, 'rampProvider'),
              pin,
              executed: false,
              executeError: msg,
            },
          }))
        } else {
          setResults((prev) => ({
            ...prev,
            [resultKey]: {
              httpStatus: 0,
              body: { error: { code: 'NETWORK_ERROR', message: msg } },
              errorCode: 'NETWORK_ERROR',
              errorMessage: msg,
              pin,
            },
          }))
        }
      } finally {
        setLoadingKey(null)
        setExecutingKey(null)
      }
    },
    [executePayload],
  )

  return { results, loadingKey, executingKey, fetchQuote }
}
