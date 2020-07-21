import fetch from 'node-fetch'

import CONFIG from '../../config.json'

//@ts-ignore
const BITS_OF_GOLD_API_KEY = CONFIG.bog.apiKey

const dateRegex = RegExp(/([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))/)

async function queryBog(): Promise<void> {
  // Grab args and verify format
  const args = process.argv
  const startDate = args[2]
  const endDate = args[3]
  if (dateRegex.exec(startDate) === null || dateRegex.exec(endDate) === null) {
    console.log(`Invalid date format. Must use YYYY-MM-DD`)
    process.exit()
  }

  // Fetch data
  const url = `http://webapi.bitsofgold.co.il/v1/sells/by_provider/?provider=${BITS_OF_GOLD_API_KEY}&filter%5Bcreated_at_gteq%5D=%27${startDate}%27&filter%5Bcreated_at_lt%5D=%27${endDate}`
  const result = await fetch(url, {
    method: 'GET'
  })
  const txs = await result.json()

  // Fetch exchange rates and totals
  const totals = { USD: 0, BTC: 0 }
  try {
    let txCount = 0
    for (const tx of txs.data) {
      const {
        fiat_type: fiatCode,
        coin_type: cryptoCode,
        timestamp,
        fee
      } = tx.attributes
      const dateString = new Date(timestamp).toISOString()

      if (!(fiatCode in totals)) {
        totals[fiatCode] = 0
      }
      if (!(cryptoCode in totals)) {
        totals[cryptoCode] = 0
      }

      totals[fiatCode] += fee
      const fiatToUSD = await queryFiatRate(fiatCode, dateString)
      const feeInUSD = fiatToUSD * fee
      totals.USD += feeInUSD
      totals.BTC += feeInUSD / (await queryCryptoRate(cryptoCode, dateString))

      // Display progress
      txCount++
      const progress = (txCount / txs.data.length) * 100
      process.stdout.write(`\rProgress: ${progress.toFixed(0)}%`)
    }

    // Print totals
    console.log(`\n*** GRAND TOTAL ***\n${JSON.stringify(totals)}`)
  } catch (e) {
    console.log(e.message)
  }
  process.exit()
}

async function queryFiatRate(
  fiatCode: string,
  dateString: string
): Promise<number> {
  const result = await fetch(
    `https://rates1.edge.app/v1/exchangeRate?currency_pair=${fiatCode}_USD&date=${dateString}`,
    {
      method: 'GET'
    }
  )
  if (result.ok !== true) {
    throw new Error(`queryFiatRate failed with status code ${result.status}`)
  }
  const json = await result.json()
  return parseFloat(json.exchangeRate)
}

async function queryCryptoRate(
  cryptoCode: string,
  dateString: string
): Promise<number> {
  const result = await fetch(
    `https://rates1.edge.app/v1/exchangeRate?currency_pair=${cryptoCode}_USD&date=${dateString}`,
    {
      method: 'GET'
    }
  )
  if (result.ok !== true) {
    throw new Error(`queryCryptoRate failed with status code ${result.status}`)
  }
  const json = await result.json()
  return parseFloat(json.exchangeRate)
}

queryBog().catch(e => console.log(e))
