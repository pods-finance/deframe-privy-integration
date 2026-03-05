import { use } from 'react'
import { WalletContext } from './wallet-context-def'

export function useWalletContext() {
    const ctx = use(WalletContext)
    if (!ctx) {
        throw new Error('useWalletContext must be used within WalletProvider')
    }
    return ctx
}
