import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { getAddressDecoder } from '@solana/kit'
import { StrKey } from '@stellar/stellar-sdk'
import { createServer } from 'vite'

async function availablePort() {
  const listener = net.createServer()
  listener.listen(0, 'localhost')
  await once(listener, 'listening')
  const { port } = listener.address()
  await new Promise(resolve => listener.close(resolve))
  return port
}

for (const [index, pr] of ['3500', '3561', '9999'].entries()) {
  test('preview selection, wallets and proxy for PR ' + pr, async t => {
    const port = await availablePort()
    const base = 'http://localhost:' + port
    const blank = pr === '9999'
    const bytes = Buffer.alloc(32, index + 1)
    const evm = blank ? '' : '0x' + bytes.subarray(0, 20).toString('hex')
    const solana = blank ? '' : getAddressDecoder().decode(bytes)
    const stellar = blank ? '' : StrKey.encodeEd25519PublicKey(bytes)
    const key = 'synthetic-key-for-test-' + pr
    const env = {
      DEFRAME_PREVIEW_PR: pr, DEFRAME_PREVIEW_PORT: String(port),
      TESTER_EVM_ADDRESS: evm, TESTER_SOLANA_ADDRESS: solana, TESTER_STELLAR_ADDRESS: stellar,
      DEFRAME_PREVIEW_API_KEY: key, VITE_APP_DEFRAME_API_KEY: key, VITE_APP_HELIUS_API_KEY: key,
      VITE_APP_PRIVY_APP_ID: 'test-app',
    }
    for (const [name, value] of Object.entries(env)) {
      const prior = process.env[name]
      process.env[name] = value
      t.after(() => { if (prior === undefined) delete process.env[name]; else process.env[name] = prior })
    }
    const server = await createServer({ mode: 'pr-' + pr, logLevel: 'error',
      optimizeDeps: { noDiscovery: true, include: [] } })
    t.after(() => server.close())
    await server.listen()
    const request = globalThis.fetch
    const upstream = t.mock.method(globalThis, 'fetch', (url, options) => {
      assert.equal(url.origin, 'https://pr-' + pr + '.preview.pods.finance')
      assert.deepEqual(options.headers, { 'x-api-key': key })
      assert.equal(options.redirect, 'error')
      return new Response(url.pathname + url.search)
    })

    const client = await server.ssrLoadModule('/src/preview.ts')
    assert.equal(client.previewPath, '/pr-' + pr)
    assert.deepEqual(client.quoteHeaders, { 'x-preview-quote': pr })
    assert.deepEqual(['gnosis', 'solana', 'stellar', 'fiat'].map(client.configuredWallet), [evm, solana, stellar, ''])
    const catalog = await server.ssrLoadModule('/src/components/BridgeCatalog/catalog.ts')
    assert.equal(catalog.catalogPr, pr === '3561' ? pr : '3500')
    assert.equal('base/EURC' in catalog.assets, pr === '3561')
    const { deframeApiHeaders } = await server.ssrLoadModule('/src/components/Ramp/rampApi.ts')
    assert.deepEqual(deframeApiHeaders(), client.quoteHeaders)
    const source = await (await request(base + '/src/preview.ts')).text()
    assert.ok(source.includes(evm) && !source.includes(key))
    assert.ok(!JSON.stringify(server.config.env).includes(key))
    const quote = '/v2/swap/quote?amountIn=100'
    const status = '/v2/swap/status/00000000-1234-1234-1234-123456789012'
    const action = '/actions/000000000000000000000001'
    for (const path of [quote, status, action]) {
      const res = await request(base + path, { headers: client.quoteHeaders })
      assert.equal(res.status, 200)
      assert.equal(await res.text(), path)
    }
    for (const options of [{}, { headers: { 'x-preview-quote': '1' } },
      { headers: { ...client.quoteHeaders, origin: 'http://example.invalid' } },
      { method: 'POST', headers: client.quoteHeaders }]) {
      assert.equal((await request(base + quote, options)).status, 403)
    }
    await request(base + '/actions/invalid', { headers: client.quoteHeaders })
    assert.equal(upstream.mock.callCount(), 3)
  })
}

test('manual Stellar Pix instructions require the quote-specific muxed deposit', async t => {
  const { Account, Asset, Memo, MuxedAccount, Networks, Operation, TransactionBuilder } = await import('@stellar/stellar-sdk')
  const quoteId = 'synthetic-stellar-quote'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(quoteId))
  const muxId = new DataView(digest).getBigUint64(0).toString()
  const account = byte => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, byte))
  const funding = account(1), baseDeposit = account(2), issuer = account(3)
  const depositAddress = new MuxedAccount(new Account(baseDeposit, '0'), muxId).accountId()
  const tx = new TransactionBuilder(new Account(funding, '1'), { fee: '100', networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.payment({ destination: depositAddress, amount: '1', asset: new Asset('USDC', issuer) }))
    .addMemo(Memo.id(muxId)).setTimeout(60).build()
  const body = { amount: '1', depositAddress, muxId, xdrUnsigned: tx.toXDR() }
  // Vite only needs a preview number to load the client parser.
  const oldPr = process.env.DEFRAME_PREVIEW_PR
  process.env.DEFRAME_PREVIEW_PR = '1'
  t.after(() => { if (oldPr === undefined) delete process.env.DEFRAME_PREVIEW_PR; else process.env.DEFRAME_PREVIEW_PR = oldPr })
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
  t.after(() => server.close())
  const { readStellarPixDeposit } = await server.ssrLoadModule('/src/components/Ramp/stellarPixDeposit.ts')
  const read = data => readStellarPixDeposit(data, quoteId, funding, 'USDC:' + issuer, '10000000')
  assert.equal((await read(body)).address, depositAddress)
  await assert.rejects(read({ ...body, depositAddress: baseDeposit }), /Missing Stellar payment instructions/)
})
