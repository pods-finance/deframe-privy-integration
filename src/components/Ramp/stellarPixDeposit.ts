import { FeeBumpTransaction, Horizon, MuxedAccount, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { parseUnits } from 'viem'

export async function readStellarPixDeposit(body: Record<string, unknown>, quoteId: string, wallet: string, token: string, amountIn: string) {
  const { amount, depositAddress, muxId, xdrUnsigned } = body
  if (!quoteId || typeof amount !== 'string' || !/^\d+(\.\d{1,7})?$/.test(amount) ||
    typeof depositAddress !== 'string' || !depositAddress.startsWith('M') ||
    typeof muxId !== 'string' || typeof xdrUnsigned !== 'string') {
    throw Error('Missing Stellar payment instructions. Request a fresh quote.')
  }
  const tx = TransactionBuilder.fromXDR(xdrUnsigned, Networks.PUBLIC)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(quoteId))
  const expectedId = (new DataView(digest).getBigUint64(0) || 1n).toString()
  if (tx instanceof FeeBumpTransaction || tx.source !== wallet || tx.signatures.length ||
    expectedId !== muxId || MuxedAccount.fromAddress(depositAddress, '0').id() !== muxId ||
    tx.memo.type !== 'id' || String(tx.memo.value) !== muxId || !tx.operations.length) {
    throw Error('The Stellar transaction does not match the funding wallet or quote.')
  }
  let total = 0n
  for (const [index, op] of tx.operations.entries()) {
    if (op.type !== 'payment' || (op.source && op.source !== wallet) ||
      !op.asset.issuer || op.asset.code + ':' + op.asset.issuer !== token) throw Error('Unexpected operation in the Stellar payment.')
    const raw = parseUnits(op.amount, 7)
    if (raw <= 0n || (index === tx.operations.length - 1 && (op.destination !== depositAddress || raw !== parseUnits(amount, 7)))) {
      throw Error('The Stellar transaction does not match the quoted deposit.')
    }
    total += raw
  }
  if (total !== BigInt(amountIn)) throw Error('The Stellar payment total differs from the quote.')
  const maxTime = Number(tx.timeBounds?.maxTime ?? 0)
  return { address: depositAddress, amount, memo: muxId, xdr: xdrUnsigned, singlePayment: tx.operations.length === 1,
    validUntil: maxTime ? maxTime * 1000 : Infinity }
}

export async function connectStellarFundingWallet(wallet: string) {
  const freighter = await import('@stellar/freighter-api')
  if (!(await freighter.isConnected()).isConnected) throw Error('Open this page with Freighter enabled, or use the payment instructions below.')
  const access = await freighter.requestAccess()
  if (access.error) throw Error('Freighter did not grant access to the funding account.')
  if (access.address !== wallet) throw Error('Select the quoted funding account in Freighter and connect again.')
}

export async function payWithFreighter(xdr: string, wallet: string, expires: number) {
  const freighter = await import('@stellar/freighter-api')
  const [account, network] = await Promise.all([freighter.getAddress(), freighter.getNetwork()])
  const mainnet: string = Networks.PUBLIC
  if (account.address !== wallet || network.networkPassphrase !== mainnet) {
    throw Error('Select the quoted funding account and Stellar mainnet in Freighter.')
  }
  const signed = await freighter.signTransaction(xdr, { address: wallet, networkPassphrase: Networks.PUBLIC })
  if (signed.error) throw Error('Freighter did not sign the payment.')
  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, Networks.PUBLIC)
  const expected = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC)
  if (signed.signerAddress !== wallet || !tx.signatures.length || !tx.hash().equals(expected.hash())) throw Error('Freighter returned a different payment or signer.')
  if (Date.now() >= expires) throw Error('Quote expired during signing. Request a fresh quote.')
  return new Horizon.Server('https://horizon.stellar.org').submitTransaction(tx)
}
