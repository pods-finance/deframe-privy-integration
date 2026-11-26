export const targetId = import.meta.env.TESTER_TARGET
export const targetOrigin = import.meta.env.TESTER_API_ORIGIN
export const targetLabel = targetId.startsWith('pr-') ? 'Preview PR #' + targetId.slice(3) : targetId
export const targetPath = '/' + targetId
export const quoteHeaders = { 'x-deframe-target': targetId }
export const testSafe = import.meta.env.TESTER_EVM_ADDRESS
export const nativeWallets = {
  solana: import.meta.env.TESTER_SOLANA_ADDRESS,
  stellar: import.meta.env.TESTER_STELLAR_ADDRESS,
}
export function configuredWallet(chain: string) {
  if (chain === 'fiat') return ''
  return chain === 'solana' || chain === 'stellar' ? nativeWallets[chain] : testSafe
}
