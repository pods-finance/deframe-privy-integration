import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { getAddressDecoder } from '@solana/kit'
import { StrKey } from '@stellar/stellar-sdk'
import { createServer } from 'vite'
import { launchTarget, targetForMode } from './tester-target.mjs'

async function availablePort() {
  const listener = net.createServer()
  listener.listen(0, 'localhost')
  await once(listener, 'listening')
  const { port } = listener.address()
  await new Promise(resolve => listener.close(resolve))
  return port
}

const targets = [
  ['prod', 'https://api.pods.finance'],
  ['dev', 'https://dev-api.pods.finance'],
  ['staging', 'https://staging-api.pods.finance'],
  ['pr-3500', 'https://pr-3500.preview.pods.finance'],
  ['pr-3561', 'https://pr-3561.preview.pods.finance'],
  ['pr-9999', 'https://pr-9999.preview.pods.finance'],
]

test('launcher and build resolve the same target, including with a saved preview PR', () => {
  const saved = { DEFRAME_TARGET: 'preview', DEFRAME_PREVIEW_PR: '3500' }
  for (const [id, origin] of targets) {
    const args = id.startsWith('pr-') ? ['preview', id.slice(3)] : [id]
    assert.deepEqual(launchTarget(args, saved), { id, origin })
    assert.deepEqual(targetForMode(id, saved), { id, origin })
  }
  assert.equal(launchTarget([], saved).id, 'pr-3500')
  assert.equal(launchTarget(['3561'], saved).id, 'pr-3561')
  assert.equal(launchTarget([], { ...saved, DEFRAME_TARGET: 'dev' }).id, 'dev')
  for (const args of [['preview'], ['preview', '0'], ['preview', '-1'], ['preview', '1.5'], ['preview', '1/path']]) {
    assert.throws(() => launchTarget(args, saved), /positive integer/)
  }
  assert.throws(() => launchTarget([], { DEFRAME_TARGET: 'preview' }), /positive integer/)
  assert.throws(() => launchTarget(['prod', '3500'], saved), /Only preview/)
  assert.throws(() => launchTarget(['other'], saved), /Choose a target/)
})

let previousTargetCookie = ''
for (const [index, [id, origin]] of targets.entries()) {
  test('wallets and proxy for ' + id, async t => {
    const port = await availablePort()
    const base = 'http://localhost:' + port
    const blank = id === 'pr-9999'
    const bytes = Buffer.alloc(32, index + 1)
    const evm = blank ? '' : '0x' + bytes.subarray(0, 20).toString('hex')
    const solana = blank ? '' : getAddressDecoder().decode(bytes)
    const stellar = blank ? '' : StrKey.encodeEd25519PublicKey(bytes)
    const key = 'synthetic-shared-server-key'
    const manual = id === 'prod' || id === 'staging'
    const entered = 'synthetic-customer-' + id
    const expectedKey = manual ? entered : key
    const env = {
      DEFRAME_PREVIEW_PORT: String(port),
      TESTER_EVM_ADDRESS: evm, TESTER_SOLANA_ADDRESS: solana, TESTER_STELLAR_ADDRESS: stellar,
      DEFRAME_API_KEY: key, VITE_APP_DEFRAME_API_KEY: key, VITE_APP_HELIUS_API_KEY: key,
      VITE_APP_PRIVY_APP_ID: 'test-app',
    }
    for (const [name, value] of Object.entries(env)) {
      const prior = process.env[name]
      process.env[name] = value
      t.after(() => { if (prior === undefined) delete process.env[name]; else process.env[name] = prior })
    }
    const server = await createServer({ mode: id, logLevel: 'error',
      optimizeDeps: { noDiscovery: true, include: [] } })
    t.after(() => server.close())
    await server.listen()
    const request = globalThis.fetch
    const upstream = t.mock.method(globalThis, 'fetch', (url, options) => {
      assert.equal(url.origin, origin)
      assert.deepEqual(Object.keys(options.headers), ['x-api-key'])
      if (url.pathname === '/customers/by-api-key') {
        return new Response(null, { status: options.headers['x-api-key'] === entered ? 200 : 401 })
      }
      assert.ok(options.headers['x-api-key'] === expectedKey, 'Proxy must use the credential for this target')
      assert.equal(options.redirect, 'error')
      return new Response(url.pathname + url.search)
    })

    const client = await server.ssrLoadModule('/src/preview.ts')
    assert.equal(client.targetPath, '/' + id)
    assert.equal(client.targetOrigin, origin)
    assert.deepEqual(client.quoteHeaders, { 'x-deframe-target': id })
    assert.deepEqual(['gnosis', 'solana', 'stellar', 'fiat'].map(client.configuredWallet), [evm, solana, stellar, ''])
    const catalog = await server.ssrLoadModule('/src/components/BridgeCatalog/catalog.ts')
    assert.equal(catalog.catalogPr, id === 'pr-3561' ? '3561' : '3500')
    assert.equal('base/EURC' in catalog.assets, id === 'pr-3561')
    const { deframeApiHeaders } = await server.ssrLoadModule('/src/components/Ramp/rampApi.ts')
    assert.deepEqual(deframeApiHeaders(), client.quoteHeaders)
    const source = await (await request(base + '/src/preview.ts')).text()
    assert.ok(source.includes(evm) && !source.includes(key))
    assert.ok(!JSON.stringify(server.config.env).includes(key))
    const quote = '/v2/swap/quote?amountIn=100'
    const status = '/v2/swap/status/00000000-1234-1234-1234-123456789012'
    const action = '/actions/000000000000000000000001'
    const endpoint = base + '/tester/customer-key'
    const headers = { ...client.quoteHeaders, origin: base }
    let cookie = ''
    if (manual) {
      assert.equal((await request(base + quote, { headers })).status, 401)
      assert.equal((await request(endpoint, { headers: { ...headers, cookie: previousTargetCookie } })).status, 401)
      const submit = (value, origin = base) => request(endpoint, {
        method: 'PUT', headers: { ...headers, origin, authorization: 'Bearer ' + value },
      })
      assert.equal((await submit(entered, 'https://example.invalid')).status, 403)
      assert.equal((await submit('invalid-key')).status, 401)
      assert.equal((await request(endpoint, { headers })).status, 401)
      const signedIn = await submit(entered)
      assert.equal(signedIn.status, 204)
      const setCookie = signedIn.headers.get('set-cookie')
      assert.ok(setCookie?.includes('HttpOnly') && setCookie.includes('SameSite=Strict') && !setCookie.includes(entered))
      cookie = setCookie.split(';')[0]
      assert.equal((await request(endpoint, { headers: { ...headers, cookie } })).status, 204)
      assert.equal((await request(base + quote, { headers })).status, 401)
    } else {
      assert.equal((await request(endpoint, { method: 'PUT', headers: { ...headers, authorization: 'Bearer ' + entered } })).status, 404)
    }
    for (const path of [quote, status, action]) {
      const res = await request(base + path, { headers: { ...headers, cookie } })
      assert.equal(res.status, 200)
      assert.equal(await res.text(), path)
    }
    for (const options of [{}, { headers: { 'x-deframe-target': 'other' } },
      { headers: { ...client.quoteHeaders, origin: 'http://example.invalid' } },
      { method: 'POST', headers: client.quoteHeaders }]) {
      assert.equal((await request(base + quote, options)).status, 403)
    }
    await request(base + '/actions/invalid', { headers: client.quoteHeaders })
    if (manual) {
      assert.equal((await request(endpoint, { method: 'DELETE', headers: { ...headers, cookie } })).status, 204)
      assert.equal((await request(base + quote, { headers: { ...headers, cookie } })).status, 401)
      // Keep a valid session ID to check that a subsequent target cannot reuse it.
      const again = await request(endpoint, { method: 'PUT', headers: { ...headers, authorization: 'Bearer ' + entered } })
      previousTargetCookie = again.headers.get('set-cookie').split(';')[0]
    }
    assert.equal(upstream.mock.callCount(), manual ? 6 : 3)
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
  const oldKey = process.env.DEFRAME_API_KEY, oldApp = process.env.VITE_APP_PRIVY_APP_ID
  process.env.DEFRAME_API_KEY = 'synthetic-server-key'
  process.env.VITE_APP_PRIVY_APP_ID = 'test-app'
  t.after(() => {
    if (oldKey === undefined) delete process.env.DEFRAME_API_KEY; else process.env.DEFRAME_API_KEY = oldKey
    if (oldApp === undefined) delete process.env.VITE_APP_PRIVY_APP_ID; else process.env.VITE_APP_PRIVY_APP_ID = oldApp
  })
  const server = await createServer({ mode: 'dev', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
  t.after(() => server.close())
  const { readStellarPixDeposit } = await server.ssrLoadModule('/src/components/Ramp/stellarPixDeposit.ts')
  const read = data => readStellarPixDeposit(data, quoteId, funding, 'USDC:' + issuer, '10000000')
  assert.equal((await read(body)).address, depositAddress)
  await assert.rejects(read({ ...body, depositAddress: baseDeposit }), /Missing Stellar payment instructions/)
})
