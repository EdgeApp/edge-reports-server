# Blocked partner reporting APIs

Two partners have no working reporting plugin, and neither is blocked on work
this repo can do alone. Bridgeless has no partner API either, but a chain scan
replaces it; its section records what that scan relies on. This records what
each one actually needs, with the evidence, so that the next person does not
repeat the investigation.

Everything below was established by a live request against the partner's own
API, not from documentation. Requests were read-only and used the credentials
already in `edge-react-gui/env.json`. Every claim here is reproducible with the
commands shown.

Last verified 2026-07-31.

## Summary

| Partner | Plugin state | Blocked on | Who unblocks it |
| --- | --- | --- | --- |
| nexchange | Ships here, but unverifiable | API key lacks the reporting scope | nexchange support |
| Simplex | `src/partners/simplex.ts`, wrong host and auth | A server-side reporting key that does not exist yet | Simplex partner support |

## nexchange

The plugin ships in this branch, descended from
[#217](https://github.com/EdgeApp/edge-reports-server/pull/217). It was ported
twice; this branch carries one copy and there is nothing left to deduplicate.

Two fixes found while porting are applied here, and are worth carrying into any
other surviving copy:

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
mention `x-api-key` at all, while the ported plugin sends `x-api-key`. Confirm
the header in the same message.

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

Reported by `src/partners/bridgeless.ts` since 2026-10-21, with no partner API
and no key. Bridgeless is a public Cosmos-SDK L1 and Edge is referral 2
(`BRIDGELESS_INIT.referralId` in `env.json`, confirmed by
`GET /cosmos/bridge/referrals/2` on the LCD).

The LCD's `/cosmos/bridge/transactions` list cannot drive a report. It has no
referral filter, no timestamp and no cursor, and it is hash-ordered: every run
would rescan 100,000+ records. The chain's own transactions can, though. Every
deposit is recorded on chain by a
`/core.bridge.MsgSubmitTransactions` transaction (one per validator) carrying
the full bridge record, `referral_id` included, and the archive node's
Tendermint RPC can find those by height:

```
GET https://rpc.node0.mainnet.bridgeless.com/tx_search
  ?query="message.action='/core.bridge.MsgSubmitTransactions' AND tx.height>=A AND tx.height<B"
```

The plugin builds the report from three reads:

- **Find.** Scan height windows from the last run's height, decode each
  transaction's protobuf locally and keep `referral_id == 2`. Event attributes
  do not carry the referral id, which leaves the filter to the client. Height
  6,400,000 (2026-06-20) predates Edge's referral id, and the first run starts
  there. A 200,000 block window takes about 3 seconds; the first run reads the
  whole history in under two minutes.
- **Date.** The block time of the Submit transaction, from `/blockchain`.
- **Status.** The bridge state record,
  `GET /cosmos/bridge/transactions/{chain}/{hash}/{index}` on the LCD. A
  withdrawal hash is a finished payout; a signature without one is a payout
  approved but not yet claimed. Unfinished orders are re-read every run.

A full scan of the bridge store on 2026-10-21 found 49 records with
`referral_id == 2`, and the plugin's first run reported the same 49.

Commission is not reported per order. The record's `commission_amount` is the
bridge's fee in payout token units, and the referral's `commission_rate` sets
Edge's share of it. The dashboard estimates revenue from the app's
`revShareRate`, as for any other partner.
