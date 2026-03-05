import type { EvmChainId } from './useWallets'
import { useWalletContext } from './useWalletContext'

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
    } = useWalletContext()

    return (
        <div>
            <div className="mb-3 flex gap-2">
                <button
                    type="button"
                    onClick={() => { setWalletEnvironment('EVM') }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${walletEnvironment === 'EVM' ? 'bg-indigo-600 text-white' : 'border border-slate-800 text-slate-300 hover:text-slate-100'}`}
                >
                    EVM
                </button>
                <button
                    type="button"
                    onClick={() => { setWalletEnvironment('SVM') }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${walletEnvironment === 'SVM' ? 'bg-indigo-600 text-white' : 'border border-slate-800 text-slate-300 hover:text-slate-100'}`}
                >
                    SVM
                </button>
            </div>

            {walletEnvironment === 'EVM' ? (
                <>
                    <div className="mb-3">
                        <label htmlFor="evm-chain-select" className="mb-1 block text-xs text-slate-400">
                            Rede
                        </label>
                        <select
                            id="evm-chain-select"
                            value={selectedEvmChainId}
                            onChange={(e) => {
                                const value = Number(e.target.value) as EvmChainId
                                setSelectedEvmChainId(value)
                            }}
                            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            {evmChains.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {shouldShowCreateButton && (
                        <div className="flex justify-center">
                            <button
                                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => void createWallet()}
                            >
                                Create wallet
                            </button>
                        </div>
                    )}
                    <div>
                        <p className="flex justify-between text-sm text-slate-400">EOA: <span className="text-slate-100">{wallets[0]?.address ?? '—'}</span></p>
                        <p className="flex justify-between text-sm text-slate-400">Smart: <span className="text-slate-100">{client?.account.address ?? '—'}</span></p>
                    </div>
                </>
            ) : (
                <>
                    {shouldShowCreateSolanaButton && (
                        <div className="flex justify-center">
                            <button
                                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => void createSolanaWallet({ createAdditional: true })}
                            >
                                Create solana wallet
                            </button>
                        </div>
                    )}
                    <div>
                        <p className="flex justify-between text-sm text-slate-400">SVM: <span className="text-slate-100">{(solanaWallet as { address?: string } | undefined)?.address ?? '—'}</span></p>
                    </div>
                </>
            )}
        </div>
    )
}

export default Wallets