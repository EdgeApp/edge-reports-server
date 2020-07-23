import { asArray, asNumber, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 30 // 30 days
const BITY_TOKEN_URL = 'https://connect.bity.com/oauth2/token'
const BITY_API_URL = 'https://reporting.api.bity.com/exchange/v1/summary/monthly/'
const PAGE_SIZE = 100

export async function queryBity(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let tokenParams
  let credentials
  let authToken
  let queryYear
  let queryMonth
 
  if (typeof pluginParams.apiKeys.clientId === 'string' && typeof pluginParams.apiKeys.clientSecret === 'string') {

    queryYear = pluginParams.settings.offset.lastCheckedYear ? pluginParams.settings.offset.lastCheckedYear : "2019"
    queryMonth = pluginParams.settings.offset.lastCheckedMonth ? pluginParams.settings.offset.lastCheckedMonth : "01"

    credentials = {
        'grant_type': 'client_credentials',
        scope: 'https://auth.bity.com/scopes/reporting.exchange',
        client_id: pluginParams.apiKeys.clientId,
        client_secret: pluginParams.apiKeys.clientSecret
      }

    tokenParams = Object.keys(credentials).map((key) => {
        return encodeURIComponent(key) + '=' + encodeURIComponent(credentials[key])
    }).join('&')

        const tokenResponse = await fetch(BITY_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: tokenParams
        })
        const tokenReply = await tokenResponse.json()
        authToken = tokenReply.access_token

  } else {
    return {
      settings: { offset: {lastCheckedMonth: "01", lastCheckedYear: "2019"} },
      transactions: []
    }
  }

  let page = 1

  const monthlyResponse = await fetch(`${BITY_API_URL}${queryYear}-${queryMonth}/orders?page=${page}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${authToken}` }
        }
      )
      let monthlyTxs = []
      if (monthlyResponse.ok) {
        monthlyTxs = await monthlyResponse.json().catch(e => [])
      }


  return {
    settings: { offset: {lastCheckedMonth: "01", lastCheckedYear: "2019"} },
    transactions: []
  }
}

export const bity: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBity,
  // results in a PluginResult
  pluginName: 'Bity',
  pluginId: 'bity'
}