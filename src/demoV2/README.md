# Edge Reports v2 dashboard

An isolated redesign of the reports dashboard, served at `/v2/`. It is fully
separate from the v1 demo (`src/demo`): its own entry point, its own parcel
bundle (`dist/v2/`), and its own URL. v1 routes, components and build output are
untouched. Where behavior overlaps, code is duplicated into v2 rather than
refactoring anything v1 depends on.

## What it is

The full rendering and interaction engine is ported from the design prototype:
one summary card, then Providers, Networks and Currency pairs sections, each with
a trend chart (stacked bars or lines), a share card (donut + ranked bars, hover
linked), and a detail table (the network and pair tables paginated). Global
filters (range, type, providers, networks, pairs) scope every card. Top-8-plus-
Other color rules keep the chart, share card and table in agreement.

Each trend chart has its own interval control (Auto, Day, Week, Month). Auto
follows the range: daily up to 31 days, weekly up to 180 days, monthly beyond
(so 7d/30d are daily, 90d and this quarter weekly, 12m/24m monthly). Weeks are
ISO weeks (Monday start, UTC). The tooltip names the bucket and flags a week or
month the range cuts short, since its bar covers fewer days than its peers.

A network is the chain an asset lives on (the `@pluginId` half of a chained
pair key). A pair whose legs sit on one network counts fully toward it; a
cross-network pair (e.g. BTC to ETH) counts half toward each side, so the
network totals add up to the pair totals instead of counting a swap twice. A
leg with no network (fiat, or an order stored before chain ids were recorded)
yields to the other leg, so a USD to BTC buy counts fully toward Bitcoin. Only
pairs with no network on either leg land in "Unknown network". The network
filter matches pairs the same way.

The only thing that changed from the prototype is the data source: the baked-in
sample generator is replaced by the real `/v1` reporting API.

## Data flow

- `GET /v1/getAppId?apiKey=`: validates the key. Returns plain text on a bad
  key (400); v2 checks the response before parsing and redirects to the
  key-entry screen instead of hanging (the v1 spinner-forever bug).
- `GET /v2/config?apiKey=`: per-provider rev-share rates and fiat/swap
  classification. Isolated v2 route; no v1 route touched.
- `GET /v1/getPluginIds?apiKey=`: the app's registered providers.
- `POST /v1/analytics`: one call for all providers, `timePeriod: "day"`, last
  24 months. v2 rebuckets to day, week or month client-side, per chart.

Auth reuses v1's simple apiKey model: the key lives in the `apiKey` cookie (a
`?apiKey=` query param also seeds it). No new auth system.

### Est. revenue

Where the partner's API reports Edge's actual fee per order (e.g. Revolut's
`partner_fee`, pre-converted to USD), the plugin stores it on the transaction as
`revenueUsd` with `revenueSource: 'reported'`, the cache engine sums it into the
analytics buckets, and the dashboard uses it directly, marked with a check in
the provider table. That figure is a fact about the order and never recomputed.

For partners that report no fee, revenue is estimated at read time as
`volume * revShareRate`. The rate lives on the app doc in `reports_apps`, as an
optional `revShareRate` beside that partner's `apiKeys`:

```json
"partnerIds": {
  "moonpay": { "apiKeys": { "apiKey": "..." }, "revShareRate": 0.008 }
}
```

Per app and per partner, because the rate is a property of the deal. Estimating
at read time rather than at ingest means correcting a rate fixes history
immediately, while reported figures stay immutable. The rates are deliberately
not in source or `config.json`: they are commercial terms and this repo is
public. A partner with neither reported fees nor a rate contributes 0.

## Local testing

Run against a local CouchDB (never point at production).

```bash
# 1) Build v1 + v2 bundles (v2 lands in dist/v2/).
npm run build.dist

# 2) Serve the API + built dashboards.
npm run start.api        # http://localhost:8008

# 3) Open the dashboard and enter an API key registered in reports_apps.
open http://localhost:8008/v2/
```

The dashboard needs an app registered in the `reports_apps` database: a document
whose `_id` is the API key, with an `appId` and a `partnerIds` map. That is what
`getAppId`, `getPluginIds` and `validateApiKey` read. Populate transaction data
with the normal engines (`npm run start` to query partners, `npm run start.cache`
to build the hour/day/month cache buckets that `/v1/analytics` serves).

For live-reload development of the v2 UI only: `npm run demo.v2` (Parcel dev
server on :1235). Point it at a running API via same-origin or a proxy; the
`build.dist` + `start.api` path above is the end-to-end test.

Partner credentials belong in the `reports_apps` document, not in `config.json`
and not in any tracked file. Writing real keys into production is a human ops
step. A null apiKey makes a partner plugin skip silently and return no rows, so
"no data" and "never wired" look the same; check the key is populated before
concluding a plugin is broken.
