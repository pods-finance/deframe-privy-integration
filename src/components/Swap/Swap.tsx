import { useState } from 'react';
import {
  isFiatBrlDestination,
  isFiatDestination,
  isSolanaToSolanaChains,
  useSwap,
} from './useSwap';

const SWAP_CHAINS: { slug: string; name: string }[] = [
  { slug: 'ethereum', name: 'Ethereum' },
  { slug: 'base', name: 'Base' },
  { slug: 'arbitrum', name: 'Arbitrum' },
  { slug: 'polygon', name: 'Polygon' },
  { slug: 'bsc', name: 'BSC' },
  { slug: 'hyperevm', name: 'HyperEVM' },
  { slug: 'avalanche', name: 'Avalanche' },
  { slug: 'optimism', name: 'Optimism' },
  { slug: 'gnosis', name: 'Gnosis' },
  { slug: 'solana', name: 'Solana' },
  { slug: 'bitcoin', name: 'Bitcoin' },
  { slug: 'fiat', name: 'Fiat' },
];

interface Props {
  walletAddress?: string;
}

const Swap = ({ walletAddress }: Props) => {
  const [originChain, setOriginChain] = useState('polygon');
  const [tokenIn, setTokenIn] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [destinationChain, setDestinationChain] = useState('bitcoin');
  const [tokenOut, setTokenOut] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [thirdParty, setThirdParty] = useState(false);

  const {
    quote,
    quoteLoading,
    quoteError,
    fetchQuote,
    executeLoading,
    executeError,
    txHash,
  } = useSwap(walletAddress);

  const isLoading = quoteLoading || executeLoading;
  const isSolanaToSolana = isSolanaToSolanaChains(originChain, destinationChain);
  const fiatDestination = isFiatDestination(destinationChain);
  const fiatBrl = isFiatBrlDestination(destinationChain, tokenOut);

  const handleDestinationChainChange = (value: string) => {
    setDestinationChain(value);
    if (!isFiatBrlDestination(value, tokenOut)) {
      setPixKey('');
      setThirdParty(false);
    }
  };

  const handleTokenOutChange = (value: string) => {
    setTokenOut(value);
    if (!isFiatBrlDestination(destinationChain, value)) {
      setPixKey('');
      setThirdParty(false);
    }
  };

  const handleGetQuote = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchQuote({
      originChain,
      tokenIn,
      amountIn,
      destinationChain,
      tokenOut,
      ...(!isSolanaToSolana && !fiatDestination
        ? { destinationAddress: destinationAddress.trim() }
        : {}),
      ...(fiatBrl
        ? { pixKey: pixKey.trim(), thirdParty }
        : {}),
    });
  };

  const submitDisabled =
    isLoading ||
    (fiatBrl && !pixKey.trim()) ||
    (!isSolanaToSolana && !fiatDestination && !destinationAddress.trim());

  return (
    <div className="flex flex-col gap-5">
      <h2 className="ui-heading-section">Swap</h2>

      <form onSubmit={handleGetQuote} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-origin-chain">
            Origin chain
          </label>
          <select
            id="swap-origin-chain"
            value={originChain}
            onChange={(e) => { setOriginChain(e.target.value); }}
            className="ui-select"
          >
            {SWAP_CHAINS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-token-in">
            Token in (address or symbol)
          </label>
          <input
            id="swap-token-in"
            value={tokenIn}
            onChange={(e) => { setTokenIn(e.target.value); }}
            placeholder="0x... or BRL"
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
          <select
            id="swap-destination-chain"
            value={destinationChain}
            onChange={(e) => { handleDestinationChainChange(e.target.value); }}
            className="ui-select"
          >
            {SWAP_CHAINS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-token-out">
            Token out (address or symbol)
          </label>
          <input
            id="swap-token-out"
            value={tokenOut}
            onChange={(e) => { handleTokenOutChange(e.target.value); }}
            placeholder="So111... or BRL"
            className="ui-input ui-input-mono"
          />
        </div>
        {isSolanaToSolana ? (
          <p className="text-caption text-gray-500">
            Solana → Solana:{' '}
            <code className="ui-code">/v2/swap/quote</code> uses your Privy Solana wallet
            for both{' '}
            <span className="text-ink">originAddress</span> and{' '}
            <span className="text-ink">destinationAddress</span>.
          </p>
        ) : fiatDestination ? (
          <p className="text-caption text-gray-500">
            Fiat destination: <span className="text-ink">destinationAddress</span> is omitted.
            {fiatBrl
              ? ' PIX key is required for BRL off-ramp.'
              : ' Set token out to BRL to enable PIX key / third party.'}
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
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="swap-pix-key">
            PIX key
          </label>
          <input
            id="swap-pix-key"
            value={pixKey}
            onChange={(e) => { setPixKey(e.target.value); }}
            placeholder="CPF, CNPJ, phone, email, or UUID"
            className="ui-input"
            disabled={!fiatBrl}
            required={fiatBrl}
          />
        </div>
        <label
          htmlFor="swap-third-party"
          className={`flex items-center gap-2 text-small ${fiatBrl ? 'text-ink' : 'text-gray-500'}`}
        >
          <input
            id="swap-third-party"
            type="checkbox"
            checked={thirdParty}
            onChange={(e) => { setThirdParty(e.target.checked); }}
            disabled={!fiatBrl}
          />
          Third party
        </label>
        <button
          type="submit"
          disabled={submitDisabled}
          className="ui-btn-primary w-full sm:w-auto"
        >
          {quoteLoading ? 'Fetching quote…' : executeLoading ? 'Confirm in wallet…' : 'Swap'}
        </button>
      </form>

      {quoteError && <p className="ui-text-error">{quoteError}</p>}
      {executeError && <p className="ui-text-error">{executeError}</p>}
      {txHash && <p className="ui-text-success">Tx: {txHash}</p>}

      {quote && (
        <div className="ui-sub-panel">
          <p className="mb-2 text-small font-semibold text-ink">Quote</p>
          <p className="mb-1 text-caption text-gray-500">
            {quote.tokenIn.symbol} → {quote.tokenOut.symbol}
          </p>
          <p className="mb-1 text-caption text-gray-500">
            Amount out: {quote.tokenOut.amount} {quote.tokenOut.symbol}
          </p>
          <p className="text-caption text-gray-500">
            Quote ID: {quote.quoteId}
          </p>
        </div>
      )}
    </div>
  );
};

export default Swap;
