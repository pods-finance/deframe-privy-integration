import QRCode from 'react-qr-code'
import { asRecord, readString } from './rampApi'
import type { RampQuoteResult } from './useRampQuote'

function instructionsPreview(body: unknown): string | undefined {
  const record = asRecord(body)
  const instructions = record?.paymentInstructions
  if (instructions == null) return undefined
  return JSON.stringify(instructions)
}

function pixCopyPaste(body: unknown): string | undefined {
  const instructions = asRecord(asRecord(body)?.paymentInstructions)
  const pix = asRecord(instructions?.pix)
  const value = readString(pix?.copyPaste)?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}

export function RampQuoteMeta({ result }: { result: RampQuoteResult }) {
  const error = result.errorCode
    ? `{ error: { code: ${result.errorCode}, message: ${result.errorMessage ?? ''} } }`
    : null
  const copyPaste = pixCopyPaste(result.body)
  const instructions = instructionsPreview(result.body)
  return (
    <div className="flex flex-col gap-2 text-caption text-gray-500">
      <p>
        HTTP {result.httpStatus || '—'} · provider={result.provider ?? '—'} · rampProvider=
        {result.rampProvider ?? '—'}
      </p>
      {error ? <p className="ui-text-error">{error}</p> : null}
      {result.executeError ? (
        <p className="ui-text-error">Execute: {result.executeError}</p>
      ) : null}
      {result.txHash ? <p className="ui-text-success">Tx: {result.txHash}</p> : null}
      {result.executed && !result.txHash ? (
        <p className="ui-text-success">Submitted via Privy</p>
      ) : null}
      {copyPaste ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
          <div className="w-fit rounded-lg bg-white p-3">
            <QRCode value={copyPaste} size={160} level="M" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-small font-medium text-ink">Pix QR / copy-paste</p>
            <p className="break-all font-mono text-caption">{copyPaste}</p>
          </div>
        </div>
      ) : null}
      {instructions && !copyPaste ? (
        <p className="break-all">instructions: {instructions}</p>
      ) : null}
      {instructions && copyPaste ? (
        <details>
          <summary className="cursor-pointer text-gray-500">Full paymentInstructions JSON</summary>
          <p className="mt-1 break-all">{instructions}</p>
        </details>
      ) : null}
    </div>
  )
}
