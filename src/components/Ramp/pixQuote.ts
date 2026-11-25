import { formatUnits } from 'viem'
import { asRecord, deframeApiHeaders, deframeApiUrl, parseResponseBody, readString } from './rampApi'
import { assets } from '../BridgeCatalog/catalog'

export const PIX_TEST_SAFE = '0xBDFfcEF09a027BfA147E11D2e240853914Fc210a'
export const pixNativeWallets = {
  solana: '8wyqJTZkeqFD7Fu7Noc2NAHcepbMHca8apcxq37tH2hT',
  stellar: 'GBIBNJ7ABD6GHO6DCBW47RGPKGO3ZFXO4Y4AIMD5M3P4HL2BQ6USOR5M',
} as const

function pixAsset(chain: string, symbol: string, offramp = true) {
  const { contract: token, decimals } = assets[chain + '/' + symbol]
  const walletNetwork = chain === 'solana' || chain === 'stellar' ? chain : 'evm'
  return { label: symbol + ' · ' + chain[0].toUpperCase() + chain.slice(1), chain, token, symbol, decimals, offramp, walletNetwork } as const
}

export const gnosisUsdc = pixAsset('gnosis', 'USDC', false)
export const stableUsdt0 = pixAsset('stable', 'USDT0')
export const pixAssets = [
  gnosisUsdc, stableUsdt0, pixAsset('base', 'USDC'),
  pixAsset('solana', 'USDC'), pixAsset('solana', 'BRS'), pixAsset('stellar', 'USDC'),
]

export async function getPixQuote(onramp: boolean, asset: typeof pixAssets[number], amountIn: string, wallet: string) {
  const params = new URLSearchParams({
    preferredProvider: 'pods', amountIn,
    originChain: onramp ? 'fiat' : asset.chain, tokenIn: onramp ? 'BRL' : asset.token,
    destinationChain: onramp ? asset.chain : 'fiat', tokenOut: onramp ? asset.token : 'BRL',
    [onramp ? 'destinationAddress' : 'originAddress']: wallet,
  })
  if (asset.walletNetwork !== 'evm') params.set('rampProvider', 'avenia')
  const preview = import.meta.env.VITE_PIX_PREVIEW === '3500'
  const url = preview ? new URL('/preview-3500-quote', window.location.origin) : deframeApiUrl('/v2/swap/quote')
  url.search = params.toString()
  const headers = preview ? { 'x-preview-quote': '3500' } : deframeApiHeaders()
  const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(60000) })
  const body = asRecord(await parseResponseBody(response))
  const quote = asRecord(body?.quote)
  if (!response.ok || !quote) throw Error(readString(asRecord(body?.error)?.message) ?? readString(body?.error) ?? 'Could not prepare a Pix quote.')
  const output = asRecord(quote.tokenOut)
  const amount = readString(output?.amount)
  const symbol = onramp ? asset.symbol : 'BRL'
  const cryptoToken = onramp ? output : asRecord(quote.tokenIn)
  const echoedWallet = readString(onramp ? quote.destinationAddress : quote.originAddress)
  const sameAddress = (a: unknown, b: string) => typeof a === 'string' && (asset.walletNetwork === 'evm' ? a.toLowerCase() === b.toLowerCase() : a === b)
  if (quote.originChain !== params.get('originChain') || quote.destinationChain !== params.get('destinationChain') ||
    !sameAddress(echoedWallet, wallet) || !sameAddress(cryptoToken?.contract, asset.token) || cryptoToken?.decimals !== asset.decimals ||
    readString(asRecord(quote.tokenIn)?.amount) !== amountIn) throw Error('The quote did not match the selected wallet, asset, chain or amount.')
  if (!amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n || output?.symbol !== symbol) throw Error('The quote did not include the expected output.')
  const instructions = asRecord(body?.paymentInstructions)
  const code = readString(asRecord(instructions?.pix)?.copyPaste)
  if (onramp && !code) throw Error('Avenia did not return a Pix payment code. Request a fresh quote.')
  const ticketEnd = readString(instructions?.expiresAt)
  const expires = Math.min(Number(quote.deadline) * 1000, ticketEnd ? Date.parse(ticketEnd) : Infinity)
  if (!Number.isFinite(expires) || expires <= Date.now()) throw Error('Quote expired. Request a fresh quote.')
  return { credit: formatUnits(BigInt(amount), onramp ? asset.decimals : 2) + ' ' + symbol, expires, code }
}
