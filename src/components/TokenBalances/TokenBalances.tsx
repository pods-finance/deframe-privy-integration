import { useTokenBalances } from './useTokenBalances'

interface Props {
  walletAddress?: string | null
}

const TokenBalances = ({ walletAddress }: Props) => {
  const { balances, loading, error } = useTokenBalances(walletAddress)

  if (!walletAddress) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur">
        <h3 className="mb-4 text-lg font-semibold text-slate-300">Saldos por rede</h3>
        <p className="text-sm text-slate-500">Conecte uma smart wallet para ver os saldos.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur">
      <h3 className="mb-4 text-lg font-semibold text-slate-300">Saldos por rede</h3>

      {loading && (
        <p className="text-sm text-slate-400">Carregando saldos…</p>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-300">{error}</p>
      )}

      {!loading && balances.length === 0 && !error && (
        <p className="text-sm text-slate-500">Nenhum token configurado para exibir.</p>
      )}

      {!loading && balances.length > 0 && (
        <div className="flex flex-col gap-6 overflow-y-auto">
          {[...balances]
            .sort((a, b) => {
              const aHasBalance = a.tokens.some((t) => t.balance > 0n)
              const bHasBalance = b.tokens.some((t) => t.balance > 0n)
              if (aHasBalance && !bHasBalance) return -1
              if (!aHasBalance && bHasBalance) return 1
              return 0
            })
            .map(({ chainId, chainName, tokens }) => (
              <div
                key={chainId}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
              >
                <p className="mb-3 text-sm font-medium text-slate-400">
                  {chainName} (ID: {chainId})
                </p>
                <ul className="flex flex-col gap-2">
                  {[...tokens]
                    .sort((a, b) => (a.balance < b.balance ? 1 : a.balance > b.balance ? -1 : 0))
                    .map(({ token, formatted }) => (
                      <li
                        key={token.address}
                        className="flex items-center justify-between rounded border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-200">{token.symbol}</span>
                        <span className="font-mono text-slate-300">
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
  )
}

export default TokenBalances
