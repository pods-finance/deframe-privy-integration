import { useMemo, useState } from 'react'
import { asRecord, readString } from './rampApi'
import { RampQuoteMeta } from './RampQuoteMeta'
import {
  amountInDecimals,
  defaultHumanAmount,
  eligibleRampPins,
  findInverseRoute,
  findMatchingRoutes,
  humanToRaw,
  isBrlOfframp,
  RAMP_PAY_ENDPOINTS,
  receiveOptionsForPay,
  type RampEndpoint,
  type RampPin,
  type RampRoute,
  usdMethodsForPair,
} from './rampRoutes'
import type { RampQuoteResult } from './useRampQuote'

interface Props {
  pixKey: string
  results: Partial<Record<string, RampQuoteResult>>
  loadingKey: string | null
  executingKey: string | null
  onQuote: (params: {
    route: RampRoute
    pin: RampPin
    amountIn: string
  }) => void
}

function endpointByKey(key: string, list: RampEndpoint[]): RampEndpoint | undefined {
  return list.find((item) => item.key === key)
}

function catalogPayFor(route: RampRoute): RampEndpoint | undefined {
  return RAMP_PAY_ENDPOINTS.find(
    (item) => item.chain === route.originChain && item.token === route.tokenIn,
  )
}

const DEFAULT_PAY =
  RAMP_PAY_ENDPOINTS.find((item) => item.key === 'fiat:BRL') ?? RAMP_PAY_ENDPOINTS[0]

export function RampQuoteBuilder({
  pixKey,
  results,
  loadingKey,
  executingKey,
  onQuote,
}: Props) {
  const [payKey, setPayKey] = useState(DEFAULT_PAY?.key ?? '')
  const pay = endpointByKey(payKey, RAMP_PAY_ENDPOINTS) ?? DEFAULT_PAY

  const receiveChoices = useMemo(
    () => (pay ? receiveOptionsForPay(pay) : []),
    [pay],
  )

  const [receiveKey, setReceiveKey] = useState(
    () => receiveOptionsForPay(DEFAULT_PAY ?? RAMP_PAY_ENDPOINTS[0])[0]?.key ?? '',
  )
  const receive =
    endpointByKey(receiveKey, receiveChoices) ?? receiveChoices[0]

  const usdMethods = useMemo(() => {
    if (!pay || !receive) return [] as Array<'WIRE' | 'ACH'>
    return usdMethodsForPair({
      originChain: pay.chain,
      tokenIn: pay.token,
      destinationChain: receive.chain,
      tokenOut: receive.token,
    })
  }, [pay, receive])

  const [usdMethod, setUsdMethod] = useState<'WIRE' | 'ACH'>('WIRE')
  const activeUsdMethod = usdMethods.includes(usdMethod)
    ? usdMethod
    : (usdMethods[0] ?? undefined)

  const matchedRoutes = useMemo(() => {
    if (!pay || !receive) return [] as RampRoute[]
    return findMatchingRoutes({
      originChain: pay.chain,
      tokenIn: pay.token,
      destinationChain: receive.chain,
      tokenOut: receive.token,
      ...(activeUsdMethod ? { usdPaymentMethod: activeUsdMethod } : {}),
    })
  }, [pay, receive, activeUsdMethod])

  const selectedRoute = matchedRoutes[0]
  const pins = selectedRoute ? eligibleRampPins(selectedRoute) : []
  const showProviderSelect = pins.length > 1
  const [pin, setPin] = useState<RampPin>('default')
  const activePin: RampPin = pins.includes(pin) ? pin : (pins[0] ?? 'default')

  const [humanAmount, setHumanAmount] = useState(() =>
    pay ? defaultHumanAmount(pay.token) : '100',
  )

  const decimals = pay ? amountInDecimals(pay.token) : 2
  const rawAmount = humanToRaw(humanAmount, decimals)
  const inverse = selectedRoute ? findInverseRoute(selectedRoute) : undefined
  const busy = loadingKey !== null || executingKey !== null
  const resultKey = selectedRoute ? `${selectedRoute.id}:${activePin}` : null
  const result = resultKey ? results[resultKey] : undefined
  const quoting = resultKey !== null && loadingKey === resultKey
  const signing = resultKey !== null && executingKey === resultKey

  const applyPay = (nextPay: RampEndpoint) => {
    setPayKey(nextPay.key)
    setHumanAmount(defaultHumanAmount(nextPay.token))
    const nextReceives = receiveOptionsForPay(nextPay)
    const keep = nextReceives.find((item) => item.key === receiveKey)
    setReceiveKey((keep ?? nextReceives[0])?.key ?? '')
  }

  const handleInvert = () => {
    if (!inverse) return
    const nextPay = catalogPayFor(inverse)
    if (!nextPay) return
    applyPay(nextPay)
    const nextReceive = receiveOptionsForPay(nextPay).find(
      (item) =>
        item.chain === inverse.destinationChain && item.token === inverse.tokenOut,
    )
    if (nextReceive) setReceiveKey(nextReceive.key)
    if (inverse.usdPaymentMethod) setUsdMethod(inverse.usdPaymentMethod)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoute || rawAmount == null) return
    onQuote({
      route: selectedRoute,
      pin: pins.length > 0 ? activePin : 'default',
      amountIn: rawAmount,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="ui-sub-panel flex flex-col gap-4">
      <div>
        <h3 className="text-small font-semibold text-ink">Quote builder</h3>
        <p className="text-caption text-gray-500">
          Pick pay → receive from the Deframe solver catalog (fiat + inventory). Amount is
          humanized; raw units go on the wire.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="ramp-builder-pay">
            You pay
          </label>
          <select
            id="ramp-builder-pay"
            className="ui-select"
            value={pay?.key ?? ''}
            onChange={(e) => {
              const next = endpointByKey(e.target.value, RAMP_PAY_ENDPOINTS)
              if (next) applyPay(next)
            }}
          >
            {RAMP_PAY_ENDPOINTS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="ui-label" htmlFor="ramp-builder-receive">
            You receive
          </label>
          <select
            id="ramp-builder-receive"
            className="ui-select"
            value={receive?.key ?? ''}
            disabled={receiveChoices.length === 0}
            onChange={(e) => {
              setReceiveKey(e.target.value)
            }}
          >
            {receiveChoices.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label className="ui-label" htmlFor="ramp-builder-amount">
            Amount ({pay?.symbol ?? '—'})
          </label>
          <input
            id="ramp-builder-amount"
            inputMode="decimal"
            value={humanAmount}
            onChange={(e) => {
              setHumanAmount(e.target.value)
            }}
            placeholder={pay ? defaultHumanAmount(pay.token) : '0'}
            className="ui-input ui-input-mono"
          />
          <p className="text-caption text-gray-500">
            {rawAmount != null
              ? `Raw amountIn: ${rawAmount} (${decimals} decimals)`
              : 'Enter a valid decimal amount'}
          </p>
        </div>

        <button
          type="button"
          className="ui-btn-secondary ui-btn-sm"
          disabled={!inverse || busy}
          onClick={handleInvert}
          title={inverse ? `Invert to ${inverse.label}` : 'No inverse route in catalog'}
        >
          Invert
        </button>
      </div>

      {usdMethods.length > 0 ? (
        <div className="flex max-w-xs flex-col gap-1">
          <label className="ui-label" htmlFor="ramp-builder-usd-method">
            USD payment method
          </label>
          <select
            id="ramp-builder-usd-method"
            className="ui-select"
            value={activeUsdMethod}
            onChange={(e) => {
              setUsdMethod(e.target.value as 'WIRE' | 'ACH')
            }}
          >
            {usdMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {showProviderSelect ? (
        <div className="flex max-w-xs flex-col gap-1">
          <label className="ui-label" htmlFor="ramp-builder-provider">
            rampProvider
          </label>
          <select
            id="ramp-builder-provider"
            className="ui-select"
            value={activePin}
            onChange={(e) => {
              setPin(e.target.value as RampPin)
            }}
          >
            {pins.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {selectedRoute && activePin === 'unblockpay' ? (
            <p className="text-caption text-gray-500">
              Expected: {selectedRoute.unblockpayExpected}
            </p>
          ) : null}
        </div>
      ) : selectedRoute?.direction === 'inventory' ? (
        <p className="text-caption text-gray-500">Inventory route — no rampProvider pin.</p>
      ) : null}

      {selectedRoute ? (
        <p className="text-caption text-gray-500">
          Route <code className="ui-code">{selectedRoute.id}</code> · {selectedRoute.label}
        </p>
      ) : (
        <p className="ui-text-error text-caption">No catalog route for this pair.</p>
      )}

      {selectedRoute && isBrlOfframp(selectedRoute) && !pixKey.trim() ? (
        <p className="text-caption text-amber-700">
          Set PIX key in shared fields below before quoting this offramp.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="ui-btn-primary ui-btn-sm"
          disabled={busy || !selectedRoute || rawAmount == null}
        >
          {quoting ? 'Quoting…' : signing ? 'Signing…' : 'Get quote'}
        </button>
        {selectedRoute?.direction === 'offramp' || selectedRoute?.direction === 'inventory' ? (
          <span className="text-caption text-gray-500">
            Executable quotes open Privy to sign (same as Swap).
          </span>
        ) : null}
      </div>

      {result ? <RampQuoteMeta result={result} /> : null}
      {result ? (
        <details>
          <summary className="cursor-pointer text-small text-gray-500">Quote JSON</summary>
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
        </details>
      ) : null}
    </form>
  )
}
