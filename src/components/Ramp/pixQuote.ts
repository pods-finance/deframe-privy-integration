import { formatUnits } from 'viem'
import { asRecord, deframeApiHeaders, deframeApiUrl, parseResponseBody, readString } from './rampApi'
import { TOKENS } from './rampRoutes'

export const PIX_TEST_SAFE = '0xBDFfcEF09a027BfA147E11D2e240853914Fc210a'

export const pixAssets = [
  { label: 'USDC · Gnosis', chain: 'gnosis', token: TOKENS.usdc.gnosis, symbol: 'USDC', offramp: false },
  { label: 'USDT0 · Stable', chain: 'stable', token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', symbol: 'USDT0', offramp: true },
  { label: 'USDC · Base', chain: 'base', token: TOKENS.usdc.base, symbol: 'USDC', offramp: true },
]

export async function getPixQuote(onramp: boolean, asset: typeof pixAssets[number], amountIn: string, wallet: string) {
  const params = new URLSearchParams({
    preferredProvider: 'pods', amountIn,
    originChain: onramp ? 'fiat' : asset.chain, tokenIn: onramp ? 'BRL' : asset.token,
    destinationChain: onramp ? asset.chain : 'fiat', tokenOut: onramp ? asset.token : 'BRL',
    [onramp ? 'destinationAddress' : 'originAddress']: wallet,
  })
  const preview = import.meta.env.VITE_PIX_PREVIEW === '3364'
  const url = preview ? new URL('/preview-3364-quote', window.location.origin) : deframeApiUrl('/v2/swap/quote')
  url.search = params.toString()
  const headers = preview ? { 'x-preview-quote': '3364' } : deframeApiHeaders()
  const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(60000) })
  const body = asRecord(await parseResponseBody(response))
  const quote = asRecord(body?.quote)
  if (!response.ok || !quote) throw Error(readString(asRecord(body?.error)?.message) ?? readString(body?.error) ?? 'Could not prepare a Pix quote.')
  const output = asRecord(quote.tokenOut)
  const amount = readString(output?.amount)
  const symbol = onramp ? asset.symbol : 'BRL'
  if (!amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n || output?.symbol !== symbol) throw Error('The quote did not include the expected output.')
  const instructions = asRecord(body?.paymentInstructions)
  const code = readString(asRecord(instructions?.pix)?.copyPaste)
  if (onramp && !code) throw Error('Avenia did not return a Pix payment code. Request a fresh quote.')
  const ticketEnd = readString(instructions?.expiresAt)
  const expires = Math.min(Number(quote.deadline) * 1000, ticketEnd ? Date.parse(ticketEnd) : Infinity)
  if (!Number.isFinite(expires) || expires <= Date.now()) throw Error('Quote expired. Request a fresh quote.')
  return { credit: formatUnits(BigInt(amount), onramp ? 6 : 2) + ' ' + symbol, expires, code }
}
