import { useEffect, useMemo } from 'react'
import { useCreateWallet, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const Wallets = () => {
    const { createWallet } = useCreateWallet();
    const { wallets, ready } = useWallets();
    const { client, getClientForChain } = useSmartWallets();

    const renderCreateWalletButton = useMemo(() => {
        if (ready && wallets.length === 0) {
            return (
                <div className='flex justify-center'>
                    <button
                        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            void createWallet()
                        }}
                    >
                        Create wallet
                    </button>
                </div>
            )
        }
        return null
    }, [createWallet, ready, wallets])

    useEffect(() => {
        if (!client?.account.address) {
            return
        }
        const fetchBytecode = async () => {
            const publicClient = createPublicClient({
                chain: base,
                transport: http(),
            })
            console.log({ publicClient })
            const bytecode = await publicClient.getCode({
                address: client.account.address,
            })
            console.log({ bytecode })
            if (bytecode === '0x' || !bytecode) {
                console.log('Wallet was not been deployed!')
                try {
                    const chainClient = await getClientForChain({
                        id: 8453
                    });
                    console.log({ chainClient })
                    if (!chainClient) {
                        console.log('Chain client not found')
                        return
                    }
                    const tx: unknown = await chainClient.sendTransaction({
                        to: client.account.address,
                        value: 0n,
                        data: '0x',
                    })
                    console.log({ tx })
                } catch (e) {
                    console.log('Chain client not found', e)
                    return
                }
            } else {
                console.log('Wallet was been deployed!')
            }
        }
        void fetchBytecode()
    }, [client?.account.address, getClientForChain])

    return (
        <div>
            {renderCreateWalletButton}
            <div>
                <p className='text-sm text-slate-400 flex justify-between'>EOA: <span className='text-slate-100'>{wallets[0]?.address ?? '—'}</span></p>
                <p className='text-sm text-slate-400 flex justify-between'>Smart: <span className='text-slate-100'>{client?.account.address ?? '—'}</span></p>
            </div>
        </div>
    )
}

export default Wallets