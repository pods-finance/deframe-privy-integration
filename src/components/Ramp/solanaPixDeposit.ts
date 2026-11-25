import { PublicKey, VersionedTransaction } from '@solana/web3.js'

const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ataProgram = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const trackingProgram = 'G7WyTTDWEFDefk7BYcqriqSdkRmXXGapUGc7CeA4GYPN'

export function readSolanaPixDeposit(encoded: string, wallet: string, mint: string, amount: string, quoteId: string) {
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
  const { message } = VersionedTransaction.deserialize(bytes)
  const keys = message.staticAccountKeys
  const invalid = () => new Error('The prepared Solana payment does not match this quote. Request a new quote.')
  if (message.addressTableLookups.length || message.header.numRequiredSignatures !== 1 || keys[0]?.toBase58() !== wallet) throw invalid()
  const [source] = PublicKey.findProgramAddressSync([keys[0].toBytes(), tokenProgram.toBytes(), new PublicKey(mint).toBytes()], ataProgram)
  let total = 0n
  let destination = ''
  let tracked = false
  for (const ix of message.compiledInstructions) {
    const program = keys[ix.programIdIndex]
    const accounts = ix.accountKeyIndexes.map(index => keys[index])
    if (program.equals(tokenProgram)) {
      if (ix.data.length !== 9 || ix.data[0] !== 3 || accounts.length !== 3 || !accounts[0].equals(source) || !accounts[2].equals(keys[0])) throw invalid()
      total += new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength).getBigUint64(1, true)
      // The funding rail appends the inventory transfer after any customer fee transfer.
      destination = accounts[1].toBase58()
    } else if (program.toBase58() === trackingProgram) {
      const memo = JSON.parse(new TextDecoder().decode(ix.data)) as { version?: number; actionId?: string }
      if (tracked || memo.version !== 1 || memo.actionId !== quoteId) throw invalid()
      tracked = true
    } else if (!(program.equals(ataProgram) && ix.data.length === 1 && ix.data[0] === 1 &&
        accounts[0]?.equals(keys[0]) && accounts[3]?.toBase58() === mint)) throw invalid()
  }
  if (!tracked || !destination || total !== BigInt(amount) || total === 0n) throw invalid()
  return { destination, bytes, quoteId }
}
