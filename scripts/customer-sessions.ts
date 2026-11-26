import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Only the random session ID leaves the proxy. Restarting the server discards its keys.
export function customerSessions(targetId: string, port: number, upstream: string) {
  const cookie = `deframe_customer_${targetId}_${String(port)}`
  const attributes = '; Path=/; HttpOnly; SameSite=Strict'
  const keys = new Map<string, string>()

  function sessionId(req: IncomingMessage) {
    return req.headers.cookie?.split(';').map(part => part.trim())
      .find(part => part.startsWith(cookie + '='))?.slice(cookie.length + 1) ?? ''
  }

  function getKey(req: IncomingMessage) {
    return keys.get(sessionId(req))
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const previous = sessionId(req)
    if (req.method === 'GET') {
      res.statusCode = keys.has(previous) ? 204 : 401
    } else if (req.method === 'DELETE') {
      keys.delete(previous)
      res.setHeader('Set-Cookie', cookie + '=; Max-Age=0' + attributes)
      res.statusCode = 204
    } else if (req.method === 'PUT') {
      const key = /^Bearer ([!-~]+)$/.exec(req.headers.authorization ?? '')?.[1]
      if (!key) {
        res.statusCode = 400
        res.end('Enter a customer API key.')
        return
      }
      const response = await fetch(new URL('/customers/by-api-key', upstream), {
        headers: { 'x-api-key': key }, redirect: 'error', signal: AbortSignal.timeout(15000),
      })
      await response.body?.cancel()
      if (!response.ok) {
        const rejected = response.status === 401 || response.status === 403
        res.statusCode = rejected ? 401 : 502
        res.end(rejected ? 'This target rejected the customer API key.' : 'Could not verify the key with this target.')
        return
      }
      const id = randomBytes(32).toString('hex')
      keys.delete(previous)
      keys.set(id, key)
      res.setHeader('Set-Cookie', cookie + '=' + id + attributes)
      res.statusCode = 204
    } else {
      res.statusCode = 405
    }
    res.end()
  }

  return { getKey, handle }
}
