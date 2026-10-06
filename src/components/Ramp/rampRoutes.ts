export type RampPin = 'default' | 'avenia' | 'unblockpay'
export type RampDirection = 'onramp' | 'offramp' | 'inventory'
export type RampSection = 'A' | 'B' | 'D'
export type UnblockpayExpected = '200' | 'RAMP_PROVIDER_NOT_ELIGIBLE'

export const TOKENS = {
  usdc: {
    ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    celo: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    monad: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    gnosis: '0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0',
  },
  brla: {
    polygon: '0xE6A537a407488807F0bbeb0038B79004f19DDDFb',
    base: '0xfCB34c47f850f452C15EA1B84d51231C38A61783',
    gnosis: '0xFECB3F7c54E2CAAE9dC6Ac9060A822D47E053760',
  },
  brz: {
    polygon: '0x4eD141110F6EeeAbA9A1df36d8c26f684d2475Dc',
  },
  brs: 'BRSxQRUaGswjLs7ewcH7uXj3r7SgmfKSSLLXyCKHZtUo',
  hyperUsdcMonad: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371',
} as const

const AMOUNTS = {
  brlCents: '10000',
  usdcRaw: '5000000',
  usdcBscRaw: '5000000000000000000',
  usdCents: '5000',
  brlaRaw: '100000000000000000000',
  brsRaw: '100000000',
  hyperShareRaw: '1000000000000000000',
} as const

const PIX_USDC_CHAINS = ['polygon', 'base', 'arbitrum', 'bsc', 'celo', 'monad'] as const
const UNBLOCKPAY_PIX_CHAINS = new Set(['polygon', 'base'])
const USD_CHAINS = ['ethereum', 'base', 'polygon'] as const
const USD_METHODS = ['WIRE', 'ACH'] as const
const BRLA_BRS_CHAINS = ['polygon', 'base', 'gnosis'] as const

export interface RampRoute {
  id: string
  section: RampSection
  sectionTitle: string
  label: string
  direction: RampDirection
  originChain: string
  destinationChain: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  usdPaymentMethod?: 'WIRE' | 'ACH'
  unblockpayExpected: UnblockpayExpected
}

function usdc(chain: keyof typeof TOKENS.usdc): string {
  return TOKENS.usdc[chain]
}

function pixUnblockpayExpected(chain: string): UnblockpayExpected {
  return UNBLOCKPAY_PIX_CHAINS.has(chain) ? '200' : 'RAMP_PROVIDER_NOT_ELIGIBLE'
}

function usdUnblockpayExpected(
  chain: string,
  method: 'WIRE' | 'ACH',
): UnblockpayExpected {
  if (method === 'WIRE' && (chain === 'polygon' || chain === 'base')) return '200'
  return 'RAMP_PROVIDER_NOT_ELIGIBLE'
}

function buildCatalog(): RampRoute[] {
  const rows: RampRoute[] = []

  for (const chain of PIX_USDC_CHAINS) {
    rows.push({
      id: `a-onramp-brl-usdc-${chain}`,
      section: 'A',
      sectionTitle: 'A · Pix ↔ USDC inventory (ViaBrla)',
      label: `Onramp Pix BRL → USDC ${chain}`,
      direction: 'onramp',
      originChain: 'fiat',
      destinationChain: chain,
      tokenIn: 'BRL',
      tokenOut: usdc(chain),
      amountIn: AMOUNTS.brlCents,
      unblockpayExpected: pixUnblockpayExpected(chain),
    })
    rows.push({
      id: `a-offramp-usdc-brl-${chain}`,
      section: 'A',
      sectionTitle: 'A · Pix ↔ USDC inventory (ViaBrla)',
      label: `Offramp USDC ${chain} → Pix BRL`,
      direction: 'offramp',
      originChain: chain,
      destinationChain: 'fiat',
      tokenIn: usdc(chain),
      tokenOut: 'BRL',
      amountIn: chain === 'bsc' ? AMOUNTS.usdcBscRaw : AMOUNTS.usdcRaw,
      unblockpayExpected: pixUnblockpayExpected(chain),
    })
  }

  for (const chain of USD_CHAINS) {
    for (const method of USD_METHODS) {
      rows.push({
        id: `b-onramp-usd-usdc-${chain}-${method.toLowerCase()}`,
        section: 'B',
        sectionTitle: 'B · USD ↔ USDC (Avenia)',
        label: `Onramp USD ${method} → USDC ${chain}`,
        direction: 'onramp',
        originChain: 'fiat',
        destinationChain: chain,
        tokenIn: 'USD',
        tokenOut: usdc(chain),
        amountIn: AMOUNTS.usdCents,
        usdPaymentMethod: method,
        unblockpayExpected: usdUnblockpayExpected(chain, method),
      })
      rows.push({
        id: `b-offramp-usdc-usd-${chain}-${method.toLowerCase()}`,
        section: 'B',
        sectionTitle: 'B · USD ↔ USDC (Avenia)',
        label: `Offramp USDC ${chain} → USD ${method}`,
        direction: 'offramp',
        originChain: chain,
        destinationChain: 'fiat',
        tokenIn: usdc(chain),
        tokenOut: 'USD',
        amountIn: AMOUNTS.usdcRaw,
        usdPaymentMethod: method,
        unblockpayExpected: usdUnblockpayExpected(chain, method),
      })
    }
  }

  rows.push(
    {
      id: 'd-onramp-brl-brla-polygon',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Onramp Pix BRL → BRLA polygon',
      direction: 'onramp',
      originChain: 'fiat',
      destinationChain: 'polygon',
      tokenIn: 'BRL',
      tokenOut: TOKENS.brla.polygon,
      amountIn: AMOUNTS.brlCents,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-offramp-brla-brl-polygon',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Offramp BRLA polygon → Pix BRL',
      direction: 'offramp',
      originChain: 'polygon',
      destinationChain: 'fiat',
      tokenIn: TOKENS.brla.polygon,
      tokenOut: 'BRL',
      amountIn: AMOUNTS.brlaRaw,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-onramp-brl-brs-solana',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Onramp Pix BRL → BRS solana',
      direction: 'onramp',
      originChain: 'fiat',
      destinationChain: 'solana',
      tokenIn: 'BRL',
      tokenOut: TOKENS.brs,
      amountIn: AMOUNTS.brlCents,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-offramp-brs-brl-solana',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Offramp BRS solana → Pix BRL',
      direction: 'offramp',
      originChain: 'solana',
      destinationChain: 'fiat',
      tokenIn: TOKENS.brs,
      tokenOut: 'BRL',
      amountIn: AMOUNTS.brsRaw,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-onramp-brl-brz-polygon',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Onramp Pix BRL → BRZ polygon',
      direction: 'onramp',
      originChain: 'fiat',
      destinationChain: 'polygon',
      tokenIn: 'BRL',
      tokenOut: TOKENS.brz.polygon,
      amountIn: AMOUNTS.brlCents,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-offramp-brz-brl-polygon',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Offramp BRZ polygon → Pix BRL',
      direction: 'offramp',
      originChain: 'polygon',
      destinationChain: 'fiat',
      tokenIn: TOKENS.brz.polygon,
      tokenOut: 'BRL',
      amountIn: AMOUNTS.brlaRaw,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-onramp-brl-hyper-monad',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Onramp Pix BRL → Hyper USDC monad',
      direction: 'onramp',
      originChain: 'fiat',
      destinationChain: 'monad',
      tokenIn: 'BRL',
      tokenOut: TOKENS.hyperUsdcMonad,
      amountIn: AMOUNTS.brlCents,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-offramp-hyper-brl-monad',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'Offramp Hyper USDC monad → Pix BRL',
      direction: 'offramp',
      originChain: 'monad',
      destinationChain: 'fiat',
      tokenIn: TOKENS.hyperUsdcMonad,
      tokenOut: 'BRL',
      amountIn: AMOUNTS.hyperShareRaw,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-inventory-brla-usdc-gnosis',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'BRLA polygon → USDC gnosis',
      direction: 'inventory',
      originChain: 'polygon',
      destinationChain: 'gnosis',
      tokenIn: TOKENS.brla.polygon,
      tokenOut: TOKENS.usdc.gnosis,
      amountIn: AMOUNTS.brlaRaw,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
    {
      id: 'd-inventory-usdc-gnosis-brla',
      section: 'D',
      sectionTitle: 'D · Other public fiat / inventory',
      label: 'USDC gnosis → BRLA polygon',
      direction: 'inventory',
      originChain: 'gnosis',
      destinationChain: 'polygon',
      tokenIn: TOKENS.usdc.gnosis,
      tokenOut: TOKENS.brla.polygon,
      amountIn: AMOUNTS.usdcRaw,
      unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
    },
  )

  for (const chain of BRLA_BRS_CHAINS) {
    rows.push(
      {
        id: `d-inventory-brla-${chain}-brs`,
        section: 'D',
        sectionTitle: 'D · Other public fiat / inventory',
        label: `BRLA ${chain} → BRS solana`,
        direction: 'inventory',
        originChain: chain,
        destinationChain: 'solana',
        tokenIn: TOKENS.brla[chain],
        tokenOut: TOKENS.brs,
        amountIn: AMOUNTS.brlaRaw,
        unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
      },
      {
        id: `d-inventory-brs-brla-${chain}`,
        section: 'D',
        sectionTitle: 'D · Other public fiat / inventory',
        label: `BRS solana → BRLA ${chain}`,
        direction: 'inventory',
        originChain: 'solana',
        destinationChain: chain,
        tokenIn: TOKENS.brs,
        tokenOut: TOKENS.brla[chain],
        amountIn: AMOUNTS.brsRaw,
        unblockpayExpected: 'RAMP_PROVIDER_NOT_ELIGIBLE',
      },
    )
  }

  return rows
}

export const RAMP_ROUTES = buildCatalog()

export const RAMP_SECTIONS = ['A', 'B', 'D'] as const satisfies readonly RampSection[]

export function isFiatChain(chain: string): boolean {
  return chain.trim().toLowerCase() === 'fiat'
}

export function isSolanaChain(chain: string): boolean {
  return chain.trim().toLowerCase() === 'solana'
}

export function isBrlOfframp(route: RampRoute): boolean {
  return isFiatChain(route.destinationChain) && route.tokenOut.toUpperCase() === 'BRL'
}

export function isUsdOfframp(route: RampRoute): boolean {
  return isFiatChain(route.destinationChain) && route.tokenOut.toUpperCase() === 'USD'
}

function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/** Binance-Peg USDC on BSC is 18 decimals; other catalog USDC tokens are 6. */
function isBscUsdc(token: string): boolean {
  return sameAddress(token, TOKENS.usdc.bsc)
}

/** Decimals for `amountIn` (tokenIn). Fiat BRL/USD use 2. */
export function amountInDecimals(tokenIn: string): number {
  const token = tokenIn.trim()
  const upper = token.toUpperCase()
  if (upper === 'BRL' || upper === 'USD') return 2
  if (token === TOKENS.brs) return 6
  if (token === TOKENS.hyperUsdcMonad) return 18
  if (isBscUsdc(token)) return 18
  if (
    Object.values(TOKENS.brla).some((addr) => sameAddress(addr, token)) ||
    Object.values(TOKENS.brz).some((addr) => sameAddress(addr, token))
  ) {
    return 18
  }
  if (Object.values(TOKENS.usdc).some((addr) => sameAddress(addr, token))) {
    return 6
  }
  return 6
}

export function amountInSymbol(tokenIn: string): string {
  const token = tokenIn.trim()
  const upper = token.toUpperCase()
  if (upper === 'BRL' || upper === 'USD') return upper
  if (token === TOKENS.brs) return 'BRS'
  if (token === TOKENS.hyperUsdcMonad) return 'hyperUSDCa'
  if (Object.values(TOKENS.brla).some((addr) => addr.toLowerCase() === token.toLowerCase())) {
    return 'BRLA'
  }
  if (Object.values(TOKENS.brz).some((addr) => addr.toLowerCase() === token.toLowerCase())) {
    return 'BRZ'
  }
  if (Object.values(TOKENS.usdc).some((addr) => addr.toLowerCase() === token.toLowerCase())) {
    return 'USDC'
  }
  return token.slice(0, 8)
}

/** One selectable side of a quote (pay or receive). */
export interface RampEndpoint {
  key: string
  chain: string
  token: string
  symbol: string
  label: string
}

function sameToken(left: string, right: string): boolean {
  const a = left.trim()
  const b = right.trim()
  if (a.toUpperCase() === 'BRL' || a.toUpperCase() === 'USD') {
    return a.toUpperCase() === b.toUpperCase()
  }
  return a.toLowerCase() === b.toLowerCase()
}

function endpointFrom(chain: string, token: string): RampEndpoint {
  const symbol = amountInSymbol(token)
  const chainLabel = chain === 'fiat' ? 'fiat' : chain
  return {
    key: `${chainLabel}:${token}`,
    chain,
    token,
    symbol,
    label: `${symbol} · ${chainLabel}`,
  }
}

function collectEndpoints(side: 'in' | 'out'): RampEndpoint[] {
  const byKey = new Map<string, RampEndpoint>()
  for (const route of RAMP_ROUTES) {
    const endpoint =
      side === 'in'
        ? endpointFrom(route.originChain, route.tokenIn)
        : endpointFrom(route.destinationChain, route.tokenOut)
    byKey.set(endpoint.key, endpoint)
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export const RAMP_PAY_ENDPOINTS = collectEndpoints('in')
export const RAMP_RECEIVE_ENDPOINTS = collectEndpoints('out')

export function findMatchingRoutes(params: {
  originChain: string
  tokenIn: string
  destinationChain: string
  tokenOut: string
  usdPaymentMethod?: 'WIRE' | 'ACH'
}): RampRoute[] {
  return RAMP_ROUTES.filter((route) => {
    if (route.originChain !== params.originChain) return false
    if (route.destinationChain !== params.destinationChain) return false
    if (!sameToken(route.tokenIn, params.tokenIn)) return false
    if (!sameToken(route.tokenOut, params.tokenOut)) return false
    if (params.usdPaymentMethod) {
      return route.usdPaymentMethod === params.usdPaymentMethod
    }
    return true
  })
}

export function findInverseRoute(route: RampRoute): RampRoute | undefined {
  return RAMP_ROUTES.find(
    (candidate) =>
      candidate.originChain === route.destinationChain &&
      candidate.destinationChain === route.originChain &&
      sameToken(candidate.tokenIn, route.tokenOut) &&
      sameToken(candidate.tokenOut, route.tokenIn) &&
      (candidate.usdPaymentMethod ?? undefined) === (route.usdPaymentMethod ?? undefined),
  )
}

export function receiveOptionsForPay(pay: RampEndpoint): RampEndpoint[] {
  const byKey = new Map<string, RampEndpoint>()
  for (const route of RAMP_ROUTES) {
    if (route.originChain !== pay.chain || !sameToken(route.tokenIn, pay.token)) continue
    const receive = endpointFrom(route.destinationChain, route.tokenOut)
    byKey.set(receive.key, receive)
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function payOptionsForReceive(receive: RampEndpoint): RampEndpoint[] {
  const byKey = new Map<string, RampEndpoint>()
  for (const route of RAMP_ROUTES) {
    if (route.destinationChain !== receive.chain || !sameToken(route.tokenOut, receive.token)) {
      continue
    }
    const pay = endpointFrom(route.originChain, route.tokenIn)
    byKey.set(pay.key, pay)
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Pins the demo UI may offer for a selected route.
 * Empty = crypto inventory (no rampProvider query param).
 */
export function eligibleRampPins(route: RampRoute): RampPin[] {
  if (route.direction === 'inventory') return []
  if (route.unblockpayExpected === '200') {
    return ['default', 'avenia', 'unblockpay']
  }
  return ['default', 'avenia']
}

export function routeNeedsUsdMethod(route: RampRoute): boolean {
  return Boolean(route.usdPaymentMethod) ||
    route.tokenIn.toUpperCase() === 'USD' ||
    route.tokenOut.toUpperCase() === 'USD'
}

export function usdMethodsForPair(params: {
  originChain: string
  tokenIn: string
  destinationChain: string
  tokenOut: string
}): Array<'WIRE' | 'ACH'> {
  const methods = new Set<'WIRE' | 'ACH'>()
  for (const route of findMatchingRoutes(params)) {
    if (route.usdPaymentMethod) methods.add(route.usdPaymentMethod)
  }
  return [...methods]
}

/** Default human amount for a token side (matches catalog raw defaults). */
export function defaultHumanAmount(token: string): string {
  const decimals = amountInDecimals(token)
  return rawToHuman(defaultRawAmount(token), decimals)
}

export function defaultRawAmount(token: string): string {
  const upper = token.trim().toUpperCase()
  if (upper === 'BRL') return AMOUNTS.brlCents
  if (upper === 'USD') return AMOUNTS.usdCents
  if (token === TOKENS.brs) return AMOUNTS.brsRaw
  if (token === TOKENS.hyperUsdcMonad) return AMOUNTS.hyperShareRaw
  if (
    Object.values(TOKENS.brla).some((addr) => sameAddress(addr, token)) ||
    Object.values(TOKENS.brz).some((addr) => sameAddress(addr, token))
  ) {
    return AMOUNTS.brlaRaw
  }
  if (isBscUsdc(token)) return AMOUNTS.usdcBscRaw
  return AMOUNTS.usdcRaw
}

export function rawToHuman(raw: string, decimals: number): string {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return ''
  const negative = false
  const digits = trimmed.replace(/^0+(?=\d)/, '') || '0'
  if (decimals === 0) return `${negative ? '-' : ''}${digits}`
  const padded = digits.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals)
  const fraction = padded.slice(-decimals).replace(/0+$/, '')
  return fraction.length > 0 ? `${whole}.${fraction}` : whole
}

/**
 * Parse a human decimal string into raw integer units.
 * Returns null when the value is empty or malformed.
 */
export function humanToRaw(human: string, decimals: number): string | null {
  const trimmed = human.trim().replace(/,/g, '')
  if (!trimmed) return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  const [wholePart, fractionPart = ''] = trimmed.split('.')
  if (fractionPart.length > decimals) return null
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0'
  const fraction = fractionPart.padEnd(decimals, '0')
  const combined = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  return combined
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

export function addressForChain(
  chain: string,
  evmAddress?: string,
  solanaAddress?: string,
  fallback?: string,
): string {
  if (isFiatChain(chain)) {
    return firstNonEmpty(fallback, evmAddress, solanaAddress)
  }
  if (isSolanaChain(chain)) {
    return firstNonEmpty(solanaAddress, fallback)
  }
  return firstNonEmpty(evmAddress, fallback)
}
