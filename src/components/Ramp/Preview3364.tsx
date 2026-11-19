import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { isAddress } from 'viem'
import { PIX_TEST_SAFE } from './pixQuote'
import { TOKENS } from './rampRoutes'

const sources = [
  { label: 'Pix BRL', chain: 'fiat', token: 'BRL', amount: '100' },
  { label: 'BRLA · Polygon', chain: 'polygon', token: TOKENS.brla.polygon, amount: '1000000000000000000' },
  { label: 'BRS · Base', chain: 'base', token: '0x0000006238e3C7797Ae71827da303560bae1B125', amount: '1000000' },
]
const destinations = [
  { label: 'USDC · Gnosis', chain: 'gnosis', token: TOKENS.usdc.gnosis },
  { label: 'USDT0 · Stable', chain: 'stable', token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' },
]
const preview = 'https://pr-3364.preview.pods.finance'

export default function Preview3364() {
  const { ready, authenticated, login } = usePrivy()
  const { client } = useSmartWallets()
  const [wallet, setWallet] = useState<string>(PIX_TEST_SAFE)
  const [pending, setPending] = useState('')
  const [responses, setResponses] = useState<Record<string, string>>({})
  async function quote(id: string, params: URLSearchParams) {
    setPending(id)
    try {
      const response = await fetch('/preview-3364-quote?' + params.toString(), {
        headers: { 'x-preview-quote': '3364' },
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
      <nav aria-label="Preview tools" className="flex gap-2"><a className="ui-btn-tab ui-btn-tab-active" aria-current="page" href="/pr-3364">Bridge quotes</a><a className="ui-btn-tab" href="/pr-3364/pix">Pix ramps</a></nav>
      <h1 className="ui-heading-section">BRL → USD preview quotes</h1>
      <p>PR #3364 · One unit per input. Each click requests a fresh five-minute quote. Pix can return unpaid payment instructions.</p>
      <label>Pix destination wallet (BRL KYC)
        <input className="ui-input w-full" value={wallet} onChange={event => { setWallet(event.target.value.trim()) }} />
      </label>
      <div>{authenticated
        ? <button className="ui-btn-tab" disabled={!client?.account.address} onClick={() => { if (client) setWallet(client.account.address) }}>Use connected Privy smart wallet</button>
        : <button className="ui-btn-tab" disabled={!ready} onClick={() => { login() }}>Connect Privy wallet</button>}</div>
      {sources.flatMap(source => destinations.map(destination => {
        const id = source.chain + '-' + destination.chain
        const pix = source.chain === 'fiat'
        const params = new URLSearchParams({ originChain: source.chain, tokenIn: source.token, amountIn: source.amount,
          destinationChain: destination.chain, tokenOut: destination.token, preferredProvider: 'pods' })
        if (pix) params.set('destinationAddress', wallet)
        return <section key={id} className="ui-panel-shell p-5">
          <h2>1 {source.label} → {destination.label}</h2>
          <button className="ui-btn-tab" disabled={Boolean(pending) || (pix && !isAddress(wallet))} onClick={() => void quote(id, params)}>{pending === id ? 'Requesting…' : 'Get quote'}</button>
          <details><summary>Request</summary><code className="break-all">GET {preview}/v2/swap/quote?{params.toString()}</code></details>
          {responses[id] && <pre className="overflow-auto max-h-80" aria-live="polite">{responses[id]}</pre>}
        </section>
      }))}
    </section>
  </main>
}
