import nano from 'nano'

import config from '../config.json'
// Query Partner Functions
// import { bitrefill } from './partners/bitrefill'
import { changelly } from './partners/changelly'
import { changenow } from './partners/changenow'
import { coinswitch } from './partners/coinswitch'
// import { faast } from './partners/faast'
// Cleaners
import { asDbSettings, StandardTx } from './types'

const nanoDb = nano(config.couchDbFullpath)
const DB_NAMES = ['db_settings', 'db_transactions']
const partners = [changelly, changenow, coinswitch]
const partnerKeys = config.apiKeys
const QUERY_FREQ_MS = 300000
const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))
const PARTNER_SETTINGS = 'partnerSettings'

// Need to surround this in a try catch that alerts slack
export async function queryEngine(): Promise<void> {
  const result = await nanoDb.db.list()
  console.log(result)
  for (const dbName of DB_NAMES) {
    if (!result.includes(dbName)) {
      if (dbName === 'db_transactions') {
        await nanoDb.db.create(dbName, { partitioned: true })
      } else {
        await nanoDb.db.create(dbName)
      }
    }
  }
  const dbSettings = nanoDb.db.use('db_settings')
  while (true) {
    const out = await dbSettings.get(PARTNER_SETTINGS).catch(e => {
      if (e.error != null && e.error === 'not_found') {
        return { settings: {} }
      } else {
        throw e
      }
    })
    let partnerSettings: ReturnType<typeof asDbSettings>
    try {
      partnerSettings = asDbSettings(out)
    } catch {
      partnerSettings = { settings: {}, _id: undefined, _rev: undefined }
    }
    for (const partner of partners) {
      const apiKeys =
        partnerKeys[partner.pluginId] != null
          ? partnerKeys[partner.pluginId]
          : {}
      const settings =
        partnerSettings.settings[partner.pluginId] != null
          ? partnerSettings.settings[partner.pluginId]
          : {}
      console.log('Querying partner:', partner.pluginName)
      const result = await partner.queryFunc({
        apiKeys,
        settings
      })
      for (const transaction of result.transactions) {
        insertTransaction(transaction, partner.pluginId).catch(e => {
          console.log(e)
        })
      }
      console.log('Finished querying partner:', partner.pluginName)
      partnerSettings.settings[partner.pluginId] = result.settings
    }
    await dbSettings.insert(partnerSettings, PARTNER_SETTINGS)
    await snooze(QUERY_FREQ_MS)
  }
}

async function insertTransaction(
  transaction: StandardTx,
  pluginId: string
): Promise<any> {
  const dbTransactions: nano.DocumentScope<StandardTx> = nanoDb.db.use(
    'db_transactions'
  )
  const key = pluginId + ':' + transaction.inputTXID
  const result = await dbTransactions.get(key)
  if (result != null) {
    const newObj = { ...result, ...transaction }
    await dbTransactions.insert(newObj)
  } else {
    await dbTransactions.insert(transaction, key)
  }
}
