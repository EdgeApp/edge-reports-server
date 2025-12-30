import { program } from 'commander'
import fs from 'fs'
import path from 'path'

import { datelog } from '../../util'
import { queryCouch } from './queryCouch'

interface MonthlyTotal {
  month: string
  usdValue: number
  txCount: number
}

interface PluginMonthlyData {
  usdValue: number
  txCount: number
}

interface MonthlyPluginBreakdown {
  month: string
  plugins: { [pluginId: string]: PluginMonthlyData }
  total: PluginMonthlyData
}

interface CoinReportOptions {
  pid?: string
  cc?: string
  startDate?: string
  endDate?: string
  out?: string
  p?: string
}

async function main(): Promise<void> {
  program
    .option('-pid, --pid <pluginIds>', 'Comma-separated plugin IDs to filter')
    .option('-cc, --cc <currencyCodes>', 'Comma-separated currency codes')
    .option(
      '-startDate, --start-date <date>',
      'Start date (inclusive), e.g. 2025-09-01'
    )
    .option(
      '-endDate, --end-date <date>',
      'End date (exclusive), e.g. 2025-12-01'
    )
    .option(
      '-out, --out <filename>',
      'Output filename (if omitted, console only)'
    )
    .option('-p, --p <partition>', 'Partition to query, e.g. edge_exolix')
    .parse(process.argv)

  const options: CoinReportOptions = program.opts()

  // Parse plugin IDs
  const pluginIds = options.pid?.split(',').map(s => s.trim()) ?? []

  // Parse currency codes
  const currencyCodes = options.cc?.split(',').map(s => s.trim()) ?? []

  // Parse dates
  const startDate =
    options.startDate != null && options.startDate !== ''
      ? `${options.startDate}T00:00:00.000Z`
      : undefined
  const endDate =
    options.endDate != null && options.endDate !== ''
      ? `${options.endDate}T00:00:00.000Z`
      : undefined

  if (pluginIds.length === 0 && currencyCodes.length === 0) {
    console.error('Error: Must specify at least -pid or -cc')
    process.exit(1)
  }

  // Combine pluginIds and currencyCodes for tracking
  const filterIds = [...pluginIds, ...currencyCodes]

  // Get partition
  const partition = options.p

  datelog('Starting coin report query...')
  if (partition != null) datelog(`Partition: ${partition}`)
  if (startDate != null) datelog(`Start date (inclusive): ${startDate}`)
  if (endDate != null) datelog(`End date (exclusive): ${endDate}`)
  if (pluginIds.length > 0)
    datelog(`Filtering by pluginIds: ${pluginIds.join(', ')}`)
  if (currencyCodes.length > 0)
    datelog(`Filtering by currencyCodes: ${currencyCodes.join(', ')}`)

  const monthlyTotals: Map<string, MonthlyTotal> = new Map()
  // Map of month -> filterId -> {usdValue, txCount}
  const monthlyPluginBreakdown: Map<
    string,
    Map<string, PluginMonthlyData>
  > = new Map()

  // Build selector for query
  const andConditions: object[] = [{ status: 'complete' }]

  if (startDate != null) {
    andConditions.push({ isoDate: { $gte: startDate } })
  }
  if (endDate != null) {
    andConditions.push({ isoDate: { $lt: endDate } })
  }

  // Build $or conditions for filtering
  const orConditions: object[] = []

  if (pluginIds.length > 0) {
    orConditions.push({ depositChainPluginId: { $in: pluginIds } })
    orConditions.push({ payoutChainPluginId: { $in: pluginIds } })
  }

  if (currencyCodes.length > 0) {
    orConditions.push({ depositCurrency: { $in: currencyCodes } })
    orConditions.push({ payoutCurrency: { $in: currencyCodes } })
  }

  if (orConditions.length > 0) {
    andConditions.push({ $or: orConditions })
  }

  const selector = { $and: andConditions }

  let totalTxCount = 0

  for await (const batch of queryCouch({ partition, selector })) {
    datelog(`Processing batch of ${batch.length} transactions...`)

    for (const tx of batch) {
      totalTxCount++

      // Extract month from isoDate (YYYY-MM format)
      const month = tx.isoDate.slice(0, 7)

      // Update monthly totals
      let monthTotal = monthlyTotals.get(month)
      if (monthTotal == null) {
        monthTotal = { month, usdValue: 0, txCount: 0 }
        monthlyTotals.set(month, monthTotal)
      }
      monthTotal.usdValue += tx.usdValue
      monthTotal.txCount++

      // Initialize monthly plugin breakdown for this month if needed
      let monthPlugins = monthlyPluginBreakdown.get(month)
      if (monthPlugins == null) {
        monthPlugins = new Map<string, PluginMonthlyData>()
        for (const filterId of filterIds) {
          monthPlugins.set(filterId, { usdValue: 0, txCount: 0 })
        }
        monthlyPluginBreakdown.set(month, monthPlugins)
      }

      // Update breakdown - check pluginIds and currencyCodes
      const matchingFilters = new Set<string>()

      // Check pluginIds
      if (
        tx.depositChainPluginId != null &&
        pluginIds.includes(tx.depositChainPluginId)
      ) {
        matchingFilters.add(tx.depositChainPluginId)
      }
      if (
        tx.payoutChainPluginId != null &&
        pluginIds.includes(tx.payoutChainPluginId)
      ) {
        matchingFilters.add(tx.payoutChainPluginId)
      }

      // Check currency codes
      if (currencyCodes.includes(tx.depositCurrency)) {
        matchingFilters.add(tx.depositCurrency)
      }
      if (currencyCodes.includes(tx.payoutCurrency)) {
        matchingFilters.add(tx.payoutCurrency)
      }

      // Add usdValue to each matching filter for this month
      for (const filterId of matchingFilters) {
        const breakdown = monthPlugins.get(filterId)
        if (breakdown != null) {
          breakdown.usdValue += tx.usdValue
          breakdown.txCount++
        }
      }
    }
  }

  datelog(`Total transactions found: ${totalTxCount}`)

  // Sort monthly totals by month
  const sortedMonthlyTotals = Array.from(monthlyTotals.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  )

  // Build monthly plugin breakdown array sorted by month
  const sortedMonthlyPluginBreakdown: MonthlyPluginBreakdown[] = Array.from(
    monthlyPluginBreakdown.entries()
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pluginMap]) => {
      const plugins: { [pluginId: string]: PluginMonthlyData } = {}
      let totalUsd = 0
      let totalTx = 0
      for (const [pluginId, data] of pluginMap.entries()) {
        plugins[pluginId] = data
        totalUsd += data.usdValue
        totalTx += data.txCount
      }
      return {
        month,
        plugins,
        total: { usdValue: totalUsd, txCount: totalTx }
      }
    })

  // Calculate grand totals per filter
  const filterGrandTotals: { [filterId: string]: PluginMonthlyData } = {}
  for (const filterId of filterIds) {
    filterGrandTotals[filterId] = { usdValue: 0, txCount: 0 }
  }
  for (const monthData of sortedMonthlyPluginBreakdown) {
    for (const [filterId, data] of Object.entries(monthData.plugins)) {
      filterGrandTotals[filterId].usdValue += data.usdValue
      filterGrandTotals[filterId].txCount += data.txCount
    }
  }

  // Create results object
  const results = {
    queryInfo: {
      partition,
      startDate,
      endDate,
      pluginIds: pluginIds.length > 0 ? pluginIds : undefined,
      currencyCodes: currencyCodes.length > 0 ? currencyCodes : undefined,
      totalTransactions: totalTxCount,
      generatedAt: new Date().toISOString()
    },
    monthlyTotals: sortedMonthlyTotals,
    monthlyBreakdown: sortedMonthlyPluginBreakdown,
    filterGrandTotals,
    grandTotal: {
      usdValue: sortedMonthlyTotals.reduce((sum, m) => sum + m.usdValue, 0),
      txCount: totalTxCount
    }
  }

  // Write results to file if -out is specified
  if (options.out != null) {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    const outputPath = path.join(dataDir, options.out)
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
    datelog(`Results written to ${outputPath}`)
  }

  // Print summary to console
  console.log('\n=== MONTHLY TOTALS ===')
  console.log('Month\t\tUSD Value\t\tTx Count')
  console.log('-'.repeat(50))
  for (const m of sortedMonthlyTotals) {
    console.log(`${m.month}\t\t$${m.usdValue.toFixed(2)}\t\t${m.txCount}`)
  }

  console.log('\n=== BREAKDOWN BY MONTH ===')
  for (const monthData of sortedMonthlyPluginBreakdown) {
    console.log(`\n--- ${monthData.month} ---`)
    console.log('Filter\t\t\tUSD Value\t\tTx Count')
    console.log('-'.repeat(50))
    for (const filterId of filterIds) {
      const data = monthData.plugins[filterId]
      if (data != null && data.txCount > 0) {
        const usd = data.usdValue.toFixed(2)
        console.log(`${filterId.padEnd(16)}\t$${usd}\t\t${data.txCount}`)
      }
    }
    const totalUsd = monthData.total.usdValue.toFixed(2)
    console.log(`TOTAL\t\t\t$${totalUsd}\t\t${monthData.total.txCount}`)
  }

  console.log('\n=== FILTER GRAND TOTALS ===')
  console.log('Filter\t\t\tUSD Value\t\tTx Count')
  console.log('-'.repeat(50))
  for (const filterId of filterIds) {
    const data = filterGrandTotals[filterId]
    const usd = data.usdValue.toFixed(2)
    console.log(`${filterId.padEnd(16)}\t$${usd}\t\t${data.txCount}`)
  }

  console.log('\n=== GRAND TOTAL ===')
  console.log(`Total USD Value: $${results.grandTotal.usdValue.toFixed(2)}`)
  console.log(`Total Transactions: ${results.grandTotal.txCount}`)
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
