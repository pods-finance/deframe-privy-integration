import { useTokenBalances } from './useTokenBalances';

interface Props {
  walletAddress?: string | null;
}

const TokenBalances = ({ walletAddress }: Props) => {
  const { balances, loading, error } = useTokenBalances(walletAddress);

  if (!walletAddress) {
    return (
      <div className="ui-card p-6 lg:p-8">
        <h3 className="ui-heading-section mb-4">Balances by network</h3>
        <p className="ui-text-muted">Connect a smart wallet to view balances.</p>
      </div>
    );
  }

  return (
    <div className="ui-card p-6 lg:p-8">
      <h3 className="ui-heading-section mb-4">Balances by network</h3>

      {loading && <p className="ui-text-muted">Loading balances…</p>}

      {error && <p className="ui-text-error mb-4">{error}</p>}

      {!loading && balances.length === 0 && !error && (
        <p className="ui-text-muted">No tokens configured to display.</p>
      )}

      {!loading && balances.length > 0 && (
        <div className="flex flex-col gap-6 overflow-y-auto">
          {[...balances]
            .sort((a, b) => {
              const aHasBalance = a.tokens.some((t) => t.balance > 0n);
              const bHasBalance = b.tokens.some((t) => t.balance > 0n);
              if (aHasBalance && !bHasBalance) return -1;
              if (!aHasBalance && bHasBalance) return 1;
              return 0;
            })
            .map(({ chainId, chainName, tokens }) => (
              <div key={chainId} className="ui-sub-panel">
                <p className="mb-3 text-small font-medium text-gray-500">
                  {chainName} (ID: {chainId})
                </p>
                <ul className="flex flex-col gap-2">
                  {[...tokens]
                    .sort((a, b) => (a.balance < b.balance ? 1 : a.balance > b.balance ? -1 : 0))
                    .map(({ token, formatted }) => (
                      <li
                        key={token.address}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-small"
                      >
                        <span className="font-medium text-ink">{token.symbol}</span>
                        <span className="font-mono text-gray-500">
                          {parseFloat(formatted) > 0
                            ? Number(formatted).toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })
                            : '0'}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default TokenBalances;
