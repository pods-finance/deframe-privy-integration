import { useState } from 'react';
import { useTransfer } from './useTransfer';

const CHAINS: { id: number; name: string }[] = [
  { id: 1, name: 'Ethereum' },
  { id: 8453, name: 'Base' },
  { id: 42161, name: 'Arbitrum' },
  { id: 137, name: 'Polygon' },
  { id: 56, name: 'BSC' },
  { id: 999, name: 'HyperEVM' },
  { id: 43114, name: 'Avalanche' },
  { id: 10, name: 'Optimism' },
  { id: 100, name: 'Gnosis' },
];

interface Props {
  walletAddress?: string;
}

const Transfer = ({ walletAddress }: Props) => {
  const { executeTransfer, loading, error, txHash, walletAddress: hookWallet } = useTransfer(walletAddress);
  const address = walletAddress ?? hookWallet ?? '';

  const [walletOrigin, setWalletOrigin] = useState('');
  const [walletDestination, setWalletDestination] = useState('');
  const [token, setToken] = useState('0x0000000000000000000000000000000000000000');
  const [amount, setAmount] = useState('');
  const [chainId, setChainId] = useState('8453');

  const effectiveWalletOrigin = walletOrigin || address;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeTransfer({
      walletOrigin: effectiveWalletOrigin,
      walletDestination,
      token,
      amount,
      chainId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="ui-heading-section">Transfer</h2>
      <p className="ui-text-secondary">
        Transfer tokens between wallets. Use{' '}
        <code className="ui-code">0x0000...0000</code> for native token (ETH, etc.).
      </p>

      <div className="flex flex-col gap-1">
        <label className="ui-label" htmlFor="transfer-wallet-origin">
          From (wallet origin)
        </label>
        <input
          id="transfer-wallet-origin"
          value={effectiveWalletOrigin}
          onChange={(e) => { setWalletOrigin(e.target.value); }}
          placeholder="0x..."
          className="ui-input ui-input-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="ui-label" htmlFor="transfer-wallet-destination">
          To (wallet destination)
        </label>
        <input
          id="transfer-wallet-destination"
          value={walletDestination}
          onChange={(e) => { setWalletDestination(e.target.value); }}
          placeholder="0x..."
          className="ui-input ui-input-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="ui-label" htmlFor="transfer-token">
          Token address
        </label>
        <input
          id="transfer-token"
          value={token}
          onChange={(e) => { setToken(e.target.value); }}
          placeholder="0x... or 0x0000...0000 for native"
          className="ui-input ui-input-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="ui-label" htmlFor="transfer-amount">
          Amount (in wei / smallest unit)
        </label>
        <input
          id="transfer-amount"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); }}
          placeholder="1000000000000000000"
          className="ui-input"
          inputMode="decimal"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="ui-label" htmlFor="transfer-chain-id">
          Chain ID
        </label>
        <select
          id="transfer-chain-id"
          value={chainId}
          onChange={(e) => { setChainId(e.target.value); }}
          className="ui-select"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="ui-text-error">{error}</p>}
      {txHash && <p className="ui-text-success">Transaction sent: {txHash}</p>}

      <button
        type="submit"
        disabled={loading || !effectiveWalletOrigin || !walletDestination || !token || !amount}
        className="ui-btn-primary w-full sm:w-auto"
      >
        {loading ? 'Transferring…' : 'Transfer'}
      </button>
    </form>
  );
};

export default Transfer;
