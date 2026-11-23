import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { formatUnits, isAddress, zeroAddress } from 'viem'
import { PIX_TEST_SAFE } from './pixQuote'
import { humanToRaw, TOKENS } from './rampRoutes'
import type { SwapQuote } from '../Swap/useSwap'

const brlSources = [
  { label: 'Pix BRL', chain: 'fiat', token: 'BRL', amount: '100' },
  { label: 'BRLA · Polygon', chain: 'polygon', token: TOKENS.brla.polygon, amount: '1000000000000000000' },
  { label: 'BRS · Base', chain: 'base', token: '0x0000006238e3C7797Ae71827da303560bae1B125', amount: '1000000' },
]
const usdAssets = [
  { label: 'USDC · Gnosis', chain: 'gnosis', token: TOKENS.usdc.gnosis },
  { label: 'USDT0 · Stable', chain: 'stable', token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' },
]
const reverse = window.location.pathname !== '/pr-3500/forward'
const pr = '3500'
const sources = reverse ? usdAssets.map(asset => ({ ...asset, amount: '2000000' })) : brlSources
const destinations = reverse ? brlSources.filter(asset => asset.chain !== 'fiat') : usdAssets
const preview = `https://pr-${pr}.preview.pods.finance`

export default function Preview3364() {
  const { ready, authenticated, login } = usePrivy()
  const { client } = useSmartWallets()
  const [wallet, setWallet] = useState<string>(PIX_TEST_SAFE)
  const [pending, setPending] = useState('')
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [depositAmount, setDepositAmount] = useState('1')
  const [instructions, setInstructions] = useState<{ route: string, address: string, amount: string, output: string, deadline: Date, quoteId: string }>()
  const depositRaw = /^\d+(\.\d{1,6})?$/.test(depositAmount) ? humanToRaw(depositAmount, 6) : null
  async function getDeposit(source: typeof sources[number], destination: typeof destinations[number]) {
    if (!depositRaw || BigInt(depositRaw) <= 0n) return
    const id = source.chain + '-' + destination.chain
    setInstructions(undefined)
    setPending(id)
    try {
      const params = new URLSearchParams({ originChain: source.chain, tokenIn: source.token, amountIn: depositRaw,
        destinationChain: destination.chain, tokenOut: destination.token, originAddress: PIX_TEST_SAFE, destinationAddress: PIX_TEST_SAFE, preferredProvider: 'pods' })
      const res = await fetch(`/preview-${pr}-quote?` + params.toString(), { headers: { 'x-preview-quote': pr }, cache: 'no-store', signal: AbortSignal.timeout(60000) })
      const data = await res.json() as { error?: { message?: string }, depositAddress?: string, quote: SwapQuote & { id: string, depositAddress?: string, originAddress?: string, destinationAddress?: string } }
      if (!res.ok) throw Error(data.error?.message ?? 'Deposit quote failed')
      const q = data.quote
      const address = data.depositAddress ?? q.depositAddress
      const deadline = new Date(Number(q.deadline) * 1000)
      if (!address || !isAddress(address) || address === zeroAddress || (data.depositAddress && q.depositAddress && data.depositAddress.toLowerCase() !== q.depositAddress.toLowerCase())
        || q.originAddress?.toLowerCase() !== PIX_TEST_SAFE.toLowerCase() || q.destinationAddress?.toLowerCase() !== PIX_TEST_SAFE.toLowerCase()
        || !['deframe', 'pods'].includes(q.provider) || !q.id || q.originChain !== source.chain || q.destinationChain !== destination.chain
        || q.tokenIn.contract.toLowerCase() !== source.token.toLowerCase() || q.tokenOut.contract.toLowerCase() !== destination.token.toLowerCase()
        || q.tokenIn.amount !== depositRaw || BigInt(q.tokenOut.amount) <= 0n || !(deadline.getTime() > Date.now())) throw Error('The preview did not return matching deposit instructions.')
      setInstructions({ route: id, address, amount: depositAmount, deadline, quoteId: q.id, output: formatUnits(BigInt(q.tokenOut.amount), q.tokenOut.decimals) })
      setResponses(previous => ({ ...previous, [id]: '' }))
    } catch (e) {
      setResponses(previous => ({ ...previous, [id]: e instanceof Error ? e.message : 'Deposit quote failed' }))
    } finally { setPending('') }
  }
  async function quote(id: string, params: URLSearchParams) {
    setPending(id)
    try {
      const response = await fetch(`/preview-${pr}-quote?` + params.toString(), {
        headers: { 'x-preview-quote': pr },
        signal: AbortSignal.timeout(60000),
      })
      const body = await response.text()
      let formatted = body
      try { formatted = JSON.stringify(JSON.parse(body), null, 2) } catch { /* Retain the upstream error text. */ }
      setResponses(previous => ({ ...previous, [id]: 'HTTP ' + String(response.status) + '\n' + formatted }))
    } catch (e) {
      setResponses(previous => ({ ...previous, [id]: e instanceof Error ? e.message : 'Request failed' }))
    } finally { setPending('') }
  }
  return <main className="ui-page ui-surface-warm min-h-screen py-10">
    <section className="ui-container flex flex-col gap-5">
      <nav aria-label="Preview tools" className="flex gap-2"><a className="ui-btn-tab" href="/pr-3500">USD → BRL quotes</a><a className="ui-btn-tab" href="/pr-3500/forward">BRL → USD quotes</a><a className="ui-btn-tab" href={`/pr-${pr}/swap`}>Bridge swap</a><a className="ui-btn-tab" href="/pr-3500/pix">Pix ramps</a><a className="ui-btn-tab" href="/pr-3500/ramp">Ramp catalog</a><a className="ui-btn-tab" href="/pr-3500/custom">Custom swap</a></nav>
      <h1 className="ui-heading-section">{reverse ? 'USD → BRL' : 'BRL → USD'} preview quotes</h1>
      {reverse ? <p>PR #3500 · Each quote uses 2 units of the input token.</p> : <><p>PR #3500 · One unit per input. Each click requests a fresh five-minute quote. Pix can return unpaid payment instructions.</p>
      <label>Pix destination wallet (BRL KYC)
        <input className="ui-input w-full" value={wallet} onChange={event => { setWallet(event.target.value.trim()) }} />
      </label>
      <div>{authenticated
        ? <button className="ui-btn-tab" disabled={!client?.account.address} onClick={() => { if (client) setWallet(client.account.address) }}>Use connected Privy smart wallet</button>
        : <button className="ui-btn-tab" disabled={!ready} onClick={() => { login() }}>Connect Privy wallet</button>}</div></>}
      {reverse && <label className="ui-label">Deposit amount from Safe {PIX_TEST_SAFE}
        <input className="ui-input" inputMode="decimal" value={depositAmount} disabled={Boolean(pending)} onChange={e => { setDepositAmount(e.target.value); setInstructions(undefined) }} />
      </label>}
      {sources.flatMap(source => destinations.map(destination => {
        const id = source.chain + '-' + destination.chain
        const pix = source.chain === 'fiat'
        const params = new URLSearchParams({ originChain: source.chain, tokenIn: source.token, amountIn: source.amount,
          destinationChain: destination.chain, tokenOut: destination.token, preferredProvider: 'pods' })
        if (pix) params.set('destinationAddress', wallet)
        return <section key={id} className="ui-panel-shell p-5">
          <h2>{reverse ? 2 : 1} {source.label} → {destination.label}</h2>
          <button className="ui-btn-tab" disabled={Boolean(pending) || (pix && !isAddress(wallet))} onClick={() => void quote(id, params)}>{pending === id ? 'Requesting…' : 'Get quote'}</button>
          {reverse && <button className="ui-btn-tab" disabled={Boolean(pending) || !depositRaw || BigInt(depositRaw) <= 0n} onClick={() => void getDeposit(source, destination)}>Get deposit address</button>}
          {instructions?.route === id && <div className="my-3 break-all" role="status">
            <p>Send {instructions.amount} {source.label} to <code>{instructions.address}</code>.</p>
            <p>Receive {instructions.output} {destination.label} at {PIX_TEST_SAFE}.</p>
            <p>Quote {instructions.quoteId} · Rate locked until {instructions.deadline.toLocaleString()}. Request a fresh deposit address if this time has passed.</p>
          </div>}
          <details><summary>Request</summary><code className="break-all">GET {preview}/v2/swap/quote?{params.toString()}</code></details>
          {responses[id] && <pre className="overflow-auto max-h-80" aria-live="polite">{responses[id]}</pre>}
        </section>
      }))}
    </section>
  </main>
}
