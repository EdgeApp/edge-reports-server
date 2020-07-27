import { asArray, asNumber, asObject, asOptional, asString, asBoolean, asUnknown, asUndefined, asNull } from 'cleaners'
import fetch from 'node-fetch'
import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const pageLimit = 100

const asTransakOrder = asObject({
    status: asString,
    id: asString,
    fromWalletAddress: asOptional,
    fiatCurrency: asString,
    fiatAmount: asNumber,
    walletAddress: asString,
    cryptocurrency: asString,
    cryptoAmount: asNumber,
    completedAt: asOptional(asString)
})

const asTransakResult = asObject({
    response: asArray(asUnknown)
})


export async function queryTransak(
    pluginParams: PluginParams
): Promise<PluginResult> {
    const ssFormatTxs: StandardTx[] = []
    let apiKey: string

    let { offset = 0 } = pluginParams.settings
    if (typeof pluginParams.apiKeys.transak_api_secret === 'string') {
        apiKey = pluginParams.apiKeys.transak_api_secret
    } else {
        return {
            settings: { offset: offset },
            transactions: []
        }
    }

    let resultJSON
    let done = false

    while (!done) {
        let url = `https://api.transak.com/api/v1/partners/orders/?partnerAPISecret=${apiKey}&limit=${pageLimit}&skip=${offset}`
        let jsonObj: ReturnType<typeof asTransakResult>
        try {
            const result = await fetch(url)
            resultJSON = await result.json()
            jsonObj = asTransakResult(resultJSON)
        } catch (e) {
            console.log(e)
            break
        }
        const txs = jsonObj.response
        for (const rawtx of txs) {
            let tx
            try {
                tx = asTransakOrder(rawtx)
            } catch (e) {
                console.log(e)
                continue
            }
            if (tx.status === 'COMPLETED') {
                const ssTx: StandardTx = {
                    status: 'complete',
                    inputTXID: tx.id,
                    inputAddress: tx.fromWalletAddress.toString(),
                    inputCurrency: tx.fiatCurrency,
                    inputAmount: tx.fiatAmount,
                    outputAddress: tx.walletAddress,
                    outputCurrency: tx.cryptocurrency,
                    outputAmount: tx.cryptoAmount.toString(),
                    timestamp: new Date(tx.completedAt).getTime() / 1000,
                    isoDate: (new Date(tx.completedAt)).toISOString()
                }
                ssFormatTxs.push(ssTx)
                if (tx.length < pageLimit) break

            }
        }
        if (txs.length < pageLimit) {
            done = true
        }
        offset += txs.length
    }

    offset = Math.floor(offset / 100) * 100
    const out: PluginResult = {
        settings: { offset: offset },
        transactions: ssFormatTxs
    }
    return out
}

export const transak: PartnerPlugin = {
    // queryFunc will take PluginSettings as arg and return PluginResult
    queryFunc: queryTransak,
    // results in a PluginResult
    pluginName: 'Transak',
    pluginId: 'transak'
}