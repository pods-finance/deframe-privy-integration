import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Connect } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { isAddress, zeroAddress } from 'viem'
import { isAddress as isSolanaAddress } from '@solana/kit'
import { StrKey } from '@stellar/stellar-sdk'

export default defineConfig(({ mode }) => {
  const env: Record<string, string | undefined> = loadEnv(mode, process.cwd(), ['DEFRAME_', 'TESTER_', 'VITE_APP_PRIVY_APP_ID'])
  const pr = /^pr-([1-9]\d*)$/.exec(mode)?.[1] ?? env.DEFRAME_PREVIEW_PR
  if (!pr || !/^[1-9]\d*$/.test(pr)) throw Error('Set DEFRAME_PREVIEW_PR to a positive PR number.')
  const upstream = `https://pr-${pr}.preview.pods.finance`
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
    if (req.method !== 'GET' || req.headers['x-preview-quote'] !== pr ||
        req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin)) {
      res.statusCode = 403
      res.end('Local preview requests only')
      return
    }
    const apiKey = env.DEFRAME_PREVIEW_API_KEY
    if (!apiKey) {
      res.statusCode = 503
      res.end('Restart with yarn tester to load the preview API key.')
      return
    }
    const url = new URL(path, upstream)
    url.search = search
    const response = await fetch(url, { headers: { 'x-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(55000) })
    const body = await response.text()
    res.statusCode = response.status
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json')
    res.end(body)
  }

  const proxy: Connect.NextHandleFunction = (req, res, next) => {
    const local = new URL(req.url ?? '/', origin)
    const quote = local.pathname === '/v2/swap/quote' || local.pathname === `/preview-${pr}-quote`
    const status = /^\/v2\/swap\/status\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(local.pathname)
    const action = /^\/actions\/[a-f0-9]{24}$/i.test(local.pathname)
    if (!quote && !status && !action) {
      next()
      return
    }
    void serve(req, res, quote ? '/v2/swap/quote' : local.pathname, quote ? local.search : '').catch(() => {
      res.statusCode = 502
      res.end('Could not reach the preview API')
    })
  }

  const listen = { host: 'localhost', port, strictPort: true, cors: false }
  return {
    envPrefix: [],
    define: {
      'import.meta.env.VITE_APP_PRIVY_APP_ID': JSON.stringify(env.VITE_APP_PRIVY_APP_ID ?? ''),
      'import.meta.env.VITE_APP_DEFRAME_API_URL': JSON.stringify(origin),
      'import.meta.env.VITE_PIX_PREVIEW': JSON.stringify(pr),
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
