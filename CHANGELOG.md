# edge-reports-server

## Unreleased

- added: CI job that runs the mocha test suite on every pull request
- added: Add Revolut fiat payment provider
- added: Add Swapter reporting
- added: Add NYM Swap (nymswap) reporting
- added: Isolated v2 reports dashboard at /v2/ (real /v1 API data, apiKey auth with redirect on a bad key)
- added: Partner-reported revenue (revenueUsd/revenueSource) on StandardTx, summed through the analytics cache; Revolut reports it, and the v2 dashboard uses reported figures where present with volume x revShareRate as the estimate elsewhere
- changed: Update sideshift plugin with new optional API fields
- changed: Query both old and new Sideshift affiliate accounts and merge completed orders to preserve full shift history across an affiliate-account rotation
- changed: Add signature header support to Exolix
- changed: Add index for orderId
- changed: Add EVM chainId, pluginId, and tokenId fields to StandardTx
- changed: Update Lifi to provide chainId, pluginId, and tokenId
- changed: Use rates V3 for transactions with pluginId/tokenId
- fixed: Moonpay by adding Revolut payment type
- fixed: Use v2 rates API
- fixed: Repair the broken mocha test suite (correct util.test.ts import and stale analytics fixtures) so npm test passes

## 0.2.0

- added: Add Lifi reporting
- added: Added `/v1/getTxInfo` route.
- added: Paybis support
- added: Kado reporting
- changed: Paginate caching engine to prevent timeouts
- changed: Create caching engine 'initialized' document entry for each app:partner pair
- fixed: Properly handle null values in 'number' typed fields

## 0.1.0

- Initial release
