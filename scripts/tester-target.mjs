const fixedOrigins = new Map([
  ['prod', 'https://api.pods.finance'],
  ['dev', 'https://dev-api.pods.finance'],
  ['staging', 'https://staging-api.pods.finance'],
])

/** @param {string | undefined} name @param {string} [pr] */
export function resolveTarget(name, pr) {
  if (name === 'preview') {
    if (!pr || !/^[1-9]\d*$/.test(pr)) throw Error('Preview requires a positive integer PR number.')
    return { id: 'pr-' + pr, origin: 'https://pr-' + pr + '.preview.pods.finance' }
  }
  const origin = fixedOrigins.get(name)
  if (!name || !origin) throw Error('Choose a target: prod, dev, staging, or preview <PR>.')
  if (pr !== undefined) throw Error('Only preview accepts a PR number.')
  return { id: name, origin }
}

/** @param {string[]} args @param {Record<string,string | undefined>} env */
export function launchTarget(args, env) {
  if (args.length === 0) {
    const name = env.DEFRAME_TARGET || 'preview'
    return resolveTarget(name, name === 'preview' ? env.DEFRAME_PREVIEW_PR : undefined)
  }
  if (args.length === 1 && /^[1-9]\d*$/.test(args[0])) return resolveTarget('preview', args[0])
  if (args.length > 2) throw Error('Usage: yarn tester <prod|dev|staging|preview PR>.')
  return resolveTarget(args[0], args[1])
}

/** @param {string} mode @param {Record<string,string | undefined>} env */
export function targetForMode(mode, env) {
  if (mode === 'development' || mode === 'production') return launchTarget([], env)
  if (mode.startsWith('pr-')) return resolveTarget('preview', mode.slice(3))
  return resolveTarget(mode)
}
