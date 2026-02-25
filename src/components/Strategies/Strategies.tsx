import { useStrategies } from './useStrategies'
import Strategy from './Strategy'

interface Props {
    walletAddress?: string
}

const Strategies = ({ walletAddress }: Props) => {
    const {
        strategies,
        loading,
        error,
        selectedActionById,
        setSelectedActionById,
        fetchStrategyDetails,
    } = useStrategies(walletAddress)

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Strategies</h2>

            {loading && <p className="text-sm text-slate-400">Loading strategies…</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}

            {!loading && !error && strategies.length === 0 && (
                <p className="text-sm text-slate-400">No strategies found.</p>
            )}

            <div className="flex flex-col gap-3">
                {strategies.map((s) => {
                    const firstAction = (s.availableActions ?? [])[0] ?? ''
                    const selectedAction = selectedActionById[s.id] ?? firstAction

                    return (
                        <Strategy
                            key={s.id}
                            strategy={s}
                            selectedAction={selectedAction}
                            onSelectAction={(action) => {
                                setSelectedActionById((prev) => {
                                    return { ...prev, [s.id]: action }
                                })
                            }}
                            walletAddress={walletAddress ?? ''}
                            fetchStrategyDetails={fetchStrategyDetails}
                        />
                    )
                })}
            </div>
        </div>
    )
}

export default Strategies