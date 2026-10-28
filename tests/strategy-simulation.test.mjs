import { test } from 'node:test'
import assert from 'node:assert/strict'
import { custom } from 'viem'
import { arbitrum } from 'viem/chains'
import { createBundlerClient, entryPoint06Address } from 'viem/account-abstraction'
import { simulateUserOperation } from '../src/components/StrategyTest/simulateUserOperation.ts'

const calls = [{ to: '0x1111111111111111111111111111111111111111', data: '0x', value: 0n }]
function fixture({ rejectGas = false } = {}) {
  const requests = []
  let signed = 0
  const account = {
    type: 'smart',
    address: '0x2222222222222222222222222222222222222222',
    entryPoint: { address: entryPoint06Address, version: '0.6' },
    getFactoryArgs: async () => ({}),
    getNonce: async () => 1n,
    encodeCalls: async input => { assert.deepEqual(input, calls); return '0xabcd' },
    getStubSignature: async () => `0x${'ff'.repeat(65)}`,
    signUserOperation: async () => { signed++; throw Error('Simulation must not sign') },
  }
  const client = createBundlerClient({
    account,
    chain: arbitrum,
    paymaster: true,
    userOperation: { estimateFeesPerGas: async () => ({ maxFeePerGas: 100n, maxPriorityFeePerGas: 10n }) },
    transport: custom({ request: async request => {
      requests.push(request)
      if (request.method === 'pm_getPaymasterStubData') {
        const operation = request.params[0]
        if (!operation.maxFeePerGas || !operation.maxPriorityFeePerGas) throw Error('Missing maxFeePerGas/maxPriorityFeePerGas')
        assert.equal(operation.maxFeePerGas, '0x64')
        assert.equal(operation.maxPriorityFeePerGas, '0xa')
        return { paymasterAndData: '0x3333333333333333333333333333333333333333', isFinal: true }
      }
      if (request.method === 'eth_estimateUserOperationGas') {
        if (rejectGas) throw Error('Source transaction reverted: insufficient balance')
        return { callGasLimit: '0x100', verificationGasLimit: '0x200', preVerificationGas: '0x300' }
      }
      throw Error(`Unexpected RPC in simulation: ${request.method}`)
    } }, { retryCount: 0 }),
  })
  return { client, requests, getSigned: () => signed }
}

test('reproduces missing paymaster fees with the previous standalone estimator', async () => {
  const { client, requests } = fixture()
  await assert.rejects(client.estimateUserOperationGas({ calls }), /Missing maxFeePerGas/)
  assert.equal(requests[0].method, 'pm_getPaymasterStubData')
  assert.equal(requests[0].params[0].maxFeePerGas, undefined)
  assert.equal(requests.some(r => r.method === 'eth_estimateUserOperationGas'), false)
})

test('full unsigned preparation fills fees before the real Viem paymaster and gas pipeline', async () => {
  const { client, requests, getSigned } = fixture()
  const result = await simulateUserOperation(client, calls)
  assert.deepEqual(requests.map(r => r.method), ['pm_getPaymasterStubData', 'eth_estimateUserOperationGas'])
  assert.deepEqual(result, { maxFeePerGas: 100n, maxPriorityFeePerGas: 10n, callGasLimit: 256n, verificationGasLimit: 512n, preVerificationGas: 768n })
  assert.equal(getSigned(), 0)
  assert.equal('signature' in result, false)
  assert.equal('nonce' in result, false)
  assert.equal('paymasterAndData' in result, false)
})

test('a bundler simulation failure is preserved and never signs or submits', async () => {
  const { client, requests, getSigned } = fixture({ rejectGas: true })
  await assert.rejects(simulateUserOperation(client, calls), /insufficient balance/)
  assert.equal(getSigned(), 0)
  assert.equal(requests.some(r => /sendUserOperation|sendRawTransaction/.test(r.method)), false)
})
