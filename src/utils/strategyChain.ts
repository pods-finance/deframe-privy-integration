export interface StrategyChainFields {
  chain?: unknown
  network?: unknown
}

function normalizeChainLabel(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value)
  return undefined
}

export function getStrategyChainLabel(s: StrategyChainFields): string {
  return normalizeChainLabel(s.chain) ?? normalizeChainLabel(s.network) ?? ''
}

export function isOndoBscStrategy(s: StrategyChainFields & { protocol?: string }): boolean {
  if (s.protocol?.toLowerCase() !== 'ondo') return false
  return getStrategyChainLabel(s).toLowerCase() === 'bsc'
}

export function isSolanaStrategy(s: StrategyChainFields): boolean {
  return getStrategyChainLabel(s).toLowerCase() === 'solana'
}

export function isStellarStrategy(s: StrategyChainFields): boolean {
  const label = getStrategyChainLabel(s).toLowerCase()
  return label === 'stellar' || label.includes('stellar')
}
