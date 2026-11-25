import { encodeFunctionData, erc20Abi, isAddress, isAddressEqual, zeroAddress } from 'viem'
import { base, stable } from 'viem/chains'
import { asRecord } from './rampApi'

export function readEvmPixDeposit(body: Record<string, unknown>, chainName: string, token: string, wallet: string, amountIn: string) {
  const chain = chainName === 'base' ? base : chainName === 'stable' ? stable : undefined
  const quote = asRecord(body.quote)
  const address = body.depositAddress
  if (Number(body.chainId) !== chain?.id || Number(asRecord(quote?.tokenIn)?.chainId) !== chain.id ||
    quote?.provider !== 'avenia' || !quote.quoteId || asRecord(quote.tokenOut)?.decimals !== 2 ||
    typeof address !== 'string' || !isAddress(address) || !isAddress(wallet) || !isAddress(token) ||
    isAddressEqual(address, zeroAddress) || isAddressEqual(address, wallet) || isAddressEqual(address, token)) {
    throw Error('The preview did not return a valid Pix deposit address on the selected network. Request a fresh quote.')
  }
  // The tracked wallet batch can pay a different recipient. A plain deposit uses the explicit quote address.
  const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [address, BigInt(amountIn)] })
  return { address, wallet, chain, call: { to: token, data, value: 0n } }
}
