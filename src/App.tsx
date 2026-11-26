import { Fragment } from 'react'
import CustomerKeyGate from './components/CustomerKeyGate'
import { targetPath, targetLabel, targetOrigin, targetId } from './preview'
import { PrivyProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import BridgeCatalog from './components/BridgeCatalog/BridgeCatalog';
import PreviewQuotes from './components/Ramp/PreviewQuotes';
import YourApp from './components/YourApp';
import { arbitrum, base, mainnet, optimism, polygon, gnosis, stable, hyperEvm, avalanche, bsc } from 'viem/chains';

const KeyGate = targetId === 'prod' || targetId === 'staging' ? CustomerKeyGate : Fragment
const solanaConnectors = toSolanaWalletConnectors()

function App() {
  const privyAppId = import.meta.env.VITE_APP_PRIVY_APP_ID || ''

  if (!privyAppId) {
    throw new Error('VITE_APP_PRIVY_APP_ID is not set')
  }

  const path = window.location.pathname
  if (path !== '/' && path !== targetPath && !path.startsWith(targetPath + '/')) {
    return <main className="ui-container py-10">This tester is running {targetLabel} at {targetOrigin}. <a href={targetPath + '/catalog'}>Open its route catalog</a></main>
  }

  return (
    <>
      <header className="ui-container py-2">API target <strong>{targetLabel}</strong> · <code>{targetOrigin}</code></header>
      <KeyGate>
        <PrivyProvider appId={privyAppId} config={{
          externalWallets: { solana: { connectors: solanaConnectors } },
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
                rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
                rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
              },
            },
          },
        }}>
          <SmartWalletsProvider>
            {['/', targetPath + '/catalog'].includes(path) ? <BridgeCatalog /> : [targetPath, targetPath + '/forward'].includes(path) ? <PreviewQuotes /> : <YourApp />}
          </SmartWalletsProvider>
        </PrivyProvider>
      </KeyGate>
    </>
  )
}

export default App
