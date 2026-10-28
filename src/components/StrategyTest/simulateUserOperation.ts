import type { Call } from './flow'

interface PreparedGas {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  callGasLimit: bigint
  verificationGasLimit: bigint
  preVerificationGas: bigint
  paymasterVerificationGasLimit?: bigint
  paymasterPostOpGasLimit?: bigint
}

interface PreparationClient {
  prepareUserOperation: (parameters: { calls: Call[] }) => Promise<PreparedGas>
}

export async function simulateUserOperation(client: PreparationClient, calls: Call[]): Promise<PreparedGas> {
  // Standalone gas estimation omits fee preparation in Viem. Paymasters need
  // the fees before supplying stub data, so use the full unsigned pipeline.
  const operation = await client.prepareUserOperation({ calls })
  // Do not display or reuse the stub signature, nonce or paymaster authorization.
  // Submission prepares fresh execution data for the same reviewed calls.
  return {
    maxFeePerGas: operation.maxFeePerGas,
    maxPriorityFeePerGas: operation.maxPriorityFeePerGas,
    callGasLimit: operation.callGasLimit,
    verificationGasLimit: operation.verificationGasLimit,
    preVerificationGas: operation.preVerificationGas,
    ...(operation.paymasterVerificationGasLimit == null ? {} : { paymasterVerificationGasLimit: operation.paymasterVerificationGasLimit }),
    ...(operation.paymasterPostOpGasLimit == null ? {} : { paymasterPostOpGasLimit: operation.paymasterPostOpGasLimit }),
  }
}
