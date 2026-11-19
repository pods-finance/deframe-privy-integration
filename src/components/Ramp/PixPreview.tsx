import { useEffect, useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import QRCode from 'react-qr-code'
import { isAddress } from 'viem'
import { humanToRaw } from './rampRoutes'
import { getPixQuote, pixAssets } from './pixPreviewQuote'

function PixForm({ onramp, initialWallet }: { onramp: boolean, initialWallet: string }) {
  const assets = pixAssets.filter(a => onramp || a.offramp)
  const [token, setToken] = useState(assets[0].token)
  const asset = assets.find(a => a.token === token) ?? assets[0]
  const [wallet, setWallet] = useState(initialWallet)
  const [amount, setAmount] = useState('1')
  const [result, setResult] = useState<Awaited<ReturnType<typeof getPixQuote>>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!result) return
    const check = () => { setExpired(Date.now() >= result.expires) }
    const timer = window.setTimeout(check, Math.max(result.expires - Date.now(), 0))
    document.addEventListener('visibilitychange', check)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', check) }
  }, [result])
  const normalized = amount.trim().replace(',', '.')
  const raw = /^\d+(\.\d+)?$/.test(normalized) ? humanToRaw(normalized, onramp ? 2 : 6) : null
  async function prepare() {
    if (!raw || busy) return
    setError(''); setBusy(true); setCopied(false)
    try {
      const quote = await getPixQuote(onramp, asset, raw, wallet.trim())
      setExpired(false); setResult(quote)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate the quote.') }
    finally { setBusy(false) }
  }
  const code = result?.code
  return <section className="ui-panel-shell flex flex-col gap-5 p-6 sm:p-8">
    <h2 className="ui-heading-section">{onramp ? 'Pay with Pix' : 'Quote a Pix payout'}</h2>
    {result ? <>
      <div><p className="ui-label">You receive</p><p className="text-3xl font-semibold">{result.credit}</p></div>
      <p>{onramp ? 'Pay R$' + normalized : 'From ' + normalized + ' ' + asset.symbol} · {asset.label}</p>
      <p className="ui-label break-all">{onramp ? 'Receiving' : 'Funding'} wallet: {wallet}</p>
      {expired ? <p role="status">Quote expired. Generate a new quote.</p> : <>
        <p>Valid until {new Date(result.expires).toLocaleTimeString()}.</p>
        {onramp && code && <>
          <p>{code.startsWith('00020126sandbox-') ? 'Simulated Pix code. A bank app cannot pay this ticket.' : 'Scan with your bank app and check the BRL amount and recipient before paying.'}</p>
          <div className="mx-auto w-fit bg-white p-6"><QRCode title="Pix payment QR code" value={code} size={220} level="M" /></div>
          <button className="ui-btn-secondary" onClick={() => { void navigator.clipboard.writeText(code).then(() => { setCopied(true) }).catch(() => { setError('Select the Pix code below to copy it.') }) }}>{copied ? 'Copied' : 'Copy Pix code'}</button>
          <details><summary>Pix copy-and-paste code</summary><p className="break-all select-all font-mono">{code}</p></details>
        </>}
      </>}
      <button className="ui-btn-secondary" onClick={() => { setResult(undefined); setError('') }}>New quote</button>
    </> : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void prepare() }}>
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <label className="ui-label">{onramp ? 'Receive' : 'Spend'}
          <select className="ui-select mt-1" value={token} onChange={e => { setToken(e.target.value) }}>{assets.map(a => <option key={a.token} value={a.token}>{a.label}</option>)}</select>
        </label>
        <label className="ui-label">Amount ({onramp ? 'BRL' : asset.symbol})
          <input className="ui-input mt-1" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value) }} />
        </label>
        <label className="ui-label">{onramp ? 'Receiving' : 'Funding'} wallet (BRL KYC)
          <input className="ui-input ui-input-mono mt-1" value={wallet} onChange={e => { setWallet(e.target.value.trim()) }} />
        </label>
      </fieldset>
      <button type="submit" className="ui-btn-primary" disabled={busy || !raw || raw === '0' || !isAddress(wallet)}>{busy ? 'Preparing…' : onramp ? 'Generate Pix QR' : 'Get payout quote'}</button>
    </form>}
    {error && <p role="alert" className="ui-text-error">{error}</p>}
  </section>
}

export default function PixPreview() {
  const [onramp, setOnramp] = useState(true)
  const { client } = useSmartWallets()
  return <main className="ui-page ui-surface-warm min-h-screen px-4 py-10">
    <div className="relative mx-auto flex max-w-xl flex-col gap-5">
      <nav aria-label="Preview tools" className="flex gap-2"><a className="ui-btn-tab" href="/pr-3364">Bridge quotes</a><a className="ui-btn-tab ui-btn-tab-active" aria-current="page" href="/pr-3364/pix">Pix ramps</a></nav>
      <h1 className="text-3xl font-semibold">Pix ramps</h1>
      <div className="flex gap-2" role="group" aria-label="Payment direction">
        <button aria-pressed={onramp} className={'ui-btn-tab ' + (onramp ? 'ui-btn-tab-active' : '')} onClick={() => { setOnramp(true) }}>Onramp</button>
        <button aria-pressed={!onramp} className={'ui-btn-tab ' + (!onramp ? 'ui-btn-tab-active' : '')} onClick={() => { setOnramp(false) }}>Offramp</button>
      </div>
      <PixForm key={String(onramp)} onramp={onramp} initialWallet={client?.account.address ?? '0xBDFfcEF09a027BfA147E11D2e240853914Fc210a'} />
    </div>
  </main>
}
