import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

function aws(...args) {
  return JSON.parse(execFileSync('aws', ['--profile', 'deframe', '--region', 'us-east-1', ...args, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
}

function readTaskSecret(web, name) {
  const [arn, version] = web.secrets.find(entry => entry.name === name).valueFrom.split(':::')
  return aws('secretsmanager', 'get-secret-value', '--secret-id', arn, ...(version ? ['--version-id', version] : [])).SecretString
}

async function verifyPreviewDatabase(web, database, pr, apiRepo, apiRequire) {
  const env = Object.fromEntries((web.environment ?? []).map(({ name, value }) => [name, value]))
  if (env.CONFIG_SOURCE !== 'mongo') {
    if (readTaskSecret(web, 'MONGODB_DATABASE_NAME') !== database.databaseName) throw Error('Preview database mismatch')
    return
  }
  if (env.PREVIEW_PR_NUMBER !== pr || env.CONFIG_SERVICE !== 'web' || env.ENV !== 'dev' || env.CONFIG_ENV !== `preview-pr-${pr}`) throw Error('Preview task identity mismatch')
  const { layerScopes, parseConfigValueRecords, resolveEffectiveConfig } = apiRequire('tsx/cjs/api').require(join(apiRepo, 'config/configStore.ts'), import.meta.url)
  // The boot configuration permits only a preview-layer database override. Read that one non-secret key.
  const scopes = layerScopes({ env: 'dev', service: 'web', previewPr: Number(pr) }).filter(scope => scope.startsWith('preview-pr-'))
  const documents = await database.collection('config_values').find({ scope: { $in: scopes }, key: 'MONGODB_DATABASE_NAME' }).toArray()
  const override = resolveEffectiveConfig(parseConfigValueRecords(documents), scopes).get('MONGODB_DATABASE_NAME')?.payload
  if (override && override.kind !== 'unset' && (override.kind !== 'value' || override.value !== database.databaseName)) throw Error('Preview database mismatch')
}

export async function previewKey(pr, apiRepo, customerId) {
  const apiRequire = createRequire(join(apiRepo, 'package.json'))

  const service = aws('ecs', 'describe-services', '--cluster', 'deframe-dev', '--services', `deframe-preview-pr-${pr}-web`).services[0]
  if (!service?.taskDefinition || service.status !== 'ACTIVE') throw Error('The preview service is unavailable.')
  const definition = aws('ecs', 'describe-task-definition', '--task-definition', service.taskDefinition).taskDefinition
  const web = definition.containerDefinitions.find(container => container.name === 'web')
  const { MongoClient, ObjectId } = apiRequire('mongodb')
  const mongo = new MongoClient(readTaskSecret(web, 'MONGODB_URI'), { serverSelectionTimeoutMS: 15000 })
  try {
    await mongo.connect()
    const database = mongo.db(`deframe-preview-pr-${pr}`)
    await verifyPreviewDatabase(web, database, pr, apiRepo, apiRequire)
    const key = await database.collection('customerapikeys').findOne({ customer: new ObjectId(customerId), deletedAt: null }, { projection: { value: 1 } })
    if (!key?.value) throw Error('Preview test customer key unavailable')
    return key.value
  } finally {
    await mongo.close()
  }
}
