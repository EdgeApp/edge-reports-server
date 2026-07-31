# Edge Reports v2 dashboard

An isolated redesign of the reports dashboard, served at `/v2/`. It is fully
separate from the v1 demo (`src/demo`): its own entry point, its own parcel
bundle (`dist/v2/`), and its own URL. v1 routes, components and build output are
untouched. Where behavior overlaps, code is duplicated into v2 rather than
refactoring anything v1 depends on.

## What it is

The full rendering and interaction engine is ported from the design prototype:
one summary card, a Providers section and a Currency pairs section, each with a
trend chart (stacked bars or lines), a share card (donut + ranked bars, hover
linked), and a detail table (the pair table paginated). Global filters (range,
type, providers, pairs) scope every card. Top-8-plus-Other color rules keep the
chart, share card and table in agreement.

The only thing that changed from the prototype is the data source: the baked-in
sample generator is replaced by the real `/v1` reporting API.

## Data flow

- `GET /v1/getAppId?apiKey=` — validates the key. Returns plain text on a bad
  key (400); v2 checks the response before parsing and redirects to the
  key-entry screen instead of hanging (the v1 spinner-forever bug).
- `GET /v2/config?apiKey=` — per-provider rev-share rates and fiat/swap
  classification. Isolated v2 route; no v1 route touched.
- `GET /v1/getPluginIds?apiKey=` — the app's registered providers.
- `POST /v1/analytics` — one call for all providers, `timePeriod: "day"`, last
  24 months. v2 rebuckets to month client-side for the longer presets.

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
