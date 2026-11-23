import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import BridgeCatalog from './components/BridgeCatalog/BridgeCatalog';
import Preview3364 from './components/Ramp/Preview3364';
import YourApp from './components/YourApp';
import { arbitrum, base, mainnet, optimism, polygon, gnosis, stable, hyperEvm, avalanche, bsc } from 'viem/chains';

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
      // supportedChains: [gnosis],
      supportedChains: [arbitrum, base, bsc, mainnet, optimism, polygon, gnosis, stable, hyperEvm, avalanche],
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
        {['/', '/pr-3500/catalog'].includes(window.location.pathname) ? <BridgeCatalog /> : ['/pr-3500', '/pr-3500/forward'].includes(window.location.pathname) ? <Preview3364 /> : <YourApp />}
      </SmartWalletsProvider>
    </PrivyProvider>
  )
}

export default App
