# Build SVM (Solana) Yield Strategies with Deframe & Privy

Enable users to access DeFi yield strategies with a Web2-grade experience by combining Privy’s embedded wallets with Deframe’s strategy execution layer. This recipe shows how to route user funds into diversified yield strategies—spanning lending, staking, and protocol-native yields—while Deframe handles bytecode generation, protocol routing, and execution. Privy simplifies onboarding and wallet management, allowing users to earn yield across DeFi without interacting directly with contracts or managing complex transaction flows.

## Resources

- **Deframe Docs**
  - Official documentation for Deframe strategies.
  - Open docs: `https://docs.deframe.io/`
- **Privy Solana Walets Docs**
  - Privy Solana Wallets are a powerful tool for helping users interact with DeFi.
  - Open docs: `https://docs.privy.io/wallets/using-wallets/solana`

## Install and configure the Vite projet

Commands/selections used (as shown in the `create-vite` wizard):

```bash
yarn create vite
```

- **Project name**: `deframe-privy-svm-integration`
- **Select a framework**: `React`
- **Select a variant**: `TypeScript + SWC`
- **Use rolldown-vite (Experimental)?**: `No`
- **Install with yarn and start now?**: `Yes`

Then, to run locally:

```bash
cd deframe-privy-svm-integration
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
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    // ...
    nodePolyfills(),
  ],
});
```

### Privy's SDK setup

Below is a minimal setup for Privy and Alchemy provider setup. To customize your Privy provider, follow the instructions in the Privy Quickstart to get your app set up with Privy.

```ts
// src/App.tsx
import { PrivyProvider } from '@privy-io/react-auth';
import YourApp from "your_app_path";

function App() {
  const privyAppId = import.meta.env.VITE_APP_PRIVY_APP_ID || '';
  const alchemyApiKey = import.meta.env.VITE_APP_ALCHEMY_API_KEY;

  if (!privyAppId) {
    throw new Error('VITE_APP_PRIVY_APP_ID is not set');
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(
                `https://solana-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
              ),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                `wss://solana-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
              ),
            },
          },
        },
      }}
    >
      <YourApp />
    </PrivyProvider>
  )
}

export default App

```

## Configure secrets

This application relies on environment variables to connect to Privy and Deframe. These values are injected at build time by Vite and must be prefixed with VITE\_ to be exposed to the client.

1. Create the .env file

   Create a .env file at the root of your project and define the following variables:

   ```bash
   # .env
   VITE_APP_PRIVY_APP_ID=''
   VITE_APP_DEFRAME_API_URL=''
   VITE_APP_DEFRAME_API_KEY=''
   VITE_APP_ALCHEMY_API_KEY=''
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
   - `VITE_APP_ALCHEMY_API_KEY`

   Your Alchemy application identifier. You can find this value in the Alchemy Dashboard: <https://dashboard.alchemy.com/>

2. Add TypeScript support for environment variables

   To ensure full TypeScript support when accessing environment variables via import.meta.env, create the following file:

   ```ts
   // src/vite-env.d.ts
   /// <reference types="vite/client" />
   interface ImportMetaEnv {
     readonly VITE_APP_PRIVY_APP_ID: string;
     readonly VITE_APP_DEFRAME_API_URL: string;
     readonly VITE_APP_DEFRAME_API_KEY: string;
     readonly VITE_APP_ALCHEMY_API_KEY: string;
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
import { usePrivy, useLoginWithEmail } from "@privy-io/react-auth";

// Gate the app:
const { ready, authenticated } = usePrivy();
if (!ready) return null;
if (!authenticated) return <LoginScreen />;

// Email OTP login (inside LoginScreen):
const { sendCode, loginWithCode, state } = useLoginWithEmail();
await sendCode({ email });
await loginWithCode({ code });
```

For the next steps in this recipe, **assume the user is authenticated**.

## Create SVM Wallet

- `usePrivy()` (from `@privy-io/react-auth`)
  - `ready`: Privy user instance is ready
  - `user.linkedAccounts`: array of wallets linked/created for the user
- `useCreateWallet()` (from `@privy-io/react-auth/solana`)
  - `createWallet()`: creates a svm wallet for the user (when they don't have one yet)

```tsx
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";

const { user, ready } = usePrivy();
const { createWallet } = useCreateWallet();

if (
  ready &&
  user?.linkedAccounts.find((acc) => acc.chainType === "solana") === undefined
) {
  return <button onClick={() => void createWallet()}>Create wallet</button>;
}
```

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
  - `network`: specify `'solana'` for a better experience
  - `protocol`: which protocol you want

Example request:

```js
const baseUrl = import.meta.env.DEFRAME_API_URL;
const apiKey = import.meta.env.DEFRAME_API_KEY;

const url = new URL("/strategies", baseUrl);
url.searchParams.set("limit", "100");
url.searchParams.set("network", "solana");
url.searchParams.set("protocol", "kamino");

const res = await fetch(url.toString(), {
  method: "GET",
  headers: {
    "x-api-key": apiKey,
  },
});

const json = await res.json();
console.log(json);
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
  ***

Example request:

```ts
const baseUrl = import.meta.env.DEFRAME_API_URL;
const apiKey = import.meta.env.DEFRAME_API_KEY;

const strategyId = "Kamino-SOL-solana";
const wallet = "YOUR_WALLET";

const url = new URL(`/strategies/${strategyId}`, baseUrl);
url.searchParams.set("wallet", wallet);

const res = await fetch(url.toString(), {
  method: "GET",
  headers: {
    "x-api-key": apiKey,
  },
});

const json = await res.json();
console.log(json);
```

### 3) Generate bytecodes for an action

Request the transaction bytecodes needed to execute a strategy action for a wallet.

- **Method**: `GET`
- **Path**: `/strategies/:strategy-id/bytecode`
- **Query params**:
  - `action` (required): one of the strategy `availableActions` (example: `lend`, `withdraw`, `borrow`, `repay`)
  - `wallet` (required): the user's wallet address
  - `amount` (required): the amount (considering decimals) the user wants to execute for the action

Example request:

```js
const baseUrl = import.meta.env.DEFRAME_API_URL;
const apiKey = import.meta.env.DEFRAME_API_KEY;

const strategyId = "Kamino-SOL-solana";
const wallet = "YOUR_WALLET";
const action = "lend";
const amount = "1500000000"; // for 1.5 with 9 decimals

const url = new URL(`/strategies/${strategyId}/bytecode`, baseUrl);
url.searchParams.set("action", action);
url.searchParams.set("wallet", wallet);
url.searchParams.set("amount", amount);

const res = await fetch(url.toString(), {
  method: "GET",
  headers: {
    "x-api-key": apiKey,
  },
});

const json = await res.json();
console.log(json);
```

Response type (shape):

```ts
type DeframeBytecodeResponse = {
  feeCharged: string;
  transaction: string;
};
```

Notes:

- Ensure `amount` respects the token decimals.
- The response is intended to be executed by the user's wallet.

## Executing the bytecodes

After you receive the response from `/strategies/:strategy-id/bytecode`, for **SVM** you must:

1. Read the serialized Solana transaction (base64) from the response.
2. Decode it to `Uint8Array` and call Privy’s `signAndSendTransaction` with your Solana wallet.

Example:

```ts
import {
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";

// In your component:
const { signAndSendTransaction } = useSignAndSendTransaction();
const { wallets } = useWallets();
const solanaWallet = wallets[0]; // or pick by address

// After fetching bytecode from Deframe:
const base64 = response.transaction;
const binary = atob(base64);
const transaction = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) transaction[i] = binary.charCodeAt(i);

const { signature } = await signAndSendTransaction({
  transaction,
  wallet: solanaWallet,
  chain: "solana:mainnet",
  options: { skipPreflight: true },
});
```

## Bytecode as instructions

If you need the SVM payload as **instructions** instead of a pre-serialized base64 transaction, call the bytecode endpoint with:

- **Query param**: `output=instructions`

Same endpoint: `GET /strategies/:strategy-id/bytecode` (with `action`, `wallet`, `amount`, and any other params as before).

The response shape is:

```ts
{
  feeCharged: Record<string, any>;
  instructions: Array<any>;
  lutsByAddress: Array<any>;
}
```

After you process or modify the instructions on your side, convert them back to a serialized transaction by calling:

- **Method**: `POST`
- **Path**: `/strategies/:strategyId/convert-instructions-to-base64`
- **Headers**: `x-api-key: VITE_APP_DEFRAME_API_KEY` (or your API key env)
- **Body**:

```ts
{
  wallet: string;
  instructions: any[];
  lutsByAddress?: any[];
}
```

The API responds with:

```ts
{
  transaction: string;
} // base64 serialized transaction
```

Use this `transaction` the same way as in the previous section: decode to `Uint8Array` and pass to Privy’s `signAndSendTransaction`.

## Full example repository

Reference implementation:

<https://github.com/pods-finance/deframe-privy-integration>
