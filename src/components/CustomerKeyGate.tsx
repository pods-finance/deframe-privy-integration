import { useEffect, useRef, useState, type ReactNode } from 'react'
import { quoteHeaders, targetLabel } from '../preview'

const endpoint = '/tester/customer-key'

export default function CustomerKeyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'enter' | 'ready'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(endpoint, { headers: quoteHeaders, cache: 'no-store', signal: controller.signal })
      .then(res => { if (!controller.signal.aborted) setStatus(res.status === 204 ? 'ready' : 'enter') })
      .catch(() => { if (!controller.signal.aborted) setStatus('enter') })
    return () => { controller.abort() }
  }, [])

  async function update(method: 'PUT' | 'DELETE') {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const headers = new Headers(quoteHeaders)
      if (method === 'PUT' && input.current) {
        headers.set('Authorization', 'Bearer ' + input.current.value.trim())
        input.current.value = ''
      }
      const res = await fetch(endpoint, { method, headers, cache: 'no-store' })
      if (res.status !== 204) {
        setError(res.status === 401 ? 'This target rejected the customer API key.' : 'Could not update the key. Check the local tester and try again.')
        return
      }
      setStatus(method === 'PUT' ? 'ready' : 'enter')
    } catch {
      setError('Could not update the customer key.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <p className="ui-container">Checking customer key…</p>
  return <>
    <section className="ui-container py-2">
      {status === 'ready'
        ? <button className="ui-btn-tab" disabled={busy} onClick={() => { void update('DELETE') }}>Clear customer API key</button>
        : <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void update('PUT') }}>
          <label className="ui-label">Customer API key for {targetLabel}
            <input ref={input} type="password" required autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} className="ui-input" />
          </label>
          <button className="ui-btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Use customer key'}</button>
        </form>}
      {error && <p role="alert">{error}</p>}
    </section>
    {status === 'ready' && children}
  </>
}
