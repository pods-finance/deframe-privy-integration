/**
 * Executes Deframe strategy bytecode as EVM (smart wallet) or SVM (Solana) transactions.
 */

export interface DeframeEvmBytecode {
  to: string
  value: string
  data: string
  chainId: string
}

export interface DeframeBytecodeResponse {
  feeCharged: string
  metadata: {
    isCrossChain: boolean
    isSameChainSwap: boolean
    crossChainQuoteId: string
  }
  bytecode: DeframeEvmBytecode[]
  /** Solana: base64-encoded serialized transaction (optional) */
  transaction?: string
}

export type WalletEnvironment = 'EVM' | 'SVM'

export interface EvmExecutorDeps {
  getClientForChain: (params: { id: number }) => Promise<unknown>
}

export interface SolanaExecutorDeps {
  signAndSendTransaction: (
    input: {
      transaction: Uint8Array
      wallet: object
      chain?: string
      options?: { skipPreflight?: boolean }
    }
  ) => Promise<{ signature: Uint8Array }>
  solanaWallet: object | null
}

/** Normalizes base64 (handles URL-safe and padding) for atob. */
function normalizeBase64(str: string): string {
  const replaced = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (replaced.length % 4)) % 4
  return replaced + '='.repeat(pad)
}

function extractSolanaTransaction(
  resp: DeframeBytecodeResponse
): Uint8Array | null {
  const raw = resp.transaction

  if (!raw || typeof raw !== 'string') return null

  try {
    const base64 = raw.includes('+') || raw.includes('/') ? raw : normalizeBase64(raw)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

export async function executeEvmBytecode(
  resp: DeframeBytecodeResponse,
  deps: EvmExecutorDeps
): Promise<unknown> {
  const { getClientForChain } = deps
  const first = resp.bytecode[0]

  const chainId = Number(first.chainId)
  const chainClient = await getClientForChain({ id: chainId })
  if (!chainClient) throw new Error('Chain client not found')

  const calls = resp.bytecode.map((b) => ({
    to: b.to as `0x${string}`,
    data: b.data as `0x${string}`,
    value: BigInt(b.value),
  }))

  const tx = await (chainClient as { sendTransaction: (p: { calls: unknown[] }) => Promise<unknown> }).sendTransaction({
    calls,
  })
  return tx
}

export async function executeSolanaBytecode(
  resp: DeframeBytecodeResponse,
  deps: SolanaExecutorDeps
): Promise<{ signature: Uint8Array }> {
  const { signAndSendTransaction, solanaWallet } = deps
  if (
    !solanaWallet ||
    typeof (solanaWallet as { address?: string }).address !== 'string'
  ) {
    throw new Error('Solana wallet not connected')
  }

  const transaction = extractSolanaTransaction(resp)
  if (!transaction) {
    throw new Error(
      'Could not extract Solana transaction from bytecode response. The Deframe API may return a different format for Solana strategies.'
    )
  }

  const result = await signAndSendTransaction({
    transaction,
    wallet: solanaWallet,
    chain: 'solana:mainnet',
    options: { skipPreflight: true },
  })
  return result
}

export async function executeStrategyTx(
  resp: DeframeBytecodeResponse,
  walletEnvironment: WalletEnvironment,
  evmDeps: EvmExecutorDeps,
  solanaDeps: SolanaExecutorDeps
): Promise<unknown> {
  if (walletEnvironment === 'SVM') {
    return executeSolanaBytecode(resp, solanaDeps)
  }
  return executeEvmBytecode(resp, evmDeps)
}
