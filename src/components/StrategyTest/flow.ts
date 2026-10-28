import { encodeFunctionData, erc20Abi, getAddress, isAddress, zeroAddress } from 'viem'
import type { Address, Hex } from 'viem'

export type SettlementMode = 'direct' | 'depositAddress'
export type Scenario = 'cross-deposit' | 'same-withdraw' | 'same-deposit' | 'cross-withdraw'
export const scenarios: { id: Scenario; label: string }[] = [
  { id: 'cross-deposit', label: '1. Deposit from Arbitrum' },
  { id: 'same-withdraw', label: '2. Withdraw on strategy chain' },
  { id: 'same-deposit', label: '3. Deposit on strategy chain' },
  { id: 'cross-withdraw', label: '4. Withdraw to Arbitrum' },
]
export const protocols = {
  Aave: { strategyId: '67904d5061866a32dd2d39ed', chainId: 137, chain: 'polygon', token: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' },
  Morpho: { strategyId: '6a35a1b26639a6235e83244a', chainId: 8453, chain: 'base', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
} as const
export type Protocol = keyof typeof protocols
export const arbitrumUsdc = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
export interface ApiConfig { baseUrl: string; apiKey: string }
export interface Intent {
  strategyId: string
  wallet: Address
  action: 'lend' | 'withdraw'
  amount: string
  sourceChainId: number
  sourceToken: Address
  destinationChainId: number
  mode: SettlementMode
}
export interface Call { to: Address; data: Hex; value: bigint }
export interface Prepared {
  id: string
  intent: Intent
  calls: Call[]
  expiresAt: number
  preparedAt: number
  responseMs: number
  depositAddress?: Address
  response: Record<string, unknown>
}
export interface JournalEntry {
  id: string
  api: string
  intent: Intent
  attemptedAt: string
  userOperationHash?: Hex
  transactionHash?: Hex
  status: string
}

export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object from the API')
  return value as Record<string, unknown>
}
export function rawAmount(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || BigInt(value) >= 2n ** 256n) throw new Error('Enter a positive amount in raw token units (2 USDC = 2000000)')
  return value
}
export function address(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) throw new Error('Invalid EVM address')
  return getAddress(value)
}
function equalAddress(a: unknown, b: string): boolean { return address(a).toLowerCase() === b.toLowerCase() }
function chain(value: unknown): number {
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new Error('Invalid chain ID')
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid chain ID')
  return id
}
export function makeIntent(protocol: Protocol, scenario: Scenario, mode: SettlementMode, wallet: string, amount: string): Intent {
  const preset = protocols[protocol]
  const isDeposit = scenario.endsWith('deposit')
  if (address(wallet) === zeroAddress) throw new Error('Connect a funded wallet')
  return {
    strategyId: preset.strategyId, wallet: address(wallet), amount: rawAmount(amount.trim()),
    action: isDeposit ? 'lend' : 'withdraw',
    sourceChainId: scenario === 'cross-deposit' ? 42161 : preset.chainId,
    sourceToken: address(scenario === 'cross-deposit' ? arbitrumUsdc : preset.token),
    destinationChainId: scenario === 'cross-withdraw' ? 42161 : preset.chainId,
    mode: isDeposit ? mode : 'direct',
  }
}
export function bytecodePath(intent: Intent): string {
  const query = new URLSearchParams({ action: intent.action, wallet: intent.wallet, destinationAddress: intent.wallet, amount: intent.amount, settlementMode: intent.mode })
  if (intent.action === 'lend') {
    query.set('fromChainId', String(intent.sourceChainId))
    query.set('fromTokenAddress', intent.sourceToken)
  } else {
    query.set('withdrawAll', 'false')
    if (intent.destinationChainId !== intent.sourceChainId) {
      query.set('toChainId', String(intent.destinationChainId))
      query.set('toTokenAddress', arbitrumUsdc)
    }
  }
  return `/strategies/${encodeURIComponent(intent.strategyId)}/bytecode?${query.toString()}`
}

export function parsePrepared(value: unknown, intent: Intent, startedAt: number, now = Date.now()): Prepared {
  const response = record(value)
  if (typeof response.id !== 'string' || !/^[a-f\d]{24}$/i.test(response.id)) throw new Error('Missing valid Action ID')
  if (response.previewOnly) throw new Error('Preview-only quotes cannot be submitted')
  if (response.chainIdIn != null && chain(response.chainIdIn) !== intent.sourceChainId) throw new Error('Response source chain mismatch')
  if (response.chainIdOut != null && chain(response.chainIdOut) !== intent.destinationChainId) throw new Error('Response destination chain mismatch')
  if (response.originAddress != null && !equalAddress(response.originAddress, intent.wallet)) throw new Error('Response origin differs from connected wallet')
  if (response.destinationAddress != null && !equalAddress(response.destinationAddress, intent.wallet)) throw new Error('Response recipient differs from connected wallet')
  const quote = response.quote == null ? undefined : record(response.quote)
  if (quote?.originAddress != null && !equalAddress(quote.originAddress, intent.wallet)) throw new Error('Quote origin differs from connected wallet')
  if (quote?.destinationAddress != null && !equalAddress(quote.destinationAddress, intent.wallet)) throw new Error('Quote recipient differs from connected wallet')
  // Keep even legacy responses without deadlines short-lived. The API remains
  // responsible for enforcing accepted terms during downstream settlement.
  let expiresAt = startedAt + 120_000
  if (quote?.deadline != null) {
    const deadline = Number(quote.deadline) * 1000
    if (!Number.isFinite(deadline) || deadline <= now) throw new Error('Quote has expired')
    expiresAt = Math.min(expiresAt, deadline)
  }
  if (expiresAt <= now) throw new Error('Preparation took too long; request fresh terms')
  let depositAddress: Address | undefined
  let calls: Call[]
  if (intent.mode === 'depositAddress') {
    const funding = record(response.depositInstructions)
    depositAddress = address(response.depositAddress)
    if (depositAddress === zeroAddress || equalAddress(depositAddress, intent.wallet)) throw new Error('Invalid deposit address')
    if (!equalAddress(funding.to, depositAddress) || !equalAddress(funding.tokenAddress, intent.sourceToken) ||
        chain(funding.chainId) !== intent.sourceChainId || rawAmount(funding.amountRaw) !== intent.amount) {
      throw new Error('Funding instructions do not match the requested token, chain, amount and deposit address')
    }
    if (chain(response.chainId) !== intent.sourceChainId || !equalAddress(response.tokenAddress, intent.sourceToken) ||
        !equalAddress(response.destinationAddress, intent.wallet)) throw new Error('Deposit response binding mismatch')
    if ([response.bytecode, response.transactionData].some(value => Array.isArray(value) && value.length > 0)) throw new Error('Ambiguous deposit response: both funding instructions and bytecode')
    const native = [zeroAddress, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'].includes(intent.sourceToken.toLowerCase())
    calls = native
      ? [{ to: depositAddress, value: BigInt(intent.amount), data: '0x' }]
      : [{ to: intent.sourceToken, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [depositAddress, BigInt(intent.amount)] }) }]
  } else {
    if (!Array.isArray(response.bytecode) || response.bytecode.length === 0) throw new Error('No executable bytecode returned')
    calls = response.bytecode.map((item: unknown) => {
      const tx = record(item)
      if (chain(tx.chainId) !== intent.sourceChainId) throw new Error('Mixed or unexpected source chain in bytecode')
      if (tx.operationType != null && tx.operationType !== 0 && tx.operationType !== '0') throw new Error('Delegate calls are not supported')
      if (typeof tx.data !== 'string' || !/^0x(?:[a-f\d]{2})*$/i.test(tx.data)) throw new Error('Invalid transaction data')
      if (typeof tx.value !== 'string' || !/^(0|[1-9]\d*)$/.test(tx.value) || BigInt(tx.value) >= 2n ** 256n) throw new Error('Invalid transaction value')
      return { to: address(tx.to), data: tx.data as Hex, value: BigInt(tx.value) }
    })
  }
  return { id: response.id, intent: { ...intent }, calls, depositAddress, expiresAt, preparedAt: now, responseMs: now - startedAt, response }
}

export function assertReady(prepared: Prepared, wallet: string, now = Date.now()): void {
  if (!equalAddress(wallet, prepared.intent.wallet)) throw new Error('Connected wallet changed; prepare again')
  if (now + 10_000 >= prepared.expiresAt) throw new Error('Prepared request expired or is too close to expiry; prepare again')
}
export function normalizeApi(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an API origin without a path or credentials')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('API URL must use HTTPS (or local HTTP)')
  return url.origin
}
export async function requestApi(config: ApiConfig, path: string, signal?: AbortSignal): Promise<unknown> {
  if (!config.apiKey.trim()) throw new Error('Enter this environment’s customer API key')
  const response = await fetch(new URL(path, normalizeApi(config.baseUrl)), {
    cache: 'no-store',
    redirect: 'error',
    headers: { 'x-api-key': config.apiKey.trim() },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Deframe returned HTTP ${String(response.status)}. Check customer access, balance, capacity and route availability.`)
  return response.json() as Promise<unknown>
}
export const terminalStatuses = new Set(['SUCCESS', 'FAILED', 'REFUND_REQUIRED', 'REFUNDED', 'EXPIRED'])
