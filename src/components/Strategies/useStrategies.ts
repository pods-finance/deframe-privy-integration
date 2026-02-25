import { useEffect, useState } from 'react'

export interface Strategy {
  id: string
  protocol: string
  assetName: string
  availableActions?: string[]
  logourl?: string
  paused?: boolean
  network?: string
  underlyingAsset?: string
  underlyingDecimals?: number
  assetDecimals?: number
  [key: string]: unknown
}

export function useStrategies(walletAddress?: string) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedActionById, setSelectedActionById] = useState<Record<string, string>>({})
  const [detailsById, setDetailsById] = useState<Record<string, unknown>>({})
  const [detailsLoadingById, setDetailsLoadingById] = useState<Record<string, boolean>>({})
  const [detailsErrorById, setDetailsErrorById] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()

    const fetchStrategies = async () => {
      try {
        setLoading(true)
        setError(null)

        const baseUrl = import.meta.env.VITE_APP_DEFRAME_API_URL
        const apiKey = import.meta.env.VITE_APP_DEFRAME_API_KEY

        if (!baseUrl || !apiKey) {
          throw new Error('Missing VITE_APP_DEFRAME_API_URL or VITE_APP_DEFRAME_API_KEY')
        }

        const url = new URL('/strategies?limit=100', baseUrl).toString()
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
          },
          signal: controller.signal,
        })

        if (!res.ok) {
          const body = await res.text().catch(() => {
            return ''
          })
          throw new Error(`Deframe /strategies failed (${String(res.status)}). ${body}`.trim())
        }

        const data = (await res.json()) as unknown
        const list = Array.isArray((data as { data?: unknown }).data)
          ? ((data as { data: Strategy[] }).data)
          : []

        setStrategies(list)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    void fetchStrategies()
    return () => {
      controller.abort()
    }
  }, [])

  const fetchStrategyDetails = async (strategyId: string, wallet: string): Promise<unknown> => {
    const baseUrl = import.meta.env.VITE_APP_DEFRAME_API_URL
    const apiKey = import.meta.env.VITE_APP_DEFRAME_API_KEY

    if (!baseUrl || !apiKey) {
      throw new Error('Missing VITE_APP_DEFRAME_API_URL or VITE_APP_DEFRAME_API_KEY')
    }

    setDetailsLoadingById((prev) => {
      return { ...prev, [strategyId]: true }
    })
    setDetailsErrorById((prev) => {
      const { [strategyId]: _removed, ...rest } = prev
      void _removed
      return rest
    })

    try {
      const url = new URL(`/strategies/${encodeURIComponent(strategyId)}`, baseUrl)
      url.searchParams.set('wallet', wallet)

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
        throw new Error(`Deframe /strategies/:id failed (${String(res.status)}). ${body}`.trim())
      }

      const details = (await res.json()) as unknown
      setDetailsById((prev) => {
        return { ...prev, [strategyId]: details }
      })

      return details
    } catch (e) {
      setDetailsErrorById((prev) => {
        return { ...prev, [strategyId]: e instanceof Error ? e.message : 'Unknown error' }
      })
      return null
    } finally {
      setDetailsLoadingById((prev) => {
        return { ...prev, [strategyId]: false }
      })
    }
  }
  useEffect(() => {
    if (!walletAddress) return
    const firstId = strategies[0]?.id
    if (!firstId) return
    if (detailsById[firstId]) return
    if (detailsLoadingById[firstId]) return

    void fetchStrategyDetails(firstId, walletAddress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, strategies])

  return {
    strategies,
    loading,
    error,
    selectedActionById,
    setSelectedActionById,
    detailsById,
    detailsLoadingById,
    detailsErrorById,
    fetchStrategyDetails,
  }
}

