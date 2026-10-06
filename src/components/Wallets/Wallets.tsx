import { useEffect, useState } from 'react';
import type { EvmChainId } from './useWallets';
import { useWalletContext } from './useWalletContext';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }
}

function CopyableAddress({ label, address }: { label: string; address?: string }) {
  const [copied, setCopied] = useState(false);
  const value = address?.trim();
  const canCopy = Boolean(value);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copied]);

  const copyAddress = async () => {
    if (!value) {
      return;
    }
    const didCopy = await copyText(value);
    setCopied(didCopy);
  };

  return (
    <p className="flex items-center justify-between gap-3 text-small text-gray-500">
      <span>{label}:</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="break-all font-mono text-ink">{value ?? '—'}</span>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm shrink-0 px-0"
          onClick={() => {
            void copyAddress();
          }}
          disabled={!canCopy}
          aria-label={`Copy ${label} address`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
    </p>
  );
}

const Wallets = () => {
  const {
    wallets,
    client,
    createWallet,
    shouldShowCreateButton,
    solanaWallet,
    createSolanaWallet,
    shouldShowCreateSolanaButton,
    stellarWallet,
    createStellarWallet,
    shouldShowCreateStellarButton,
    walletEnvironment,
    setWalletEnvironment,
    selectedEvmChainId,
    setSelectedEvmChainId,
    evmChains,
  } = useWalletContext();

  return (
    <div className="ui-sub-panel">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => { setWalletEnvironment('EVM'); }}
          className={`ui-btn-tab ui-btn-sm ${walletEnvironment === 'EVM' ? 'ui-btn-tab-active' : ''}`}
        >
          EVM
        </button>
        <button
          type="button"
          onClick={() => { setWalletEnvironment('SVM'); }}
          className={`ui-btn-tab ui-btn-sm ${walletEnvironment === 'SVM' ? 'ui-btn-tab-active' : ''}`}
        >
          SVM
        </button>
        <button
          type="button"
          onClick={() => { setWalletEnvironment('STELLAR'); }}
          className={`ui-btn-tab ui-btn-sm ${walletEnvironment === 'STELLAR' ? 'ui-btn-tab-active' : ''}`}
        >
          Stellar
        </button>
      </div>

      {walletEnvironment === 'EVM' && (
        <>
          <div className="mb-4">
            <label htmlFor="evm-chain-select" className="ui-label mb-1 block">
              Network
            </label>
            <select
              id="evm-chain-select"
              value={selectedEvmChainId}
              onChange={(e) => {
                const value = Number(e.target.value) as EvmChainId;
                setSelectedEvmChainId(value);
              }}
              className="ui-select"
            >
              {evmChains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {shouldShowCreateButton && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                className="ui-btn-primary ui-btn-sm"
                onClick={() => void createWallet()}
              >
                Create wallet
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <CopyableAddress label="EOA" address={wallets[0]?.address} />
            <CopyableAddress label="Smart" address={client?.account.address} />
          </div>
        </>
      )}

      {walletEnvironment === 'SVM' && (
        <>
          {shouldShowCreateSolanaButton && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                className="ui-btn-primary ui-btn-sm"
                onClick={() => void createSolanaWallet({ createAdditional: true })}
              >
                Create solana wallet
              </button>
            </div>
          )}
          <CopyableAddress label="SVM" address={solanaWallet?.address} />
        </>
      )}

      {walletEnvironment === 'STELLAR' && (
        <>
          {shouldShowCreateStellarButton && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                className="ui-btn-primary ui-btn-sm"
                onClick={() => void createStellarWallet()}
              >
                Create Stellar wallet
              </button>
            </div>
          )}
          <CopyableAddress label="Stellar" address={stellarWallet?.address} />
          <p className="mt-2 text-caption text-gray-400">
            Tier 2 — strategies use Privy rawSign on the transaction hash, then broadcast to Horizon.
          </p>
        </>
      )}
    </div>
  );
};

export default Wallets;
