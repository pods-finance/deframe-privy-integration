import { useState } from 'react'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import {
  useCreateWallet as useCreateExtendedWallet,
  useSignRawHash,
} from '@privy-io/react-auth/extended-chains'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useCreateWallet as useCreateSolanaWallet } from '@privy-io/react-auth/solana'
import { arbitrum, avalanche, base, bsc, gnosis, hyperEvm, mainnet, optimism, polygon } from 'viem/chains'

export type WalletEnvironment = 'EVM' | 'SVM' | 'STELLAR'

interface LinkedAccount { chainType?: string; address?: string }

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

    const { createWallet } = useCreateWallet()
    const { createWallet: createSolanaWallet } = useCreateSolanaWallet()
    const { createWallet: createExtendedWallet } = useCreateExtendedWallet()
    const { signRawHash } = useSignRawHash()
    const { user, ready } = usePrivy()
    const { wallets } = useWallets()
    const { client } = useSmartWallets()

    const linkedAccounts = user?.linkedAccounts as LinkedAccount[] | undefined

    const shouldShowCreateButton = ready && wallets.length === 0

    const solanaWallet = findLinkedAccount(linkedAccounts, 'solana')
    const shouldShowCreateSolanaButton = ready && solanaWallet === undefined

    const stellarWallet = findLinkedAccount(linkedAccounts, 'stellar')
    const shouldShowCreateStellarButton = ready && stellarWallet === undefined

    const createStellarWallet = async () => {
        return createExtendedWallet({ chainType: 'stellar' })
    }

    // Privy deploys a counterfactual account when the user submits an operation.
    // Reading a wallet or changing the chain must never submit a transaction.

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
