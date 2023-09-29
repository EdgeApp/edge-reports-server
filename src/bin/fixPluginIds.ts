import { asArray, asObject, asString } from 'cleaners'
import js from 'jsonfile'
import nano from 'nano'

import { asApps, asDbTx, DbTx } from '../types'
import { datelog } from '../util'

const asDbQueryResult = asObject({ docs: asArray(asDbTx), bookmark: asString })

const PLUGIN_ID_MAP = {
  fox: 'foxExchange'
}

const PAGINATION = 100

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
        let bookmark
        const queryResults: any[] = []
        while (true) {
          const query = {
            selector: {
              _id: { $exists: true }
            },
            bookmark,
            limit: PAGINATION
          }
          const result = await reportsTransactions.partitionedFind(
            partition,
            query
          )
          if (
            typeof result.bookmark === 'string' &&
            result.docs.length === PAGINATION
          ) {
            bookmark = result.bookmark
          } else {
            bookmark = undefined
          }
          try {
            asDbQueryResult(result)
          } catch (e) {
            datelog(`Invalid Query Result for ${partition}`, e)
            continue
          }
          queryResults.push(...result.docs)
          if (result.docs.length < PAGINATION) break
        }
        if (queryResults.length === 0) {
          datelog(
            `Bad partition ${pluginId} does not exist within app ${app.appId}.`
          )
          return
        } else {
          datelog(
            `Gathered ${queryResults.length} docs from partition ${partition}`
          )
        }

        for (let i = 0; i < queryResults.length; i += PAGINATION) {
          const currentBatch: DbTx[] = queryResults.slice(i, i + PAGINATION)
          const newTxs = currentBatch.map(tx => {
            return {
              ...tx,
              _id: `${app.appId}_${PLUGIN_ID_MAP[pluginId]}:${tx.orderId}`,
              _rev: undefined
            }
          })
          await reportsTransactions.bulk({ docs: newTxs })
          datelog(
            `Successfully inserted ${i +
              currentBatch.length} documents of new partition ${
              PLUGIN_ID_MAP[pluginId]
            }`
          )

          const deleteTxs = currentBatch.map(tx => {
            return {
              ...tx,
              _deleted: true
            }
          })
          await reportsTransactions.bulk({ docs: deleteTxs })
          datelog(
            `Successfully deleted ${i +
              currentBatch.length} documents of old partition ${pluginId}`
          )
        }

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
