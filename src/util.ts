const snoozeReject: Function = async (ms: number) =>
  new Promise((resolve: Function, reject: Function) => setTimeout(reject, ms))

const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

export { snooze, snoozeReject }
