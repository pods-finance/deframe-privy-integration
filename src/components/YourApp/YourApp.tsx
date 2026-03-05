import { usePrivy } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { useState } from 'react';
import Auth from '../Auth';
import Wallets from '../Wallets';
import { WalletProvider } from '../Wallets/WalletContext';
import { useWalletContext } from '../Wallets/useWalletContext';
import Strategies from '../Strategies';
import Swap from '../Swap';
import Transfer from '../Transfer/Transfer';
import EarnWidgetHost from '../EarnWidgetHost';

function AppTabContent() {
    const ctx = useWalletContext()
    const walletAddress: string | undefined = ctx.activeWalletAddress ?? undefined
    const walletEnvironment = ctx.walletEnvironment
    const selectedEvmChainId =
        walletEnvironment === 'EVM' ? ctx.selectedEvmChainId : undefined
    return (
        <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
            <Wallets />
            <Strategies
                walletAddress={walletAddress}
                walletEnvironment={walletEnvironment}
                selectedEvmChainId={selectedEvmChainId}
            />
        </div>
    )
}

const YourApp = () => {
    const { ready, authenticated, user, logout } = usePrivy();
    const { client } = useSmartWallets();
    const [activeTab, setActiveTab] = useState<'app' | 'transfer' | 'swap' | 'deframe'>('app');
    if (!ready) {
        return <div>Loading...</div>;
    }

    if (!authenticated) {
        return <Auth />;
    }

    return (
        <div className="min-h-screen w-full bg-slate-950 px-4 py-10 text-slate-100">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                    <p>Hello {user?.email?.address ?? 'User'}</p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('app');
                            }}
                            className={`rounded-lg px-3 py-1 text-sm font-medium ${activeTab === 'app'
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-800 text-slate-300 hover:text-slate-100'
                                }`}
                        >
                            Your app
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('transfer');
                            }}
                            className={`rounded-lg px-3 py-1 text-sm font-medium ${activeTab === 'transfer'
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-800 text-slate-300 hover:text-slate-100'
                                }`}
                        >
                            Transfer
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('swap');
                            }}
                            className={`rounded-lg px-3 py-1 text-sm font-medium ${activeTab === 'swap'
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-800 text-slate-300 hover:text-slate-100'
                                }`}
                        >
                            Swap
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('deframe');
                            }}
                            className={`rounded-lg px-3 py-1 text-sm font-medium ${activeTab === 'deframe'
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-800 text-slate-300 hover:text-slate-100'
                                }`}
                        >
                            Deframe SDK
                        </button>
                        <button
                            className="cursor-pointer text-sm text-slate-400 hover:text-slate-300"
                            onClick={() => void logout()}
                        >
                            Logout
                        </button>
                    </div>
                </div>

                <WalletProvider>
                    {activeTab === 'app' ? (
                        <AppTabContent />
                    ) : activeTab === 'transfer' ? (
                        <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
                            <Wallets />
                            <Transfer walletAddress={client?.account.address} />
                        </div>
                    ) : activeTab === 'swap' ? (
                        <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
                            <Wallets />
                            <Swap walletAddress={client?.account.address} />
                        </div>
                    ) : (
                        <EarnWidgetHost />
                    )}
                </WalletProvider>
            </div>
        </div>
    );
}

export default YourApp;
