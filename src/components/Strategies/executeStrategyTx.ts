/**
 * Executes Deframe strategy bytecode as EVM (smart wallet), SVM (Solana), or Stellar transactions.
 */

import type { ConnectedStandardSolanaWallet } from '@privy-io/react-auth/solana'
import {
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'
import { Transaction as SolanaTransaction, VersionedTransaction } from '@solana/web3.js'

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
  /** Solana: base64-encoded serialized transaction; Stellar: unsigned XDR (optional) */
  transaction?: string
  /** Stellar unsigned XDR (optional alternate field) */
  xdr?: string
}

export type WalletEnvironment = 'EVM' | 'SVM' | 'STELLAR'

export interface EvmExecutorDeps {
  getClientForChain: (params: { id: number }) => Promise<unknown>
}

export interface SolanaExecutorDeps {
  signAndSendTransaction: (
    input: {
      transaction: Uint8Array
      wallet: ConnectedStandardSolanaWallet
      chain?: string
      options?: { skipPreflight?: boolean }
    }
  ) => Promise<{ signature: Uint8Array }>
  solanaWallet?: ConnectedStandardSolanaWallet | null
}

export interface StellarExecutorDeps {
  signRawHash: (input: {
    address: string
    chainType: 'stellar'
    hash: `0x${string}`
  }) => Promise<{ signature: `0x${string}` }>
  stellarAddress: string
  /** Defaults to public Horizon mainnet */
  horizonUrl?: string
  networkPassphrase?: string
}

const DEFAULT_STELLAR_HORIZON_URL = 'https://horizon.stellar.org'

/** Normalizes base64 (handles URL-safe and padding) for atob. */
function normalizeBase64(str: string): string {
  const replaced = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (replaced.length % 4)) % 4
  return replaced + '='.repeat(pad)
}

/**
 * Decode a base64 Solana wire transaction (e.g. Jupiter) without mutating bytes.
 * Prefer {@link VersionedTransaction.deserialize} — legacy {@link SolanaTransaction} wire
 * format is handled only as fallback; passing wrong parser causes signature verify failures on-chain.
 */
function extractSolanaTransaction(
  resp: DeframeBytecodeResponse
): Uint8Array | null {
  const raw = resp.transaction

  if (!raw || typeof raw !== 'string') return null

  try {
    const base64 = raw.includes('+') || raw.includes('/') ? raw : normalizeBase64(raw.trim())
    const buf = Buffer.from(base64, 'base64')
    try {
      VersionedTransaction.deserialize(buf)
    } catch {
      SolanaTransaction.from(buf)
    }
    // Preserve exact Jupiter / builder bytes — do not re-serialize (avoids canonicalization drift)
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

function extractStellarXdr(resp: DeframeBytecodeResponse): string | null {
  if (typeof resp.xdr === 'string' && resp.xdr.trim()) return resp.xdr.trim()
  if (typeof resp.transaction === 'string' && resp.transaction.trim()) {
    return resp.transaction.trim()
  }
  return null
}

function toHexHash(hashBytes: Buffer | Uint8Array): `0x${string}` {
  return `0x${Buffer.from(hashBytes).toString('hex')}` as `0x${string}`
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
  if (!solanaWallet || typeof solanaWallet.address !== 'string') {
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

export async function executeStellarBytecode(
  resp: DeframeBytecodeResponse,
  deps: StellarExecutorDeps
): Promise<{ hash: string; result: Horizon.HorizonApi.SubmitTransactionResponse }> {
  const {
    signRawHash,
    stellarAddress,
    horizonUrl = import.meta.env.VITE_APP_STELLAR_HORIZON_URL || DEFAULT_STELLAR_HORIZON_URL,
    networkPassphrase = Networks.PUBLIC,
  } = deps

  if (!stellarAddress) {
    throw new Error('Stellar wallet not connected')
  }

  const unsignedXdr = extractStellarXdr(resp)
  if (!unsignedXdr) {
    throw new Error(
      'Could not extract Stellar XDR from bytecode response (expected `xdr` or `transaction`).'
    )
  }

  const parsed = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase)
  if (parsed instanceof FeeBumpTransaction) {
    throw new Error('Fee-bump Stellar transactions are not supported yet')
  }

  const tx = parsed as Transaction
  const hashHex = toHexHash(tx.hash())

  const { signature } = await signRawHash({
    address: stellarAddress,
    chainType: 'stellar',
    hash: hashHex,
  })

  const signatureBytes = Buffer.from(signature.replace(/^0x/, ''), 'hex')
  tx.signatures.push(
    new xdr.DecoratedSignature({
      hint: Keypair.fromPublicKey(stellarAddress).signatureHint(),
      signature: signatureBytes,
    })
  )

  const server = new Horizon.Server(horizonUrl)
  const result = await server.submitTransaction(tx)
  return { hash: result.hash, result }
}

export async function executeStrategyTx(
  resp: DeframeBytecodeResponse,
  walletEnvironment: WalletEnvironment,
  evmDeps: EvmExecutorDeps,
  solanaDeps: SolanaExecutorDeps,
  stellarDeps?: StellarExecutorDeps
): Promise<unknown> {
  if (walletEnvironment === 'SVM') {
    return executeSolanaBytecode(resp, solanaDeps)
  }
  if (walletEnvironment === 'STELLAR') {
    if (!stellarDeps) {
      throw new Error('Stellar executor deps required')
    }
    return executeStellarBytecode(resp, stellarDeps)
  }
  return executeEvmBytecode(resp, evmDeps)
}
