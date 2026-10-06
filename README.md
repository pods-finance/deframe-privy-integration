# Deframe + Privy Integration

A React app that combines [Privy](https://privy.io) embedded wallets with the [Deframe](https://deframe.io) strategy layer to give users a Web2-style experience for accessing DeFi yield strategies. Users can deposit into yield strategies (lending, staking, protocol yields) without interacting directly with smart contracts or managing complex transaction flows.

**Tech stack:** React 19 · TypeScript · Vite · Tailwind CSS · Privy · Deframe SDK

---

## Requirements

- **Node.js** (v18+)
- **Yarn** (or npm/pnpm)
- Accounts for [Privy](https://dashboard.privy.io) and [Deframe](https://www.deframe.io/dashboard) to obtain API keys

---

## Environment Variables

Create a `.env` file in the project root with the following variables. All must be prefixed with `VITE_` to be available in the client.

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `VITE_APP_PRIVY_APP_ID` | Privy application identifier | [Privy Dashboard](https://dashboard.privy.io/) |
| `VITE_APP_DEFRAME_API_URL` | Base API URL for Deframe | [Deframe Dashboard](https://www.deframe.io/dashboard) — e.g. `https://api.deframe.io` |
| `VITE_APP_DEFRAME_API_KEY` | API key for Deframe | [Deframe Dashboard](https://www.deframe.io/dashboard) |
| `VITE_APP_RAMP_KYC_USER_ID` | Existing BRL session for the KYC tab | Your environment |
| `VITE_APP_RAMP_KYC_USER_ID_USD` | Existing USD session for the KYC tab | Your environment |

The **KYC** and **Ramp** tabs use the same `VITE_APP_DEFRAME_API_URL` and `VITE_APP_DEFRAME_API_KEY` as Swap (`x-api-key`). Point the URL at local or staging while UnblockPay is being certified. Session ids come from the env vars above and are not shown in the form. Onramp quotes with empty `transactionData` stay inspect-only (Pix QR / wire instructions). Offramp and other quotes that return bytecode open Privy to sign and submit, same as Swap.

Example `.env`:

```env
VITE_APP_PRIVY_APP_ID='your-privy-app-id'
VITE_APP_DEFRAME_API_URL='https://api.deframe.io'
VITE_APP_DEFRAME_API_KEY='your-deframe-api-key'
VITE_APP_RAMP_KYC_USER_ID=
VITE_APP_RAMP_KYC_USER_ID_USD=
```

---

## How to Run

### 1. Install dependencies

```bash
yarn
```

### 2. Configure environment

Create `.env` and set the variables above. Without them, the app will not run correctly.

### 3. Start the development server

```bash
yarn dev
```

The app will be available at `http://localhost:5173` (or the port shown in the terminal).

### KYC tab

After login, open **KYC** (between Swap and Ramp). Select a wallet, set `VITE_APP_RAMP_KYC_USER_ID` and `VITE_APP_RAMP_KYC_USER_ID_USD`, then follow [UnblockPay walkthrough](#unblockpay-walkthrough).

### Ramp tab

Open **Ramp** (between KYC and Deframe SDK). Select an EVM wallet, and a Solana wallet for BRS rows. Each catalog row has `default` / `avenia` / `unblockpay`. Inspect HTTP status, `provider`, `rampProvider`, payment instructions, and `{ error: { code, message } }`. When the quote returns EVM/Solana `transactionData`, Privy opens to sign and submit (same executor as Swap). Onramp Pix QR stays display-only.

### UnblockPay walkthrough

BRL and USD are separate sessions. Set both env vars before opening **KYC**. The form does not show or store them.

1. **Poll the BRL session once** and confirm the top-level status is approved.
2. **Submit UnblockPay details** in *1B*: name, email, phone, date of birth, tax id, tax country, and address. Upload documents in the next step.
3. **Pick a path.** Open the hosted verification link when the status payload includes one, or continue to step 4.
4. **Upload documents** in *1C*: identity front, identity back, and a proof of address. A passport is a single file. Uploads run one at a time and stop on the first error.
5. **Turn on auto-poll (5s).** The first status read after the uploads triggers the provider check. Later polls do not fire another check.
6. **Done** when the UnblockPay status is approved and the needed capability is true — BRL for Pix, USD for wire.

If a step is rejected, re-upload that file and poll again. *1A · Avenia* stays collapsed and is only for a fresh session. Do not reuse the BRL session for USD.

### Other scripts

| Command | Description |
|---------|-------------|
| `yarn build` | Production build |
| `yarn preview` | Preview the production build locally |
| `yarn lint` | Run ESLint |

---

## Resources

- [Deframe documentation](https://docs.deframe.io/)
- [Privy Wallets documentation](https://docs.privy.io/wallets)
