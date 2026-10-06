import { useEffect, useState } from 'react'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import {
  useCreateWallet as useCreateExtendedWallet,
  useSignRawHash,
} from '@privy-io/react-auth/extended-chains'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useCreateWallet as useCreateSolanaWallet } from '@privy-io/react-auth/solana'
import { createPublicClient, http } from 'viem'
import { arbitrum, avalanche, base, bsc, gnosis, hyperEvm, mainnet, optimism, polygon } from 'viem/chains'

export type WalletEnvironment = 'EVM' | 'SVM' | 'STELLAR'

type LinkedAccount = { chainType?: string; address?: string }

export const EVM_CHAINS = [
    { id: mainnet.id, name: 'Mainnet', chain: mainnet },
    { id: polygon.id, name: 'Polygon', chain: polygon },
    { id: bsc.id, name: 'BSC', chain: bsc },
    { id: base.id, name: 'Base', chain: base },
    { id: arbitrum.id, name: 'Arbitrum', chain: arbitrum },
    { id: optimism.id, name: 'Optimism', chain: optimism },
    { id: hyperEvm.id, name: 'HyperEvm', chain: hyperEvm },
    { id: gnosis.id, name: 'Gnosis', chain: gnosis },
    { id: avalanche.id, name: 'Avalanche', chain: avalanche },
] as const

export type EvmChainId = (typeof EVM_CHAINS)[number]['id']

function findLinkedAccount(
  accounts: LinkedAccount[] | undefined,
  chainType: string
): LinkedAccount | undefined {
  return accounts?.find((account) => account.chainType === chainType)
}

export function useWalletsHook() {
    const [walletEnvironment, setWalletEnvironment] = useState<WalletEnvironment>('EVM')
    const [selectedEvmChainId, setSelectedEvmChainId] = useState<EvmChainId>(mainnet.id)

    const selectedChain = EVM_CHAINS.find((c) => c.id === selectedEvmChainId) ?? EVM_CHAINS[0]

    const { createWallet } = useCreateWallet()
    const { createWallet: createSolanaWallet } = useCreateSolanaWallet()
    const { createWallet: createExtendedWallet } = useCreateExtendedWallet()
    const { signRawHash } = useSignRawHash()
    const { user, ready } = usePrivy()
    const { wallets } = useWallets()
    const { client, getClientForChain } = useSmartWallets()

    const linkedAccounts = user?.linkedAccounts as LinkedAccount[] | undefined

    const shouldShowCreateButton = ready && wallets.length === 0

    const solanaWallet = findLinkedAccount(linkedAccounts, 'solana')
    const shouldShowCreateSolanaButton = ready && solanaWallet === undefined

    const stellarWallet = findLinkedAccount(linkedAccounts, 'stellar')
    const shouldShowCreateStellarButton = ready && stellarWallet === undefined

    const createStellarWallet = async () => {
        return createExtendedWallet({ chainType: 'stellar' })
    }

    useEffect(() => {
        if (!client?.account.address) {
            return
        }
        const fetchBytecode = async () => {
            const publicClient = createPublicClient({
                chain: selectedChain.chain,
                transport: http(),
            })
            const bytecode = await publicClient.getCode({
                address: client.account.address,
            })
            if (bytecode === '0x' || !bytecode) {
                console.log('Wallet was not been deployed!')
                try {
                    const chainClient = await getClientForChain({
                        id: selectedChain.id
                    })
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
    }, [client?.account.address, getClientForChain, selectedChain])

    const activeWalletAddress =
        walletEnvironment === 'EVM'
            ? client?.account.address
            : walletEnvironment === 'SVM'
              ? solanaWallet?.address ?? ''
              : stellarWallet?.address ?? ''

    return {
        wallets,
        ready,
        client,
        createWallet,
        shouldShowCreateButton,
        solanaWallet,
        createSolanaWallet,
        shouldShowCreateSolanaButton,
        stellarWallet,
        createStellarWallet,
        shouldShowCreateStellarButton,
        signRawHash,
        walletEnvironment,
        setWalletEnvironment,
        activeWalletAddress,
        selectedEvmChainId,
        setSelectedEvmChainId,
        evmChains: EVM_CHAINS,
    }
}
