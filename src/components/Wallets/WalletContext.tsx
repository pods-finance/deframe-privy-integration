import type { ReactNode } from 'react'
import { useWalletsHook } from './useWallets'
import { WalletContext } from './wallet-context-def'

export function WalletProvider({ children }: { children: ReactNode }) {
    const value = useWalletsHook()
    return (
        <WalletContext value={value}>
            {children}
        </WalletContext>
    )
}
