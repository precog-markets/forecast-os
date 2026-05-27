# Kalshi Read-Only Provider

Use Kalshi only as public read-only context inside ForecastOS.

## Public Source

- Trade API: `https://external-api.kalshi.com/trade-api/v2`
  - Public market data endpoints for events, markets, and orderbooks.
  - No authentication for the read paths used by ForecastOS.

Do not use Kalshi authentication, orders, portfolio reads, private WebSockets, or
account-specific endpoints from ForecastOS MCP.

## Supported Identifiers

```json
{
  "identifier": {
    "kalshi": {
      "ticker": "MARKET-TICKER",
      "event_ticker": "EVENT-TICKER",
      "series_ticker": "SERIES-TICKER"
    }
  }
}
```

- Use `ticker` for a single market and orderbook reads.
- Use `event_ticker` for event details with nested markets.
- Use `series_ticker` for grouped market listing.

## Endpoint Mapping

- Search markets:
  - `GET /markets?status=open&limit=...`
  - Optional native filters: `tickers`, `event_ticker`, `series_ticker`.
  - Optional `query` uses a persistent 6-hour open-market cache by default.
    ForecastOS builds the cache Aeon-style by reading `/series`, then open
    `/markets` for each series, enriching each market with series title and
    category before local keyword filtering.
  - Set `cache_mode: "refresh"` to rebuild before searching, or
    `cache_mode: "bypass"` to use the bounded live page scan plus local filtering.
- Get market/event:
  - `GET /markets?tickers=...`
  - `GET /events/{event_ticker}?with_nested_markets=true`
- Prices:
  - Read `yes_bid`, `yes_ask`, `no_bid`, `no_ask`, and `last_price` from market
    payloads. Normalize cents to 0-1 probabilities.
- Orderbook:
  - `GET /markets/{ticker}/orderbook?depth=...`

## Persistent Keyword Cache

Kalshi does not expose a Polymarket-style native free-text search endpoint.
ForecastOS therefore uses a local JSON search cache for Kalshi keyword searches:

- Default mode: `cache_mode: "auto"`.
- Default TTL: 6 hours.
- Override cache directory with `FORECASTOS_KALSHI_CACHE_DIR`.
- Override TTL with `FORECASTOS_KALSHI_CACHE_TTL_MS`.
- Cached searches cover open markets only and are read-only discovery context.
- Direct `ticker`, `event_ticker`, and `series_ticker` lookups continue to use
  live Kalshi filters by default.

The cache stores market discovery fields only. Do not cache orderbooks, trades,
private account data, wallet data, or ForecastOS creation/funding state.

## Normalization

ForecastOS normalizes Kalshi results into:

- provider identity: `provider: "kalshi"`
- market identity: `provider_market_id`, `ticker`, `event_ticker`, `series_ticker`
- human fields: `title`, `question`, `subtitle`
- public activity fields: `volume`, `volume_24h`, `open_interest`, `status`
- timing fields: `close_time`, `resolution_time`
- source URL and raw provider payload

Use normalized fields for normal chat. Use raw payload only when the user asks for
operator/debug detail.
