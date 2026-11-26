import { fileURLToPath } from 'node:url'
import { createServer, loadEnv } from 'vite'
import { launchTarget } from './tester-target.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
const env = loadEnv('development', root, ['DEFRAME_TARGET', 'DEFRAME_PREVIEW_PR'])
const target = launchTarget(process.argv.slice(2), env)
const server = await createServer({ root, mode: target.id })
await server.listen()
console.log('Deframe target ' + target.id + ' → ' + target.origin)
server.printUrls()
