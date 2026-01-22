
# Build Yield Strategies with Deframe & Privy

Enable users to access DeFi yield strategies with a Web2-grade experience by combining Privy’s embedded wallets with Deframe’s strategy execution layer. This recipe shows how to route user funds into diversified yield strategies—spanning lending, staking, and protocol-native yields—while Deframe handles bytecode generation, protocol routing, and execution. Privy simplifies onboarding and wallet management, allowing users to earn yield across DeFi without interacting directly with contracts or managing complex transaction flows.

## Resources

- **Deframe Docs**
  - Official documentation for Deframe strategies.
  - Open docs: `https://docs.deframe.io/`
- **Privy Wallets**
  - Privy Wallets are a powerful tool for helping users interact with DeFi.
  - Open docs: `https://docs.privy.io/wallets`

## Install and configure the Vite projet

Commands/selections used (as shown in the `create-vite` wizard):

```bash
yarn create vite
```

- **Project name**: `deframe-privy-integration`
- **Select a framework**: `React`
- **Select a variant**: `TypeScript + SWC`
- **Use rolldown-vite (Experimental)?**: `No`
- **Install with yarn and start now?**: `Yes`

Then, to run locally:

```bash
cd deframe-privy-integration
yarn dev
```

## Vite requirement (Privy SDK)

If (and only if) your app is built with **Vite**, you must add Node polyfills so the Privy SDK works correctly in the browser.

### 1) Install the polyfills plugin

Run the following command (this is required for Vite projects):

```bash
yarn add --dev vite-plugin-node-polyfills
```

### 2) Enable it in `vite.config.ts`

Add the import and the plugin call:

```ts
// vite.config.ts
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    // ...
    nodePolyfills(),
  ],
})
```

### Privy's SDK setup

Below is a minimal setup for Privy and Alchemy provider setup. To customize your Privy provider, follow the instructions in the Privy Quickstart to get your app set up with Privy.

```ts
// src/App.tsx
import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import YourApp from "your_app_path";

function App() {
  const privyAppId = import.meta.env.VITE_APP_PRIVY_APP_ID || ''

  if (!privyAppId) {
    throw new Error('VITE_APP_PRIVY_APP_ID is not set')
  }

  return (
    <PrivyProvider
      appId={privyAppId} 
      config={{
        embeddedWallets: {
            ethereum: {
                createOnLogin: "users-without-wallets",
            },
        },
      }}
    >
      <SmartWalletsProvider>
        <YourApp />
      </SmartWalletsProvider>
    </PrivyProvider>
  )
}

export default App

```

## Configure secrets

This application relies on environment variables to connect to Privy and Deframe. These values are injected at build time by Vite and must be prefixed with VITE_ to be exposed to the client.

1. Create the .env file

    Create a .env file at the root of your project and define the following variables:

    ```bash
    # .env
    VITE_APP_PRIVY_APP_ID=''
    VITE_APP_DEFRAME_API_URL=''
    VITE_APP_DEFRAME_API_KEY=''
    ```

    - `VITE_APP_PRIVY_APP_ID`

    Your Privy application identifier. You can find this value in the Privy Dashboard:
    <https://dashboard.privy.io/>

    - `VITE_APP_DEFRAME_API_URL`

    The base API URL provided by Deframe for executing protocol interactions and strategy flows.

    - `VITE_APP_DEFRAME_API_KEY`

    Your Deframe API key, used to authenticate requests to the Deframe API.

    Both values can be obtained from the Deframe Dashboard:
    <https://www.deframe.io/dashboard>

2. Add TypeScript support for environment variables

    To ensure full TypeScript support when accessing environment variables via import.meta.env, create the following file:

    ```ts
    // src/vite-env.d.ts
    /// <reference types="vite/client" />
    interface ImportMetaEnv {
    readonly VITE_APP_PRIVY_APP_ID: string;
    readonly VITE_APP_DEFRAME_API_URL: string;
    readonly VITE_APP_DEFRAME_API_KEY: string;
    }

    interface ImportMeta {
    readonly env: ImportMetaEnv;
    }

    ```

    This file:

    - Enables type safety when accessing environment variables
    - Prevents TypeScript errors when using import.meta.env
    - Ensures better DX when working with Privy and Deframe configs

## Install and configure Privy's SDK

### Privy's SDK installation

```bash
yarn add @privy-io/react-auth@latest permissionless
```

## Enable Smart Wallets + gas sponsorship (recommended)

To make the UX feel “Web2 smooth” (no wallet popups, no manual gas management), enable Privy Smart Wallets and sponsor gas via a paymaster (use Alchemy or Pimlico)

### Enable Smart Wallets in the Privy Dashboard

1. Go to the Privy dashboard: `https://dashboard.privy.io/`
2. Open your app and find the **Wallet infrastructure / Smart Wallets** settings.
3. Enable Smart Wallets for your target chains (i.e. Ethereum, Polygon, Gnosis, Arbitrum, Base and HyperEVM, this last as Custom Chain).

## Authentication (required)

Before creating wallets or calling Deframe endpoints that depend on a wallet address, users must be **logged in and authenticated**.

At a minimum, your app should provide:

- **Start login**: trigger an authentication flow (for example, email OTP, OAuth, etc.).
- **Complete login**: confirm the user session is established after the user finishes the login step.
- **Check authentication**: expose a boolean (or equivalent) to decide whether to show the authenticated app or the login screen.
- **Logout** (recommended): allow the user to end the session.

### Helpful Privy hooks

- `usePrivy()` (from `@privy-io/react-auth`)
  - `ready`: SDK is ready to be used
  - `authenticated`: whether the user is authenticated
  - `user`: user object (profile + linked accounts)
  - `logout()`: end the session
- `useLoginWithEmail()` (from `@privy-io/react-auth`) (if using email OTP)
  - `sendCode({ email })`: send an OTP to the email
  - `loginWithCode({ code })`: complete login with the OTP
  - `state.status`: current state (e.g. `initial`, `sending-code`, `awaiting-code-input`, `submitting-code`, `done`, `error`)
  - `state.error`: error details (when `state.status === 'error'`)

```tsx
import { usePrivy, useLoginWithEmail } from '@privy-io/react-auth'

// Gate the app:
const { ready, authenticated } = usePrivy()
if (!ready) return null
if (!authenticated) return <LoginScreen />

// Email OTP login (inside LoginScreen):
const { sendCode, loginWithCode, state } = useLoginWithEmail()
await sendCode({ email })
await loginWithCode({ code })
```

For the next steps in this recipe, **assume the user is authenticated**.

## EOA & Smart Wallet usage

### Create the EOA (embedded wallet)

- `useWallets()` (from `@privy-io/react-auth`)
  - `ready`: wallets list is ready
  - `wallets`: array of wallets linked/created for the user (EOA is typically here)
- `useCreateWallet()` (from `@privy-io/react-auth`)
  - `createWallet()`: creates an embedded wallet for the user (when they don't have one yet)

```tsx
import { useCreateWallet, useWallets } from '@privy-io/react-auth'

const { ready, wallets } = useWallets()
const { createWallet } = useCreateWallet()

if (ready && wallets.length === 0) {
  return <button onClick={() => void createWallet()}>Create wallet</button>
}
```

### Create the Smart Wallet

- `useSmartWallets()` (from `@privy-io/react-auth/smart-wallets`)
  - `client`: smart wallet client instance (when available)
  - `client.account.address`: the Smart Wallet address (Account Abstraction)

```tsx
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

const { client } = useSmartWallets()
const smartWalletAddress = client?.account.address
```

> Warning
>
> Smart wallets are typically **counterfactual**: you may have an address even if the contract is **not deployed yet** on a given chain.  
> Before you call Deframe endpoints that depend on a **smart wallet on a specific network**, make sure the smart wallet is **deployed on that target chain**.
>
> **How to verify deployment**: query the chain for contract bytecode (if the result is `0x`, it is not deployed).
>
> **How to deploy**: send a minimal “no-op” transaction (e.g. `to: smartWalletAddress`, `value: 0`, `data: 0x`) using the smart wallet client for that chain. This triggers the deployment flow.
>
> **Paymaster note**: if you’re using a paymaster for gas sponsorship, it must have sufficient **credit/balance**; deployment still consumes gas.

Example: verify whether the Smart Wallet is deployed (Viem `getCode`):

```ts
import { createPublicClient, http } from 'viem'
import { polygon } from 'viem/chains'

const smartWalletAddress = '0xYOUR_SMART_WALLET_ADDRESS'

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(),
})

const code = await publicClient.getCode({ address: smartWalletAddress })
const isDeployed = !!code && code !== '0x'
console.log({ isDeployed, code })
```

Example: trigger deployment with a minimal transaction (Privy `getClientForChain`):

```ts
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

const { client, getClientForChain } = useSmartWallets()
const smartWalletAddress = client?.account.address

const chainClient = await getClientForChain({ id: 137 }) // Polygon
if (!chainClient || !smartWalletAddress) throw new Error('Missing chain client or smart wallet')

await chainClient.sendTransaction({
  to: smartWalletAddress,
  value: 0n,
  data: '0x',
})
```

#### Note: We'll use the Smart Wallet address to request bytecodes from Deframe's API

## Fetching strategies from Deframe's API

All requests below use:

- **Base URL**: `VITE_APP_DEFRAME_API_URL`
- **Auth header**: `x-api-key: VITE_APP_DEFRAME_API_KEY`

### 1) List strategies

Fetch the available strategies that the user can interact with.

- **Method**: `GET`
- **Path**: `/strategies`
- **Query params (optional)**:
  - `limit`: number of items per page
  - `page`: page number

Example request:

```js
const baseUrl = import.meta.env.DEFRAME_API_URL
const apiKey = import.meta.env.DEFRAME_API_KEY

const url = new URL('/strategies', baseUrl)
url.searchParams.set('limit', '100')

const res = await fetch(url.toString(), {
  method: 'GET',
  headers: {
    'x-api-key': apiKey,
  },
})

const json = await res.json()
console.log(json)
```

Expected response shape (simplified):

- `data`: list of strategies
- `pagination`: paging metadata (when available)

Each strategy item commonly includes fields like:

- `id`
- `protocol`
- `assetName`
- `network`
- `availableActions`
- `logourl`
- `underlyingDecimals` / `assetDecimals`

### 2) Strategy details for a wallet

Fetch specific information for a given strategy, as apy (protocol UI apy), avgApy (last 30 days) and inceptionApy (since contract was deployed). If wallet was passed as query param, the wallet's spot position is returned.

- **Method**: `GET`
- **Path**: `/strategies/:strategy-id`
- **Query params**:
  - `wallet`: the user's wallet address
  **************

Example request:

```ts
const baseUrl = import.meta.env.DEFRAME_API_URL
const apiKey = import.meta.env.DEFRAME_API_KEY

const strategyId = 'Aave-USDT-polygon'
const wallet = '0xYOUR_WALLET'

const url = new URL(`/strategies/${strategyId}`, baseUrl)
url.searchParams.set('wallet', wallet)

const res = await fetch(url.toString(), {
  method: 'GET',
  headers: {
    'x-api-key': apiKey,
  },
})

const json = await res.json()
console.log(json)
```

### 3) Generate bytecodes for an action

Request the transaction bytecodes needed to execute a strategy action for a wallet.

- **Method**: `GET`
- **Path**: `/strategies/:strategy-id/bytecode`
- **Query params**:
  - `action` (required): one of the strategy `availableActions` (example: `lend`)
  - `wallet` (required): the user's wallet address
  - `amount` (required): the amount (considering decimals) the user wants to execute for the action

Example request:

```js
const baseUrl = import.meta.env.DEFRAME_API_URL
const apiKey = import.meta.env.DEFRAME_API_KEY

const strategyId = 'Aave-USDT-polygon'
const action = 'lend'
const wallet = '0xYOUR_WALLET'
const amount = '1500000' // for 1.5 with 6 decimals

const url = new URL(`/strategies/${strategyId}/bytecode`, baseUrl)
url.searchParams.set('action', action)
url.searchParams.set('wallet', wallet)
url.searchParams.set('amount', amount)

const res = await fetch(url.toString(), {
  method: 'GET',
  headers: {
    'x-api-key': apiKey,
  },
})

const json = await res.json()
console.log(json)
```

Response type (shape):

```ts
type DeframeBytecodeResponse = {
  feeCharged: string
  metadata: {
    isCrossChain: boolean
    isSameChainSwap: boolean
    crossChainQuoteId: string
  }
  bytecode: {
    to: string
    value: string
    data: string
    chainId: string
  }[]
}
```

Notes:

- Ensure `amount` respects the token decimals.
- The response is intended to be executed by the user's wallet.

## Executing the bytecodes

After you receive the response from `/strategies/:strategy-id/bytecode`, you must **execute each item** in `bytecode[]` as a smart-wallet transaction (usually on the same chain specified by `chainId`).

Key points:

- The **smart wallet must be deployed** on the target chain (see the Smart Wallet deployment warning above).
- Use the **Smart Wallet client for the target chain** (example: `getClientForChain({ id: chainId })`).
- Convert types:
  - `to` and `data` must be `0x`-prefixed hex strings (e.g. `` `0x${string}` ``).
  - `value` should be a `bigint` (convert using `BigInt(value)`).

Example (execute `bytecode[]` as calls):

```ts
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'

const { getClientForChain } = useSmartWallets()

async function executeDeframeBytecodes(resp: DeframeBytecodeResponse) {
  const first = resp.bytecode[0]
  if (!first) throw new Error('Empty bytecode array')

  const chainId = Number(first.chainId)
  const chainClient = await getClientForChain({ id: chainId })
  if (!chainClient) throw new Error('Chain client not found')

  const calls = resp.bytecode.map((b) => {
    return {
      to: b.to as `0x${string}`,
      data: b.data as `0x${string}`,
      value: BigInt(b.value),
    }
  })

  const tx = await chainClient.sendTransaction({ calls })
  console.log({ tx })
}
```

Notes:

- The SDK may return a transaction hash or an object depending on the configured client—log it and optionally wait for confirmations.
- If you are using a paymaster, ensure it has enough credit/balance; execution consumes gas.

