import { queryEngine } from './queryEngine'
import { ratesEngine } from './ratesEngine'

ratesEngine().catch(e => {
  console.log(e)
})
