import { useCallback, useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

interface TransferParams {
  walletOrigin: string
  walletDestination: string
  token: string
  amount: string
  chainId: string
}

interface TransferBytecodeItem {
  chainId: string
  data: string
  to: string
  value: string
}

interface TransferBytecodeResponse {
  bytecode: TransferBytecodeItem[]
}

export function useTransfer(walletAddress?: string) {
  const { getClientForChain } = useSmartWallets()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const executeTransfer = useCallback(
    async (params: TransferParams) => {
      try {
        setLoading(true)
        setError(null)
        setTxHash(null)

        const baseUrl = import.meta.env.VITE_APP_DEFRAME_API_URL
        const apiKey = import.meta.env.VITE_APP_DEFRAME_API_KEY

        if (!baseUrl || !apiKey) {
          throw new Error('Missing VITE_APP_DEFRAME_API_URL or VITE_APP_DEFRAME_API_KEY')
        }

        const url = new URL('/transfer/bytecode', baseUrl)
        url.searchParams.set('walletOrigin', params.walletOrigin)
        url.searchParams.set('walletDestination', params.walletDestination)
        url.searchParams.set('token', params.token)
        url.searchParams.set('amount', params.amount)
        url.searchParams.set('chainId', params.chainId)

        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
          },
        })

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`Transfer bytecode failed (${String(res.status)}). ${body}`.trim())
        }

        const data = (await res.json()) as TransferBytecodeResponse
        const bytecodeList = data.bytecode

        if (bytecodeList.length === 0) {
          throw new Error('No bytecode returned from API')
        }

        const first = bytecodeList[0]
        const chainId = Number(first.chainId)
        const chainClient = await getClientForChain({ id: chainId })

        if (!chainClient) {
          throw new Error(`Chain client not found for chainId ${String(chainId)}`)
        }

        const calls = bytecodeList.map((b) => ({
          to: b.to as `0x${string}`,
          data: b.data as `0x${string}`,
          value: BigInt(b.value),
        }))

        const hash = await chainClient.sendTransaction({ calls })
        setTxHash(typeof hash === 'string' ? hash : (hash as { hash?: string }).hash ?? String(hash))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [getClientForChain]
  )

  return {
    executeTransfer,
    loading,
    error,
    txHash,
    walletAddress,
  }
}
