import type { WalletEnvironment } from '../Wallets/useWallets';
import type { Strategy as StrategyModel } from './useStrategies';
import { useStrategy } from './useStrategy';

interface Props {
  strategy: StrategyModel;
  selectedAction: string;
  onSelectAction: (action: string) => void;
  fetchStrategyDetails: (strategyId: string, wallet: string) => Promise<unknown>;
  walletAddress: string;
  walletEnvironment?: WalletEnvironment;
}

const Strategy = ({
  strategy,
  selectedAction,
  onSelectAction,
  fetchStrategyDetails,
  walletAddress,
  walletEnvironment = 'EVM',
}: Props) => {
  const {
    options,
    details,
    detailsLoading,
    refreshDetails,
    avgApyPct,
    underlyingDecimals,
    assetDecimals,
    isOndoBsc,
    amount,
    setAmount,
    amountInShares,
    setAmountInShares,
    fromTokenAddress,
    setFromTokenAddress,
    fromChainId,
    setFromChainId,
    toTokenAddress,
    setToTokenAddress,
    toChainId,
    setToChainId,
    destinationAddress,
    setDestinationAddress,
    reserveAddress,
    setReserveAddress,
    bytecodesLoading,
    bytecodesError,
    fetchBytecodes,
  } = useStrategy({
    strategy,
    selectedAction,
    walletAddress,
    fetchStrategyDetails,
    walletEnvironment,
  });

  const currentPositionValue = details?.spotPosition.currentPosition.value ?? '—';
  const currentPositionInSharesValue =
    details?.spotPosition.currentPositionInShares?.value ?? '—';
  const profitValue = details?.spotPosition.profit.value ?? '—';

  return (
    <div className="ui-card flex items-start gap-4 p-4 lg:p-6">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {strategy.logourl ? (
          <img
            src={strategy.logourl}
            alt={`${strategy.assetName} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-caption text-gray-400">
            {strategy.assetName.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-h4 font-semibold text-ink">{strategy.assetName}</p>
            <p className="truncate text-caption text-gray-500">
              {strategy.protocol}
              {strategy.network ? ` · ${strategy.network}` : ''}
            </p>
          </div>
          <div className="text-caption text-gray-500">
            Avg APY:{' '}
            <span className="font-semibold text-ink">
              {avgApyPct === null ? '—' : `${avgApyPct.toFixed(2)}%`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => { void refreshDetails(); }}
            disabled={!walletAddress || detailsLoading}
            className="ui-btn-secondary ui-btn-sm"
          >
            {detailsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-caption text-gray-500">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between gap-2">
              <span>Position</span>
              <span className="font-medium text-ink">{currentPositionValue}</span>
            </div>
            {isOndoBsc && (
              <div className="flex justify-between gap-2">
                <span>PositionInShares</span>
                <span className="font-medium text-ink">{currentPositionInSharesValue}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between gap-2">
            <span>Profit</span>
            <span className="font-medium text-ink">{profitValue}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="ui-label shrink-0" htmlFor={`action-${strategy.id}`}>
            Action
          </label>
          <select
            id={`action-${strategy.id}`}
            value={selectedAction}
            onChange={(e) => { onSelectAction(e.currentTarget.value); }}
            className="ui-select flex-1"
            disabled={options.length === 0}
          >
            {options.length === 0 ? (
              <option value="">No actions</option>
            ) : (
              options.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor={`amount-${strategy.id}`}>
            Amount
            {underlyingDecimals === null ? '' : ` (decimals: ${String(underlyingDecimals)})`}
          </label>
          <input
            id={`amount-${strategy.id}`}
            value={amount}
            onChange={(e) => { setAmount(e.currentTarget.value); }}
            placeholder="0.0"
            className="ui-input"
            inputMode="decimal"
          />
        </div>

        {isOndoBsc && (
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor={`amountInShares-${strategy.id}`}>
              AmountInShares
              {assetDecimals === null ? '' : ` (decimals: ${String(assetDecimals)})`}
            </label>
            <input
              id={`amountInShares-${strategy.id}`}
              value={amountInShares}
              onChange={(e) => { setAmountInShares(e.currentTarget.value); }}
              placeholder="0.0"
              className="ui-input"
              inputMode="decimal"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor={`fromToken-${strategy.id}`}>
              From Token Address
            </label>
            <input
              id={`fromToken-${strategy.id}`}
              value={fromTokenAddress}
              onChange={(e) => { setFromTokenAddress(e.currentTarget.value); }}
              placeholder="0x..."
              className="ui-input ui-input-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor={`fromChainId-${strategy.id}`}>
              From Chain ID
            </label>
            <input
              id={`fromChainId-${strategy.id}`}
              value={fromChainId}
              onChange={(e) => { setFromChainId(e.currentTarget.value); }}
              placeholder="e.g. 8453"
              className="ui-input"
              inputMode="numeric"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor={`toToken-${strategy.id}`}>
              To Token Address
            </label>
            <input
              id={`toToken-${strategy.id}`}
              value={toTokenAddress}
              onChange={(e) => { setToTokenAddress(e.currentTarget.value); }}
              placeholder="0x..."
              className="ui-input ui-input-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor={`toChainId-${strategy.id}`}>
              To Chain ID
            </label>
            <input
              id={`toChainId-${strategy.id}`}
              value={toChainId}
              onChange={(e) => { setToChainId(e.currentTarget.value); }}
              placeholder="e.g. 1"
              className="ui-input"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor={`destinationAddress-${strategy.id}`}>
            Destination Address
          </label>
          <input
            id={`destinationAddress-${strategy.id}`}
            value={destinationAddress}
            onChange={(e) => { setDestinationAddress(e.currentTarget.value); }}
            placeholder="0x..."
            className="ui-input ui-input-mono"
          />
        </div>

        {strategy.network?.toLowerCase() === 'solana' && (
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor={`reserveAddress-${strategy.id}`}>
              Reserve Address (SVM)
            </label>
            <input
              id={`reserveAddress-${strategy.id}`}
              value={reserveAddress}
              onChange={(e) => { setReserveAddress(e.currentTarget.value); }}
              placeholder="SVM reserve address"
              className="ui-input ui-input-mono"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          {bytecodesError && <p className="ui-text-error">{bytecodesError}</p>}
          <button
            type="button"
            onClick={() => { void fetchBytecodes(); }}
            disabled={bytecodesLoading || !walletAddress}
            className="ui-btn-primary mt-1 w-full sm:w-auto"
          >
            {bytecodesLoading ? 'Fetching bytecodes…' : 'Fetch bytecodes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Strategy;
