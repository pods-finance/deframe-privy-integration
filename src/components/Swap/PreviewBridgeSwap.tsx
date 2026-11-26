import { quoteHeaders, testSafe } from '../../preview'
import { useEffect, useRef, useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { decodeFunctionData, erc20Abi, formatUnits, isAddress, isHex } from 'viem'
import { gnosisUsdc, stableUsdt0 } from '../Ramp/pixQuote'
import { humanToRaw, TOKENS } from '../Ramp/rampRoutes'
import { asRecord, parseResponseBody, readString } from '../Ramp/rampApi'
import type { SwapQuoteResponse } from './useSwap'

const brla = { symbol: 'BRLA', chain: 'polygon', id: 137, token: TOKENS.brla.polygon, decimals: 18 }
const brs = { symbol: 'BRS', chain: 'base', id: 8453, token: '0x0000006238e3C7797Ae71827da303560bae1B125', decimals: 6 }
const reverseRoutes = [
  { ...gnosisUsdc, id: 100, decimals: 6 },
  { ...stableUsdt0, id: 988, decimals: 6 },
].flatMap(from => [brla, brs].map(to => ({ from, to: { ...to, label: to.symbol + ' · ' + to.chain } })))
const routes = [...reverseRoutes,
  { from: brla, to: gnosisUsdc },
  { from: brla, to: stableUsdt0 },
  { from: brs, to: gnosisUsdc },
  { from: brs, to: stableUsdt0 },
]

async function prepare(route: typeof routes[number], amount: string, sender: string, recipient: string) {
  const { from, to } = route
  const search = new URLSearchParams({ originChain: from.chain, tokenIn: from.token, amountIn: amount,
    destinationChain: to.chain, tokenOut: to.token, originAddress: sender, destinationAddress: recipient, preferredProvider: 'pods' })
  const res = await fetch('/v2/swap/quote?' + search.toString(), { headers: quoteHeaders, cache: 'no-store', signal: AbortSignal.timeout(60000) })
  const body = await parseResponseBody(res)
  if (!res.ok) throw Error(readString(asRecord(asRecord(body)?.error)?.message) ?? 'Quote failed (HTTP ' + String(res.status) + ')')
  const { quote, chainId, transactionData } = body as SwapQuoteResponse
  if (quote.originChain !== from.chain || quote.destinationChain !== to.chain || quote.tokenIn.contract.toLowerCase() !== from.token.toLowerCase()
    || quote.tokenOut.contract.toLowerCase() !== to.token.toLowerCase() || quote.tokenIn.amount !== amount || !quote.quoteId
    || readString(quote.originAddress)?.toLowerCase() !== sender.toLowerCase() || readString(quote.destinationAddress)?.toLowerCase() !== recipient.toLowerCase()
    || !['pods', 'deframe'].includes(quote.provider) || BigInt(quote.tokenOut.amount) <= 0n || Number(chainId) !== from.id
    || !Array.isArray(transactionData) || !transactionData.length) throw Error('The API did not return the selected bridge swap.')
  const calls = transactionData.map(tx => {
    if (Number(tx.chainId) !== from.id || !isAddress(tx.to) || !isHex(tx.data) || BigInt(tx.value) !== 0n) throw Error('Unexpected origin transaction in quote.')
    return { to: tx.to, data: tx.data, value: 0n }
  })
  const transfer = decodeFunctionData({ abi: erc20Abi, data: calls[0].data })
  if (calls[0].to.toLowerCase() !== from.token.toLowerCase() || transfer.functionName !== 'transfer'
    || transfer.args[1] !== BigInt(amount)) throw Error('Funding transfer does not match the quoted token and amount.')
  const expires = Number(quote.deadline) * 1000
  if (!Number.isFinite(expires) || expires <= Date.now()) throw Error('Quote expired. Get a fresh quote.')
  return { quoteId: quote.quoteId, calls, expires, credit: formatUnits(BigInt(quote.tokenOut.amount), quote.tokenOut.decimals) }
}

function SwapForm({ wallet }: { wallet: string }) {
  const { getClientForChain } = useSmartWallets()
  const entry = new URLSearchParams(window.location.search)
  const [index, setIndex] = useState(() => Math.max(0, routes.findIndex(({ from, to }) => from.chain + '/' + from.symbol === entry.get('from') && to.chain + '/' + to.symbol === entry.get('to'))))
  const [amount, setAmount] = useState(entry.get('amount') ?? '1')
  const requestedRecipient = entry.get('recipient')
  const initialRecipient = testSafe && requestedRecipient?.toLowerCase() === testSafe.toLowerCase() ? testSafe : requestedRecipient && isAddress(requestedRecipient) && requestedRecipient.toLowerCase() !== wallet.toLowerCase() ? requestedRecipient : wallet
  const [recipient, setRecipient] = useState(initialRecipient)
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof prepare>>>()
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const [error, setError] = useState('')
  const [hash, setHash] = useState('')
  const sending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!quote) return
    const timer = window.setTimeout(() => { setExpired(true); }, Math.max(0, quote.expires - Date.now()))
    return () => { window.clearTimeout(timer); }
  }, [quote])
  const route = routes[index]
  const normalized = amount.trim().replace(',', '.')
  const raw = /^\d+(\.\d+)?$/.test(normalized) ? humanToRaw(normalized, route.from.decimals) : null
  function reset() { setQuote(undefined); setExpired(false); setHash(''); setError('') }
  async function getQuote() {
    if (!raw || raw === '0' || busy) return
    reset(); setBusy(true)
    try { setQuote(await prepare(route, raw, wallet, recipient)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare the swap.') }
    finally { setBusy(false) }
  }
  async function submit() {
    if (!quote || sending.current || busy || hash) return
    sending.current = true; setBusy(true); setError('')
    try {
      const signer = await getClientForChain({ id: route.from.id })
      if (!mounted.current) return
      if (signer?.account.address.toLowerCase() !== wallet.toLowerCase()) throw Error('Reconnect the quoted Privy wallet.')
      if (Date.now() >= quote.expires) throw Error('Quote expired. Get a fresh quote.')
      setHash(await signer.sendTransaction({ calls: quote.calls }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Wallet submission failed.') }
    finally { setBusy(false); sending.current = false }
  }
  return <section className="ui-panel-shell flex flex-col gap-4 p-6">
    <h2 className="ui-heading-section">Bridge swap</h2>
    <fieldset disabled={busy} onChange={reset} className="flex flex-col gap-3">
      <label className="ui-label">Route<select className="ui-select" value={index} onChange={e => { setIndex(Number(e.target.value)); }}>
        {routes.map(({ from, to }, i) => <option key={from.chain + '-' + to.chain} value={i}>{from.symbol} on {from.chain} → {to.label}</option>)}
      </select></label>
      <label className="ui-label">Amount ({route.from.symbol})<input className="ui-input" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); }} /></label>
      <p className="break-all">Funding wallet: {wallet}</p>
      <label className="ui-label">Receive on {route.to.chain}<select className="ui-select" value={recipient} onChange={e => { setRecipient(e.target.value); }}>
        {initialRecipient.toLowerCase() !== wallet.toLowerCase() && initialRecipient.toLowerCase() !== testSafe.toLowerCase() && <option value={initialRecipient}>Selected recipient · {initialRecipient}</option>}
        <option value={wallet}>My Privy wallet · {wallet}</option>
        {testSafe && wallet.toLowerCase() !== testSafe.toLowerCase() && <option value={testSafe}>Test Safe · {testSafe}</option>}
      </select></label>
    </fieldset>
    <button className="ui-btn-secondary" disabled={busy || !raw || raw === '0'} onClick={() => void getQuote()}>Get quote</button>
    {quote && <><p>You receive {quote.credit} {route.to.symbol} on {route.to.chain}.</p>
      <p className="break-all">Quote {quote.quoteId} · {expired ? 'Expired' : 'Valid until ' + new Date(quote.expires).toLocaleTimeString()}</p>
      {hash ? <p className="break-all" role="status">Origin transaction submitted: {hash}</p>
        : <button className="ui-btn-primary" disabled={busy || expired} onClick={() => void submit()}>Submit {amount} {route.from.symbol} swap</button>}
    </>}
    {error && <p role="alert" className="ui-text-error">{error}</p>}
  </section>
}

export default function PreviewBridgeSwap() {
  const { client } = useSmartWallets()
  const wallet = client?.account.address
  return wallet ? <SwapForm key={wallet} wallet={wallet} /> : <p role="status">Connect your Privy EVM smart wallet to swap.</p>
}
