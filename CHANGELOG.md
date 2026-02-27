# edge-reports-server

## Unreleased

- changed: Add index for orderId
- changed: Add EVM chainId, pluginId, and tokenId fields to StandardTx
- changed: Update Lifi to provide chainId, pluginId, and tokenId
- changed: Use rates V3 for transactions with pluginId/tokenId
- fixed: Moonpay by adding Revolut payment type
- fixed: Use v2 rates API

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
