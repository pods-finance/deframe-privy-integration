import { useEffect, useRef, useState } from 'react'
import type { Hex } from 'viem'
import { address, assertReady, bytecodePath, makeIntent, normalizeApi, parsePrepared, protocols, record, requestApi, terminalStatuses } from './flow'
import type { ApiConfig, Call, JournalEntry, Prepared, Protocol, Scenario, SettlementMode } from './flow'

export interface WalletAdapter {
  estimate: (chainId: number, wallet: string, calls: Call[]) => Promise<unknown>
  submit: (chainId: number, wallet: string, calls: Call[]) => Promise<Hex>
  receipt: (chainId: number, wallet: string, hash: Hex) => Promise<{ success: boolean; transactionHash: Hex }>
}
const journalKey = 'deframe.strategy-tests.v1'
function readJournal(): JournalEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(journalKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry: unknown): entry is JournalEntry => {
      if (entry == null || typeof entry !== 'object') return false
      const e = entry as Partial<JournalEntry>
      return typeof e.id === 'string' && typeof e.api === 'string' && typeof e.intent?.wallet === 'string' && typeof e.status === 'string'
    })
  } catch { return [] }
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error'
export function useStrategyTest(wallet: string, adapter: WalletAdapter) {
  const [baseUrl, setBaseUrl] = useState('https://pr-2630.preview.pods.finance')
  const [apiKey, setApiKey] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('Aave')
  const [scenario, setScenario] = useState<Scenario>('cross-deposit')
  const [mode, setMode] = useState<SettlementMode>('direct')
  const [amount, setAmount] = useState('2000000')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [position, setPosition] = useState<Record<string, unknown> | null>(null)
  const [simulation, setSimulation] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [journal, setJournal] = useState(readJournal)
  const [activeId, setActiveId] = useState('')
  const [monitorRevision, setMonitorRevision] = useState(0)
  const [action, setAction] = useState<Record<string, unknown> | null>(null)
  const [monitorError, setMonitorError] = useState('')
  const lock = useRef(false)
  const currentWallet = useRef(wallet)
  useEffect(() => { currentWallet.current = wallet }, [wallet])
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [])

  function save(entry: JournalEntry): void {
    // Persist the attempt before opening the wallet prompt; an ambiguous
    // submission error must never re-enable automatic submission of this Action.
    const previous = readJournal()
    const existing = previous.find(item => item.id === entry.id && item.api === entry.api)
    const entries = previous.filter(item => item.id !== entry.id || item.api !== entry.api)
    const keepSettlementStatus = existing && terminalStatuses.has(existing.status) && entry.status.startsWith('SOURCE_')
    const next = [{ ...entry, ...(keepSettlementStatus ? { status: existing.status } : {}) }, ...entries].slice(0, 100)
    localStorage.setItem(journalKey, JSON.stringify(next))
    setJournal(next)
  }
  async function run(label: string, work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(label)
    setError('')
    try { await work() } catch (e) { setError(message(e)) } finally { lock.current = false; setBusy('') }
  }
  const config: ApiConfig = { baseUrl, apiKey }
  function clearPrepared() { setPrepared(null); setSimulation(null); setPosition(null); setError(''); setActiveId(''); setAction(null) }
  const changeScenario = (next: Scenario) => {
    clearPrepared(); setScenario(next); setAmount(next.endsWith('deposit') ? '2000000' : '')
  }
  async function loadPosition(intent = makeIntent(protocol, scenario, mode, wallet, amount || '1')) {
    const result = record(await requestApi(config, `/v2/strategies/${intent.strategyId}?wallet=${intent.wallet}`))
    const strategy = record(result.strategy)
    const preset = protocols[protocol]
    if (strategy.paused === true || !Array.isArray(strategy.availableActions) || !strategy.availableActions.includes(intent.action)) throw new Error('Strategy is paused or this action is unavailable for this customer')
    if (address(strategy.underlyingAsset).toLowerCase() !== preset.token.toLowerCase()) throw new Error('Strategy underlying token differs from the test preset')
    const networkId = strategy.networkId ?? strategy.chainId
    if (networkId != null ? Number(networkId) !== preset.chainId : strategy.network !== preset.chain) throw new Error('Strategy chain differs from the test preset')
    setPosition(record(result.spotPosition))
  }
  const prepare = () => run('Preparing', async () => {
    setPrepared(null); setSimulation(null); setAction(null); setActiveId('')
    const intent = makeIntent(protocol, scenario, mode, wallet, amount)
    await loadPosition(intent)
    if (currentWallet.current.toLowerCase() !== intent.wallet.toLowerCase()) throw new Error('Wallet changed during preparation')
    const started = Date.now()
    const response = await requestApi(config, bytecodePath(intent))
    const next = parsePrepared(response, intent, started)
    assertReady(next, currentWallet.current)
    setPrepared(next)
  })
  const simulate = () => run('Simulating', async () => {
    setSimulation(null)
    if (!prepared) throw new Error('Prepare a request first')
    assertReady(prepared, currentWallet.current)
    const result = await adapter.estimate(prepared.intent.sourceChainId, prepared.intent.wallet, prepared.calls)
    assertReady(prepared, currentWallet.current)
    setSimulation(JSON.stringify(result, (_, v: unknown) => typeof v === 'bigint' ? String(v) : v, 2))
  })
  async function confirmReceipt(entry: JournalEntry) {
    if (!entry.userOperationHash) throw new Error('Submission outcome unknown. Inspect your wallet before creating another request.')
    const receipt = await adapter.receipt(entry.intent.sourceChainId, entry.intent.wallet, entry.userOperationHash)
    const confirmed = { ...entry, transactionHash: receipt.transactionHash, status: receipt.success ? 'SOURCE_CONFIRMED' : 'SOURCE_REVERTED' }
    save(confirmed)
    if (!receipt.success) throw new Error('Source transaction reverted. No retry was submitted.')
    setActiveId(entry.id)
    if (entry.intent.mode === 'direct') {
      const network = ({ 42161: 'arbitrum', 137: 'polygon', 8453: 'base' } as Record<number, string>)[entry.intent.sourceChainId]
      if (!network) throw new Error('Unsupported fulfillment chain')
      await requestApi(config, `/strategies/${encodeURIComponent(entry.intent.strategyId)}/fulfill?${new URLSearchParams({ txHash: receipt.transactionHash, chain: network }).toString()}`)
    }
    // Deposit-address transfers are observed by the settlement worker. Calling
    // legacy fulfillment here would create a competing recovery path.
  }
  const submit = () => run('Waiting for wallet / receipt', async () => {
    if (!prepared || simulation == null) throw new Error('Prepare and simulate before submitting')
    assertReady(prepared, currentWallet.current)
    const api = normalizeApi(baseUrl)
    if (readJournal().some(item => item.api === api && item.id === prepared.id)) throw new Error('This Action already has a submission attempt. Resume monitoring instead.')
    const entry: JournalEntry = { id: prepared.id, api, intent: prepared.intent, attemptedAt: new Date().toISOString(), status: 'SUBMISSION_STARTED' }
    save(entry)
    const hash = await adapter.submit(prepared.intent.sourceChainId, prepared.intent.wallet, prepared.calls)
    const submitted = { ...entry, userOperationHash: hash, status: 'SOURCE_SUBMITTED' }
    save(submitted)
    setActiveId(entry.id)
    await confirmReceipt(submitted)
  })
  const resume = (entry: JournalEntry) => run('Resuming receipt check', async () => {
    if (entry.api !== normalizeApi(baseUrl) || entry.intent.wallet.toLowerCase() !== wallet.toLowerCase()) throw new Error('Select the original API and connected wallet to resume')
    if (!apiKey.trim()) throw new Error('Enter the API key before resuming')
    setActiveId(entry.id)
    setMonitorRevision(value => value + 1)
    if (!terminalStatuses.has(entry.status)) await confirmReceipt(entry)
  })

  useEffect(() => {
    if (!activeId || !apiKey.trim()) return
    const tracked = readJournal().find(entry => entry.id === activeId && entry.api === normalizeApi(baseUrl))
    if (tracked?.intent.wallet.toLowerCase() !== wallet.toLowerCase()) return
    const controller = new AbortController()
    let timer: number | undefined
    const deadline = Date.now() + 30 * 60_000
    async function poll() {
      try {
        const next = record(await requestApi({ baseUrl, apiKey }, `/actions/${encodeURIComponent(activeId)}`, controller.signal))
        if (controller.signal.aborted) return
        if (typeof next.status !== 'string') throw new Error('Action response has no status')
        setAction(next); setMonitorError('')
        const existing = readJournal().find(item => item.id === activeId && item.api === normalizeApi(baseUrl))
        if (existing) save({ ...existing, status: next.status })
        if (terminalStatuses.has(next.status)) return
      } catch (e) {
        if (controller.signal.aborted) return
        setMonitorError(`Status check failed: ${message(e)}. No transaction was retried.`)
      }
      if (Date.now() < deadline) timer = window.setTimeout(() => { void poll() }, 5000)
      else setMonitorError('Monitoring paused after 30 minutes. Resume to keep checking this Action.')
    }
    void poll()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [activeId, baseUrl, apiKey, monitorRevision, wallet])

  const stale = !prepared || now + 10_000 >= prepared.expiresAt || wallet.toLowerCase() !== prepared.intent.wallet.toLowerCase()
  const attempted = !!prepared && journal.some(entry => entry.id === prepared.id && entry.api === normalizeApi(baseUrl))
  return { baseUrl, setBaseUrl, apiKey, setApiKey, protocol, setProtocol, scenario, changeScenario, mode, setMode, amount, setAmount,
    prepared, position, simulation, busy, error, journal, action, monitorError, now, stale, attempted, clearPrepared, prepare, simulate, submit, resume,
    inspect: () => run('Reading position', async () => { await loadPosition() }),
  }
}
