export class HttpError extends Error {
  public status: number
  public error: Error

  constructor(status: number, messageOrError: string | Error) {
    if (messageOrError instanceof Error) {
      super(messageOrError.message)
      this.error = messageOrError
    } else {
      super(messageOrError)
      this.error = new Error(messageOrError)
    }
    this.status = status
  }
}
