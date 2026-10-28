import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData, erc20Abi, zeroAddress } from 'viem'
import { assertReady, bytecodePath, makeIntent, normalizeApi, parsePrepared, protocols, rawAmount } from '../src/components/StrategyTest/flow.ts'

const wallet = '0x1111111111111111111111111111111111111111'
const deposit = '0x2222222222222222222222222222222222222222'
const now = 1793203200000
const intent = makeIntent('Aave', 'cross-deposit', 'direct', wallet, '2000000')
const direct = () => ({ id: '1234567890abcdef12345678', chainIdIn: 42161, chainIdOut: 137, quote: { deadline: now / 1000 + 90, originAddress: wallet, destinationAddress: wallet }, bytecode: [{ chainId: '42161', to: deposit, data: '0xabcd', value: '0' }] })
const funding = (i = intent) => ({ id: direct().id, chainId: i.sourceChainId, depositAddress: deposit, destinationAddress: wallet, tokenAddress: i.sourceToken, depositInstructions: { chainId: i.sourceChainId, to: deposit, tokenAddress: i.sourceToken, amountRaw: i.amount } })

for (const protocol of Object.keys(protocols)) {
  for (const scenario of ['cross-deposit', 'same-withdraw', 'same-deposit', 'cross-withdraw']) {
    test(`${protocol} ${scenario} binds source, destination, wallet and partial intent`, () => {
      const i = makeIntent(protocol, scenario, 'direct', wallet, '2000000')
      const url = new URL(bytecodePath(i), 'https://preview.example')
      assert.equal(url.searchParams.get('wallet'), wallet)
      assert.equal(url.searchParams.get('destinationAddress'), wallet)
      assert.equal(i.sourceChainId, scenario === 'cross-deposit' ? 42161 : protocols[protocol].chainId)
      assert.equal(i.destinationChainId, scenario === 'cross-withdraw' ? 42161 : protocols[protocol].chainId)
      if (i.action === 'withdraw') {
        assert.equal(url.searchParams.get('withdrawAll'), 'false')
        assert.equal(url.searchParams.has('fromTokenAddress'), false)
        assert.equal(url.searchParams.get('toChainId'), scenario === 'cross-withdraw' ? '42161' : null)
      } else assert.equal(url.searchParams.get('fromChainId'), String(i.sourceChainId))
    })
  }
}
test('direct response preserves every call in order', () => {
  const response = direct()
  response.bytecode.push({ chainId: '42161', to: wallet, data: '0x', value: '3' })
  const prepared = parsePrepared(response, intent, now, now + 5)
  assert.deepEqual(prepared.calls.map(x => [x.to, x.value]), [[deposit, 0n], [wallet, 3n]])
  assert.equal(prepared.expiresAt, now + 90_000)
  assert.equal(prepared.responseMs, 5)
})
for (const mode of ['erc20', 'native']) test(`deposit-address ${mode} creates only the exact funding transfer`, () => {
  const i = { ...intent, mode: 'depositAddress', ...(mode === 'native' ? { sourceToken: zeroAddress } : {}) }
  const prepared = parsePrepared(funding(i), i, now, now)
  assert.equal(prepared.calls.length, 1)
  if (mode === 'native') assert.deepEqual(prepared.calls[0], { to: deposit, data: '0x', value: 2000000n })
  else {
    assert.equal(prepared.calls[0].to, i.sourceToken)
    assert.equal(prepared.calls[0].value, 0n)
    const decoded = decodeFunctionData({ abi: erc20Abi, data: prepared.calls[0].data })
    assert.equal(decoded.functionName, 'transfer')
    assert.deepEqual(decoded.args, [deposit, 2000000n])
  }
})
for (const [field, value] of [['amountRaw', '1999999'], ['chainId', 8453], ['tokenAddress', deposit], ['to', wallet]]) test(`rejects mismatched funding ${field}`, () => {
  const response = funding()
  response.depositInstructions[field] = value
  assert.throws(() => parsePrepared(response, { ...intent, mode: 'depositAddress' }, now, now))
})
test('rejects empty, mixed-chain, delegate, malformed or negative-value bytecode', () => {
  for (const bad of [[], [{ ...direct().bytecode[0], chainId: 137 }], [{ ...direct().bytecode[0], operationType: 1 }], [{ ...direct().bytecode[0], data: '0xabc' }], [{ ...direct().bytecode[0], value: '-1' }]]) {
    assert.throws(() => parsePrepared({ ...direct(), bytecode: bad }, intent, now, now))
  }
})
test('does not silently fall back to direct when deposit instructions are absent', () => {
  assert.throws(() => parsePrepared(direct(), { ...intent, mode: 'depositAddress' }, now, now))
})
test('rejects inconsistent recipient, chains, preview-only and expired quotes', () => {
  for (const change of [{ destinationAddress: deposit }, { chainIdOut: 8453 }, { chainIdIn: 1 }, { previewOnly: true }, { quote: { deadline: now / 1000 - 1 } }]) assert.throws(() => parsePrepared({ ...direct(), ...change }, intent, now, now))
})
test('changed wallet and near-expiry requests cannot be submitted', () => {
  const prepared = parsePrepared(direct(), intent, now, now)
  assert.throws(() => assertReady(prepared, deposit, now))
  assert.throws(() => assertReady(prepared, wallet, now + 80_000))
  assert.doesNotThrow(() => assertReady(prepared, wallet, now))
})
test('amounts never use floating point or accept uint256 overflow', () => {
  for (const value of ['2.5', '-2', '0', '2e6', '02000000', (2n ** 256n).toString()]) assert.throws(() => rawAmount(value))
  assert.equal(rawAmount('9007199254740993'), '9007199254740993')
})
test('configuration accepts only secure origins or localhost, without embedded credentials', () => {
  for (const value of ['http://preview.example', 'https://key@preview.example', 'https://preview.example/api', 'https://preview.example?key=secret']) assert.throws(() => normalizeApi(value))
  assert.equal(normalizeApi('https://preview.example/'), 'https://preview.example')
  assert.equal(normalizeApi('http://127.0.0.1:5173'), 'http://127.0.0.1:5173')
})
