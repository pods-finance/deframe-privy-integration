import { useState } from 'react';
import {
  readBrlaEnabled,
  readTopLevelStatus,
  readUnblockpayBrlCapability,
  readUnblockpayNestStatus,
  readUnblockpayUsdCapability,
  readUnblockpayVerification,
  readUnblockpayVerificationLink,
  readUsdEnabled,
  unblockpayUploadBlockedReason,
  useRampKyc,
  type AveniaSubmitInput,
  type EvidenceImage,
  type KycLane,
  type KycLaneState,
  type UnblockPaySubmitInput,
  type UnblockpayDocumentFile,
  type UnblockpayDocumentInput,
  type UnblockpayDocumentType,
  type UnblockpayStep,
} from './useRampKyc';
import type { RampApiResult } from './rampApi';

interface Props {
  walletAddress?: string;
}

type CaptureType = 'RG' | 'CNH' | 'PASSPORT';

/** Capture vocabulary → UnblockPay `documentType`. */
const CAPTURE_TO_DOCUMENT_TYPE: Record<CaptureType, UnblockpayDocumentType> = {
  RG: 'NATIONAL_ID',
  CNH: 'DRIVER_LICENSE',
  PASSPORT: 'PASSPORT',
};

async function readBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
  return dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
}

async function fileToImage(file: File): Promise<EvidenceImage> {
  return {
    base64: await readBase64(file),
    mimeType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
  };
}

/** The server sniffs magic bytes anyway, but declaring the real type keeps the filename right. */
async function fileToDocument(file: File): Promise<UnblockpayDocumentFile> {
  const mimeType =
    file.type === 'application/pdf'
      ? 'application/pdf'
      : file.type === 'image/png'
        ? 'image/png'
        : 'image/jpeg';
  return { base64: await readBase64(file), mimeType };
}

function hasImage(image: EvidenceImage | UnblockpayDocumentFile): boolean {
  return Boolean(image.base64 ?? image.url);
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="ui-input"
      />
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div className="ui-sub-panel overflow-x-auto">
      <p className="mb-2 text-small font-semibold text-ink">{title}</p>
      <pre className="max-h-80 overflow-auto font-mono text-caption text-gray-500">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StepList({ label, steps }: { label: string; steps: UnblockpayStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div>
      <p>
        <span className="text-ink">{label}</span>:{' '}
        {steps.map((step) => step.name).join(', ')}
      </p>
      {steps
        .filter((step) => step.rejectionDescription ?? step.rejectionCodes)
        .map((step) => (
          <p key={step.name} className="ui-text-error text-caption">
            {step.name}
            {step.rejectionCodes ? ` (${step.rejectionCodes.join(', ')})` : ''}
            {step.rejectionDescription ? ` — ${step.rejectionDescription}` : ''}
          </p>
        ))}
    </div>
  );
}

function StatusSummary({ body, lane }: { body: unknown; lane: KycLane }) {
  const status = readTopLevelStatus(body);
  const brla = readBrlaEnabled(body);
  const usd = readUsdEnabled(body);
  const nest = readUnblockpayNestStatus(body);
  const capability = lane === 'brl' ? readUnblockpayBrlCapability(body) : readUnblockpayUsdCapability(body);
  const link = readUnblockpayVerificationLink(body);
  const verification = readUnblockpayVerification(body);
  if (body == null) return null;
  return (
    <div className="flex flex-col gap-1 text-small text-gray-500">
      <p>
        Top-level <span className="text-ink">status</span>: {status ?? '—'} ·{' '}
        <span className="text-ink">brlaEnabled</span>: {String(brla ?? '—')} ·{' '}
        <span className="text-ink">usdEnabled</span>: {String(usd ?? '—')}
      </p>
      <p>
        UnblockPay nest: {nest ?? '—'} · {lane === 'brl' ? 'BRL' : 'USD'} capability:{' '}
        {String(capability ?? '—')}
        {verification?.type ? ` · verification type: ${verification.type}` : ''}
      </p>
      {verification ? (
        <>
          <StepList label="pending" steps={verification.pending} />
          <StepList label="underReview" steps={verification.underReview} />
          <StepList label="approved" steps={verification.approved} />
          <StepList label="partiallyRejected" steps={verification.partiallyRejected} />
          <StepList label="rejected" steps={verification.rejected} />
        </>
      ) : null}
      {link ? (
        <p>
          Path A · Sumsub:{' '}
          <a href={link} target="_blank" rel="noreferrer" className="text-ink underline">
            {link}
          </a>
        </p>
      ) : null}
    </div>
  );
}

const RampKyc = ({ walletAddress }: Props) => {
  const {
    brl,
    usd,
    setLane,
    createSession,
    submitAvenia,
    submitUnblockpay,
    uploadUnblockpayDocuments,
    pollStatus,
  } = useRampKyc();

  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [brlTaxIdCountry, setBrlTaxIdCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [documentType, setDocumentType] = useState<CaptureType>('RG');
  const [front, setFront] = useState<EvidenceImage>({});
  const [back, setBack] = useState<EvidenceImage>({});
  const [liveness, setLiveness] = useState<EvidenceImage>({});

  const [usdEmail, setUsdEmail] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxIdCountry, setTaxIdCountry] = useState('');
  const [usdFirstName, setUsdFirstName] = useState('');
  const [usdLastName, setUsdLastName] = useState('');
  const [usdDob, setUsdDob] = useState('');
  const [usdPhone, setUsdPhone] = useState('');
  const [usdCountry, setUsdCountry] = useState('');
  const [usdState, setUsdState] = useState('');
  const [usdCity, setUsdCity] = useState('');
  const [usdZip, setUsdZip] = useState('');
  const [usdStreet, setUsdStreet] = useState('');
  const [usdNumber, setUsdNumber] = useState('');

  const fullName = `${firstName} ${lastName}`.trim();

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const aveniaBody = (): AveniaSubmitInput => ({
    applicant: { fullName, dateOfBirth, phone },
    address: { country, state, city, zipCode, streetAddress, number, complement },
    documents: {
      documentType,
      front,
      ...(hasImage(back) ? { back } : {}),
      attestation: {
        provider: 'bigdatacorp_documentoscopy',
        extracted: {
          fullName,
          birthDate: dateOfBirth,
          cpf,
          documentType,
        },
      },
    },
    liveness: {
      image: liveness,
      attestation: {
        provider: 'aws_rekognition_face_liveness',
        status: 'SUCCEEDED',
        confidence: 95.78,
      },
    },
  });

  const brlUnblockpayBody = (): UnblockPaySubmitInput => ({
    firstName,
    lastName,
    email,
    phone,
    dateOfBirth,
    taxId: cpf,
    taxIdCountry: brlTaxIdCountry,
    address: {
      country,
      state,
      city,
      zipCode,
      streetAddress,
      number,
      complement,
    },
  });

  const usdUnblockpayBody = (): UnblockPaySubmitInput => ({
    firstName: usdFirstName,
    lastName: usdLastName,
    email: usdEmail,
    phone: usdPhone,
    dateOfBirth: usdDob,
    taxId,
    taxIdCountry,
    address: {
      country: usdCountry,
      state: usdState,
      city: usdCity,
      zipCode: usdZip,
      streetAddress: usdStreet,
      number: usdNumber,
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="ui-heading-section">Verification</h2>
        <p className="ui-text-secondary">
          Poll the BRL session, then submit UnblockPay on that same session. USD uses a separate
          session. Do not mix Pix and wire.
        </p>
      </div>

      <div className="ui-sub-panel flex flex-col gap-4">
        <h3 className="text-small font-semibold text-ink">1 · BRL session</h3>
        {brl.kycUserId.trim() ? null : (
          <p className="text-caption text-gray-500">
            BRL session is not configured. Set <code className="ui-code">VITE_APP_RAMP_KYC_USER_ID</code>.
          </p>
        )}
        <PollControls lane="brl" state={brl} busy={busy} setLane={setLane} pollStatus={pollStatus} run={run} />
        <StatusSummary body={brl.statusBody} lane="brl" />
      </div>

      <details className="ui-sub-panel">
        <summary className="cursor-pointer text-small font-semibold text-ink">
          1A · Avenia (optional)
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="kyc-email" label="Email" value={email} onChange={setEmail} />
            <Field id="kyc-cpf" label="CPF" value={cpf} onChange={setCpf} />
            <Field id="kyc-first-name" label="First name" value={firstName} onChange={setFirstName} />
            <Field id="kyc-last-name" label="Last name" value={lastName} onChange={setLastName} />
            <Field id="kyc-dob" label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} type="date" />
            <Field id="kyc-phone" label="Phone" value={phone} onChange={setPhone} />
            <Field id="kyc-street" label="Street" value={streetAddress} onChange={setStreetAddress} />
            <Field id="kyc-number" label="Number" value={number} onChange={setNumber} />
            <Field id="kyc-city" label="City" value={city} onChange={setCity} />
            <Field id="kyc-state" label="State" value={state} onChange={setState} />
            <Field id="kyc-zip" label="ZIP" value={zipCode} onChange={setZipCode} />
            <Field id="kyc-country" label="Country (alpha-3)" value={country} onChange={setCountry} />
            <Field id="kyc-complement" label="Complement" value={complement} onChange={setComplement} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor="kyc-doc-type">
              Document type
            </label>
            <select
              id="kyc-doc-type"
              value={documentType}
              onChange={(e) => {
                setDocumentType(e.target.value as CaptureType);
              }}
              className="ui-select"
            >
              <option value="RG">RG</option>
              <option value="CNH">CNH</option>
              <option value="PASSPORT">PASSPORT</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ImageField id="kyc-front" label="Document front" onPick={setFront} />
            <ImageField id="kyc-back" label="Document back" onPick={setBack} />
            <ImageField id="kyc-liveness" label="Liveness selfie" onPick={setLiveness} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="ui-btn-primary ui-btn-sm"
              disabled={busy !== null || !walletAddress}
              onClick={() => {
                void run('create-brl', () =>
                  createSession('brl', { cpf, email, walletAddress: walletAddress ?? '' }),
                );
              }}
            >
              {busy === 'create-brl' ? 'Creating…' : 'Create session'}
            </button>
            <button
              type="button"
              className="ui-btn-secondary ui-btn-sm"
              disabled={busy !== null}
              onClick={() => {
                void run('avenia', () => submitAvenia(aveniaBody()));
              }}
            >
              {busy === 'avenia' ? 'Submitting…' : 'Submit Avenia'}
            </button>
          </div>
          {!walletAddress ? (
            <p className="ui-text-error">Select a wallet before creating a session.</p>
          ) : null}
        </div>
      </details>

      <div className="ui-sub-panel flex flex-col gap-4">
        <h3 className="text-small font-semibold text-ink">1B · UnblockPay</h3>
        <p className="text-caption text-gray-500">
          Name, contact, tax id, and address. Documents are uploaded in the next step.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="kyc-brl-tax-id" label="CPF" value={cpf} onChange={setCpf} />
          <Field
            id="kyc-brl-tax-country"
            label="Tax country"
            value={brlTaxIdCountry}
            onChange={setBrlTaxIdCountry}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-btn-primary ui-btn-sm"
            disabled={busy !== null}
            onClick={() => {
              void run('unblock-brl', () => submitUnblockpay('brl', brlUnblockpayBody()));
            }}
          >
            {busy === 'unblock-brl' ? 'Submitting…' : 'Submit UnblockPay'}
          </button>
        </div>
        {brl.snapshotBeforeUnblockpay ? (
          <p className="text-caption text-gray-500">
            Snapshot before 1B: status={brl.snapshotBeforeUnblockpay.status ?? '—'} usdEnabled=
            {String(brl.snapshotBeforeUnblockpay.usdEnabled ?? '—')}. After 1B top-level should
            stay Avenia and usdEnabled unchanged.
          </p>
        ) : null}
      </div>

      <DocumentsForm
        lane="brl"
        defaultCountry={country}
        statusBody={brl.statusBody}
        busy={busy}
        run={run}
        uploadDocuments={uploadUnblockpayDocuments}
      />

      <JsonBlock title="BRL last HTTP / status JSON" value={brl.lastResult} />

      <div className="ui-sub-panel flex flex-col gap-4">
        <h3 className="text-small font-semibold text-ink">USD</h3>
        <p className="text-caption text-gray-500">Separate session from BRL. Do not reuse the Pix profile for wire.</p>
        {usd.kycUserId.trim() ? null : (
          <p className="text-caption text-gray-500">
            USD session is not configured. Set <code className="ui-code">VITE_APP_RAMP_KYC_USER_ID_USD</code>,
            or create a session below.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="kyc-usd-email" label="Email" value={usdEmail} onChange={setUsdEmail} />
          <Field id="kyc-tax-id" label="Tax id" value={taxId} onChange={setTaxId} />
          <Field
            id="kyc-tax-country"
            label="Tax country"
            value={taxIdCountry}
            onChange={setTaxIdCountry}
          />
          <Field id="kyc-usd-first-name" label="First name" value={usdFirstName} onChange={setUsdFirstName} />
          <Field id="kyc-usd-last-name" label="Last name" value={usdLastName} onChange={setUsdLastName} />
          <Field id="kyc-usd-dob" label="Date of birth" value={usdDob} onChange={setUsdDob} type="date" />
          <Field id="kyc-usd-phone" label="Phone" value={usdPhone} onChange={setUsdPhone} />
          <Field id="kyc-usd-street" label="Street" value={usdStreet} onChange={setUsdStreet} />
          <Field id="kyc-usd-number" label="Number" value={usdNumber} onChange={setUsdNumber} />
          <Field id="kyc-usd-city" label="City" value={usdCity} onChange={setUsdCity} />
          <Field id="kyc-usd-state" label="State" value={usdState} onChange={setUsdState} />
          <Field id="kyc-usd-zip" label="ZIP" value={usdZip} onChange={setUsdZip} />
          <Field id="kyc-usd-country" label="Country" value={usdCountry} onChange={setUsdCountry} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-btn-primary ui-btn-sm"
            disabled={busy !== null || !walletAddress}
            onClick={() => {
              void run('create-usd', () =>
                createSession('usd', {
                  taxId,
                  taxIdCountry,
                  email: usdEmail,
                  walletAddress: walletAddress ?? '',
                }),
              );
            }}
          >
            {busy === 'create-usd' ? 'Creating…' : 'Create USD session'}
          </button>
          <button
            type="button"
            className="ui-btn-secondary ui-btn-sm"
            disabled={busy !== null}
            onClick={() => {
              void run('unblock-usd', () => submitUnblockpay('usd', usdUnblockpayBody()));
            }}
          >
            {busy === 'unblock-usd' ? 'Submitting…' : 'Submit UnblockPay USD'}
          </button>
        </div>
        <PollControls lane="usd" state={usd} busy={busy} setLane={setLane} pollStatus={pollStatus} run={run} />
        <StatusSummary body={usd.statusBody} lane="usd" />
      </div>

      <DocumentsForm
        lane="usd"
        defaultCountry={usdCountry}
        statusBody={usd.statusBody}
        busy={busy}
        run={run}
        uploadDocuments={uploadUnblockpayDocuments}
      />

      <JsonBlock title="USD last HTTP / status JSON" value={usd.lastResult} />
    </div>
  );
};

function ImageField({
  id,
  label,
  onPick,
}: {
  id: string;
  label: string;
  onPick: (image: EvidenceImage) => void;
}) {
  return (
    <FilePicker id={id} label={label} accept="image/jpeg,image/png">
      {(file) => {
        void fileToImage(file).then(onPick);
      }}
    </FilePicker>
  );
}

function DocumentField({
  id,
  label,
  onPick,
}: {
  id: string;
  label: string;
  onPick: (file: UnblockpayDocumentFile) => void;
}) {
  return (
    <FilePicker id={id} label={label} accept="image/jpeg,image/png,application/pdf">
      {(file) => {
        void fileToDocument(file).then(onPick);
      }}
    </FilePicker>
  );
}

function FilePicker({
  id,
  label,
  accept,
  children,
}: {
  id: string;
  label: string;
  accept: string;
  children: (file: File) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="ui-input text-caption"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          children(file);
        }}
      />
    </div>
  );
}

/**
 * Path B: FRONT + BACK of an identity document plus a proof of address, one POST
 * each. v1 asks for no selfie, so it is deliberately absent from this form.
 */
function DocumentsForm({
  lane,
  defaultCountry,
  statusBody,
  busy,
  run,
  uploadDocuments,
}: {
  lane: KycLane;
  defaultCountry: string;
  statusBody: unknown;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  uploadDocuments: (lane: KycLane, inputs: UnblockpayDocumentInput[]) => Promise<RampApiResult[]>;
}) {
  const [capture, setCapture] = useState<CaptureType>('RG');
  const [front, setFront] = useState<UnblockpayDocumentFile>({});
  const [back, setBack] = useState<UnblockpayDocumentFile>({});
  const [proofOfAddress, setProofOfAddress] = useState<UnblockpayDocumentFile>({});
  const [uploads, setUploads] = useState<{ label: string; httpStatus: number; code?: string }[]>([]);

  const blockedReason = unblockpayUploadBlockedReason(statusBody);
  const documentType = CAPTURE_TO_DOCUMENT_TYPE[capture];
  const busyKey = `docs-${lane}`;

  // UnblockPay treats a passport as one document and asks for a side only on
  // NATIONAL_ID and DRIVER_LICENSE, so the passport capture is a single file.
  const singlePage = capture === 'PASSPORT';

  const queued: { label: string; input: UnblockpayDocumentInput }[] = [];
  if (hasImage(front)) {
    queued.push({
      label: singlePage ? documentType : `${documentType} FRONT`,
      input: {
        documentType,
        ...(singlePage ? {} : { documentSide: 'FRONT' as const }),
        country: defaultCountry,
        file: front,
      },
    });
  }
  if (!singlePage && hasImage(back)) {
    queued.push({
      label: `${documentType} BACK`,
      input: { documentType, documentSide: 'BACK', country: defaultCountry, file: back },
    });
  }
  if (hasImage(proofOfAddress)) {
    queued.push({
      label: 'PROOF_OF_ADDRESS',
      input: { documentType: 'PROOF_OF_ADDRESS', country: defaultCountry, file: proofOfAddress },
    });
  }

  return (
    <div className="ui-sub-panel flex flex-col gap-4">
      <h3 className="text-small font-semibold text-ink">
        {lane === 'brl' ? '1C' : 'USD'} · Documents
      </h3>
      <p className="text-caption text-gray-500">
        Identity (front and back, or one page for a passport) and a proof of address. JPEG, PNG, or PDF.
      </p>
      <div className="flex flex-col gap-1">
        <label className="ui-label" htmlFor={`docs-${lane}-capture`}>
          Identity document ({capture} → {documentType})
        </label>
        <select
          id={`docs-${lane}-capture`}
          value={capture}
          onChange={(e) => {
            setCapture(e.target.value as CaptureType);
          }}
          className="ui-select"
        >
          <option value="RG">RG → NATIONAL_ID</option>
          <option value="CNH">CNH → DRIVER_LICENSE</option>
          <option value="PASSPORT">PASSPORT → PASSPORT</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <DocumentField
          id={`docs-${lane}-front`}
          label={singlePage ? 'Passport page' : 'Identity front'}
          onPick={setFront}
        />
        {singlePage ? null : (
          <DocumentField id={`docs-${lane}-back`} label="Identity back" onPick={setBack} />
        )}
        <DocumentField
          id={`docs-${lane}-poa`}
          label="Proof of address (JPEG, PNG or PDF)"
          onPick={setProofOfAddress}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="ui-btn-primary ui-btn-sm"
          disabled={busy !== null || blockedReason !== null || queued.length === 0}
          onClick={() => {
            void run(busyKey, async () => {
              setUploads([]);
              const results = await uploadDocuments(lane, queued.map((entry) => entry.input));
              setUploads(
                results.map((result, index) => ({
                  label: queued[index].label,
                  httpStatus: result.httpStatus,
                  code: result.errorCode,
                })),
              );
            });
          }}
        >
          {busy === busyKey ? 'Uploading…' : `Send documents (${String(queued.length)})`}
        </button>
        <span className="text-caption text-gray-500">
          Sequential POSTs, stopping at the first error.
        </span>
      </div>
      {blockedReason ? <p className="ui-text-error text-caption">{blockedReason}</p> : null}
      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-1 text-caption text-gray-500">
          {uploads.map((upload) => (
            <li key={upload.label}>
              {upload.label}: HTTP {upload.httpStatus}
              {upload.code ? ` · ${upload.code}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PollControls({
  lane,
  state,
  busy,
  setLane,
  pollStatus,
  run,
}: {
  lane: KycLane;
  state: KycLaneState;
  busy: string | null;
  setLane: (lane: KycLane, patch: Partial<KycLaneState>) => void;
  pollStatus: (lane: KycLane) => Promise<unknown>;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="ui-btn-secondary ui-btn-sm"
        disabled={busy !== null}
        onClick={() => {
          void run(`poll-${lane}`, () => pollStatus(lane));
        }}
      >
        {busy === `poll-${lane}` ? 'Polling…' : 'Poll status once'}
      </button>
      <label className="flex items-center gap-2 text-small text-ink" htmlFor={`auto-poll-${lane}`}>
        <input
          id={`auto-poll-${lane}`}
          type="checkbox"
          role="switch"
          checked={state.polling}
          onChange={(e) => {
            setLane(lane, { polling: e.target.checked });
          }}
        />
        Auto-poll every 5s {state.polling ? '(on)' : '(off)'}
      </label>
      <span className="text-caption text-gray-500">
        Last poll:{' '}
        {state.lastPolledAt === null ? '—' : new Date(state.lastPolledAt).toLocaleTimeString()}
      </span>
    </div>
  );
}

export default RampKyc;
