import type { EvmChainId } from './useWallets';
import { useWalletContext } from './useWalletContext';

const Wallets = () => {
  const {
    wallets,
    client,
    createWallet,
    shouldShowCreateButton,
    solanaWallet,
    createSolanaWallet,
    shouldShowCreateSolanaButton,
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
      </div>

      {walletEnvironment === 'EVM' ? (
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
            <p className="flex justify-between text-small text-gray-500">
              EOA: <span className="font-mono text-ink">{wallets[0]?.address ?? '—'}</span>
            </p>
            <p className="flex justify-between text-small text-gray-500">
              Smart: <span className="font-mono text-ink">{client?.account.address ?? '—'}</span>
            </p>
          </div>
        </>
      ) : (
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
          <p className="flex justify-between text-small text-gray-500">
            SVM:{' '}
            <span className="font-mono text-ink">
              {(solanaWallet as { address?: string } | undefined)?.address ?? '—'}
            </span>
          </p>
        </>
      )}
    </div>
  );
};

export default Wallets;
