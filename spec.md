Got it — this is a solid idea, it just needs to be _cleanly framed_ so the intent, flow, and threat model are obvious. Below is a **tight, implementation-ready rewrite** that preserves your logic while clarifying _why_ each step exists and how the pieces fit together.

I’ll give you:

1. **High-level intent (what problem this solves)**
2. **Revised protocol description (server ↔ client)**
3. **Clarified role of prefix hash + time range**
4. **Cleaned-up query logic**
5. **Result masking + fake document strategy**
6. **Short “why this works” summary**

You can lift this almost verbatim into a design doc.

---

## 1. High-level intent

The goal is to allow a client to retrieve information about **one specific transaction** while:

- Hiding which transaction they care about
- Preventing the server from learning the client’s address or exact transaction time
- Keeping the anonymity set ~256 on average
- Scaling efficiently as transaction volume grows

This is achieved by combining:

- **Time-range obfuscation**
- **Address prefix hashing**
- **Client-side matching via masked identifiers**
- **Server-side padding with fake documents**

---

## 2. Server-side parameters

The server dynamically computes anonymity parameters based on current traffic density.

### Server computes and returns:

- **`L`** — address prefix hash length
- **`R`** — time range duration such that:

  > The expected number of transactions matching `(prefix length L, time range R)` ≈ 256

Key property:

- Increasing `L` (more prefix bits) reduces matching addresses
- `R` is scaled upward to compensate

Example intuition:

- `L = 0` → no prefix filter → small `R`
- `L = 1` → 16× fewer addresses → `R ×= 16`
- `L = 2` → 256× fewer → `R ×= 256`

This allows **horizontal scaling** without collapsing anonymity sets.

---

## 3. Client-side query construction

Let:

- `d` = actual transaction datetime
- `R` = server-provided range
- `nonce` = random client nonce

### Steps:

1. **Randomly translate the query window**

```text
Choose y where 0 < y < R
x = d - y
```

This ensures the real transaction time is _uniformly hidden_ within the range.

2. **Compute address prefix hash**

```text
prefixHash = hash(address)[0:L]
```

3. **Send to server**

```ts
{
  x, // shifted datetime
    prefixHash, // truncated hash
    nonce
}
```

The server never sees:

- The full address
- The true transaction time
- The txid or orderId

---

## 4. Server-side query execution

Given:

- `x`
- `R`
- `L`
- `prefixHash`

The server performs a bounded query:

```text
S = x - slopTime
E = x + R
```

Query constraints:

- `isoDate ∈ [S, E]`
- `addressPrefixHash == prefixHash`

Expected result size:

- ~256 real transactions on average

---

## 5. Returned result set

The server returns:

- **All matching real transactions**
- **Additional fake documents** (padding beyond 256)

### Returned shape (minimal + masked):

```ts
interface TxInfo {
  maskedTxid?: string // hash(nonce + txid)

  isoDate: string

  destinationAmount: number
  destinationPluginId?: string
  destinationTokenId?: EdgeTokenId

  providerId: string
  orderId: string
  edgeMaskedOrderId: string

  sourceAmount: number
  sourceCurrencyCode: string
  sourcePluginId?: string
  sourceTokenId?: EdgeTokenId

  status: Status
}
```

### Client-side identification

The client:

- Computes `hash(nonce + txid)`
- Matches against `maskedTxid`
- Discards all other entries

The server **cannot tell** which document was the real one.

---

## 6. Masking & fake documents

### Masking purpose

- Prevents leakage of sensitive correlations
- Ensures values like `sourceAmount` and `sourceCurrencyCode` are indistinguishable from noise

### Fake documents:

- Structurally identical to real ones
- Contain plausible but non-real values
- Ensure:

  - The anonymity set is **larger than 256**
  - No field can be trusted without client-side verification

This prevents:

- Statistical filtering
- Value-based deanonymization
- “Guess-the-real-doc” attacks

---

## 7. Why this works (short summary)

- **Time randomization** hides _when_ the transaction occurred
- **Prefix hashing** enables scaling without global scans
- **Server-chosen R** maintains a stable anonymity set
- **Client-side nonce masking** prevents server correlation
- **Fake documents** destroy semantic signal

Result:

> The client learns what it needs.
> The server learns nothing actionable.

---

If you want, next we can:

- Tighten this into a **formal protocol spec**
- Do a **threat-model walk-through**
- Analyze **worst-case deanonymization scenarios**
- Or simplify this further without losing guarantees

Just tell me the next angle you want to sharpen.
