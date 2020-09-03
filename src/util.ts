const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

const snoozeReject: Function = async (ms: number) =>
  new Promise((resolve: Function, reject: Function) => setTimeout(reject, ms))

const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

export { datelog, snooze, snoozeReject }
