import { useCallback, useEffect, useState } from 'react'
import {
  asRecord,
  deframeRequest,
  readBoolean,
  readString,
  type RampApiResult,
} from './rampApi'

const LEGACY_SESSION_KEYS = ['deframe-ramp-kycUserId-brl', 'deframe-ramp-kycUserId-usd']

function readEnvId(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

const BRL_SESSION_ID = readEnvId(import.meta.env.VITE_APP_RAMP_KYC_USER_ID)
const USD_SESSION_ID = readEnvId(import.meta.env.VITE_APP_RAMP_KYC_USER_ID_USD)

function clearLegacySessionIds() {
  try {
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key)
  } catch {
    /* ignore private mode */
  }
}

clearLegacySessionIds()

export type KycLane = 'brl' | 'usd'

export interface RampAddressInput {
  country: string
  state: string
  city: string
  zipCode: string
  streetAddress: string
  number: string
  complement?: string
}

/** Avenia evidence stays image-only; the API rejects anything else on that path. */
export interface EvidenceImage {
  base64?: string
  url?: string
  mimeType?: 'image/jpeg' | 'image/png'
}

/** UnblockPay's document upload also takes PDF, which suits a utility-bill proof of address. */
export interface UnblockpayDocumentFile {
  base64?: string
  url?: string
  mimeType?: 'image/jpeg' | 'image/png' | 'application/pdf'
}

export interface AveniaSubmitInput {
  applicant: {
    fullName: string
    dateOfBirth: string
    phone: string
  }
  address: RampAddressInput
  documents: {
    documentType: 'RG' | 'CNH' | 'PASSPORT'
    front: EvidenceImage
    back?: EvidenceImage
    attestation: {
      provider: string
      extracted: {
        fullName: string
        birthDate: string
        cpf: string
        documentType?: string
      }
    }
  }
  liveness: {
    image: EvidenceImage
    attestation: {
      provider: string
      status: string
      confidence?: number
    }
  }
}

/**
 * Mirrors `unblockpaySubmitKycSchema` on the API: a flat PII body where identity is
 * always `taxId` + `taxIdCountry` (CPF digits under `BRA` for Pix). The API still
 * accepts a legacy `cpf` alias, but new integrations do not send it. Images belong
 * to the documents route.
 */
export interface UnblockPaySubmitInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string
  taxId: string
  taxIdCountry: string
  address: RampAddressInput
}

export type UnblockpayDocumentType =
  | 'NATIONAL_ID'
  | 'DRIVER_LICENSE'
  | 'PASSPORT'
  | 'PROOF_OF_ADDRESS'

export type UnblockpayDocumentSide = 'FRONT' | 'BACK'

export interface UnblockpayDocumentInput {
  documentType: UnblockpayDocumentType
  documentSide?: UnblockpayDocumentSide
  country?: string
  file: UnblockpayDocumentFile
}

export interface KycLaneState {
  kycUserId: string
  lastResult: RampApiResult | null
  statusBody: unknown
  snapshotBeforeUnblockpay: { status?: string; usdEnabled?: boolean } | null
  polling: boolean
  lastPolledAt: number | null
}

function emptyLane(sessionId: string): KycLaneState {
  return {
    kycUserId: sessionId,
    lastResult: null,
    statusBody: null,
    snapshotBeforeUnblockpay: null,
    polling: false,
    lastPolledAt: null,
  }
}

function nestUnblockpay(statusBody: unknown): Record<string, unknown> | null {
  const record = asRecord(statusBody)
  const ramps = asRecord(record?.ramps)
  return asRecord(ramps?.unblockpay)
}

/**
 * UnblockPay reports plain step names in most buckets but enriches the rejected ones
 * with `{ name, rejectionCodes, rejectionDescription }`. Reading every bucket through
 * the same tolerant shape keeps the reason visible wherever they choose to attach it.
 */
function readStepArray(value: unknown): UnblockpayStep[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (typeof entry === 'string') return [{ name: entry }]
    const record = asRecord(entry)
    const name = readString(record?.name)
    if (!name) return []
    const codes = Array.isArray(record?.rejectionCodes)
      ? record.rejectionCodes.filter((code): code is string => typeof code === 'string')
      : []
    return [{
      name,
      ...(codes.length > 0 ? { rejectionCodes: codes } : {}),
      ...(readString(record?.rejectionDescription)
        ? { rejectionDescription: readString(record?.rejectionDescription) }
        : {}),
    }]
  })
}

export function isOkResult(result: RampApiResult): boolean {
  return result.httpStatus >= 200 && result.httpStatus < 300
}

export function readTopLevelStatus(statusBody: unknown): string | undefined {
  return readString(asRecord(statusBody)?.status)
}

export function readUsdEnabled(statusBody: unknown): boolean | undefined {
  return readBoolean(asRecord(statusBody)?.usdEnabled)
}

export function readBrlaEnabled(statusBody: unknown): boolean | undefined {
  return readBoolean(asRecord(statusBody)?.brlaEnabled)
}

export function readUnblockpayVerificationLink(statusBody: unknown): string | undefined {
  return readString(nestUnblockpay(statusBody)?.verificationLink)
}

export function readUnblockpayNestStatus(statusBody: unknown): string | undefined {
  return readString(nestUnblockpay(statusBody)?.status)
}

export function readUnblockpayBrlCapability(statusBody: unknown): boolean | undefined {
  const nest = nestUnblockpay(statusBody)
  const caps = asRecord(nest?.capabilities)
  return readBoolean(caps?.BRL) ?? readBoolean(caps?.brl)
}

export function readUnblockpayUsdCapability(statusBody: unknown): boolean | undefined {
  const nest = nestUnblockpay(statusBody)
  const caps = asRecord(nest?.capabilities)
  return readBoolean(caps?.USD) ?? readBoolean(caps?.usd)
}

export interface UnblockpayStep {
  name: string
  rejectionCodes?: string[]
  rejectionDescription?: string
}

export interface UnblockpayVerification {
  type?: string
  pending: UnblockpayStep[]
  underReview: UnblockpayStep[]
  approved: UnblockpayStep[]
  partiallyRejected: UnblockpayStep[]
  rejected: UnblockpayStep[]
}

export function readUnblockpayVerification(statusBody: unknown): UnblockpayVerification | null {
  const verification = asRecord(nestUnblockpay(statusBody)?.verification)
  if (!verification) return null
  return {
    type: readString(verification.type),
    pending: readStepArray(verification.pending),
    underReview: readStepArray(verification.underReview),
    approved: readStepArray(verification.approved),
    partiallyRejected: readStepArray(verification.partiallyRejected),
    rejected: readStepArray(verification.rejected),
  }
}

/**
 * The API refuses uploads once the nest left the capture window, so the UI
 * mirrors those gates instead of letting the user discover them through a 409.
 */
export function unblockpayUploadBlockedReason(statusBody: unknown): string | null {
  const nest = readUnblockpayNestStatus(statusBody)
  if (!nest) return 'No UnblockPay nest yet — submit UnblockPay PII first, then poll status.'
  if (nest === 'under_review') return 'Nest is under_review — uploads return 409 UNBLOCKPAY_KYC_IN_PROGRESS.'
  if (nest === 'rejected') return 'Nest is rejected — uploads return 409 UNBLOCKPAY_KYC_REJECTED.'
  if (nest === 'approved') return 'Nest is approved — uploads are a no-op.'
  return null
}

/**
 * Error envelopes carry no `ramps` nest, so keeping the last good body avoids a
 * failed call making the UI claim the UnblockPay nest disappeared.
 */
function statusPatch(result: RampApiResult): Partial<KycLaneState> {
  return isOkResult(result) ? { statusBody: result.body } : {}
}

function missingKycUserIdResult(): RampApiResult {
  return {
    httpStatus: 0,
    body: { error: { code: 'KYC_USER_REQUIRED', message: 'Session is not configured' } },
    errorCode: 'KYC_USER_REQUIRED',
    errorMessage: 'Session is not configured',
  }
}

export function useRampKyc() {
  const [brl, setBrl] = useState<KycLaneState>(() => emptyLane(BRL_SESSION_ID))
  const [usd, setUsd] = useState<KycLaneState>(() => emptyLane(USD_SESSION_ID))

  const setLane = useCallback((lane: KycLane, patch: Partial<KycLaneState>) => {
    const setter = lane === 'brl' ? setBrl : setUsd
    setter((prev) => ({ ...prev, ...patch }))
  }, [])

  const createSession = useCallback(
    async (lane: KycLane, input: {
      cpf?: string
      taxId?: string
      taxIdCountry?: string
      email: string
      walletAddress: string
      externalUserId?: string
    }) => {
      const result = await deframeRequest('/api/v1/kyc/sessions', {
        method: 'POST',
        body: JSON.stringify({
          ...(input.cpf ? { cpf: input.cpf } : {}),
          ...(input.taxId ? { taxId: input.taxId } : {}),
          ...(input.taxIdCountry ? { taxIdCountry: input.taxIdCountry } : {}),
          email: input.email,
          walletAddress: input.walletAddress,
          ...(input.externalUserId ? { externalUserId: input.externalUserId } : {}),
        }),
      })
      const createdId = readString(asRecord(result.body)?.kycUserId)
      setLane(lane, {
        lastResult: result,
        kycUserId: createdId ?? (lane === 'brl' ? brl.kycUserId : usd.kycUserId),
        ...statusPatch(result),
      })
      return result
    },
    [brl.kycUserId, setLane, usd.kycUserId],
  )

  const submitAvenia = useCallback(
    async (input: AveniaSubmitInput) => {
      if (!brl.kycUserId.trim()) {
        const result = missingKycUserIdResult()
        setLane('brl', { lastResult: result })
        return result
      }
      const result = await deframeRequest(
        `/api/v1/kyc/sessions/${brl.kycUserId.trim()}/submit`,
        { method: 'POST', body: JSON.stringify(input) },
      )
      setLane('brl', { lastResult: result, ...statusPatch(result) })
      return result
    },
    [brl.kycUserId, setLane],
  )

  const submitUnblockpay = useCallback(
    async (lane: KycLane, input: UnblockPaySubmitInput) => {
      const current = lane === 'brl' ? brl : usd
      if (!current.kycUserId.trim()) {
        const result = missingKycUserIdResult()
        setLane(lane, { lastResult: result })
        return result
      }
      const snapshot = {
        status: readTopLevelStatus(current.statusBody),
        usdEnabled: readUsdEnabled(current.statusBody),
      }
      const body = {
        rampProvider: 'unblockpay',
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        taxId: input.taxId,
        taxIdCountry: input.taxIdCountry,
        address: input.address,
      }
      const result = await deframeRequest(
        `/api/v1/kyc/sessions/${current.kycUserId.trim()}/submit`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      setLane(lane, {
        lastResult: result,
        snapshotBeforeUnblockpay: snapshot,
        ...statusPatch(result),
      })
      return result
    },
    [brl, setLane, usd],
  )

  /** Path B: one file per request, exactly as the API schema demands. */
  const uploadUnblockpayDocument = useCallback(
    async (lane: KycLane, input: UnblockpayDocumentInput) => {
      const current = lane === 'brl' ? brl : usd
      if (!current.kycUserId.trim()) {
        const result = missingKycUserIdResult()
        setLane(lane, { lastResult: result })
        return result
      }
      const body = {
        rampProvider: 'unblockpay',
        documentType: input.documentType,
        ...(input.documentSide ? { documentSide: input.documentSide } : {}),
        ...(input.country ? { country: input.country } : {}),
        file: input.file,
      }
      const result = await deframeRequest(
        `/api/v1/kyc/sessions/${current.kycUserId.trim()}/documents`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      setLane(lane, { lastResult: result, ...statusPatch(result) })
      return result
    },
    [brl, setLane, usd],
  )

  /** Stops at the first non-2xx so a rejected FRONT does not hide behind a POA 200. */
  const uploadUnblockpayDocuments = useCallback(
    async (lane: KycLane, inputs: UnblockpayDocumentInput[]) => {
      const results: RampApiResult[] = []
      for (const input of inputs) {
        const result = await uploadUnblockpayDocument(lane, input)
        results.push(result)
        if (!isOkResult(result)) break
      }
      return results
    },
    [uploadUnblockpayDocument],
  )

  const pollStatus = useCallback(
    async (lane: KycLane) => {
      const current = lane === 'brl' ? brl : usd
      if (!current.kycUserId.trim()) return
      const result = await deframeRequest(
        `/api/v1/kyc/status?kycUserId=${encodeURIComponent(current.kycUserId.trim())}`,
      )
      setLane(lane, {
        lastResult: result,
        lastPolledAt: Date.now(),
        ...statusPatch(result),
      })
      return result
    },
    [brl, setLane, usd],
  )

  useEffect(() => {
    if (!brl.polling) return
    const id = window.setInterval(() => {
      void pollStatus('brl')
    }, 5000)
    return () => {
      window.clearInterval(id)
    }
  }, [brl.polling, pollStatus])

  useEffect(() => {
    if (!usd.polling) return
    const id = window.setInterval(() => {
      void pollStatus('usd')
    }, 5000)
    return () => {
      window.clearInterval(id)
    }
  }, [pollStatus, usd.polling])

  return {
    brl,
    usd,
    setLane,
    createSession,
    submitAvenia,
    submitUnblockpay,
    uploadUnblockpayDocument,
    uploadUnblockpayDocuments,
    pollStatus,
  }
}
