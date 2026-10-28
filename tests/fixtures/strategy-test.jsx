// Browser contract fixture: all API and wallet operations below are local stubs.
// This entry is never included in the production Vite build.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { StrategyTestPanel } from '../../src/components/StrategyTest/StrategyTest'
import { protocols } from '../../src/components/StrategyTest/flow'
import '../../src/index.css'

const wallet = '0x1111111111111111111111111111111111111111'
const depositAddress = '0x2222222222222222222222222222222222222222'
const operationHash = `0x${'a'.repeat(64)}`
const transactionHash = `0x${'b'.repeat(64)}`
const counts = { prepares: 0, simulations: 0, submissions: 0, fulfills: 0, polls: 0 }
const session = Date.now()
function renderCounts() { document.getElementById('counters').textContent = JSON.stringify(counts) }
const fixtureMode = new URLSearchParams(location.search).get('mode')
window.fetch = async (input) => {
  const url = new URL(input, location.href)
  const protocol = url.pathname.includes(protocols.Morpho.strategyId) ? protocols.Morpho : protocols.Aave
  let body
  if (url.pathname.startsWith('/v2/strategies/')) body = { strategy: { availableActions: ['lend','withdraw'], underlyingAsset: protocol.token, networkId: protocol.chainId }, spotPosition: { currentPosition: { value: '2000000', humanized: '2' }, profit: { value: '0' } } }
  else if (url.pathname.endsWith('/bytecode')) {
    counts.prepares++
    const chainId = Number(url.searchParams.get('fromChainId') || protocol.chainId)
    const amountRaw = url.searchParams.get('amount')
    body = { id: (session + counts.prepares).toString(16).padStart(24,'0'), destinationAddress: wallet }
    if (url.searchParams.get('settlementMode') === 'depositAddress') Object.assign(body, { chainId, depositAddress, tokenAddress: url.searchParams.get('fromTokenAddress'), depositInstructions: { chainId, to: depositAddress, tokenAddress: url.searchParams.get('fromTokenAddress'), amountRaw } })
    else Object.assign(body, { bytecode: [{ chainId: String(chainId), to: protocol.token, data: '0x', value: '0' }] })
  } else if (url.pathname.endsWith('/fulfill')) { counts.fulfills++; body = { status: 'accepted' } }
  else if (url.pathname.startsWith('/actions/')) { counts.polls++; body = { id: url.pathname.split('/').at(-1), status: 'SUCCESS', assetIn: { amount: '2000000' }, assetOut: { amount: '1999720' } } }
  else throw new Error(`Fixture rejects unexpected request: ${url.pathname}`)
  renderCounts()
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}
const adapter = {
  estimate: async () => { counts.simulations++; renderCounts(); if (fixtureMode === 'simulation-failure') throw new Error('Mock insufficient balance'); return { callGasLimit: 120000n } },
  submit: async () => { counts.submissions++; renderCounts(); if (fixtureMode === 'ambiguous-submit') throw new Error('Mock bundler timeout: submission outcome unknown'); return operationHash },
  receipt: async () => ({ success: true, transactionHash }),
}
createRoot(document.getElementById('root')).render(<main className="ui-page ui-container py-8">
  <h1 className="ui-heading-section">Mocked browser contract test</h1>
  <pre id="counters" className="whitespace-pre-wrap break-all" aria-label="Mock operation counters">{JSON.stringify(counts)}</pre>
  <StrategyTestPanel wallet={wallet} adapter={adapter} />
</main>)
