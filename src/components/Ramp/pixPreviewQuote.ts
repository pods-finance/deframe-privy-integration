import { formatUnits } from 'viem'
import { asRecord, parseResponseBody, readString } from './rampApi'
import { TOKENS } from './rampRoutes'

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
  const response = await fetch('/preview-3364-quote?' + params.toString(), { headers: { 'x-preview-quote': '3364' }, cache: 'no-store', signal: AbortSignal.timeout(60000) })
  const body = asRecord(await parseResponseBody(response))
  const quote = asRecord(body?.quote)
  if (!response.ok || !quote) throw Error(readString(asRecord(body?.error)?.message) ?? readString(body?.error) ?? 'The preview could not prepare a quote.')
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
