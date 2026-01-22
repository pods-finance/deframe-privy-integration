import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import YourApp from './components/YourApp';

function App() {
  const privyAppId = import.meta.env.VITE_APP_PRIVY_APP_ID || ''

  if (!privyAppId) {
    throw new Error('VITE_APP_PRIVY_APP_ID is not set')
  }

  return (
    <PrivyProvider appId={privyAppId} config={{
      embeddedWallets: {
        ethereum: {
          createOnLogin: "users-without-wallets",
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
