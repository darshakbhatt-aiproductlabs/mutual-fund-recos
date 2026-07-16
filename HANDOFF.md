# Handoff: mutual-fund-recos

Repo: https://github.com/darshakbhatt-aiproductlabs/mutual-fund-recos
Current state: Vite + React scaffold pushed to `main` (boots, no data/logic).
Your job: build everything described below.

## 0. First, ask the user for

- The two reference screenshots (FundsIndia "Sector Returns by Calendar
  Year" and "Style Returns by Calendar Year" heatmaps, 2010–2025 YTD).
  Use them to lock the exact category list and table format. Do **not**
  reproduce FundsIndia's proprietary table verbatim in the shipped
  product — recompute the same *kind* of table from public index data
  (see §2). The screenshots are a spec, not a data source.
- Confirmation of which GitHub auth you're using (see §6 security note).

## 1. Product summary

A site with three parts:

1. **Sector returns heatmap** — 12 sectors × year (2010→2026 YTD),
   ranked top-to-bottom by return within each year column, color-coded
   by sector. Sectors: Auto, Cons Disc., Financials, FMCG, Healthcare,
   IT, Media, Metals, Oil & Gas, Realty, Telecom, Utilities.
2. **Style/factor returns heatmap** — same layout, for: Momentum,
   Value, Quality, Low Volatility, Dividend Yield, Size (Midcap),
   Nifty 500 TRI (benchmark row), Global.
3. **Strategy picker → fund recommendations** — user manually selects
   a strategy from a menu (locked decision, no quiz/auto-pick):
   - **Contrarian** — surface the sector(s)/style(s) with the worst
     trailing 1-year return, and funds mapped to them.
   - **Momentum** — surface the best trailing 1-year performers.
   - **Quality & Low Volatility** (defensive) — pinned to those two
     style factors regardless of recent performance.
   - **Balanced / Diversified** — even spread across all sectors,
     tilted away from the current top-1 and bottom-1 (avoid
     concentration in whatever just had an extreme year).

   Each strategy resolves to a shortlist of 3–5 mutual funds, ranked
   by trailing return computed from real NAV data (§3) — not a
   static list.

## 2. Data layer — sector & style returns

**Files:** `data/sector-returns.json`, `data/style-returns.json`

```json
{
  "asOf": "2026-07-16",
  "years": [2010, 2011, "...", 2025, "2026 YTD"],
  "series": {
    "Auto":       { "2010": 35, "2011": -19, "...": null },
    "Healthcare": { "2010": 36, "...": null }
  }
}
```
Store raw returns keyed by category, not the pre-sorted heatmap rows —
sort/rank at render time in the frontend. That way re-sorting for a
new month is free.

**Script:** `scripts/fetch_sector_style_data.py`

Best-effort auto-pull, in this fallback order:
1. `niftyindices.com` historical index data endpoints (less aggressive
   bot-blocking than nseindia.com historically, but confirm current
   behavior — this changes).
2. `nseindia.com` — needs a warm-up GET to the homepage to acquire
   session cookies before hitting any data endpoint, plus a realistic
   `User-Agent`/`Referer`. Expect this to be blocked intermittently
   from datacenter IPs (including GitHub Actions runners) even with
   correct headers — NSE actively fingerprints and blocks scripted
   traffic. Don't over-invest in defeating this; treat failures as
   expected, not bugs to chase indefinitely.
3. BSE sectoral index historical data as a secondary source for
   sectors NSE doesn't cover well.

**On failure:** never overwrite good data with nulls or zeroes. Log a
clear, greppable failure line per index, keep last-known-good values,
and exit non-zero so the Action run shows red. Do not silently succeed
with partial data.

**Honesty constraint:** be upfront in the README that this table is
*our own computation* from public index closes, not a reproduction of
FundsIndia's proprietary methodology — the category boundaries and
exact weighting won't match their table point-for-point, and that's
fine and expected.

## 3. Data layer — mutual funds

**File:** `data/funds.json`

**Source:** `mfapi.in` — free, unauthenticated, daily NAV history per
scheme, no rate limiting observed historically (verify current terms
before relying on it in production). Endpoints: `/mf` (scheme list),
`/mf/{code}` (NAV history for a scheme).

**Approach — do not try to classify all ~14,000 Indian MF schemes by
style.** That's not a well-defined problem. Instead, map each
sector/style directly to real **index/smart-beta funds and sector
funds that track it** — India has actual products for this. Starter
list to search for on mfapi.in and verify current scheme
codes/expense details (names drift — confirm against the AMC's
current factsheet before shipping):

- Momentum → UTI Nifty200 Momentum 30 Index Fund, Nippon India Nifty
  Midcap150 Momentum 50 Index Fund
- Value → ICICI Prudential Nifty500 Value 50 Index Fund, DSP Nifty50
  Value 20 ETF/Index Fund
- Quality → ICICI Prudential Nifty200 Quality 30 ETF, Edelweiss
  Nifty100 Quality 30 Index Fund
- Low Volatility → ICICI Prudential Nifty100 Low Volatility 30 ETF,
  Nippon India ETF Nifty 100 Low Volatility 30
- Dividend Yield → ICICI Prudential Nifty Dividend Opportunities 50
  ETF, UTI Nifty Dividend Opportunities 50 Index Fund
- Size (Midcap) → UTI Nifty Midcap 150 Quality 50 Index Fund, Motilal
  Oswal Nifty Midcap 150 Index Fund
- Global → Motilal Oswal Nasdaq 100 FOF, ICICI Prudential US Bluechip
  Equity Fund
- Sector funds (coverage is uneven — some sectors have none, note
  that in the UI rather than forcing a bad match): Healthcare/Pharma
  (SBI Healthcare Opportunities, Nippon India Pharma), IT (ICICI
  Prudential Technology Fund), Banking/Financials (ICICI Prudential
  Banking & Financial Services), FMCG (ICICI Prudential FMCG Fund),
  Consumption as a rough Cons Disc. proxy (ICICI Prudential Bharat
  Consumption Fund). Auto, Metals, Realty, Media, Oil & Gas, Telecom,
  Utilities generally lack dedicated MF products in India — say so
  explicitly rather than mapping to a loose fit.

**Script:** `scripts/fetch_fund_data.py` — resolve each mapping to a
scheme code via the mfapi.in scheme-list search, pull NAV history,
compute trailing 1yr/3yr/5yr returns (CAGR for >1yr), rank within each
category, write `funds.json`. Ranking is by trailing return only (no
risk-adjustment, no expense ratio — mfapi.in doesn't carry those) —
say so in the UI copy so it doesn't read as more rigorous than it is.

## 4. Automation

`.github/workflows/update-data.yml`:
- Triggers: `schedule` (cron `0 3 1 * *` — 1st of month) +
  `workflow_dispatch` (manual runs for testing).
- Runs both scripts, commits `data/*.json` if changed, with a clear
  commit message (`data: monthly refresh YYYY-MM`).
- On push to `main`, a second workflow builds (`DEPLOY_TARGET=pages
  npm run build`) and deploys via `actions/upload-pages-artifact` +
  `actions/deploy-pages`. Requires the repo's Settings → Pages source
  set to "GitHub Actions" (one-time manual toggle).
- Vercel (later): once the repo is connected to Vercel, pushes to
  `main` redeploy automatically — no extra workflow needed, just
  remove/ignore the Pages deploy step or leave both running.

## 5. Frontend

Vite + React, already scaffolded. Build:
- `SectorHeatmap` / `StyleHeatmap` components — read the JSON, sort
  each year column descending, render as a color-coded grid matching
  the reference screenshots' visual density (each category gets one
  consistent color across the whole table).
- `StrategyPicker` — a menu (not a quiz, per the locked decision):
  Contrarian / Momentum / Quality & Low Vol / Balanced.
- `FundRecommendations` — reads `funds.json`, filtered by the
  categories the selected strategy resolves to.
- Design direction: this is dense financial data, not a marketing
  page — prioritize scan-ability and alignment. Tabular figures in a
  monospace face (e.g. IBM Plex Mono, already linked in `index.html`)
  for every number so columns align; a plainer sans (IBM Plex Sans,
  also linked) for labels/copy. Keep the chrome quiet — the heatmap
  itself is the thing worth looking at, don't compete with it.

## 6. Deployment sequence + security note

1. GitHub Pages first (fast, free, already spec'd in §4).
2. Move to Vercel when ready for the private-repo step: connect the
   repo in Vercel, then flip the GitHub repo to private in Settings.
   Vercel retains access via its GitHub App install, independent of
   repo visibility.
3. **Auth:** this scaffold was pushed using a PAT the user pasted
   directly into a chat conversation. Don't perpetuate that — set up
   your own auth for ongoing work (SSH deploy key, or a fresh
   fine-grained token scoped only to this repo with an expiry), and
   tell the user to revoke the token(s) that were shared in chat once
   your access is confirmed working.

## 8. Fund detail pages & risk/performance metrics

Each fund gets a detail page (`/fund/:schemeCode`, needs
`react-router-dom` — not yet in `package.json`, add it) showing a
Parameter | Value | What it measures table, mirroring the reference
screenshot the user provided ("Portfolio Risk and Performance
Measures"). The 11 metrics, grouped by data dependency:

| Metric | Needs | Formula / method |
|---|---|---|
| Standard Deviation | NAV only | σ_monthly × √12 |
| Maximum Drawdown | NAV only | min over t of (NAV_t − runningPeak_t) / runningPeak_t |
| VaR (95%) | NAV only | parametric: mean(R) − 1.645×σ(R), over trailing monthly returns |
| Expected Shortfall / CVaR (95%) | NAV only | mean of returns below the VaR cutoff |
| Sharpe Ratio | NAV + risk-free rate | (annualized return − r_f) / annualized σ |
| Sortino Ratio | NAV + risk-free rate | (annualized return − r_f) / downside deviation |
| Beta (β) | NAV + benchmark | Cov(R_fund, R_bench) / Var(R_bench), linear regression |
| R-Squared | NAV + benchmark | correlation(R_fund, R_bench)² |
| Tracking Error | NAV + benchmark | annualized σ of (R_fund − R_bench) |
| Alpha (α) | NAV + benchmark + r_f + β | R_fund_annual − [r_f + β×(R_bench_annual − r_f)] |
| Treynor Ratio | NAV + benchmark + r_f + β | (annualized return − r_f) / β |

**Two benchmarks per fund, not one:**
- **Target index** (Tracking Error, R²) — the index the fund is
  actually designed to replicate. For factor funds, that's the
  matching style index from `data/raw/index-history/` (e.g. a
  Momentum fund → Nifty200 Momentum 30). For sector funds, the
  matching sector index — same series already pulled for §2's
  heatmap.
- **Broad market** (Beta, Alpha, Treynor) — Nifty 500 TRI, used
  uniformly so funds are comparable to each other regardless of
  strategy.

**Raw data layer (new — sits underneath the derived files in §2/§3):**
```
data/raw/index-history/{indexName}.json   — monthly index levels
data/raw/nav-history/{schemeCode}.json    — monthly NAV per scheme
data/risk-free-rate.json                  — manually maintained (91-day
                                             T-Bill yield); don't add a
                                             third scraper for this, it
                                             changes rarely
```
Both `fetch_sector_style_data.py` and `fetch_fund_data.py` should
write/append to this raw layer as a side effect, so `scripts/
compute_risk_metrics.py` (new) can read from it directly instead of
re-fetching from mfapi.in or the index sources. Append new data points
incrementally each month rather than re-pulling full history.

**Output:** `data/risk-metrics.json`, keyed by scheme code, computed
over a 3-year monthly trailing window as the default (industry
standard for Beta/Alpha/Sharpe/R² in Indian fund research). If a
scheme has fewer than ~36 monthly NAV points, write `null` with a
`"reason": "insufficient_history"` per metric rather than computing on
too little data — the frontend shows "Insufficient history" instead of
a number, never a misleading one.

**Frontend copy:** use the "What it measures" text from the reference
screenshot verbatim as the second column — it's already clear,
one-line, and non-technical. Don't re-write it into denser finance
jargon.

## 9. Explicitly out of scope / don't over-build

- No user accounts, no persistence beyond the repo's own JSON files.
- No attempt to exactly reproduce FundsIndia's proprietary index
  methodology — ours is a from-scratch computation, and that's stated
  plainly in the UI, not hidden.
- No investment advice language — frame fund lists as "funds tracking
  this factor/sector," not recommendations to buy. Add a one-line
  disclaimer in the footer (not financial advice, for informational
  purposes).
