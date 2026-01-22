import type { Strategy as StrategyModel } from './useStrategies'
import { useStrategy } from './useStrategy'

interface Props {
  strategy: StrategyModel
  selectedAction: string
  onSelectAction: (action: string) => void
  fetchStrategyDetails: (strategyId: string, wallet: string) => Promise<unknown>
  walletAddress: string
}

const Strategy = ({ strategy, selectedAction, onSelectAction, fetchStrategyDetails, walletAddress }: Props) => {
  const {
    options,
    avgApyPct,
    underlyingDecimals,
    amount,
    setAmount,
    bytecodesLoading,
    bytecodesError,
    fetchBytecodes,
  } = useStrategy({
    strategy,
    selectedAction,
    walletAddress,
    fetchStrategyDetails,
  })

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="h-12 w-12 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
        {strategy.logourl ? (
          <img
            src={strategy.logourl}
            alt={`${strategy.assetName} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            {strategy.assetName.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{strategy.assetName}</p>
            <p className="truncate text-xs text-slate-400">
              {strategy.protocol}
              {strategy.network ? ` · ${strategy.network}` : ''}
            </p>
          </div>
          <div className="pt-1 text-xs text-slate-400">
            Avg APY:{' '}
            <span className="font-medium text-slate-200">
              {avgApyPct === null ? '—' : `${avgApyPct.toFixed(2)}%`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor={`action-${strategy.id}`}>
            Action
          </label>
          <select
            id={`action-${strategy.id}`}
            value={selectedAction}
            onChange={(e) => {
              onSelectAction(e.currentTarget.value)
            }}
            className="flex-1 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1 text-sm text-slate-100"
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
          <label className="text-xs text-slate-400" htmlFor={`amount-${strategy.id}`}>
            Amount
            {underlyingDecimals === null ? '' : ` (decimals: ${String(underlyingDecimals)})`}
          </label>
          <input
            id={`amount-${strategy.id}`}
            value={amount}
            onChange={(e) => {
              setAmount(e.currentTarget.value)
            }}
            placeholder="0.0"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
            inputMode="decimal"
          />
          {bytecodesError && <p className="text-xs text-red-300">{bytecodesError}</p>}
          <button
            type="button"
            onClick={() => {
              void fetchBytecodes()
            }}
            disabled={bytecodesLoading || !walletAddress}
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bytecodesLoading ? 'Fetching bytecodes…' : 'Fetch bytecodes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Strategy

