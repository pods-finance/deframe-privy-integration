import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { formatUnits, isAddress } from 'viem'
import { QRCode } from 'react-qr-code'
import { asRecord, extractApiError, parseResponseBody, readString } from '../Ramp/rampApi'
import { humanToRaw } from '../Ramp/rampRoutes'
import { PIX_TEST_SAFE } from '../Ramp/pixQuote'
import { assets, label, quoteParams, type Selection } from './catalog'

function isEvm(chain: string) {
  return !['fiat', 'solana', 'stellar'].includes(chain)
}

function WalletField({ title, chain, value, change }: { title: string; chain: string; value: string; change: (v: string) => void }) {
  const { client } = useSmartWallets()
  const { login, ready, authenticated } = usePrivy()
  if (chain === 'fiat') return null
  return <div className="flex flex-col gap-2">
    <label className="ui-label">{title} on {chain}
      <input className="ui-input w-full" value={value} required onChange={e => { change(e.target.value.trim()); }} />
    </label>
    {isEvm(chain) && <div className="flex flex-wrap gap-2">
      <button type="button" className="ui-btn-tab" onClick={() => { change(PIX_TEST_SAFE); }}>Test Safe · 210a</button>
      {client ? <button type="button" className="ui-btn-tab" onClick={() => { change(client.account.address); }}>Use Privy wallet</button>
        : !authenticated && <button type="button" className="ui-btn-tab" disabled={!ready} onClick={login}>Connect Privy</button>}
    </div>}
  </div>
}

interface Result { message: string; success: boolean; id?: string; expires?: number; pixCode?: string; deposit?: string }
function activeDeadline(deadline: unknown, ticketEnd?: string) {
  const quoteEnd = Number(deadline) * 1000
  const expires = ticketEnd ? Math.min(quoteEnd, Date.parse(ticketEnd)) : quoteEnd
  if (!Number.isFinite(expires) || expires <= Date.now()) throw Error('The returned quote has expired or is missing a deadline.')
  return expires
}

function sameToken(actual: unknown, expected: string) {
  return typeof actual === 'string' && (expected.startsWith('0x') ? actual.toLowerCase() === expected.toLowerCase() : actual === expected)
}
const reverseSources = ['gnosis/USDC', 'stable/USDT0']
const reverseTargets = ['polygon/BRLA', 'base/BRS']

export default function QuoteCase({ row, mark }: { row: Selection; mark: (id: string, success: boolean) => void }) {
  const input = assets[row.from], output = assets[row.to]
  const [amount, setAmount] = useState('1')
  const [bound, setBound] = useState(false)
  const [sender, setSender] = useState<string>(() => isEvm(input.chain) ? PIX_TEST_SAFE : '')
  const [recipient, setRecipient] = useState<string>(() => isEvm(output.chain) ? PIX_TEST_SAFE : '')
  const [pixKey, setPixKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>()
  const [expired, setExpired] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (!result?.expires) return
    const timer = window.setTimeout(() => { setExpired(true); }, Math.min(2147483647, Math.max(0, result.expires - Date.now())))
    return () => { window.clearTimeout(timer); }
  }, [result])
  function clear() { setResult(undefined); setExpired(false) }
  const value = amount.trim().replace(',', '.')
  const raw = /^\d+(\.\d+)?$/.test(value) ? humanToRaw(value, input.decimals) : null
  const params = quoteParams(row, raw ?? '')
  if (bound && input.chain !== 'fiat') params.set('originAddress', sender)
  if (bound && output.chain !== 'fiat') params.set('destinationAddress', recipient)
  if (bound && row.to === 'fiat/BRL' && pixKey) params.set('pixKey', pixKey)
  const validAddress = (chain: string, address: string) => chain === 'fiat' || (isEvm(chain) ? isAddress(address) : Boolean(address))
  const enabled = !!raw && BigInt(raw) > 0n && (!bound || (validAddress(input.chain, sender) && validAddress(output.chain, recipient)))

  const reverse = reverseSources.includes(row.from) && reverseTargets.includes(row.to)
  const walletSwap = reverse || (reverseTargets.includes(row.from) && reverseSources.includes(row.to))
  const swapParams = new URLSearchParams({ from: row.from, to: row.to, amount: value })
  if (bound && isAddress(recipient)) swapParams.set('recipient', recipient)

  async function request() {
    if (!enabled || active.current) return
    clear(); setBusy(true)
    const controller = new AbortController()
    active.current = controller
    try {
      const res = await fetch('/preview-3500-quote?' + params.toString(), { headers: { 'x-preview-quote': '3500' }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) })
      const body = asRecord(await parseResponseBody(res))
      if (!res.ok) {
        const e = extractApiError(body)
        throw Error([`HTTP ${String(res.status)}`, e.code, e.message].filter(Boolean).join(' · '))
      }
      const q = asRecord(body?.quote)
      const src = asRecord(q?.tokenIn), dst = asRecord(q?.tokenOut)
      const net = readString(dst?.amount)
      const id = readString(q?.quoteId) ?? readString(q?.id)
      const providerMatches = ['pods', 'deframe'].includes(String(q?.provider)) || (row.provider !== 'pods' && q?.provider === row.provider)
      if (!id || !net || !/^\d+$/.test(net) || !BigInt(net) || q?.originChain !== input.chain || q.destinationChain !== output.chain ||
        !providerMatches || src?.amount !== raw || !sameToken(src.contract ?? (input.chain === 'fiat' ? src.symbol : undefined), input.contract) || !sameToken(dst?.contract ?? (output.chain === 'fiat' ? dst?.symbol : undefined), output.contract) ||
        src.decimals !== input.decimals || dst?.decimals !== output.decimals) throw Error('The response did not match the selected route and amount.')
      if (bound && ((input.chain !== 'fiat' && !sameToken(q.originAddress, sender)) || (output.chain !== 'fiat' && !sameToken(q.destinationAddress, recipient)))) throw Error('The response did not match the selected wallet addresses.')
      if (row.provider !== 'pods' && q.rampProvider && q.rampProvider !== row.provider) throw Error('The response used a different ramp provider.')
      const instructions = asRecord(body?.paymentInstructions)
      const expires = activeDeadline(q.deadline, readString(instructions?.expiresAt))
      // These four routes explicitly support a plain ERC-20 deposit from the external wallet.
      const canDeposit = bound && reverse
      const deposit = canDeposit ? readString(body?.depositAddress) ?? readString(q.depositAddress) : undefined
      if (deposit && (!isAddress(deposit) || /^0x0{40}$/i.test(deposit) || (q.depositAddress && !sameToken(q.depositAddress, deposit)))) throw Error('Invalid deposit address in quote.')
      const pixCode = bound && row.from === 'fiat/BRL' ? readString(asRecord(instructions?.pix)?.copyPaste) : undefined
      setResult({ success: true, id, expires, pixCode, deposit, message: `Receive ${formatUnits(BigInt(net), output.decimals)} ${label(row.to)}` })
      mark(row.id, true)
    } catch (e) {
      if (!controller.signal.aborted) { setResult({ success: false, message: e instanceof Error ? e.message : 'Quote failed' }); mark(row.id, false) }
    } finally { active.current = null; if (!controller.signal.aborted) setBusy(false) }
  }

  return <form onSubmit={e => { e.preventDefault(); void request() }} className="flex flex-col gap-4">
    <fieldset disabled={busy} className="flex flex-col gap-4">
      <label className="ui-label">Amount in {label(row.from)}<input className="ui-input w-full" inputMode="decimal" value={amount} onChange={e => { clear(); setAmount(e.target.value) }} /></label>
      <label><input type="checkbox" checked={bound} onChange={e => { clear(); setBound(e.target.checked) }} /> Include wallet details for this quote</label>
      {row.provider !== 'pods' && <p>For a customer-specific ramp quote, include a wallet approved for this currency. The provider may return payment instructions.</p>}
      {bound && <>
        <WalletField chain={input.chain} title="Sender" value={sender} change={v => { clear(); setSender(v) }} />
        <WalletField chain={output.chain} title="Recipient" value={recipient} change={v => { clear(); setRecipient(v) }} />
        {row.to === 'fiat/BRL' && <label className="ui-label">Pix payout key (optional)<input className="ui-input w-full" value={pixKey} onChange={e => { clear(); setPixKey(e.target.value) }} /></label>}
      </>}
    </fieldset>
    <button className="ui-btn-primary self-start" disabled={busy || !enabled}>{busy ? 'Requesting quote…' : 'Get preview quote'}</button>
    {result && <div className="ui-sub-panel space-y-2 break-words" role="status">
      <strong>{result.message}</strong>
      {result.id && result.expires && <p>Quote {result.id} · {expired ? 'Expired' : 'Valid until ' + new Date(result.expires).toLocaleTimeString()}</p>}
      {result.success && walletSwap && <a className="ui-btn-tab" href={'/pr-3500/swap?' + swapParams.toString()}>Open this route in Bridge swap</a>}
      {!expired && result.deposit && <p>Send {amount} {label(row.from)} to <code className="break-all">{result.deposit}</code>. Receive at <code className="break-all">{recipient}</code>.</p>}
      {!expired && result.pixCode && <div><p>{row.provider === 'avenia' ? 'Sandbox Pix payment code' : 'Pix payment code'}</p><QRCode value={result.pixCode} size={144} /><details><summary>Copy-and-paste code</summary><code className="break-all">{result.pixCode}</code></details></div>}
    </div>}
  </form>
}
