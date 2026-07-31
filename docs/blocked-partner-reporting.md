# Blocked partner reporting APIs

Three partners have no working reporting plugin, and none of them is blocked on
work this repo can do alone. This records what each one actually needs, with the
evidence, so the next person does not repeat the investigation.

Everything below was established by a live request against the partner's own
API, not from documentation. Requests were read-only and used the credentials
already in `edge-react-gui/env.json`. Every claim here is reproducible with the
commands shown.

Last verified 2026-07-31.

## Summary

| Partner | Plugin state | Blocked on | Who unblocks it |
| --- | --- | --- | --- |
| nexchange | Not in this repo, see [#229](https://github.com/EdgeApp/edge-reports-server/pull/229) | API key lacks the reporting scope | nexchange support |
| Simplex | `src/partners/simplex.ts`, wrong host and auth | A server-side reporting key that does not exist yet | Simplex partner support |
| Bridgeless | No plugin | The partner API cannot express an incremental report | Bridgeless engineering |

## nexchange

The plugin is not in this repo on purpose. Two ports of it exist, both descended
from [#217](https://github.com/EdgeApp/edge-reports-server/pull/217), and
[#229](https://github.com/EdgeApp/edge-reports-server/pull/229) is the live one.
Shipping a second copy would only conflict with it.

Two fixes found while porting are worth carrying into #229 if they are not there
already:

- Use `asMaybe` rather than `asOptional(asEither(asString, asNull), null)` on the
  nullable response fields. `asOptional` still throws on an unexpected type, so
  one odd row aborts the whole page, exhausts the retries and stalls the window.
- Treat a zero contract address (`0x000…0`) as the chain's native asset. Without
  it `createTokenId` mints a non-null tokenId for the gas asset and mis-routes
  its rates and volume. Banxa and Moonpay special-case this the same way.

The remaining blocker is credentials, and it is independent of whose code lands.
The key in `env.json` (`NEXCHANGE_INIT.apiKey`) authenticates but is not
authorised for the reporting resource:

```
GET https://api.n.exchange/en/api/v1/audit-orders
-> HTTP 403 {"detail":"API key is not authorised for this resource"}
```

A 403 rather than a 401 is the point: the key is recognised, the scope is
missing. There is no self-serve key console.

**Ask:** email support@n.exchange or the account manager for a reporting-scoped
key, and ask them to confirm the exact header and path for audit-orders. The
public v1/v2 OpenAPI specs document `Authorization: ApiKey <key>` and do not
mention `x-api-key` at all, while the ported plugin sends `x-api-key`, so the
header is worth confirming in the same message.

## Simplex

The shipped plugin is wrong in three independent ways, and only the first two can
be fixed without a key.

**Host and path.** `turnkey.api.simplex.com/transactions` is not the reporting
API any more. The current one is `/reporting/v1/payments`, and it is not on the
turnkey host:

```
GET https://turnkey.api.simplex.com/reporting/v1/payments
-> HTTP 403 {"message":"Missing Authentication Token"}     # API Gateway for "no such route"

GET https://sandbox.test-simplexcc.com/reporting/v1/payments
-> HTTP 401 {"message":"Authorization header is missing"}  # route exists, wants auth
```

**Auth scheme.** The plugin sends `X-API-KEY`. The reporting API ignores that
header entirely and wants `Authorization: ApiKey <key>`. The error text
distinguishes the two cases exactly:

```
-H 'x-api-key: <anything>'            -> 401 "Authorization header is missing"
-H 'Authorization: Bearer <anything>' -> 401 "Authorization Apikey has invalid format"
-H 'Authorization: <anything>'        -> 401 "Authorization Apikey has invalid format"
-H 'Authorization: ApiKey <anything>' -> 401 "Invalid API key"
```

Only the last one gets past format validation to key validation, which is what
identifies it as the correct scheme.

**Credential.** This is the blocker. `env.json` holds only the publishable
checkout credentials (`PLUGIN_API_KEYS.simplex.publicKey`, a `pk_live_` value,
plus the `jwtTokenProvider` flow). Reporting needs a separate server-side
partner key that Simplex issues on request and locks to a source IP. There is no
dashboard that mints one.

The plugin is not rewritten here because the response body has never been seen.
Writing cleaners for an unobserved payload would be inventing the schema, and a
half-migrated plugin is worse than the current one.

**Ask:** request a server-side reporting ApiKey from Simplex partner support,
supply the reports-server egress IP for their allowlist, and ask for one sample
`/reporting/v1/payments` response. The sample alone unblocks the rewrite; the key
unblocks verification. The IP lock also answers the key-exposure concern that got
Simplex reporting disabled in the first place.

## Bridgeless

Bridgeless is a public Cosmos-SDK L1, so there is no key to obtain. The
unauthenticated LCD at `https://rpc-api.node0.mainnet.bridgeless.com` does carry
Edge's attribution: Edge is referral 2 (`BRIDGELESS_INIT.referralId` in
`env.json`), and the module confirms it:

```
GET /cosmos/bridge/referrals/2
-> {"referral":{"id":2,"withdrawal_address":"bridge1rcu…","commission_rate":"0.66"}}

GET /cosmos/bridge/referrals/rewards/2
-> accrued commission per token, currently 4 tokens with a non-zero to_claim
```

So aggregate commission is readable today. Per-order reporting is not, for three
reasons that compound:

- **No timestamp.** A bridge transaction record carries `deposit_block` and
  `deposit_chain_id` but no time of any kind. `StandardTx` requires `isoDate` and
  `timestamp`, so every record would need a block lookup on its own origin chain
  to be datable. The Cosmos tx index cannot supply it either: bridge state does
  not move through user transactions, and sampled blocks contain none.
- **No referral filter.** `/cosmos/bridge/transactions` returns the whole set
  (100,210 records) with no server-side filter, so attribution means scanning
  everything and filtering `referral_id == 2` client-side.
- **No incremental cursor.** The store is hash-ordered, not append-ordered:
  offsets 0, 50,000 and 100,000 return interleaved chains and unrelated block
  heights. There is no watermark to resume from, so every run is a full rescan.

Together those make a plugin infeasible rather than merely expensive. A 20,000
record sample (20% of the store) contained exactly **one** record with
`referral_id == 2`, so the current shape would rescan 100,000+ untyped records
per cycle to recover a handful of Edge orders, and still could not date them.

**Ask:** ask Bridgeless engineering for any one of these, in preference order:
a `referral_id` filter plus a timestamp on `/cosmos/bridge/transactions`; an
append-ordered or height-keyed cursor so the scan can resume; or an off-chain
partner reporting endpoint. Also worth asking why on-chain `referral_id == 2` is
so rare while `/referrals/rewards/2` shows real accrued commission, since that
gap suggests attribution is recorded somewhere this endpoint does not expose.
