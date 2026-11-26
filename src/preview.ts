export const previewPr = import.meta.env.VITE_PIX_PREVIEW
export const previewPath = `/pr-${previewPr}`
export const quoteHeaders = { 'x-preview-quote': previewPr }
export const testSafe = import.meta.env.TESTER_EVM_ADDRESS
export const nativeWallets = {
  solana: import.meta.env.TESTER_SOLANA_ADDRESS,
  stellar: import.meta.env.TESTER_STELLAR_ADDRESS,
}
export function configuredWallet(chain: string) {
  if (chain === 'fiat') return ''
  return chain === 'solana' || chain === 'stellar' ? nativeWallets[chain] : testSafe
}
