import { asArray, asNumber, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

const asIntegrators = asObject({
  feeBalances: asArray(
    asObject({
      tokenBalances: asArray(
        asObject({
          amountUsd: asString,
          token: asObject({
            name: asString,
            symbol: asString,
            address: asString,
            chainId: asNumber
          })
        })
      )
    })
  )
})

const asTransactionRequest = asObject({
  transactionRequest: asObject({
    data: asString,
    to: asString
  })
})

const url = 'https://li.quest'

const main = async (): Promise<void> => {
  const response = await fetch(`${url}/v1/integrators/edgeapp`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text)
  }

  const minAmount = Number(process.argv[2] ?? 100)

  const result = await response.json()
  const integrators = asIntegrators(result)
  let balUsd = 0
  const tokenAddresses: { [chainId: string]: string[] } = {}
  console.log(JSON.stringify(integrators, null, 2))
  integrators.feeBalances.forEach(fb => {
    fb.tokenBalances.forEach(tb => {
      const amount = Number(tb.amountUsd)
      if (amount >= minAmount) {
        balUsd += amount
        if (tokenAddresses[tb.token.chainId] === undefined) {
          tokenAddresses[tb.token.chainId] = []
        }
        tokenAddresses[tb.token.chainId].push(tb.token.address)
        console.log(
          `chainId:${tb.token.chainId} ${tb.token.symbol} (${tb.token.address}): $${tb.amountUsd}`
        )
      }
    })
  })
  console.log(`Total: $${balUsd}\n`)
  for (const chainId in tokenAddresses) {
    console.log(`\n**********************************`)
    console.log(`chainId:${chainId}\n`)
    const tokens = tokenAddresses[chainId].join(',')
    const response = await fetch(
      `${url}/v1/integrators/edgeapp/withdraw/${chainId}?tokenAddresses=${tokens}`
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text)
    }

    const result = asTransactionRequest(await response.json())
    console.log(`to address: ${result.transactionRequest.to}`)
    console.log(`data: ${result.transactionRequest.data}`)
  }
}

main().catch(e => console.log(e))
