import { useState } from 'react'
import { useSwap } from './useSwap'

interface Props {
  walletAddress?: string
}

const Swap = ({ walletAddress }: Props) => {
  const [originChain, setOriginChain] = useState('')
  const [tokenIn, setTokenIn] = useState('')
  const [amountIn, setAmountIn] = useState('')
  const [destinationChain, setDestinationChain] = useState('')
  const [tokenOut, setTokenOut] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')

  const {
    quote,
    quoteLoading,
    quoteError,
    fetchQuote,
    executeLoading,
    executeError,
    txHash,
    executeSwap,
  } = useSwap(walletAddress)

  const handleGetQuote = (e: React.FormEvent) => {
    e.preventDefault()
    void fetchQuote({
      originChain,
      tokenIn,
      amountIn,
      destinationChain,
      tokenOut,
    })
  }

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quote?.quoteId || !destinationAddress.trim()) return
    void executeSwap({
      quoteId: quote.quoteId,
      destinationAddress: destinationAddress.trim(),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">Swap</h2>

      <form onSubmit={handleGetQuote} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400" htmlFor="swap-origin-chain">
            Origin chain
          </label>
          <input
            id="swap-origin-chain"
            value={originChain}
            onChange={(e) => { setOriginChain(e.target.value) }}
            placeholder="polygon"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400" htmlFor="swap-token-in">
            Token in (address)
          </label>
          <input
            id="swap-token-in"
            value={tokenIn}
            onChange={(e) => { setTokenIn(e.target.value) }}
            placeholder="0x..."
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400" htmlFor="swap-amount-in">
            Amount in
          </label>
          <input
            id="swap-amount-in"
            value={amountIn}
            onChange={(e) => { setAmountIn(e.target.value) }}
            placeholder="10000"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400" htmlFor="swap-destination-chain">
            Destination chain
          </label>
          <input
            id="swap-destination-chain"
            value={destinationChain}
            onChange={(e) => { setDestinationChain(e.target.value) }}
            placeholder="bitcoin"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400" htmlFor="swap-token-out">
            Token out (address)
          </label>
          <input
            id="swap-token-out"
            value={tokenOut}
            onChange={(e) => { setTokenOut(e.target.value) }}
            placeholder="So111..."
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <button
          type="submit"
          disabled={quoteLoading}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {quoteLoading ? 'Fetching quote…' : 'Get quote'}
        </button>
      </form>

      {quoteError && (
        <p className="text-sm text-red-300">{quoteError}</p>
      )}

      {quote && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="mb-2 text-sm font-medium text-slate-300">Quote</p>
          <p className="mb-1 text-xs text-slate-400">
            {quote.tokenIn.symbol} → {quote.tokenOut.symbol}
          </p>
          <p className="mb-1 text-xs text-slate-400">
            Amount out: {quote.tokenOut.amount} {quote.tokenOut.symbol}
          </p>
          <p className="mb-3 text-xs text-slate-400">
            Quote ID: {quote.quoteId}
          </p>

          <form onSubmit={handleExecute} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400" htmlFor="swap-destination-address">
                Destination address
              </label>
              <input
                id="swap-destination-address"
                value={destinationAddress}
                onChange={(e) => { setDestinationAddress(e.target.value) }}
                placeholder="bc1q..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={executeLoading || !destinationAddress.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {executeLoading ? 'Executing…' : 'Execute swap'}
            </button>
          </form>

          {executeError && (
            <p className="mt-2 text-sm text-red-300">{executeError}</p>
          )}
          {txHash && (
            <p className="mt-2 text-sm text-emerald-400">
              Tx: {txHash}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default Swap
