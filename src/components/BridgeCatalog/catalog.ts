import snapshot from './catalog.json'

export const assets: Record<string, { chain: string; contract: string; decimals: number }> = snapshot.assets
export function label(key: string) {
  const [chain, token] = key.split('/')
  return chain === 'fiat' ? (token === 'BRL' ? 'Pix BRL' : 'USD bank') : token + ' · ' + chain
}

function family(from: string, to: string, provider: string) {
  const ends = [from, to]
  if (ends.includes('fiat/BRL')) return 'Pix'
  if (ends.includes('fiat/USD')) return 'USD bank'
  if (from === 'stellar/USDC') return 'Stellar CCTP'
  if (provider === 'cctp') return 'Circle CCTP'
  const tokens = ends.map(key => key.split('/')[1])
  if (tokens.every(token => token === 'USDC')) return 'USDC inventory'
  if (tokens.every(token => token === 'BRLA' || token === 'BRS')) return 'BRL token parity'
  if (tokens.every(token => token === 'USDC' || token === 'USDT0')) return 'USD token parity'
  if (tokens.includes('BRLA') || tokens.includes('BRS')) return 'BRL ↔ USD tokens'
  return 'Specialist markets'
}

export const selections = snapshot.selections.map(id => {
  const [from, to, provider, method] = id.split(' ')
  const rampProvider = method === '-' ? undefined : provider
  const swapProvider = provider === 'cctp' ? 'cctp' : 'pods'
  return { id, from, to, provider, method, rampProvider, swapProvider, family: family(from, to, provider) }
})
export type Selection = typeof selections[number]

export function quoteParams(row: Selection, amountIn: string) {
  const source = assets[row.from]
  const target = assets[row.to]
  const params = new URLSearchParams({ originChain: source.chain, tokenIn: source.contract, destinationChain: target.chain, tokenOut: target.contract, amountIn, preferredProvider: row.swapProvider })
  if (row.rampProvider) params.set('rampProvider', row.rampProvider)
  if (row.method === 'ACH' || row.method === 'WIRE') params.set('usdPaymentMethod', row.method)
  return params
}
