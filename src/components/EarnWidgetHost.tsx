import { useCallback, useMemo, useState } from 'react'
import {
  DeframeProvider,
  EarnWidget,
  type TxUpdateEvent,
} from 'deframe-sdk'
import {
  getEmbeddedConnectedWallet,
  useCreateWallet,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

const ROUTE_TO_STATE: Record<string, string> = {
  history: 'History',
  wallet: 'Wallet',
  swap: 'Swap',
  earn: 'Earn',
  overview: 'Overview',
  details: 'Details',
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  'investment-details': 'Investment Details',
  'history-deposit-details': 'Deposit History Details',
  'history-withdraw-details': 'Withdraw History Details',
  'history-swap': 'Swap History',
  'history-swap-details': 'Swap History Details',
}

type ProcessBytecode = (
  payload: PayloadShape,
  ctx: { updateTxStatus: (event: TxUpdateEvent) => void }
) => Promise<void>

interface DeframeConfig {
  DEFRAME_API_URL?: string
  DEFRAME_API_KEY?: string
  walletAddress?: string
  userId?: string
  globalCurrency: 'USD'
  globalCurrencyExchangeRate: number
  theme: {
    mode: 'dark'
    preset: 'default'
  }
  debug: boolean
}

interface RawBytecode {
  chainId?: number | string
  to: string
  data: string
  value: string
  gasLimit?: string
}

interface PayloadShape {
  clientTxId: string
  bytecodes: RawBytecode[]
  simulateError?: boolean
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

interface DeframeSmartWalletClient {
  sendTransaction: (input: { calls: { to: string; data: string; value?: bigint }[] }) => Promise<string>
}

interface SmartWalletData {
  client?: { account?: { address?: string } } & DeframeSmartWalletClient
  getClientForChain?: (
    input: { id: number }
  ) => DeframeSmartWalletClient | Promise<DeframeSmartWalletClient | null | undefined> | null | undefined
}

interface ActiveWalletShape {
  chainId?: string | number
  address?: string
  walletClientType?: string
  switchChain?: (chainId: number) => Promise<void>
  getEthereumProvider?: () => Promise<Eip1193Provider | undefined>
  getProvider?: () => Promise<Eip1193Provider | undefined>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeWalletChainId(chainId?: string | number): number | undefined {
  if (typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0) {
    return chainId
  }

  if (typeof chainId === 'string') {
    const [scope, raw] = chainId.split(':')
    if (scope === 'eip155' && raw) {
      const parsed = Number.parseInt(raw, 10)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
    }
    const parsed = Number.parseInt(chainId, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }

  return undefined
}

function toBigIntValue(value?: string): bigint | undefined {
  if (!value) {
    return 0n
  }

  const normalized = value.trim()
  if (!normalized || normalized === '0') {
    return 0n
  }

  try {
    return BigInt(normalized)
  } catch {
    return undefined
  }
}

function isSignatureRejected(error: unknown): boolean {
  const maybeError = error as { code?: number | string; message?: string }
  const code = maybeError.code
  const message = (maybeError.message ?? '').toLowerCase()
  return code === 4001 || code === 'ACTION_REJECTED' || message.includes('rejected')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForReceipt(
  provider: Eip1193Provider,
  txHash: string
): Promise<{ status?: string | number }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 120_000) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    })
    if (isRecord(receipt) && receipt.status != null) {
      return receipt as { status?: string | number }
    }
    await sleep(1500)
  }
  throw new Error('Timed out waiting for transaction confirmation')
}

async function resolveWalletProvider(wallet: ActiveWalletShape): Promise<Eip1193Provider | undefined> {
  if (wallet.getEthereumProvider) {
    const provider = await wallet.getEthereumProvider()
    if (provider) {
      return provider
    }
  }

  if (wallet.getProvider) {
    return wallet.getProvider()
  }

  return undefined
}

const EarnWidgetHost = () => {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets() as SmartWalletData
  const { createWallet } = useCreateWallet()

  const [routeName, setRouteName] = useState('Overview')
  const [txLogs, setTxLogs] = useState<string[]>([])
  const [isCreatingSmartWallet, setIsCreatingSmartWallet] = useState(false)

  const embeddedWallet = getEmbeddedConnectedWallet(wallets)
  const activeWallet = (embeddedWallet ?? wallets[0]) as ActiveWalletShape | undefined
  const smartWalletAddress = smartWalletClient?.account?.address
  const existingSmartWalletAddress =
    user?.smartWallet?.address ?? embeddedWallet?.address ?? smartWalletAddress
  const hasExistingSmartWallet = Boolean(existingSmartWalletAddress)
  const isSmartWalletSession =
    Boolean(activeWallet) && activeWallet?.walletClientType === 'privy' && Boolean(smartWalletAddress)

  const routeNavigate = useCallback((route: string) => {
    setRouteName((current) => {
      const mapped = ROUTE_TO_STATE[route] ?? route
      return current === mapped ? current : mapped
    })
  }, [])

  const logEvent = useCallback((entry: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setTxLogs((previous) => [`${timestamp} ${entry}`, ...previous].slice(0, 24))
  }, [])

  const createSmartWallet = useCallback(async () => {
    if (typeof createWallet !== 'function') {
      logEvent('Create wallet flow unavailable: missing createWallet hook.')
      return
    }

    if (hasExistingSmartWallet) {
      logEvent(`Smart wallet already exists: ${existingSmartWalletAddress ?? ''}`)
      return
    }

    setIsCreatingSmartWallet(true)
    try {
      await createWallet()
      logEvent('Smart wallet creation requested.')
    } catch (error) {
      const msg = (error as { message?: string }).message ?? 'Failed to create smart wallet'
      logEvent(`Create wallet failed: ${msg}`)
    } finally {
      setIsCreatingSmartWallet(false)
    }
  }, [createWallet, existingSmartWalletAddress, hasExistingSmartWallet, logEvent])

  const processBytecode: ProcessBytecode = useCallback(
    async (payload: PayloadShape, ctx: { updateTxStatus: (event: TxUpdateEvent) => void }) => {
      const rawTransactions: RawBytecode[] = payload.bytecodes

      const emit = (event: TxUpdateEvent): void => {
        ctx.updateTxStatus(event)

        const eventMeta = event as { type?: string; txHash?: string; code?: string | number; message?: string }
        const detail = eventMeta.txHash ? ` tx=${eventMeta.txHash.slice(0, 10)}...` : ''
        const extra = eventMeta.code != null ? ` code=${String(eventMeta.code)}` : ''
        const message = eventMeta.message ? ` message=${eventMeta.message}` : ''
        logEvent(`${eventMeta.type ?? 'UNKNOWN'}${detail}${extra}${message}`)
      }

      if (!ready || !authenticated || !activeWallet) {
        emit({
          type: 'SIGNATURE_ERROR',
          clientTxId: payload.clientTxId,
          code: 'NO_WALLET',
          message: 'No Privy wallet is connected.',
        })
        return
      }

      if (activeWallet.walletClientType !== 'privy') {
        emit({
          type: 'SIGNATURE_ERROR',
          clientTxId: payload.clientTxId,
          code: 'UNSUPPORTED_WALLET',
          message: hasExistingSmartWallet
            ? 'This integration only accepts Privy embedded smart-wallet sessions. A smart wallet exists, but current wallet is external.'
            : 'This integration only accepts Privy embedded smart-wallet sessions.',
        })
        return
      }

      if (payload.simulateError) {
        emit({
          type: 'SIGNATURE_ERROR',
          clientTxId: payload.clientTxId,
          code: 'SIMULATED_ERROR',
          message: 'simulateError=true',
        })
        return
      }

      let hasSubmittedTx = false

      try {
        const provider = await resolveWalletProvider(activeWallet)
        if (!provider) {
          emit({
            type: 'SIGNATURE_ERROR',
            clientTxId: payload.clientTxId,
            code: 'NO_PROVIDER',
            message: 'No wallet provider available for signatures.',
          })
          return
        }

        if (!smartWalletClient && !getClientForChain) {
          emit({
            type: 'SIGNATURE_ERROR',
            clientTxId: payload.clientTxId,
            code: 'UNSUPPORTED_WALLET',
            message: 'No smart wallet client available.',
          })
          return
        }

        if (!smartWalletAddress) {
          emit({
            type: 'SIGNATURE_ERROR',
            clientTxId: payload.clientTxId,
            code: 'UNSUPPORTED_WALLET',
            message: 'No smart wallet address available for this session.',
          })
          return
        }

        emit({ type: 'HOST_ACK', clientTxId: payload.clientTxId })

        const grouped = new Map<number, RawBytecode[]>()
        const fallbackChainId = normalizeWalletChainId(activeWallet.chainId)

        for (const tx of rawTransactions) {
          const chainId = normalizeWalletChainId(tx.chainId) ?? fallbackChainId
          if (!chainId) {
            emit({
              type: 'SIGNATURE_ERROR',
              clientTxId: payload.clientTxId,
              code: 'INVALID_CHAIN',
              message: 'Missing or invalid chainId in processBytecode payload.',
            })
            return
          }

          const current = grouped.get(chainId) ?? []
          current.push(tx)
          grouped.set(chainId, current)
        }

        for (const [chainId, transactions] of grouped) {
          if (activeWallet.switchChain) {
            const currentChain = normalizeWalletChainId(activeWallet.chainId)
            if (currentChain !== chainId) {
              await activeWallet.switchChain(chainId)
            }
          }

          const client = await Promise.resolve(
            typeof getClientForChain === 'function' ? getClientForChain({ id: chainId }) : smartWalletClient
          )

          if (!client) {
            emit({
              type: 'SIGNATURE_ERROR',
              clientTxId: payload.clientTxId,
              code: 'UNSUPPORTED_WALLET',
              message: `Smart wallet client is not initialized for chainId=${String(chainId)}.`,
            })
            return
          }

          const calls = transactions.map((tx) => {
            const normalizedValue = toBigIntValue(tx.value)
            return {
              to: tx.to,
              data: tx.data,
              ...(normalizedValue && normalizedValue > 0n ? { value: normalizedValue } : {}),
            }
          })

          for (const transaction of transactions) {
            void transaction
            emit({
              type: 'SIGNATURE_PROMPTED',
              clientTxId: payload.clientTxId,
            })
          }

          const txHash = await client.sendTransaction({ calls })
          hasSubmittedTx = true

          for (const transaction of transactions) {
            void transaction
            emit({
              type: 'TX_SUBMITTED',
              clientTxId: payload.clientTxId,
              chainId,
              txHash,
            })
          }

          const receipt = await waitForReceipt(provider, txHash)
          if (receipt.status === '0x0' || receipt.status === 0) {
            for (const transaction of transactions) {
              void transaction
              emit({ type: 'TX_REVERTED', clientTxId: payload.clientTxId })
            }
            return
          }

          for (const transaction of transactions) {
            void transaction
            emit({ type: 'TX_CONFIRMED', clientTxId: payload.clientTxId })
          }
        }

        emit({ type: 'TX_FINALIZED', clientTxId: payload.clientTxId })
      } catch (error) {
        if (isSignatureRejected(error)) {
          emit({ type: 'SIGNATURE_DECLINED', clientTxId: payload.clientTxId })
          return
        }

        const maybeError = error as { code?: number | string; message?: string }

        if (hasSubmittedTx) {
          emit({
            type: 'TX_FAILED',
            clientTxId: payload.clientTxId,
            code: String(maybeError.code ?? 'UNKNOWN_ERROR'),
            message: maybeError.message ?? 'Failed to execute smart-wallet transaction',
          })
          return
        }

        emit({
          type: 'SIGNATURE_ERROR',
          clientTxId: payload.clientTxId,
          code: String(maybeError.code ?? 'UNKNOWN_ERROR'),
          message: maybeError.message ?? 'Failed to execute smart-wallet transaction',
        })
      }
    },
    [
      activeWallet,
      authenticated,
      getClientForChain,
      hasExistingSmartWallet,
      logEvent,
      ready,
      smartWalletAddress,
      smartWalletClient,
    ]
  )

  const config = useMemo<DeframeConfig>(
    () => ({
      DEFRAME_API_URL: import.meta.env.VITE_APP_DEFRAME_API_URL,
      DEFRAME_API_KEY: import.meta.env.VITE_APP_DEFRAME_API_KEY,
      walletAddress: smartWalletAddress,
      userId: user?.id,
      globalCurrency: 'USD' as const,
      globalCurrencyExchangeRate: 1,
      theme: {
        mode: 'dark' as const,
        preset: 'default' as const,
      },
      debug: import.meta.env.DEV,
    }),
    [smartWalletAddress, user?.id]
  )

  const missingConfig = !config.DEFRAME_API_URL || !config.DEFRAME_API_KEY

  const handleLogout = () => {
    void logout()
  }

  const handleLogin = () => {
    login()
  }

  const handleCreateSmartWallet = () => {
    void createSmartWallet()
  }

  return (
    <section className="deframe-host-shell">
      <header className="deframe-host-header">
        <h1>EarnWidget integration</h1>
        <div className="deframe-host-actions">
          {ready ? (
            authenticated ? (
              <>
                <button onClick={handleLogout} type="button">
                  Sign out
                </button>
                {!isSmartWalletSession ? (
                  <button
                    onClick={handleCreateSmartWallet}
                    disabled={isCreatingSmartWallet || hasExistingSmartWallet}
                    type="button"
                  >
                    {isCreatingSmartWallet
                      ? 'Creating smart wallet...'
                      : hasExistingSmartWallet
                        ? 'Smart wallet already exists'
                        : 'Create smart wallet'}
                  </button>
                ) : null}
              </>
            ) : (
              <button onClick={handleLogin} type="button">
                Connect with Privy
              </button>
            )
          ) : null}
        </div>
      </header>

      {missingConfig ? (
        <div className="deframe-host-warning">
          Please provide VITE_APP_DEFRAME_API_URL and VITE_APP_DEFRAME_API_KEY.
        </div>
      ) : null}

      <section className="deframe-widget-card">
        <DeframeProvider config={config} processBytecode={processBytecode}>
          <EarnWidget autoHeight onRouteChange={routeNavigate} />
        </DeframeProvider>
      </section>

      <section className="deframe-log-card" aria-live="polite">
        {txLogs.length === 0 ? (
          <p>No tx status updates yet.</p>
        ) : (
          txLogs.map((entry) => <p key={entry}>{entry}</p>)
        )}
      </section>

      <section className="deframe-state-card">Current route: {routeName}</section>
    </section>
  )
}

export default EarnWidgetHost
