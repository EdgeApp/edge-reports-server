const BATCH_ADVANCE = 1000

const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

const snoozeReject = async (ms: number): Promise<void> =>
  new Promise((resolve: Function, reject: Function) => setTimeout(reject, ms))

const snooze = async (ms: number): Promise<void> =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

const pagination = async (txArray: any[], partition: any): Promise<void> => {
  let numErrors = 0
  for (let offset = 0; offset < txArray.length; offset += BATCH_ADVANCE) {
    let advance = BATCH_ADVANCE
    if (offset + BATCH_ADVANCE > txArray.length) {
      advance = txArray.length - offset
    }
    const docs = await partition.bulk({
      docs: txArray.slice(offset, offset + advance)
    })
    datelog(`Processed ${offset + advance} txArray.`)
    for (const doc of docs) {
      if (doc.error != null) {
        datelog(
          `There was an error in the batch ${doc.error}.  id: ${doc.id}. revision: ${doc.rev}`
        )
        numErrors++
      }
    }
  }
  datelog(`total errors: ${numErrors}`)
}

export { datelog, snooze, snoozeReject, pagination }
