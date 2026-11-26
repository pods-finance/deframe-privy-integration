import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { targetForMode } from './scripts/tester-target.mjs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Connect } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { isAddress, zeroAddress } from 'viem'
import { isAddress as isSolanaAddress } from '@solana/kit'
import { StrKey } from '@stellar/stellar-sdk'

// Read the shared credential separately from Vite's public environment loader.
function serverApiKey() {
  if (process.env.DEFRAME_API_KEY) return process.env.DEFRAME_API_KEY
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      const key = parseEnv(readFileSync(file, 'utf8')).DEFRAME_API_KEY
      if (key) return key
    }
  }
}

export default defineConfig(({ mode, command }) => {
  const env: Record<string, string | undefined> = loadEnv(mode, process.cwd(), [
    'DEFRAME_TARGET', 'DEFRAME_PREVIEW_PR', 'DEFRAME_PREVIEW_PORT', 'TESTER_', 'VITE_APP_PRIVY_APP_ID',
  ])
  const target = targetForMode(mode, env)
  const apiKey = command === 'serve' ? serverApiKey() : undefined
  if (command === 'serve' && !apiKey) throw Error('Set DEFRAME_API_KEY in this checkout’s .env.')
  if (command === 'serve' && !env.VITE_APP_PRIVY_APP_ID) throw Error('Set VITE_APP_PRIVY_APP_ID in this checkout’s .env.')
  const port = Number(env.DEFRAME_PREVIEW_PORT ?? 5500)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid DEFRAME_PREVIEW_PORT.')
  const host = 'localhost:' + String(port)
  const origin = 'http://' + host
  const evm = env.TESTER_EVM_ADDRESS?.trim() ?? ''
  const solana = env.TESTER_SOLANA_ADDRESS?.trim() ?? ''
  const stellar = env.TESTER_STELLAR_ADDRESS?.trim() ?? ''
  if (evm && (!isAddress(evm) || evm.toLowerCase() === zeroAddress)) throw Error('Invalid TESTER_EVM_ADDRESS.')
  if (solana && !isSolanaAddress(solana)) throw Error('Invalid TESTER_SOLANA_ADDRESS.')
  if (stellar && !StrKey.isValidEd25519PublicKey(stellar)) throw Error('TESTER_STELLAR_ADDRESS must be a Stellar G account.')

  async function serve(req: IncomingMessage, res: ServerResponse, path: string, search: string) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' || req.headers['x-deframe-target'] !== target.id ||
        req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin)) {
      res.statusCode = 403
      res.end('Local tester requests only')
      return
    }
    if (!apiKey) {
      res.statusCode = 503
      res.end('Set DEFRAME_API_KEY and restart the tester.')
      return
    }
    const url = new URL(path, target.origin)
    url.search = search
    const response = await fetch(url, { headers: { 'x-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(55000) })
    const body = await response.text()
    res.statusCode = response.status
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json')
    res.end(body)
  }

  const proxy: Connect.NextHandleFunction = (req, res, next) => {
    const local = new URL(req.url ?? '/', origin)
    const quote = local.pathname === '/v2/swap/quote'
    const status = /^\/v2\/swap\/status\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(local.pathname)
    const action = /^\/actions\/[a-f0-9]{24}$/i.test(local.pathname)
    if (!quote && !status && !action) {
      next()
      return
    }
    void serve(req, res, quote ? '/v2/swap/quote' : local.pathname, quote ? local.search : '').catch(() => {
      res.statusCode = 502
      res.end('Could not reach the selected API')
    })
  }

  const listen = { host: 'localhost', port, strictPort: true, cors: false }
  return {
    envPrefix: [],
    define: {
      'import.meta.env.VITE_APP_PRIVY_APP_ID': JSON.stringify(env.VITE_APP_PRIVY_APP_ID ?? ''),
      'import.meta.env.VITE_APP_DEFRAME_API_URL': JSON.stringify(origin),
      'import.meta.env.TESTER_TARGET': JSON.stringify(target.id),
      'import.meta.env.TESTER_API_ORIGIN': JSON.stringify(target.origin),
      'import.meta.env.TESTER_EVM_ADDRESS': JSON.stringify(evm),
      'import.meta.env.TESTER_SOLANA_ADDRESS': JSON.stringify(solana),
      'import.meta.env.TESTER_STELLAR_ADDRESS': JSON.stringify(stellar),
    },
    server: listen,
    preview: listen,
    plugins: [react(), tailwindcss(), nodePolyfills(), {
      name: 'deframe-preview',
      configureServer(server) { server.middlewares.use(proxy) },
      configurePreviewServer(server) { server.middlewares.use(proxy) },
    }],
  }
})
