import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import YourApp from './components/YourApp';
import { arbitrum, base, mainnet, optimism, polygon, gnosis, hyperEvm, avalanche, bsc } from 'viem/chains';

function App() {
  const privyAppId = import.meta.env.VITE_APP_PRIVY_APP_ID || ''
  const heliusApiKey = import.meta.env.VITE_APP_HELIUS_API_KEY || ''

  if (!privyAppId) {
    throw new Error('VITE_APP_PRIVY_APP_ID is not set')
  }

  return (
    <PrivyProvider appId={privyAppId} config={{
      embeddedWallets: {
        ethereum: {
          createOnLogin: "users-without-wallets",
        },
        solana: {
          createOnLogin: "users-without-wallets",
        },
      },
      supportedChains: [arbitrum, base, bsc, mainnet, optimism, polygon, gnosis, hyperEvm, avalanche],
      solana: {
        rpcs: {
          'solana:mainnet': {
            rpc: createSolanaRpc(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`),
            rpcSubscriptions: createSolanaRpcSubscriptions(`wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`),
          },
        },
      },
    }}>
      <SmartWalletsProvider>
        <YourApp />
      </SmartWalletsProvider>
    </PrivyProvider>
  )
}

export default App
