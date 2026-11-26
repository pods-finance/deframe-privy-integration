# Deframe environment tester

The `test-christian` branch runs a local Privy wallet and quote tester against production, dev, staging, or a deframe-api PR preview. Use Node 22.12+ and Yarn Classic.

```sh
git clone --branch test-christian git@github.com:pods-finance/deframe-privy-integration.git
cd deframe-privy-integration
yarn install --frozen-lockfile
cp .env.example .env
```

Copy the public `VITE_APP_PRIVY_APP_ID` from your existing deframe-privy-integration `.env`. Use a separate regular, ignored `.env` in each checkout. For dev and PR previews, set `DEFRAME_API_KEY` to the **dev LootGo** key. If a preview has its own LootGo key, set it in `.env.pr-<number>.local`.

| Command | API target |
| --- | --- |
| `yarn tester prod` | `https://api.pods.finance` |
| `yarn tester dev` | `https://dev-api.pods.finance` |
| `yarn tester staging` | `https://staging-api.pods.finance` |
| `yarn tester preview 3561` | `https://pr-3561.preview.pods.finance` |

Open [the local tester](http://localhost:5500/). The header shows the active target and API URL. On staging and production, enter the customer API key for that target in the masked field. The local proxy validates it and keeps it in memory across page navigation. Choose **Clear customer API key** to change customers. Restarting the tester clears entered keys. Stop and restart the server to switch. Preview takes a positive integer PR number. The previous `yarn tester 3561` shorthand also selects that preview.

For a default with `yarn tester` or `./start-preview.command`, set `DEFRAME_TARGET` in `.env` and set `DEFRAME_PREVIEW_PR` when using preview. The example defaults to dev. Set `DEFRAME_PREVIEW_PORT` to change the localhost port. Optional wallet overrides can go in `.env.staging.local`, `.env.pr-3561.local`, or the equivalent file for the selected target.

| Optional wallet setting | Used for |
| --- | --- |
| `TESTER_EVM_ADDRESS` | Public EVM or Safe address for wallet-bound quotes and deposits |
| `TESTER_SOLANA_ADDRESS` | Public Solana wallet address |
| `TESTER_STELLAR_ADDRESS` | Public Stellar G account for receiving or funding |

Wallet fields start empty on a fresh checkout. The route catalog supports wallet-free quotes and manual wallet entry. Sign in to Privy for connected wallets, bridge swaps, and Pix ramps. For a manual Stellar Pix payout, use the full **M address returned by that quote**. A multi-payment quote requires signing the prepared XDR.

The route checklist identifies its source revision. Previews 3500 and 3561 have bundled snapshots. All other targets use the labeled 3500 reference checklist. The loopback proxy sends quote, swap-status, and action reads to the selected target.

Run `yarn test` for the target, wallet, and proxy checks. Build with `yarn build --mode staging` and serve with `yarn preview --mode staging`. Use the same mode for both commands. Supported target modes are `prod`, `dev`, `staging`, and `pr-<number>`.
