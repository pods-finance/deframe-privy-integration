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
| `VITE_APP_DEFRAME_API_URL` | Base API URL for Deframe | [Deframe Dashboard](https://www.deframe.io/dashboard) — e.g. `https://sandbox.deframe.io` or `http://localhost:4001` for local |
| `VITE_APP_DEFRAME_API_KEY` | API key for Deframe | [Deframe Dashboard](https://www.deframe.io/dashboard) |

Example `.env`:

```env
VITE_APP_PRIVY_APP_ID='your-privy-app-id'
VITE_APP_DEFRAME_API_URL='https://sandbox.deframe.io'
VITE_APP_DEFRAME_API_KEY='your-deframe-api-key'
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
