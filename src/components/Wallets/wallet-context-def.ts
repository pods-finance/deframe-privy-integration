import { createContext } from 'react'
import type { useWalletsHook } from './useWallets'

export type WalletContextValue = ReturnType<typeof useWalletsHook> | null

export const WalletContext = createContext<WalletContextValue>(null)
