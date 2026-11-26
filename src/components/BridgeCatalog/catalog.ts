import reference from './catalog-3500.json'
import eurc from './catalog-3561.json'
import { previewPr } from '../../preview'

const catalogs: Record<string, typeof reference> = { '3500': reference, '3561': eurc }
export const catalogPr = Object.hasOwn(catalogs, previewPr) ? previewPr : '3500'
export const snapshot = catalogs[catalogPr]

export const assets: Record<string, { chain: string; contract: string; decimals: number }> = snapshot.assets
export function label(key: string) {
  const [chain, token] = key.split('/')
  return chain === 'fiat' ? (token === 'BRL' ? 'Pix BRL' : 'USD bank') : token + ' · ' + chain
}

function family(from: string, to: string, provider: string) {
  const ends = [from, to]
  if (ends.includes('fiat/BRL')) return 'Pix'
  if (ends.includes('fiat/USD')) return 'USD bank'
  if (ends.includes('base/EURC')) return 'EURC inventory'
  if (from === 'stellar/USDC') return 'Stellar CCTP'
  if (provider === 'cctp') return 'Circle CCTP'
  const tokens = ends.map(key => key.split('/')[1])
  const isReal = (token: string) => ['BRLA', 'BRS', 'BRZ', 'tBRL'].includes(token)
  const isDollar = (token: string) => token === 'USDC' || token === 'USDT0'
  if (tokens.every(token => token === 'USDC')) return 'USDC inventory'
  if (tokens.every(isReal)) return 'BRL token parity'
  if (tokens.every(isDollar)) return 'USD token parity'
  if (tokens.some(isReal) && tokens.some(isDollar)) return 'BRL ↔ USD tokens'
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
