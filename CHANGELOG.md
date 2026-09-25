# edge-reports-server

## Unreleased

- added: CI job that runs the mocha test suite on every pull request
- added: Add Revolut fiat payment provider
- added: Add Swapter reporting
- added: Add NYM Swap (nymswap) reporting
- added: Isolated v2 reports dashboard at /v2/ (real /v1 API data, apiKey auth with redirect on a bad key)
- added: Partner-reported revenue (revenueUsd/revenueSource) on StandardTx, summed through the analytics cache; Revolut reports it, and the v2 dashboard uses reported figures where present with volume x revShareRate as the estimate elsewhere
- added: Document the verified reporting-API status and unblock path for nexchange, Simplex and Bridgeless
- added: v2 dashboard chain filter, using chained pair keys (CODE@pluginId) in the analytics cache
- added: v2 dashboard Networks section and a per-chart Day/Week/Month interval with range-based defaults
- added: rewindProgress script to rewind partner query cursors for a backfill
- changed: Update sideshift plugin with new optional API fields
- changed: Query both old and new Sideshift affiliate accounts and merge completed orders to preserve full shift history across an affiliate-account rotation
- changed: Add signature header support to Exolix
- changed: Add index for orderId
- changed: Add EVM chainId, pluginId, and tokenId fields to StandardTx
- changed: Update Lifi to provide chainId, pluginId, and tokenId
- changed: Use rates V3 for transactions with pluginId/tokenId
- changed: Store chain pluginIds on new Paybis, Nym, and Kado orders
- changed: v2 Select all applies only to the currently filtered providers and pairs
- changed: Show ChangeNOW with that spelling in the v2 provider list
- changed: v2 filter dropdowns read "Select filtered" while searching, and it selects exactly the matching rows
- fixed: Classify banxa2, banxa3, gebo and Ionia gift cards as fiat in the v2 dashboard filter, by projecting the provider types from the v1 partner registry instead of a second hand-written copy
- fixed: Quarantine an unprocessable partner transaction instead of halting ingestion behind it in ChangeNow, Rango and Xgram, so one bad row no longer stops every newer transaction from being recorded
- fixed: Report LetsExchange orders whose network cannot be resolved instead of silently dropping their chain and token data
- fixed: Tolerate unexpected types on nexchange's nullable response fields, and treat a zero contract address as the chain's native asset instead of minting a tokenId for the gas asset
- fixed: Moonpay by adding Revolut payment type
- fixed: Use v2 rates API
- fixed: Repair the broken mocha test suite (correct util.test.ts import and stale analytics fixtures) so npm test passes
- fixed: Record Robinhood Chain orders from ChangeNOW, Rango, LI.FI, SideShift, LetsExchange and Nexchange
- fixed: Skip and log an unprocessable LI.FI transfer instead of stalling LI.FI ingestion
- fixed: Map Moonpay sepa_open_banking_payment to SEPA and skip unprocessable Moonpay orders
- fixed: Store chain and token ids on Changelly orders

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
