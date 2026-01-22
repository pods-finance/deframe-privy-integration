import { usePrivy } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import Auth from '../Auth';
import Wallets from '../Wallets';
import Strategies from '../Strategies';

const YourApp = () => {
    const { ready, authenticated, user, logout } = usePrivy();
    const { client } = useSmartWallets();
    if (!ready) {
        return <div>Loading...</div>;
    }

    if (!authenticated) {
        return <Auth />;
    }

    return (
        <div className="min-h-screen w-full bg-slate-950 px-4 py-10 text-slate-100">
            <div className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
                <div className='flex justify-between'>
                    <p>Hello {user?.email?.address ?? 'User'}</p>
                    <button className='cursor-pointer text-sm text-slate-400 hover:text-slate-300' onClick={() => void logout()}>Logout</button>
                </div>
                <Wallets />
                <Strategies walletAddress={client?.account.address} />
            </div>
        </div>
    );
}

export default YourApp;
