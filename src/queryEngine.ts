import nano from 'nano'

import config from '../config.json'
// Query Partner Functions
import { bitrefill } from './partners/bitrefill'
import { changelly } from './partners/changelly'
import { changenow } from './partners/changenow'
import { coinswitch } from './partners/coinswitch'
import { faast } from './partners/faast'
// Cleaners
import { asDbSettings, DbTx, StandardTx } from './types'

const datelog = function (...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

const nanoDb = nano(config.couchDbFullpath)
const DB_NAMES = [
  { name: 'db_settings' },
  { name: 'db_transactions', options: { partitioned: true } }
]
const partners = [bitrefill, changelly, changenow, coinswitch, faast]
const QUERY_FREQ_MS = 29 * 60 * 1000
const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))
const PARTNER_SETTINGS = 'partnerSettings'

export async function queryEngine(): Promise<void> {
  const result = await nanoDb.db.list()
  datelog(result)
  for (const dbName of DB_NAMES) {
    if (!result.includes(dbName.name)) {
      await nanoDb.db.create(dbName.name, dbName.options)
    }
  }
  const dbSettings = nanoDb.db.use('db_settings')
  while (true) {
    for (const partner of partners) {
      datelog('Starting with partner:', partner.pluginName)
      const out = await dbSettings.get(PARTNER_SETTINGS).catch(e => {
        if (e.error != null && e.error === 'not_found') {
          datelog('Settings document not found, creating document')
          return { settings: {} }
        } else {
          throw e
        }
      })
      let partnerSettings: ReturnType<typeof asDbSettings>
      try {
        partnerSettings = asDbSettings(out)
      } catch (e) {
        partnerSettings = { apiKeys: {}, settings: {}, _id: undefined, _rev: undefined }
      }
      const apiKeys =
        partnerSettings.apiKeys[partner.pluginId] != null
          ? partnerSettings.apiKeys[partner.pluginId]
          : {}
      const settings =
        partnerSettings.settings[partner.pluginId] != null
          ? partnerSettings.settings[partner.pluginId]
          : {}
      datelog('Querying partner:', partner.pluginName)
      try {
        const result = await partner.queryFunc({
          apiKeys,
          settings
        })
        partnerSettings.settings[partner.pluginId] = result.settings
        datelog(
          'Updating database with transactions and settings for partner:',
          partner.pluginName
        )
        await insertTransactions(result.transactions, partner.pluginId)
        await dbSettings.insert(partnerSettings, PARTNER_SETTINGS)
        datelog(
          'Finished updating database with transactions and settings for partner:',
          partner.pluginName
        )
      } catch (e) {
        datelog(`Error updating partner ${partner.pluginName}`, e)
      }
    }
    datelog(`Snoozing for ${QUERY_FREQ_MS} milliseconds`)
    await snooze(QUERY_FREQ_MS)
  }
}

async function insertTransactions(
  transactions: StandardTx[],
  pluginId: string
): Promise<any> {
  const dbTransactions: nano.DocumentScope<DbTx> = nanoDb.db.use(
    'db_transactions'
  )
  const transactionsArray: StandardTx[] = []
  for (const transaction of transactions) {
    // TODO: Add batching for more than 500 transactions
    const key = pluginId + ':' + transaction.inputTXID
    const result = await dbTransactions.get(key).catch(e => {
      if (e != null && e.error === 'not_found') {
        return {}
      } else {
        throw e
      }
    })
    const newObj = { _rev: undefined, ...result, ...transaction, _id: key }
    datelog(`id: ${newObj._id}. revision: ${newObj._rev}`)
    transactionsArray.push(newObj)
  }
  try {
    const docs = await dbTransactions.bulk({ docs: transactionsArray })
    let numErrors = 0;
    for (const doc of docs) {
      if (doc.error != null) {
        datelog(`There was an error in the batch ${doc.error}.  id: ${doc.id}. revision: ${doc.rev}`)
        numErrors++
        // throw new Error(`There was an error in the batch ${doc.error}`)
      }
    }
    datelog(`total errors: ${numErrors}`)
  } catch (e) {
    datelog('Error doing bulk transaction insert', e)
    throw e
  }
}
