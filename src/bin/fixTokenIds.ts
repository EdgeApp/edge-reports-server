import js from 'jsonfile'
import nano from 'nano'

import { DbTx } from '../types'
import { datelog } from '../util'
import { createTokenId, tokenTypes } from '../util/asEdgeTokenId'

const config = js.readFileSync('./config.json')
const nanoDb = nano(config.couchDbFullpath)

const QUERY_LIMIT = 500
const DRY_RUN = process.argv.includes('--dry-run')

const ALL_PARTITIONS = [
  'edge_banxa',
  'edge_bitaccess',
  'edge_bitrefill',
  'edge_bitsofgold',
  'edge_bity',
  'edge_changelly',
  'edge_changehero',
  'edge_changenow',
  'edge_coinswitch',
  'edge_exolix',
  'edge_faast',
  'edge_foxExchange',
  'edge_godex',
  'edge_kado',
  'edge_letsexchange',
  'edge_libertyx',
  'edge_lifi',
  'edge_moonpay',
  'edge_paybis',
  'edge_paytrie',
  'edge_rango',
  'edge_safello',
  'edge_shapeshift',
  'edge_sideshift',
  'edge_simplex',
  'edge_swapuz',
  'edge_switchain',
  'edge_thorchain',
  'edge_totle',
  'edge_transak',
  'edge_wyre',
  'edge_xanpool'
]

/**
 * Re-derive the tokenId using createTokenId. Treats the existing tokenId
 * value as a raw contract address and normalizes it. Returns undefined
 * when the value is already correct or cannot be fixed.
 */
function normalizeTokenId(
  pluginId: string | undefined,
  currencyCode: string,
  tokenId: string | null | undefined
): string | null | undefined {
  if (tokenId == null || pluginId == null) return undefined

  const tokenType = tokenTypes[pluginId] ?? null
  if (tokenType == null) return undefined // chain doesn't support tokens

  try {
    const normalized = createTokenId(tokenType, currencyCode, tokenId)
    return normalized !== tokenId ? normalized : undefined
  } catch {
    return undefined
  }
}

interface FixStats {
  scanned: number
  fixed: number
  errors: number
  byPartition: Record<string, number>
  byField: { deposit: number; payout: number }
}

fixTokenIds().catch(e => {
  datelog(e)
  process.exit(1)
})

async function fixTokenIds(): Promise<void> {
  const reportsTransactions = nanoDb.use('reports_transactions')

  const stats: FixStats = {
    scanned: 0,
    fixed: 0,
    errors: 0,
    byPartition: {},
    byField: { deposit: 0, payout: 0 }
  }

  const partitions =
    process.argv[2] != null && process.argv[2] !== '--dry-run'
      ? [process.argv[2]]
      : ALL_PARTITIONS

  if (DRY_RUN) datelog('DRY RUN — no changes will be written')

  for (const partition of partitions) {
    datelog(`Scanning partition: ${partition}`)
    let bookmark: string | undefined

    while (true) {
      const query: any = {
        selector: {
          $or: [
            { depositTokenId: { $type: 'string' } },
            { payoutTokenId: { $type: 'string' } }
          ]
        },
        bookmark,
        limit: QUERY_LIMIT
      }

      let result: any
      try {
        result = await reportsTransactions.partitionedFind(partition, query)
      } catch (e) {
        // Partition may not exist
        const err = e as { statusCode?: number }
        if (err.statusCode === 404) {
          datelog(`  Partition ${partition} not found, skipping`)
          break
        }
        throw e
      }

      const { docs } = result
      if (docs.length === 0) break

      if (typeof result.bookmark === 'string' && docs.length === QUERY_LIMIT) {
        bookmark = result.bookmark
      } else {
        bookmark = undefined
      }

      stats.scanned += docs.length

      const docsToUpdate: any[] = []

      for (const d of docs) {
        const doc: DbTx = d
        let changed = false

        const fixedDeposit = normalizeTokenId(
          doc.depositChainPluginId,
          doc.depositCurrency,
          doc.depositTokenId
        )
        if (fixedDeposit !== undefined) {
          datelog(
            `  FIX ${doc._id} depositTokenId: "${doc.depositTokenId}" -> "${fixedDeposit}"`
          )
          doc.depositTokenId = fixedDeposit
          changed = true
          stats.byField.deposit++
        }

        const fixedPayout = normalizeTokenId(
          doc.payoutChainPluginId,
          doc.payoutCurrency,
          doc.payoutTokenId
        )
        if (fixedPayout !== undefined) {
          datelog(
            `  FIX ${doc._id} payoutTokenId: "${doc.payoutTokenId}" -> "${fixedPayout}"`
          )
          doc.payoutTokenId = fixedPayout
          changed = true
          stats.byField.payout++
        }

        if (changed) {
          docsToUpdate.push(d)
          stats.byPartition[partition] = (stats.byPartition[partition] ?? 0) + 1
        }
      }

      if (docsToUpdate.length > 0) {
        stats.fixed += docsToUpdate.length
        if (!DRY_RUN) {
          try {
            await reportsTransactions.bulk({ docs: docsToUpdate })
            datelog(`  Wrote ${docsToUpdate.length} fixed docs in ${partition}`)
          } catch (e) {
            datelog(`  Error writing bulk update for ${partition}:`, e)
            stats.errors++
          }
        } else {
          datelog(
            `  Would write ${docsToUpdate.length} fixed docs in ${partition}`
          )
        }
      }

      if (bookmark == null) break
    }
  }

  datelog('\n=== Summary ===')
  datelog(`Total documents scanned: ${stats.scanned}`)
  datelog(`Total documents fixed: ${stats.fixed}`)
  datelog(`  Deposit tokenIds fixed: ${stats.byField.deposit}`)
  datelog(`  Payout tokenIds fixed: ${stats.byField.payout}`)
  if (Object.keys(stats.byPartition).length > 0) {
    datelog('Fixes by partition:')
    for (const [partition, count] of Object.entries(stats.byPartition)) {
      datelog(`  ${partition}: ${count}`)
    }
  }
  if (stats.errors > 0) {
    datelog(`Errors encountered: ${stats.errors}`)
  }
  if (DRY_RUN) {
    datelog('DRY RUN complete — no changes were made')
  }
}
