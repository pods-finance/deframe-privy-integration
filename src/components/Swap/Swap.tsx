import { useState } from 'react';
import { isSolanaToSolanaQuote, useSwap } from './useSwap';

interface Props {
  walletAddress?: string;
}

const Swap = ({ walletAddress }: Props) => {
  const [originChain, setOriginChain] = useState('');
  const [tokenIn, setTokenIn] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [destinationChain, setDestinationChain] = useState('');
  const [tokenOut, setTokenOut] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');

  const {
    quote,
    quoteLoading,
    quoteError,
    fetchQuote,
    executeLoading,
    executeError,
    txHash,
    executeSwap,
  } = useSwap(walletAddress);

  const handleGetQuote = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchQuote({
      originChain,
      tokenIn,
      amountIn,
      destinationChain,
      tokenOut,
    });
  };

  const isSolanaToSolana = isSolanaToSolanaQuote(quote);

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote?.quoteId) return;
    if (!isSolanaToSolana && !destinationAddress.trim()) return;
    void executeSwap({
      quoteId: quote.quoteId,
      ...(!isSolanaToSolana ? { destinationAddress: destinationAddress.trim() } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <h2 className="ui-heading-section">Swap</h2>

      <form onSubmit={handleGetQuote} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-origin-chain">
            Origin chain
          </label>
          <input
            id="swap-origin-chain"
            value={originChain}
            onChange={(e) => { setOriginChain(e.target.value); }}
            placeholder="polygon"
            className="ui-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-token-in">
            Token in (address)
          </label>
          <input
            id="swap-token-in"
            value={tokenIn}
            onChange={(e) => { setTokenIn(e.target.value); }}
            placeholder="0x..."
            className="ui-input ui-input-mono"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-amount-in">
            Amount in
          </label>
          <input
            id="swap-amount-in"
            value={amountIn}
            onChange={(e) => { setAmountIn(e.target.value); }}
            placeholder="10000"
            className="ui-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-destination-chain">
            Destination chain
          </label>
          <input
            id="swap-destination-chain"
            value={destinationChain}
            onChange={(e) => { setDestinationChain(e.target.value); }}
            placeholder="bitcoin"
            className="ui-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-token-out">
            Token out (address)
          </label>
          <input
            id="swap-token-out"
            value={tokenOut}
            onChange={(e) => { setTokenOut(e.target.value); }}
            placeholder="So111..."
            className="ui-input ui-input-mono"
          />
        </div>
        <button
          type="submit"
          disabled={quoteLoading}
          className="ui-btn-primary w-full sm:w-auto"
        >
          {quoteLoading ? 'Fetching quote…' : 'Get quote'}
        </button>
      </form>

      {quoteError && <p className="ui-text-error">{quoteError}</p>}

      {quote && (
        <div className="ui-sub-panel">
          <p className="mb-2 text-small font-semibold text-ink">Quote</p>
          <p className="mb-1 text-caption text-gray-500">
            {quote.tokenIn.symbol} → {quote.tokenOut.symbol}
          </p>
          <p className="mb-1 text-caption text-gray-500">
            Amount out: {quote.tokenOut.amount} {quote.tokenOut.symbol}
          </p>
          <p className="mb-3 text-caption text-gray-500">
            Quote ID: {quote.quoteId}
          </p>

          <form onSubmit={handleExecute} className="flex flex-col gap-3">
            {isSolanaToSolana ? (
              <p className="text-caption text-gray-500">
                Solana → Solana:{' '}
                <code className="ui-code">/v2/swap/bytecode</code> uses your Privy Solana wallet
                for both{' '}
                <span className="text-ink">originAddress</span> and{' '}
                <span className="text-ink">destinationAddress</span>.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="ui-label" htmlFor="swap-destination-address">
                  Destination address
                </label>
                <input
                  id="swap-destination-address"
                  value={destinationAddress}
                  onChange={(e) => { setDestinationAddress(e.target.value); }}
                  placeholder="bc1q..."
                  className="ui-input"
                  required
                />
              </div>
            )}
            <button
              type="submit"
              disabled={executeLoading || (!isSolanaToSolana && !destinationAddress.trim())}
              className="ui-btn-primary w-full sm:w-auto"
            >
              {executeLoading ? 'Executing…' : 'Execute swap'}
            </button>
          </form>

          {executeError && <p className="mt-2 ui-text-error">{executeError}</p>}
          {txHash && <p className="mt-2 ui-text-success">Tx: {txHash}</p>}
        </div>
      )}
    </div>
  );
};

export default Swap;
