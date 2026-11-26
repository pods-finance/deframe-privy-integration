import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, loadEnv } from 'vite'
import { previewKey } from './preview-key.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
const pr = process.argv[2] ?? loadEnv('development', root, 'DEFRAME_').DEFRAME_PREVIEW_PR
if (process.argv.length > 3 || !/^[1-9]\d*$/.test(pr ?? '')) {
  throw Error('Pass a positive PR number (yarn tester 3561) or set DEFRAME_PREVIEW_PR.')
}
const mode = 'pr-' + pr
const env = loadEnv(mode, root, ['DEFRAME_', 'VITE_APP_PRIVY_APP_ID'])
if (!env.VITE_APP_PRIVY_APP_ID) throw Error('Set VITE_APP_PRIVY_APP_ID in this checkout’s .env.')
process.env.DEFRAME_PREVIEW_PR = pr
if (!env.DEFRAME_PREVIEW_API_KEY) {
  if (!env.DEFRAME_API_DIRECTORY || !/^[0-9a-f]{24}$/i.test(env.DEFRAME_PREVIEW_CUSTOMER_ID ?? '')) {
    throw Error('Supply DEFRAME_PREVIEW_API_KEY or set DEFRAME_API_DIRECTORY and DEFRAME_PREVIEW_CUSTOMER_ID for AWS lookup.')
  }
  try {
    process.env.DEFRAME_PREVIEW_API_KEY = await previewKey(pr, resolve(env.DEFRAME_API_DIRECTORY), env.DEFRAME_PREVIEW_CUSTOMER_ID)
  } catch (error) {
    const known = ['The preview service is unavailable.', 'Preview task identity mismatch', 'Preview database mismatch', 'Preview test customer key unavailable']
    const reason = known.includes(error.message) ? error.message : 'Check the deframe AWS session, API checkout, and preview customer.'
    throw Error('Could not load the key for PR #' + pr + '. ' + reason)
  }
}
const server = await createServer({ root, mode })
await server.listen()
console.log('Deframe preview PR #' + pr)
server.printUrls()
