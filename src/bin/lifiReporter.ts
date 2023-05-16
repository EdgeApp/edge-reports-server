import { asArray, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

const asIntegrators = asObject({
  feeBalances: asArray(
    asObject({
      tokenBalances: asArray(
        asObject({
          amountUsd: asString,
          token: asObject({
            name: asString,
            symbol: asString
          })
        })
      )
    })
  )
})

const main = async (): Promise<void> => {
  const response = await fetch('https://li.quest/v1/integrators/edgeapp')
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text)
  }

  const result = await response.json()
  const integrators = asIntegrators(result)
  let balUsd = 0
  console.log(JSON.stringify(integrators, null, 2))
  integrators.feeBalances.forEach(fb => {
    fb.tokenBalances.forEach(tb => {
      balUsd += Number(tb.amountUsd)
      console.log(`${tb.token.name} (${tb.token.symbol}): $${tb.amountUsd}`)
    })
  })
  console.log(`Total: $${balUsd}`)
}

main().catch(e => console.log(e))
