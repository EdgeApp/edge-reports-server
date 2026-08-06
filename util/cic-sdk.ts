import axios, { AxiosInstance, AxiosResponse } from 'axios'
import crypto from 'crypto'

interface Result<T> {
  result: T
}

interface Error {
  error: {
    code: number
    message: string
  }
}

export interface PartialCicTransaction {
  id: string
  payinHash: string
  payoutHash: string
  payinAddress: string
  currencyFrom: string
  amountFrom: string
  payoutAddress: string
  currencyTo: string
  amountTo: string
  createdAt: number
}

export interface CicTransaction extends PartialCicTransaction {
  trackUrl: string
  type: 'fixed' | 'float'
  moneyReceived: number
  moneySent: number
  rate: string
  payinConfirmations: string
  status: string
  payinExtraId?: string
  payinExtraIdName?: string
  payoutHashLink: string
  refundHashLink?: string
  amountExpectedFrom: string
  payoutExtraId?: string
  payoutExtraIdName?: string
  refundHash?: string
  refundAddress: string
  refundExtraId?: string
  amountExpectedTo: string
  networkFee: string
  apiExtraFee: string
  totalFee: string
  canPush: boolean
  canRefund: boolean
}
export class CriptointercambioClient {
  private readonly client: AxiosInstance = axios.create({
    baseURL: 'https://api.criptointercambio.com/v2',
    timeout: 20000
  })

  constructor(
    private readonly apiKey: string,
    private readonly secret: string
  ) {}

  getSigningHeaders(body: Record<string, any>): Record<string, string> {
    const signature = crypto.sign('sha256', Buffer.from(JSON.stringify(body)), {
      key: this.secret,
      type: 'pkcs8',
      format: 'der'
    })
    return {
      'X-Api-Key': this.apiKey,
      'X-Api-Signature': signature.toString('base64')
    }
  }

  private async request<T>(
    method: string,
    params: Record<string, any>
  ): Promise<AxiosResponse<T>> {
    const body = {
      jsonrpc: '2.0',
      id: 'cic-transactions',
      method,
      params
    }
    const headers = this.getSigningHeaders(body)
    return this.client.post<T>('/', body, { headers })
  }

  async getTransactions(
    limit: number,
    offset: number,
    currency?: string,
    address?: string,
    extraId?: string
  ): Promise<CicTransaction[]> {
    const result = await this.request<Error | Result<CicTransaction[]>>(
      'getTransactions',
      {
        currency,
        address,
        extraId,
        offset,
        limit
      }
    )
    if ('error' in result.data) {
      throw new Error(
        `[${result.data.error.code}]: Criptointercambio error: ${result.data.error.message}`
      )
    }

    return result.data.result
  }
}
