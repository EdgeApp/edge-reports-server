import { queryEngine } from './queryEngine'
import { ratesEngine } from './ratesEngine'

queryEngine().catch(e => {
  console.log(e)
})
