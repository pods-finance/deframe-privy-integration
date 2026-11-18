import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'

const privy = fileURLToPath(new URL('../',import.meta.url))
const appConfigDir = execFileSync('git',['worktree','list','--porcelain'],{cwd:privy,encoding:'utf8'}).split('\n')[0].slice('worktree '.length)
const require = createRequire(privy + '/package.json')
const {loadEnv} = await import(require.resolve('vite'))
const app = loadEnv('development', appConfigDir, 'VITE_APP_')
if (!app.VITE_APP_PRIVY_APP_ID) throw Error('The local Privy app ID is missing')
function aws(...args) {
  return JSON.parse(execFileSync('aws', ['--profile','deframe','--region','us-east-1', ...args,'--output','json'],{encoding:'utf8'}))
}
async function previewKey() {
  if (process.env.DEFRAME_PREVIEW_API_KEY) return process.env.DEFRAME_PREVIEW_API_KEY
  const svc=aws('ecs','describe-services','--cluster','deframe-dev','--services','deframe-preview-pr-3364-web').services[0]
  const def=aws('ecs','describe-task-definition','--task-definition',svc.taskDefinition).taskDefinition
  const web=def.containerDefinitions.find(c=>c.name==='web')
  const db='deframe-preview-pr-3364'
  const read=name=>{
    const [arn,version]=web.secrets.find(s=>s.name===name).valueFrom.split(':::')
    return aws('secretsmanager','get-secret-value','--secret-id',arn,...(version?['--version-id',version]:[])).SecretString
  }
  if(read('MONGODB_DATABASE_NAME')!==db) throw Error('Preview database mismatch')
  const apiRepo=process.env.DEFRAME_API_DIRECTORY || join(homedir(),'Source/pods/deframe-api')
  const {MongoClient,ObjectId}=createRequire(join(apiRepo,'package.json'))('mongodb')
  const mongo=new MongoClient(read('MONGODB_URI'), {serverSelectionTimeoutMS:15000})
  try {
    await mongo.connect()
    const key=await mongo.db(db).collection('customerapikeys').findOne({customer:new ObjectId('6a4e760a6242bc4b29918d23'),deletedAt:null},{projection:{value:1}})
    if (!key?.value) throw Error('Preview test customer key unavailable')
    return key.value
  } finally {await mongo.close()}
}
let key
try {key=await previewKey()} catch {console.error('Could not load the PR 3364 preview key. Refresh the deframe AWS session or supply DEFRAME_PREVIEW_API_KEY.');process.exit(1)}
const child=spawn(process.execPath,[privy+'/node_modules/vite/bin/vite.js','--config','vite.preview3364.config.ts'],{cwd:privy,stdio:'inherit',env:{...process.env,VITE_APP_PRIVY_APP_ID:app.VITE_APP_PRIVY_APP_ID,DEFRAME_PREVIEW_API_KEY:key}})
child.on('exit',code=>process.exit(code??1))
