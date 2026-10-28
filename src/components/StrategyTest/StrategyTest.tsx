import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { protocols, record, scenarios } from './flow'
import type { Protocol, Scenario, SettlementMode } from './flow'
import { useStrategyTest } from './useStrategyTest'
import type { WalletAdapter } from './useStrategyTest'
import { simulateUserOperation } from './simulateUserOperation'

export function StrategyTestPanel({ wallet, adapter }: { wallet: string; adapter: WalletAdapter }) {
  const flow = useStrategyTest(wallet, adapter)
  const preset = protocols[flow.protocol]
  const deposit = flow.scenario.endsWith('deposit')
  const json = (value: unknown) => JSON.stringify(value, null, 2)
  const change = (work: () => void) => { flow.clearPrepared(); work() }
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-labelledby="strategy-test-title">
      <div>
        <h2 id="strategy-test-title" className="ui-heading-section">Strategy test</h2>
        <p className="ui-text-muted">Prepare → simulate the source transaction → submit with Privy → verify settlement.</p>
        <p className="mt-2 break-all text-small">Connected smart wallet: <strong>{wallet || 'Connect an EVM smart wallet first'}</strong></p>
        <p className="ui-text-muted">The connected account must own the funds. Selecting a test does not connect wallet …210a.</p>
      </div>
      <fieldset disabled={!!flow.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Environment and customer</legend>
        <label className="ui-label flex min-w-0 flex-col gap-1">API URL
          <input className="ui-input" value={flow.baseUrl} onChange={e => { change(() => { flow.setBaseUrl(e.target.value); flow.setApiKey('') }) }} />
        </label>
        <label className="ui-label flex min-w-0 flex-col gap-1">Customer API key
          <input className="ui-input" type="password" autoComplete="off" value={flow.apiKey} onChange={e => { change(() => { flow.setApiKey(e.target.value) }) }} />
        </label>
        <p className="ui-text-muted break-all sm:col-span-2">The key stays in this tab’s memory. No production credentials are prefilled. API URL: {flow.baseUrl}</p>
      </fieldset>
      <fieldset disabled={!!flow.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Workflow</legend>
        <label className="ui-label flex flex-col gap-1">Protocol
          <select className="ui-select" value={flow.protocol} onChange={e => { change(() => { flow.setProtocol(e.target.value as Protocol) }) }}>
            <option value="Aave">Aave · Polygon USDC</option><option value="Morpho">Morpho · Base USDC</option>
          </select>
        </label>
        <label className="ui-label flex flex-col gap-1">Test step
          <select className="ui-select" value={flow.scenario} onChange={e => { flow.changeScenario(e.target.value as Scenario) }}>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="ui-label flex flex-col gap-1">Funding mode
          <select className="ui-select" value={deposit ? flow.mode : 'direct'} disabled={!deposit} onChange={e => { change(() => { flow.setMode(e.target.value as SettlementMode) }) }}>
            <option value="direct">Direct wallet transaction</option><option value="depositAddress">Transfer to deposit address</option>
          </select>
        </label>
        <label className="ui-label flex flex-col gap-1">Amount · raw USDC units (6 decimals)
          <input className="ui-input" inputMode="numeric" value={flow.amount} placeholder={deposit ? '2000000' : 'Newly deposited amount only'} onChange={e => { change(() => { flow.setAmount(e.target.value) }) }} />
        </label>
        <p className="ui-text-muted sm:col-span-2">2 USDC = 2000000. Strategy ID: <span className="break-all font-mono">{preset.strategyId}</span>. Final recipient: connected wallet.</p>
        {!deposit && <p className="ui-text-muted sm:col-span-2">Withdrawals are partial. Enter only the settled amount from this test, excluding existing holdings and bridge fees. The app does not automatically calculate newly acquired Aave scaled units or Morpho shares.</p>}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className="ui-btn-secondary" disabled={!!flow.busy || !wallet || !flow.apiKey} onClick={() => { void flow.inspect() }}>Read access and position</button>
        <button className="ui-btn-primary" disabled={!!flow.busy || !wallet || !flow.apiKey || !flow.amount} onClick={() => { void flow.prepare() }}>Prepare request</button>
      </div>
      <p className="ui-text-muted">Preparing creates one unsigned Action. It does not move funds. Prepare only the next step; wait for settlement before preparing a withdrawal.</p>
      {flow.position && <details><summary className="cursor-pointer font-medium">Current position and profit</summary><pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-caption">{json(flow.position)}</pre></details>}
      {flow.prepared && <div className="ui-card flex min-w-0 flex-col gap-3 p-4">
        <h3 className="font-semibold">Review prepared request</h3>
        <p className="break-all text-small">Action: {flow.prepared.id}</p>
        <p className="text-small">Amount: {flow.prepared.intent.amount} raw units · Source chain: {flow.prepared.intent.sourceChainId} · Destination chain: {flow.prepared.intent.destinationChainId}</p>
        <p className="text-small">Full bytecode response: {(flow.prepared.responseMs / 1000).toFixed(2)}s · {flow.stale ? 'Expired or wallet changed' : `${String(Math.max(0, Math.floor((flow.prepared.expiresAt - flow.now) / 1000)))}s remaining`}</p>
        {flow.prepared.depositAddress && <>
          <p className="break-all text-small">Deposit address: <strong>{flow.prepared.depositAddress}</strong></p>
          <p className="break-all text-small">Funding token: {flow.prepared.intent.sourceToken}</p>
          <p className="ui-text-muted">Submit sends the exact instructed transfer. Settlement is observed automatically; no strategy fulfill request is sent for this mode. Never fund an expired request.</p>
        </>}
        <details><summary className="cursor-pointer font-medium">API response, fees and minimum output</summary><pre className="max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-caption">{json(flow.prepared.response)}</pre></details>
        <div className="flex flex-wrap gap-2">
          <button className="ui-btn-secondary" disabled={!!flow.busy || flow.stale || flow.attempted} onClick={() => { void flow.simulate() }}>Simulate source transaction</button>
          <button className="ui-btn-primary" disabled={!!flow.busy || flow.stale || flow.attempted || !flow.simulation} onClick={() => { void flow.submit() }}>Submit with Privy</button>
        </div>
        <p className="ui-text-muted">Simulation estimates the source smart-wallet operation without signing or broadcasting. It does not prove bridge delivery or the downstream strategy deposit.</p>
        {flow.simulation && <details open><summary className="font-medium">Source simulation passed</summary><pre className="overflow-auto text-caption">{flow.simulation}</pre></details>}
      </div>}
      <div aria-live="polite" role="status">
        {flow.busy && <p className="ui-text-muted">{flow.busy}…</p>}
        {flow.action && <p className="font-semibold">Settlement Action: {String(flow.action.status)}{flow.action.status === 'SUCCESS' ? ' — review the verified inputs and outputs below.' : ''}</p>}
      </div>
      {flow.error && <p role="alert" className="ui-text-error">{flow.error}</p>}
      {flow.monitorError && <p role="alert" className="ui-text-error">{flow.monitorError}</p>}
      {flow.action && <details><summary className="font-medium">Action inputs, outputs and transactions</summary><pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-3 text-caption">{json(flow.action)}</pre></details>}
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="font-semibold">Submission journal</h3>
        <p className="ui-text-muted">A source receipt is not final settlement. Entries survive reloads on this browser. Resume checks receipts and status; it never resends funds. If an attempt has no operation hash, inspect your wallet before starting another request.</p>
        {flow.journal.length === 0 && <p className="ui-text-muted">No submissions from this browser.</p>}
        {flow.journal.map(entry => <div className="ui-card min-w-0 p-3" key={`${entry.api}/${entry.id}`}>
          <p className="break-all text-small">{entry.id} · {entry.status} · {entry.api}</p>
          <p className="break-all text-caption">Wallet: {entry.intent.wallet}</p>
          {entry.userOperationHash && <p className="break-all text-caption">User operation: {entry.userOperationHash}</p>}
          {entry.transactionHash && <p className="break-all text-caption">Transaction: {entry.transactionHash}</p>}
          <button className="ui-btn-secondary ui-btn-sm mt-2" disabled={!!flow.busy || !flow.apiKey} onClick={() => { void flow.resume(entry) }}>Resume monitoring</button>
        </div>)}
      </div>
    </section>
  )
}

export default function StrategyTest({ wallet }: { wallet: string }) {
  const { getClientForChain } = useSmartWallets()
  const getClient = async (chainId: number, expectedWallet: string) => {
    const client = await getClientForChain({ id: chainId })
    if (client?.account.address.toLowerCase() !== expectedWallet.toLowerCase() || record(record(client).chain).id !== chainId) throw new Error('Privy chain client does not match the prepared wallet and chain')
    return client
  }
  const adapter: WalletAdapter = {
    estimate: async (chainId, expectedWallet, calls) => simulateUserOperation(await getClient(chainId, expectedWallet), calls),
    submit: async (chainId, expectedWallet, calls) => (await getClient(chainId, expectedWallet)).sendUserOperation({ calls }),
    receipt: async (chainId, expectedWallet, hash) => {
      const receipt = await (await getClient(chainId, expectedWallet)).waitForUserOperationReceipt({ hash, timeout: 120_000 })
      return { success: receipt.success, transactionHash: receipt.receipt.transactionHash }
    },
  }
  return <StrategyTestPanel key={wallet} wallet={wallet} adapter={adapter} />
}
