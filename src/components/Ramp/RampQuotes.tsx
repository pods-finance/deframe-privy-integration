import { useState } from 'react'
import { asRecord, readString } from './rampApi'
import { RampQuoteBuilder } from './RampQuoteBuilder'
import { RampQuoteMeta } from './RampQuoteMeta'
import {
  amountInDecimals,
  amountInSymbol,
  defaultHumanAmount,
  humanToRaw,
  RAMP_ROUTES,
  RAMP_SECTIONS,
  type RampPin,
  type RampRoute,
} from './rampRoutes'
import {
  DEFAULT_USD_BANK,
  useRampQuote,
  type RampQuoteResult,
  type UsdBankFields,
} from './useRampQuote'

interface Props {
  walletAddress?: string
  evmAddress?: string
  solanaAddress?: string
}

const PINS: RampPin[] = ['default', 'avenia', 'unblockpay']
const MARKUP_BPS_MAX = 5000

/** Empty stays unset. `0` is a real value and is sent. Out of range stays unset. */
function parseMarkupBps(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MARKUP_BPS_MAX) return undefined
  return parsed
}

function expectedForPin(route: RampRoute, pin: RampPin): string {
  if (pin === 'unblockpay') return route.unblockpayExpected
  return '200'
}

function matchesExpectation(route: RampRoute, pin: RampPin, result: RampQuoteResult): boolean {
  const expected = expectedForPin(route, pin)
  if (expected === '200') {
    return result.httpStatus === 200 && !result.errorCode
  }
  return result.errorCode === expected || String(result.httpStatus) === expected
}

const RampQuotes = ({ walletAddress, evmAddress, solanaAddress }: Props) => {
  const { results, loadingKey, executingKey, fetchQuote } = useRampQuote()
  const [pixKey, setPixKey] = useState('')
  const [markupBps, setMarkupBps] = useState('')
  const [originAddressOverride, setOriginAddressOverride] = useState('')
  const [destinationAddressOverride, setDestinationAddressOverride] = useState('')
  const [thirdParty, setThirdParty] = useState(false)
  const [usdBank, setUsdBank] = useState<UsdBankFields>(DEFAULT_USD_BANK)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [humanAmounts, setHumanAmounts] = useState<Partial<Record<string, string>>>(() =>
    Object.fromEntries(
      RAMP_ROUTES.map((row) => [row.id, defaultHumanAmount(row.tokenIn)]),
    ),
  )

  const quoteArgs = {
    originAddress: walletAddress,
    originAddressOverride,
    destinationAddressOverride,
    evmAddress,
    solanaAddress,
    pixKey,
    thirdParty,
    usdBank,
    markupBps: parseMarkupBps(markupBps),
  }

  const rawAmountFor = (route: RampRoute) => {
    const human = humanAmounts[route.id] ?? defaultHumanAmount(route.tokenIn)
    return humanToRaw(human, amountInDecimals(route.tokenIn))
  }

  const runPin = (route: RampRoute, pin: RampPin) => {
    const amountIn = rawAmountFor(route)
    if (amountIn == null) return
    void fetchQuote({ route, pin, amountIn, ...quoteArgs })
  }

  const runUnknown = () => {
    const route = RAMP_ROUTES.find((row) => row.id === 'a-onramp-brl-usdc-polygon')
    if (!route) return
    const amountIn = rawAmountFor(route)
    if (amountIn == null) return
    void fetchQuote({ route, pin: 'unknown', amountIn, ...quoteArgs })
  }

  const grouped = RAMP_SECTIONS.map((section) => ({
    section,
    title: RAMP_ROUTES.find((row) => row.section === section)?.sectionTitle ?? section,
    rows: RAMP_ROUTES.filter((row) => row.section === section),
  }))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="ui-heading-section">Quotes</h2>
        <p className="ui-text-secondary">
          Interactive builder for <code className="ui-code">GET /v2/swap/quote</code>. Onramp with
          empty <code className="ui-code">transactionData</code> shows Pix/wire instructions.
          Offramp / crypto-in with bytecode opens Privy to sign.
        </p>
      </div>

      <div className="ui-sub-panel flex flex-col gap-3">
        <p className="text-small font-semibold text-ink">Shared quote fields</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor="ramp-origin-address">
              Origin address
            </label>
            <input
              id="ramp-origin-address"
              value={originAddressOverride}
              onChange={(e) => {
                setOriginAddressOverride(e.target.value)
              }}
              placeholder="Privy wallet from context"
              className="ui-input ui-input-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor="ramp-destination-address">
              Destination address
            </label>
            <input
              id="ramp-destination-address"
              value={destinationAddressOverride}
              onChange={(e) => {
                setDestinationAddressOverride(e.target.value)
              }}
              placeholder="Privy wallet from context"
              className="ui-input ui-input-mono"
            />
          </div>
        </div>
        <p className="text-caption text-gray-500">
          Leave empty to send the wallet from context (Privy smart wallet on EVM, Solana wallet on
          SVM). A filled value is sent on the quote for that side only. Fiat offramp still omits{' '}
          <code className="ui-code">destinationAddress</code>. Signing stays on the context wallet.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor="ramp-markup-bps">
              markupBps
            </label>
            <input
              id="ramp-markup-bps"
              type="number"
              inputMode="numeric"
              min={0}
              max={MARKUP_BPS_MAX}
              step={1}
              value={markupBps}
              onChange={(e) => {
                const next = e.target.value
                if (next === '') {
                  setMarkupBps('')
                  return
                }
                if (!/^\d+$/.test(next)) return
                if (Number(next) > MARKUP_BPS_MAX) return
                setMarkupBps(next)
              }}
              className="ui-input"
            />
            <p className="text-caption text-gray-500">
              Integer from 0 to {MARKUP_BPS_MAX}. Leave empty to keep the stored default.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="ui-label" htmlFor="ramp-pix-key">
              PIX key (BRL offramp)
            </label>
            <input
              id="ramp-pix-key"
              value={pixKey}
              onChange={(e) => {
                setPixKey(e.target.value)
              }}
              placeholder="Pix key"
              className="ui-input"
            />
          </div>
          <label className="flex items-center gap-2 self-end text-small text-ink">
            <input
              type="checkbox"
              checked={thirdParty}
              onChange={(e) => {
                setThirdParty(e.target.checked)
              }}
            />
            Third party Pix
          </label>
        </div>
        <details>
          <summary className="cursor-pointer text-small text-gray-500">USD bank fields (offramp)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['bankAccountNumber', 'Account number'],
                ['bankRoutingNumber', 'Routing number'],
                ['bankBeneficiaryName', 'Beneficiary name'],
                ['bankName', 'Bank name'],
                ['beneficiaryStreetLine1', 'Street'],
                ['beneficiaryCity', 'City'],
                ['beneficiaryState', 'State'],
                ['beneficiaryPostalCode', 'Postal code'],
                ['beneficiaryCountry', 'Country'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="ui-label" htmlFor={`ramp-${key}`}>
                  {label}
                </label>
                <input
                  id={`ramp-${key}`}
                  value={usdBank[key]}
                  onChange={(e) => {
                    setUsdBank((prev) => ({ ...prev, [key]: e.target.value }))
                  }}
                  className="ui-input"
                />
              </div>
            ))}
          </div>
        </details>
      </div>

      <RampQuoteBuilder
        pixKey={pixKey}
        results={results}
        loadingKey={loadingKey}
        executingKey={executingKey}
        onQuote={({ route, pin, amountIn }) => {
          void fetchQuote({ route, pin, amountIn, ...quoteArgs })
        }}
      />

      <details className="flex flex-col gap-3">
        <summary className="cursor-pointer text-small font-semibold text-ink">
          Advanced · all catalog routes
        </summary>
        <p className="text-caption text-gray-500">
          Static matrix for regression. Humanized amounts; pin buttons still probe
          default / avenia / unblockpay per row.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ui-btn-secondary ui-btn-sm" onClick={runUnknown}>
            Probe unknown pin
          </button>
          <span className="text-caption text-gray-500">
            Pix→USDC polygon with <code className="ui-code">rampProvider=not-a-real-provider</code>{' '}
            → <code className="ui-code">INVALID_RAMP_PROVIDER</code>
          </span>
        </div>
        {results['a-onramp-brl-usdc-polygon:unknown'] ? (
          <RampQuoteMeta result={results['a-onramp-brl-usdc-polygon:unknown']} />
        ) : null}

        {grouped.map(({ section, title, rows }) => (
          <section key={section} className="flex flex-col gap-3">
            <h3 className="text-small font-semibold text-ink">{title}</h3>
            {section === 'A' ? (
              <p className="text-caption text-gray-500">
                Default / avenia stay inventory Avenia. UnblockPay is 200 on polygon/base (direct
                Pix) and <code className="ui-code">RAMP_PROVIDER_NOT_ELIGIBLE</code> on other
                chains.
              </p>
            ) : null}
            {section === 'B' ? (
              <p className="text-caption text-gray-500">
                UnblockPay + WIRE + polygon/base → 200. ACH or ethereum →{' '}
                <code className="ui-code">RAMP_PROVIDER_NOT_ELIGIBLE</code>.
              </p>
            ) : null}
            {rows.map((route) => (
              <QuoteRow
                key={route.id}
                route={route}
                humanAmount={humanAmounts[route.id] ?? defaultHumanAmount(route.tokenIn)}
                onAmountChange={(value) => {
                  setHumanAmounts((prev) => ({ ...prev, [route.id]: value }))
                }}
                results={results}
                loadingKey={loadingKey}
                executingKey={executingKey}
                expanded={expanded}
                onExpand={setExpanded}
                onPin={runPin}
              />
            ))}
          </section>
        ))}
      </details>
    </div>
  )
}

function QuoteRow({
  route,
  humanAmount,
  onAmountChange,
  results,
  loadingKey,
  executingKey,
  expanded,
  onExpand,
  onPin,
}: {
  route: RampRoute
  humanAmount: string
  onAmountChange: (value: string) => void
  results: Partial<Record<string, RampQuoteResult>>
  loadingKey: string | null
  executingKey: string | null
  expanded: string | null
  onExpand: (key: string | null) => void
  onPin: (route: RampRoute, pin: RampPin) => void
}) {
  const decimals = amountInDecimals(route.tokenIn)
  const symbol = amountInSymbol(route.tokenIn)
  const amountInputId = `ramp-amount-${route.id}`
  const busy = loadingKey !== null || executingKey !== null
  const rawAmount = humanToRaw(humanAmount, decimals)

  let last: RampQuoteResult | undefined
  for (const pin of [...PINS].reverse()) {
    const item = results[`${route.id}:${pin}`]
    if (item) {
      last = item
      break
    }
  }

  return (
    <div className="ui-sub-panel flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-small font-medium text-ink">{route.label}</p>
          <p className="text-caption text-gray-500">
            {route.originChain} → {route.destinationChain}
            {route.usdPaymentMethod ? ` · ${route.usdPaymentMethod}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PINS.map((pin) => {
            const key = `${route.id}:${pin}`
            const result = results[key]
            const quoting = loadingKey === key
            const signing = executingKey === key
            const expected = expectedForPin(route, pin)
            return (
              <button
                key={pin}
                type="button"
                disabled={busy || rawAmount == null}
                onClick={() => {
                  onPin(route, pin)
                }}
                className="ui-btn-secondary ui-btn-sm"
              >
                {quoting ? 'quote…' : signing ? 'sign…' : pin}
                {result ? (
                  <span className="ml-1 text-caption">
                    {result.httpStatus}
                    {matchesExpectation(route, pin, result) ? ' ✓' : ` ≠${expected}`}
                    {result.txHash ? ' · tx' : ''}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <label className="ui-label" htmlFor={amountInputId}>
          Amount ({symbol})
        </label>
        <input
          id={amountInputId}
          inputMode="decimal"
          value={humanAmount}
          onChange={(e) => {
            onAmountChange(e.target.value)
          }}
          placeholder={defaultHumanAmount(route.tokenIn)}
          className="ui-input ui-input-mono"
        />
        <p className="text-caption text-gray-500">
          {rawAmount != null
            ? `Raw: ${rawAmount} (${decimals} dp)`
            : 'Enter a valid decimal amount'}
        </p>
      </div>
      {last ? <RampQuoteMeta result={last} /> : null}
      {PINS.map((pin) => {
        const key = `${route.id}:${pin}`
        const result = results[key]
        if (!result) return null
        return (
          <div key={key}>
            <button
              type="button"
              className="ui-btn-ghost ui-btn-sm px-0"
              onClick={() => {
                onExpand(expanded === key ? null : key)
              }}
            >
              {expanded === key ? 'Hide' : 'Show'} {pin} JSON
            </button>
            {expanded === key ? (
              <pre className="mt-2 max-h-72 overflow-auto font-mono text-caption text-gray-500">
                {JSON.stringify(
                  {
                    httpStatus: result.httpStatus,
                    provider: result.provider ?? readString(asRecord(result.body)?.provider),
                    rampProvider: result.rampProvider,
                    error: result.errorCode
                      ? { code: result.errorCode, message: result.errorMessage }
                      : undefined,
                    body: result.body,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default RampQuotes
