import { useEffect, useRef, useState } from 'react'
import { useConnectWallet, usePrivy, useWallets as useEvmWallets } from '@privy-io/react-auth'
import { useSignRawHash } from '@privy-io/react-auth/extended-chains'
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana'
import { getBase58Decoder } from '@solana/kit'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { QRCode } from 'react-qr-code'
import { createWalletClient, custom, isAddress } from 'viem'
import { humanToRaw } from './rampRoutes'
import { getPixQuote, pixAssets, pixNativeWallets, PIX_TEST_SAFE } from './pixQuote'

function PixForm({ onramp, privyWallet }: { onramp: boolean, privyWallet?: string }) {
  const [evmWallet, setEvmWallet] = useState(onramp ? privyWallet ?? PIX_TEST_SAFE : PIX_TEST_SAFE)
  const assets = pixAssets.filter(a => onramp || a.offramp)
  const [asset, setAsset] = useState(assets[0])
  const wallet = asset.walletNetwork === 'evm' ? evmWallet : pixNativeWallets[asset.walletNetwork]
  const [amount, setAmount] = useState('1')
  const [pixKey, setPixKey] = useState('')
  const needsDeposit = !onramp
  const evmOfframp = !onramp && asset.walletNetwork === 'evm'
  const { wallets: evmWallets } = useEvmWallets()
  const { getClientForChain } = useSmartWallets()
  const [connectedStellar, setConnectedStellar] = useState('')
  const { wallets } = useWallets()
  const signer = wallets.find(w => w.address === wallet)
  const { connectWallet } = useConnectWallet()
  const solana = useSignAndSendTransaction()
  const sending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const [signature, setSignature] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof getPixQuote>>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [expired, setExpired] = useState(false)
  const { connectWallet: connectEvm } = useConnectWallet({ onSuccess: ({ wallet: connected }) => {
    if (!isAddress(connected.address)) return
    if (result?.evmDeposit && connected.address.toLowerCase() !== result.evmDeposit.wallet.toLowerCase()) {
      setError('This quote belongs to a different funding wallet. Select New quote to pay from the connected wallet.')
    } else if (!result && !busy) setEvmWallet(connected.address)
  } })
  const { user } = usePrivy()
  const stellarSigning = useSignRawHash()
  const [trustlineReady, setTrustlineReady] = useState(false)
  const [trustlineError, setTrustlineError] = useState('')
  const stellarOnramp = onramp && asset.walletNetwork === 'stellar'
  const issuer = stellarOnramp ? asset.token.split(':')[1] : ''
  const ownsStellar = user?.linkedAccounts.some(account => account.type === 'wallet' && account.chainType === 'stellar' && account.address === wallet && account.walletClientType === 'privy')
  async function enableTrustline() {
    if (!stellarOnramp || !ownsStellar || busy) return
    setBusy(true); setTrustlineError('')
    try {
      const { Asset, BASE_FEE, Horizon, Networks, Operation, TransactionBuilder } = await import('@stellar/stellar-sdk')
      const { executeStellarBytecode } = await import('../Strategies/executeStrategyTx')
      const horizonUrl = 'https://horizon.stellar.org'
      const account = await new Horizon.Server(horizonUrl).loadAccount(wallet)
      const line = account.balances.find(b => 'asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === issuer)
      if (line && 'is_authorized' in line && !line.is_authorized) throw Error('The issuer has not authorized this trustline.')
      if (!line) {
        const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
          .addOperation(Operation.changeTrust({ asset: new Asset('USDC', issuer) })).setTimeout(180).build()
        await executeStellarBytecode({ xdr: tx.toXDR() }, { stellarAddress: wallet, horizonUrl, signRawHash: input => stellarSigning.signRawHash(input) })
      }
      setTrustlineReady(true); setError('')
    } catch (cause) {
      setTrustlineError(cause instanceof Error ? cause.message : 'Could not enable the USDC trustline.')
    } finally { setBusy(false) }
  }
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
  const stellarDeposit = result?.stellarDeposit
  const evmDeposit = result?.evmDeposit
  const connectedFundingWallet = evmWallets.find(w => w.address.toLowerCase() === evmDeposit?.wallet.toLowerCase())
  const smartFundingWallet = Boolean(evmDeposit && privyWallet?.toLowerCase() === evmDeposit.wallet.toLowerCase())
  async function payEvm() {
    if (!result || !evmDeposit || sending.current || signature || Date.now() >= result.expires) return
    const { chain, call, wallet: account } = evmDeposit
    const assertCurrent = () => {
      if (!mounted.current) throw Error('The payment form was closed.')
      if (Date.now() >= result.expires) throw Error('Quote expired. Request a fresh quote.')
    }
    sending.current = true
    setBusy(true); setError('')
    try {
      if (smartFundingWallet) {
        const client = await getClientForChain({ id: chain.id })
        if (client?.account.address.toLowerCase() !== account.toLowerCase() || await client.getChainId() !== chain.id) throw Error('Reconnect the quoted smart wallet on ' + chain.name + '.')
        assertCurrent()
        setSignature(await client.sendTransaction({ calls: [call] }))
      } else {
        if (!connectedFundingWallet) throw Error('Connect the wallet shown as the funding wallet.')
        await connectedFundingWallet.switchChain(chain.id)
        const provider = await connectedFundingWallet.getEthereumProvider()
        const client = createWalletClient({ chain, transport: custom(provider) })
        const [accounts, currentChain] = await Promise.all([client.getAddresses(), client.getChainId()])
        if (currentChain !== chain.id || accounts[0]?.toLowerCase() !== account.toLowerCase()) throw Error('Select the quoted funding account on ' + chain.name + '.')
        assertCurrent()
        setSignature(await client.sendTransaction({ ...call, account }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission could not be confirmed. Check your wallet activity before retrying.')
    } finally { sending.current = false; setBusy(false) }
  }
  async function stellarPayment() {
    if (!result?.stellarDeposit || sending.current || signature || Date.now() >= result.expires) return
    sending.current = true
    setBusy(true); setError('')
    try {
      const { connectStellarFundingWallet, payWithFreighter } = await import('./stellarPixDeposit')
      if (!ownsStellar && connectedStellar !== wallet) {
        await connectStellarFundingWallet(wallet)
        setConnectedStellar(wallet)
        return
      }
      const { xdr } = result.stellarDeposit
      if (ownsStellar) {
        const { executeStellarBytecode } = await import('../Strategies/executeStrategyTx')
        const receipt = await executeStellarBytecode({ xdr }, { stellarAddress: wallet, horizonUrl: 'https://horizon.stellar.org',
          signRawHash: async input => {
            const signed = await stellarSigning.signRawHash(input)
            if (Date.now() >= result.expires) throw Error('Quote expired during signing. Request a fresh quote.')
            return signed
          } })
        setSignature(receipt.hash)
      } else {
        const receipt = await payWithFreighter(xdr, wallet, result.expires)
        setSignature(receipt.hash)
      }
    } catch (e) {
      setConnectedStellar('')
      setError(e instanceof Error ? e.message : 'Could not confirm submission. Check your wallet activity before retrying.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
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
      {signature ? <p role="status">Submitted on {evmDeposit?.chain.name ?? (result.stellarDeposit ? 'Stellar' : 'Solana')}. <a href={(evmDeposit ? evmDeposit.chain.blockExplorers.default.url + '/tx/' : result.stellarDeposit ? 'https://stellar.expert/explorer/public/tx/' : 'https://solscan.io/tx/') + signature} target="_blank" rel="noreferrer">View transaction</a></p>
      : expired ? <p role="status">Quote expired. Generate a new quote.</p> : <>
        <p>Valid until {new Date(result.expires).toLocaleTimeString()}.</p>
        {evmDeposit && <>
          <p>Pix key: {pixKey}</p>
          <div><p className="ui-label">{evmDeposit.chain.name} deposit address</p>
            <p className="break-all select-all font-mono">{evmDeposit.address}</p>
            <p>Send exactly {normalized} {asset.symbol} on {evmDeposit.chain.name} from the funding wallet shown above.</p>
          </div>
          <button className="ui-btn-secondary" onClick={() => { void navigator.clipboard.writeText(evmDeposit.address).then(() => { setCopied(true) }).catch(() => { setError('Select the deposit address above to copy it.') }) }}>{copied ? 'Address copied' : 'Copy deposit address'}</button>
          {connectedFundingWallet || smartFundingWallet
            ? <button className="ui-btn-primary" disabled={busy} onClick={() => { void payEvm() }}>{busy ? 'Waiting for wallet…' : 'Pay ' + normalized + ' ' + asset.symbol + ' with wallet'}</button>
            : <button className="ui-btn-secondary" onClick={() => { connectEvm({ walletChainType: 'ethereum-only' }) }}>Connect quoted funding wallet</button>}
        </>}
        {stellarDeposit && <>
          <p>Pix key: {pixKey}</p>
          <button disabled={busy} className="ui-btn-primary" onClick={() => { void stellarPayment() }}>
            {busy ? 'Waiting for wallet…' : ownsStellar || connectedStellar === wallet ? 'Pay ' + normalized + ' USDC with Stellar wallet' : 'Connect Stellar wallet (Freighter)'}
          </button>
          <div>
            <p className="ui-label">Stellar deposit address for this quote</p>
            <p className="break-all select-all font-mono">{stellarDeposit.address}</p>
            <p>Memo (ID): <span className="select-all font-mono">{stellarDeposit.memo}</span></p>
            <p className="text-sm">{stellarDeposit.singlePayment
              ? 'To pay manually, send ' + stellarDeposit.amount + ' USDC from the funding wallet on Stellar mainnet. Use the full M address and the memo ID above.'
              : 'This transaction includes a separate fee payment. Sign the prepared transaction to include every payment.'}</p>
          </div>
          <button className="ui-btn-secondary" onClick={() => { void navigator.clipboard.writeText(stellarDeposit.address).then(() => { setCopied(true) }).catch(() => { setError('Select the deposit address above to copy it.') }) }}>{copied ? 'Address copied' : 'Copy deposit address'}</button>
          <details><summary>Prepared transaction for another Stellar wallet (XDR)</summary><p className="break-all select-all font-mono">{stellarDeposit.xdr}</p></details>
        </>}
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
            {(!onramp ? evmWallets : []).filter(w => ![privyWallet?.toLowerCase(), PIX_TEST_SAFE.toLowerCase()].includes(w.address.toLowerCase())).map(w =>
              <option key={w.address} value={w.address}>Connected wallet ({w.address.slice(0, 6)}…{w.address.slice(-4)})</option>)}
            {Object.entries(pixNativeWallets).map(([network, address]) => <option key={network} value={address}>
              My {network === 'solana' ? 'Solana' : 'Stellar'} wallet ({address.slice(0, 4)}…{address.slice(-4)})
            </option>)}
          </select>
        </label>
        {evmOfframp && <button type="button" className="ui-btn-secondary" onClick={() => { connectEvm({ walletChainType: 'ethereum-only' }) }}>Connect a funding wallet</button>}
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
        {stellarOnramp && trustlineReady && <p role="status">Circle USDC is enabled. You can generate your Pix QR.</p>}
        {stellarOnramp && !trustlineReady && /trustline/i.test(error) && <div>
          <p>{ownsStellar ? 'Enable Circle USDC on Stellar mainnet. This reserves 0.5 XLM and uses a network fee.' : 'Open the wallet that controls this Stellar address, choose Add asset, select Circle USDC with the issuer below, and approve the trustline. Then generate the Pix QR again.'}</p>
          <p className="break-all font-mono">{issuer}</p>
          {ownsStellar && <button type="button" className="ui-btn-secondary" disabled={busy} onClick={() => { void enableTrustline() }}>Enable Circle USDC</button>}
          {trustlineError && <p role="alert">{trustlineError}</p>}
        </div>}
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
