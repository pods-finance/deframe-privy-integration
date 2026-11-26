# Deframe preview tester

The `test-christian` branch runs a local Privy wallet and quote tester against a selected deframe-api PR preview. Use Node 22.12+ and Yarn Classic.

```sh
git clone --branch test-christian git@github.com:pods-finance/deframe-privy-integration.git
cd deframe-privy-integration
yarn install --frozen-lockfile
cp .env.example .env
```

Set `VITE_APP_PRIVY_APP_ID` to the public Privy app ID and `DEFRAME_PREVIEW_API_KEY` to the key for the selected preview. Use a regular, private `.env` in each checkout. Start the tester with the PR number and open [the local catalog](http://localhost:5500/).

```sh
yarn tester 3561
```

To switch, stop the server and run `yarn tester <pr>`. To choose a default for `yarn tester` or `./start-preview.command`, set `DEFRAME_PREVIEW_PR`. You can keep PR-specific keys and wallets in `.env.pr-3561.local` or the equivalent file for another PR. Set `DEFRAME_PREVIEW_PORT` to use a different localhost port.

| Optional wallet setting | Used for |
| --- | --- |
| `TESTER_EVM_ADDRESS` | Public EVM or Safe address for wallet-bound quotes and deposits |
| `TESTER_SOLANA_ADDRESS` | Public Solana wallet address |
| `TESTER_STELLAR_ADDRESS` | Public Stellar G account for receiving or funding |

Wallet fields start empty on a fresh checkout. The route catalog supports wallet-free quotes and manual wallet entry. Sign in to Privy for connected wallets, bridge swaps, and Pix ramps. For a manual Stellar Pix payout, use the full **M address returned by that quote**. A multi-payment quote requires signing the prepared XDR.

The catalog displays the selected preview and the source revision of its route checklist. PRs 3500 and 3561 have bundled snapshots. Other PRs use the 3500 checklist as a reference. A quote always goes to the selected preview. The loopback proxy adds the Deframe key server-side for quote, swap-status, and action reads.

For AWS-backed key lookup, leave the API key empty and set `DEFRAME_API_DIRECTORY` to your installed deframe-api checkout and `DEFRAME_PREVIEW_CUSTOMER_ID` to the authorized preview customer's ID. The launcher uses the `deframe` AWS profile in `us-east-1` and verifies the selected preview database before reading the key.

Run `yarn test` for local configuration and proxy checks. Build a selected preview with `yarn build --mode pr-3561` and serve it with `yarn preview --mode pr-3561` using that preview’s API key.
