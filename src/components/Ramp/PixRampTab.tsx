import { useEffect, useRef, useState } from 'react'
import { useConnectWallet } from '@privy-io/react-auth'
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana'
import { getBase58Decoder } from '@solana/kit'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { QRCode } from 'react-qr-code'
import { isAddress } from 'viem'
import { humanToRaw } from './rampRoutes'
import { getPixQuote, pixAssets, pixNativeWallets, PIX_TEST_SAFE } from './pixQuote'

function PixForm({ onramp, privyWallet }: { onramp: boolean, privyWallet?: string }) {
  const [evmWallet, setEvmWallet] = useState(privyWallet ?? PIX_TEST_SAFE)
  const assets = pixAssets.filter(a => onramp || a.offramp)
  const [asset, setAsset] = useState(assets[0])
  const wallet = asset.walletNetwork === 'evm' ? evmWallet : pixNativeWallets[asset.walletNetwork]
  const [amount, setAmount] = useState('1')
  const [pixKey, setPixKey] = useState('')
  const needsDeposit = !onramp && asset.walletNetwork === 'solana'
  const { wallets } = useWallets()
  const signer = wallets.find(w => w.address === wallet)
  const { connectWallet } = useConnectWallet()
  const solana = useSignAndSendTransaction()
  const sending = useRef(false)
  const [signature, setSignature] = useState('')
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
  const raw = /^\d+(\.\d+)?$/.test(normalized) ? humanToRaw(normalized, onramp ? 2 : asset.decimals) : null
  async function prepare() {
    if (!raw || busy) return
    setError(''); setBusy(true); setCopied(false)
    try {
      const quote = await getPixQuote(onramp, asset, raw, wallet, pixKey)
      setSignature('')
      setExpired(false); setResult(quote)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate the quote.') }
    finally { setBusy(false) }
  }
  const code = result?.code
  async function pay() {
    if (!result?.deposit || !signer || sending.current || signature || Date.now() >= result.expires) return
    sending.current = true
    setBusy(true); setError('')
    try {
      const receipt = await solana.signAndSendTransaction({ wallet: signer, transaction: result.deposit.bytes, chain: 'solana:mainnet',
        options: { skipPreflight: false, uiOptions: { showWalletUIs: true } } })
      setSignature(getBase58Decoder().decode(receipt.signature))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission could not be confirmed. Check your wallet activity before trying again.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return <section className="ui-panel-shell flex flex-col gap-5 p-6 sm:p-8">
    <h2 className="ui-heading-section">{onramp ? 'Pay with Pix' : 'Quote a Pix payout'}</h2>
    {result ? <>
      <div><p className="ui-label">You receive</p><p className="text-3xl font-semibold">{result.credit}</p></div>
      <p>{onramp ? 'Pay R$' + normalized : 'From ' + normalized + ' ' + asset.symbol} · {asset.label}</p>
      <p className="ui-label break-all">{onramp ? 'Receiving' : 'Funding'} wallet: {wallet}</p>
      {result.deposit && <div>
        <p className="ui-label">Receiving token account in the prepared Solana payment</p>
        <p className="break-all select-all font-mono">{result.deposit.destination}</p>
        <p>Pix key: {pixKey}</p>
        <p className="text-sm">Use the payment button below. Pasting this token account into a wallet’s Send screen can send funds to the wrong account and leave the Pix payout unpaid. The prepared payment includes quote tracking and requires SOL for the fee.</p>
      </div>}
      {signature ? <p role="status">Submitted on Solana. <a href={'https://solscan.io/tx/' + signature} target="_blank" rel="noreferrer">View transaction</a></p>
      : expired ? <p role="status">Quote expired. Generate a new quote.</p> : <>
        <p>Valid until {new Date(result.expires).toLocaleTimeString()}.</p>
        {result.deposit && (signer
          ? <button disabled={busy} className="ui-btn-primary" onClick={() => { void pay() }}>{busy ? 'Waiting for wallet…' : 'Pay ' + normalized + ' ' + asset.symbol + ' with Solana wallet'}</button>
          : <button className="ui-btn-secondary" onClick={() => { connectWallet({ walletChainType: 'solana-only' }) }}>Connect funding wallet ({wallet.slice(0, 4)}…{wallet.slice(-4)})</button>)}
        {onramp && code && <>
          <p>{code.startsWith('00020126sandbox-') ? 'Simulated Pix code. A bank app cannot pay this ticket.' : 'Scan with your bank app and check the BRL amount and recipient before paying.'}</p>
          <div className="mx-auto w-fit bg-white p-6"><QRCode title="Pix payment QR code" value={code} size={220} level="M" /></div>
          <button className="ui-btn-secondary" onClick={() => { void navigator.clipboard.writeText(code).then(() => { setCopied(true) }).catch(() => { setError('Select the Pix code below to copy it.') }) }}>{copied ? 'Copied' : 'Copy Pix code'}</button>
          <details><summary>Pix copy-and-paste code</summary><p className="break-all select-all font-mono">{code}</p></details>
        </>}
      </>}
      <button disabled={busy} className="ui-btn-secondary" onClick={() => { setResult(undefined); setError('') }}>New quote</button>
    </> : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void prepare() }}>
      <fieldset disabled={busy} className="flex flex-col gap-4">
        {onramp && <p>Origin: Pix (BRL)</p>}
        <label className="ui-label">{onramp ? 'Destination wallet' : 'Origin wallet'}
          <select className="ui-select mt-1" value={wallet} onChange={e => {
            const address = e.target.value
            const network = address === pixNativeWallets.solana ? 'solana' : address === pixNativeWallets.stellar ? 'stellar' : 'evm'
            if (network === 'evm') setEvmWallet(address)
            const nextAsset = assets.find(a => a.walletNetwork === network)
            if (nextAsset && network !== asset.walletNetwork) setAsset(nextAsset)
            setError('')
          }}>
            {privyWallet && privyWallet.toLowerCase() !== PIX_TEST_SAFE.toLowerCase() && <option value={privyWallet}>My Privy wallet ({privyWallet.slice(0, 6)}…{privyWallet.slice(-4)})</option>}
            <option value={PIX_TEST_SAFE}>Test Safe (0xBDFf…210a)</option>
            <option value={pixNativeWallets.solana}>My Solana wallet (8wyq…H2hT)</option>
            <option value={pixNativeWallets.stellar}>My Stellar wallet (GBIB…OR5M)</option>
          </select>
        </label>
        <label className="ui-label">{onramp ? 'Destination asset and chain' : 'Origin asset and chain'}
          <select className="ui-select mt-1" value={asset.label} onChange={e => {
            const nextAsset = assets.find(a => a.label === e.target.value)
            if (nextAsset) setAsset(nextAsset)
            setError('')
          }}>
            {assets.map(a => <option key={a.label} value={a.label}>{a.label}</option>)}
          </select>
        </label>
        {!onramp && <p>Destination: Pix (BRL)</p>}
        {needsDeposit && <label className="ui-label">Payout Pix key
          <input className="ui-input mt-1" autoComplete="off" required value={pixKey} onChange={e => { setPixKey(e.target.value.trim()) }} />
        </label>}
        <label className="ui-label">Amount ({onramp ? 'BRL' : asset.symbol})
          <input className="ui-input mt-1" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value) }} />
        </label>
        <label className="ui-label">{onramp ? 'Receiving' : 'Funding'} wallet (BRL KYC)
          <input className="ui-input ui-input-mono mt-1" value={wallet} readOnly />
        </label>
      </fieldset>
      <button type="submit" className="ui-btn-primary" disabled={busy || !raw || raw === '0' || (needsDeposit && !pixKey)}>{busy ? 'Preparing…' : onramp ? 'Generate Pix QR' : needsDeposit ? 'Get deposit instructions' : 'Get payout quote'}</button>
    </form>}
    {error && <p role="alert" className="ui-text-error">{error}</p>}
  </section>
}

export default function PixRampTab({ onramp }: { onramp: boolean }) {
  const { client } = useSmartWallets()
  const wallet = client?.account.address
  const privyWallet = wallet && isAddress(wallet) ? wallet : undefined
  return <PixForm key={String(onramp)} onramp={onramp} privyWallet={privyWallet} />
}
