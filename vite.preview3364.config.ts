import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

async function serveQuote(req: IncomingMessage, res: ServerResponse, search: string) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' || req.headers['x-preview-quote'] !== '3364' ||
      req.headers.host !== 'localhost:5364' ||
      (req.headers.origin && req.headers.origin !== 'http://localhost:5364')) {
    res.statusCode = 403
    res.end('Local quote requests only')
    return
  }
  const apiKey = process.env.DEFRAME_PREVIEW_API_KEY
  if (!apiKey) {
    res.statusCode = 503
    res.end('Set DEFRAME_PREVIEW_API_KEY and restart the preview client')
    return
  }
  const url = new URL('/v2/swap/quote', 'https://pr-3364.preview.pods.finance')
  url.search = search
  const response = await fetch(url, { headers: { 'x-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(55000) })
  const body = await response.text()
  res.statusCode = response.status
  res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json')
  res.end(body)
}

export default mergeConfig(base, defineConfig({
  define: { 'import.meta.env.VITE_PIX_PREVIEW': JSON.stringify('3364') },
  server: { host: 'localhost', port: 5364, strictPort: true, cors: false },
  plugins: [{
    name: 'pr-3364-quote',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const local = new URL(req.url ?? '/', 'http://localhost:5364')
        if (local.pathname !== '/preview-3364-quote') {
          next()
          return
        }
        void serveQuote(req, res, local.search).catch(() => {
          res.statusCode = 502
          res.end('Could not reach the preview quote endpoint')
        })
      })
    },
  }],
}))
