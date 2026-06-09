import type { WalletEnvironment } from '../Wallets/useWallets';
import { useStrategies } from './useStrategies';
import Strategy from './Strategy';

interface Props {
  walletAddress?: string;
  walletEnvironment?: WalletEnvironment;
  selectedEvmChainId?: number;
}

const Strategies = ({
  walletAddress,
  walletEnvironment = 'EVM',
  selectedEvmChainId,
}: Props) => {
  const {
    strategies,
    loading,
    error,
    selectedActionById,
    setSelectedActionById,
    fetchStrategyDetails,
  } = useStrategies(walletAddress, walletEnvironment, selectedEvmChainId);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="ui-heading-section">Strategies</h2>

      {loading && <p className="ui-text-muted">Loading strategies…</p>}
      {error && <p className="ui-text-error">{error}</p>}

      {!loading && !error && strategies.length === 0 && (
        <p className="ui-text-muted">No strategies found.</p>
      )}

      <div className="flex flex-col gap-4">
        {[...strategies].reverse().map((s) => {
          const firstAction = (s.availableActions ?? [])[0] ?? '';
          const selectedAction = selectedActionById[s.id] ?? firstAction;

          return (
            <Strategy
              key={s.id}
              strategy={s}
              selectedAction={selectedAction}
              onSelectAction={(action) => {
                setSelectedActionById((prev) => ({ ...prev, [s.id]: action }));
              }}
              walletAddress={walletAddress ?? ''}
              fetchStrategyDetails={fetchStrategyDetails}
              walletEnvironment={walletEnvironment}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Strategies;
