import { useState } from 'react'
import { useTransfer } from './useTransfer'

const CHAINS: { id: number; name: string }[] = [
  { id: 1, name: 'Ethereum' },
  { id: 8453, name: 'Base' },
  { id: 42161, name: 'Arbitrum' },
  { id: 137, name: 'Polygon' },
  { id: 100, name: 'Gnosis' },
  { id: 999, name: 'HyperEVM' },
]

interface Props {
  walletAddress?: string
}

const Transfer = ({ walletAddress }: Props) => {
  const { executeTransfer, loading, error, txHash, walletAddress: hookWallet } = useTransfer(walletAddress)
  const address = walletAddress ?? hookWallet ?? ''

  const [walletOrigin, setWalletOrigin] = useState('')
  const [walletDestination, setWalletDestination] = useState('')
  const [token, setToken] = useState('0x0000000000000000000000000000000000000000')
  const [amount, setAmount] = useState('')
  const [chainId, setChainId] = useState('8453')

  const effectiveWalletOrigin = walletOrigin || address

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void executeTransfer({
      walletOrigin: effectiveWalletOrigin,
      walletDestination,
      token,
      amount,
      chainId,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Transfer</h2>
      <p className="text-sm text-slate-400">
        Transfer tokens between wallets. Use <code className="rounded bg-slate-800 px-1">0x0000...0000</code> for native token (ETH, etc.).
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400" htmlFor="transfer-wallet-origin">
          From (wallet origin)
        </label>
        <input
          id="transfer-wallet-origin"
          value={effectiveWalletOrigin}
          onChange={(e) => { setWalletOrigin(e.target.value); }}
          placeholder="0x..."
          className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400" htmlFor="transfer-wallet-destination">
          To (wallet destination)
        </label>
        <input
          id="transfer-wallet-destination"
          value={walletDestination}
          onChange={(e) => { setWalletDestination(e.target.value); }}
          placeholder="0x..."
          className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400" htmlFor="transfer-token">
          Token address
        </label>
        <input
          id="transfer-token"
          value={token}
          onChange={(e) => { setToken(e.target.value); }}
          placeholder="0x... or 0x0000...0000 for native"
          className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 font-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400" htmlFor="transfer-amount">
          Amount (in wei / smallest unit)
        </label>
        <input
          id="transfer-amount"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); }}
          placeholder="1000000000000000000"
          className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          inputMode="decimal"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400" htmlFor="transfer-chain-id">
          Chain ID
        </label>
        <select
          id="transfer-chain-id"
          value={chainId}
          onChange={(e) => { setChainId(e.target.value); }}
          className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {txHash && <p className="text-sm text-emerald-300">Transaction sent: {txHash}</p>}

      <button
        type="submit"
        disabled={loading || !effectiveWalletOrigin || !walletDestination || !token || !amount}
        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Transferring…' : 'Transfer'}
      </button>
    </form>
  )
}

export default Transfer
