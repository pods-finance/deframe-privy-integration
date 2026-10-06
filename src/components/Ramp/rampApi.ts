const API_BASE = import.meta.env.VITE_APP_DEFRAME_API_URL || 'http://localhost:4001'
const API_KEY = import.meta.env.VITE_APP_DEFRAME_API_KEY || ''

export interface RampApiError {
  code?: string
  message?: string
}

export interface RampApiResult<T = unknown> {
  httpStatus: number
  body: T
  errorCode?: string
  errorMessage?: string
}

export function deframeApiHeaders(jsonBody = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (API_KEY) headers['x-api-key'] = API_KEY
  if (jsonBody) headers['Content-Type'] = 'application/json'
  return headers
}

export function deframeApiUrl(path: string): URL {
  return new URL(path, API_BASE)
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry
  }
  return record
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function extractApiError(body: unknown): RampApiError {
  const error = asRecord(asRecord(body)?.error)
  if (!error) return {}
  return {
    code: readString(error.code),
    message: readString(error.message),
  }
}

export async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { error: { code: 'NON_JSON', message: text } }
  }
}

export async function deframeRequest(
  path: string,
  init: RequestInit = {},
): Promise<RampApiResult> {
  const jsonBody = init.method !== undefined && init.method !== 'GET'
  const res = await fetch(deframeApiUrl(path), {
    method: init.method,
    body: init.body,
    headers: deframeApiHeaders(jsonBody),
  })
  const body = await parseResponseBody(res)
  const { code, message } = extractApiError(body)
  return {
    httpStatus: res.status,
    body,
    errorCode: code,
    errorMessage: message,
  }
}
