import { useState } from 'react'
import { catalogPr, label, selections, snapshot, type Selection } from './catalog'
import QuoteCase from './QuoteCase'
import { previewPr, previewPath } from '../../preview'

const key = `deframe:${previewPr}:quote-checks:` + snapshot.revision
const unique = (values: string[]) => [...new Set(values)].sort()
const families = unique(selections.map(s => s.family))
const initial = selections.find(s => s.from === 'gnosis/USDC' && s.to === 'polygon/BRLA') ?? selections[0]
function optionLabel(s: Selection) {
  if (s.swapProvider === 'cctp') return 'Circle CCTP'
  return s.provider === 'pods' ? 'Pods' : (s.provider === 'avenia' ? 'Avenia' : 'UnblockPay') + ' · ' + s.method
}

export default function BridgeCatalog() {
  const [family, setFamily] = useState('')
  const [row, setRow] = useState(initial)
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, unknown>
      return Object.fromEntries(selections.filter(s => typeof saved[s.id] === 'boolean').map(s => [s.id, Boolean(saved[s.id])]))
    } catch { return {} }
  })
  const filtered = selections.filter(s => !family || s.family === family)
  const fromOptions = unique(filtered.map(s => s.from))
  const from = filtered.filter(s => s.from === row.from)
  const toOptions = unique(from.map(s => s.to))
  const variants = from.filter(s => s.to === row.to)
  const results = Object.values(outcomes)
  function mark(id: string, ok: boolean) {
    const updated = { ...outcomes, [id]: ok }
    setOutcomes(updated)
    try { sessionStorage.setItem(key, JSON.stringify(updated)) } catch { /* In-memory tracking remains available in private browsing. */ }
  }
  return <main className="ui-page ui-surface-warm min-h-screen py-10">
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5">
      <nav aria-label="Preview tools" className="flex flex-wrap gap-2">
        <a className="ui-btn-tab ui-btn-tab-active" aria-current="page" href={previewPath + '/catalog'}>Route tester</a>
        <a className="ui-btn-tab" href={previewPath + '/swap'}>Bridge swap</a>
        <a className="ui-btn-tab" href={previewPath + '/pix'}>Pix ramps</a>
        <a className="ui-btn-tab" href={previewPath + '/ramp'}>Ramp catalog</a>
        <a className="ui-btn-tab" href={previewPath}>Quick quotes</a>
      </nav>
      <header><h1 className="ui-heading-section">Bridge route tester</h1><p>PR #{previewPr} · Reference catalog #{catalogPr} ({snapshot.revision.slice(0, 7)}) · {selections.length} combinations · {results.filter(Boolean).length} quoted · {results.filter(r => !r).length} failed this tab</p></header>
      <section className="ui-panel-shell flex flex-col gap-5 p-6">
        <label className="ui-label">Route family
          <select className="ui-select w-full" value={family} onChange={e => {
            const f = e.target.value; setFamily(f)
            if (f && row.family !== f) setRow(selections.find(s => s.family === f) ?? row)
          }}><option value="">All families</option>{families.map(f => <option key={f}>{f}</option>)}</select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="ui-label">From<select className="ui-select w-full" value={row.from} onChange={e => {
            const rows = filtered.filter(s => s.from === e.target.value)
            setRow(rows.find(s => s.to === row.to) ?? rows[0])
          }}>{fromOptions.map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label>
          <label className="ui-label">To<select className="ui-select w-full" value={row.to} onChange={e => { setRow(from.find(s => s.to === e.target.value) ?? row); }}>{toOptions.map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label>
        </div>
        <label className="ui-label">Provider and payment method<select className="ui-select w-full" value={row.id} onChange={e => { setRow(variants.find(s => s.id === e.target.value) ?? row); }}>{variants.map(s => <option key={s.id} value={s.id}>{optionLabel(s)}</option>)}</select></label>
        <QuoteCase key={row.id} row={row} mark={mark} />
      </section>
      <details className="ui-panel-shell p-5"><summary className="cursor-pointer">Test checklist · {filtered.length} combinations</summary>
        <ul className="mt-3 divide-y">{filtered.map(s => <li key={s.id}><button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left" onClick={() => { setRow(s); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <span>{label(s.from)} → {label(s.to)}<small className="block">{optionLabel(s)}</small></span>
          <span>{s.id in outcomes ? outcomes[s.id] ? 'Quoted' : 'Failed' : 'Untested'}</span>
        </button></li>)}</ul>
      </details>
    </div>
  </main>
}
