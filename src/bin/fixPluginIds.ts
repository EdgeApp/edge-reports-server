import { asArray, asMap, asObject, asString } from 'cleaners'
import js from 'jsonfile'
import nano from 'nano'

import { asDbTx } from '../types'
import { datelog } from '../util'

const asApp = asObject({
  _id: asString,
  _rev: asString,
  appId: asString,
  appName: asString,
  pluginIds: asMap(asMap(asString))
})
const asApps = asArray(asApp)

const asPartitionResult = asObject({
  rows: asArray(
    asObject({ id: asString, value: asObject({ rev: asString }), doc: asDbTx })
  )
})

const PLUGIN_ID_MAP = {
  fox: 'foxExchange'
}

const config = js.readFileSync('./config.json')
const nanoDb = nano(config.couchDbFullpath)
const reportsApps = nanoDb.use('reports_apps')
const reportsProgress = nanoDb.use('reports_progresscache')
const reportsTransactions = nanoDb.use('reports_transactions')

async function fixPluginIds(): Promise<void> {
  try {
    // get the contents of all reports_apps docs
    const query = {
      selector: {
        appId: { $exists: true }
      },
      limit: 1000000
    }
    const rawApps = await reportsApps.find(query)
    const apps = asApps(rawApps.docs)
    for (const app of apps) {
      for (const pluginId in PLUGIN_ID_MAP) {
        const partition = `${app.appId}_${pluginId}`
        const result = await reportsTransactions.partitionedList(partition, {
          // @ts-ignore
          include_docs: true
        })
        const oldTxs = asPartitionResult(result).rows
        if (oldTxs.length === 0) {
          datelog(
            `Bad partition ${pluginId} does not exist within app ${app.appId}.`
          )
          return
        }

        const newTxs = oldTxs.map(tx => {
          return {
            ...tx.doc,
            _id: `${app.appId}_${PLUGIN_ID_MAP[pluginId]}:${tx.doc.orderId}`,
            _rev: undefined
          }
        })
        await reportsTransactions.bulk({ docs: newTxs })
        datelog(
          `Successfully inserted new partition ${PLUGIN_ID_MAP[pluginId]}`
        )

        const deleteTxs = oldTxs.map(tx => {
          return {
            _id: tx.id,
            _rev: tx.value.rev,
            _deleted: true
          }
        })
        await reportsTransactions.bulk({ docs: deleteTxs })
        datelog(`Successfully deleted old partition ${pluginId}`)

        if (app.pluginIds[pluginId] != null) {
          app.pluginIds[PLUGIN_ID_MAP[pluginId]] = app.pluginIds[pluginId]
          delete app.pluginIds[pluginId]
          await reportsApps.insert(app)
          datelog(
            `Successfully updated bad pluginId name ${pluginId} to ${PLUGIN_ID_MAP[pluginId]} in reports_apps`
          )
        }
        const progress = await reportsProgress.get(`${app.appId}:${pluginId}`)
        const newCache = {
          ...progress,
          _id: `${app.appId}:${PLUGIN_ID_MAP[pluginId]}`,
          _rev: undefined
        }
        await reportsProgress.insert(newCache)
        datelog(`Successfully inserted new Cache.`)
        await reportsProgress.destroy(progress._id, progress._rev)
        datelog(`Successfully deleted old Cache.`)
      }
    }
  } catch (e) {
    datelog(e)
    throw e
  }
}
fixPluginIds().catch(e => datelog(e))
