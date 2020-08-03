import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'

function main(): void {
  const app = express()

  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(cors())
}
// main().catch(e => console.log(e))
main()
