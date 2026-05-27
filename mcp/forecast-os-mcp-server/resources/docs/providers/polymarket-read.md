# Polymarket Read-Only Provider

Use Polymarket only as public read-only context inside ForecastOS.

## Public Sources

- Gamma API: `https://gamma-api.polymarket.com`
  - Events, markets, tags, sports metadata, slugs, active/closed filters.
  - No authentication for the read paths used by ForecastOS.
- CLOB API: `https://clob.polymarket.com`
  - Public token orderbook, price, midpoint, spread, and last trade price reads.
  - No authentication for the read paths used by ForecastOS.

Do not use Polymarket authentication, trading, user WebSocket, bridge, relayer,
gasless, CTF split/merge/redeem, or wallet operations from ForecastOS MCP.

## Supported Identifiers

```json
{
  "identifier": {
    "polymarket": {
      "slug": "event-or-market-slug",
      "event_id": "123",
      "market_id": "456",
      "condition_id": "0x...",
      "token_id": "123456789"
    }
  }
}
```

- Use `slug` for event or market lookup through Gamma.
- Use `condition_id` or `market_id` for direct Gamma market lookup when available.
- Use `token_id` for CLOB price and orderbook reads.

## Endpoint Mapping

- Search markets/events:
  - Keyword search: `GET /public-search?q=...&events_status=active&limit_per_type=...&page=...`
  - ForecastOS sets `search_profiles=false`, `search_tags=false`, and `optimized=true`, then keeps event/market results only.
  - `GET /events?active=true&closed=false&limit=...&offset=...`
  - Optional filters: `slug`, `tag_id`, `closed`, `active`.
- Get market/event:
  - `GET /events?slug=...`
  - Fallback/direct market lookup through `GET /markets?...`.
- Token price:
  - `GET /price?token_id=...&side=BUY|SELL`
- Token midpoint:
  - `GET /midpoint?token_id=...`
- Token spread:
  - `GET /spread?token_id=...`
- Token last trade price:
  - `GET /last-trade-price?token_id=...`
- Token orderbook:
  - `GET /book?token_id=...`

## Normalization

ForecastOS normalizes Polymarket results into:

- provider identity: `provider: "polymarket"`
- market identity: `provider_market_id`, `condition_id`, `slug`
- human fields: `title`, `question`, `outcomes`
- public activity fields: `volume`, `liquidity`, `status`
- timing fields: `close_time`, `resolution_time`
- source URL and raw provider payload

Use normalized fields for normal chat. Use raw payload only when the user asks for
operator/debug detail.

For keyword discovery, prefer `/public-search` over generic web search or broad
`/events` scans. It surfaces event pages such as `Brazil Presidential Election`
from natural-language queries and avoids returning unrelated raw profiles/tags.

## WebSockets

Polymarket public market WebSockets can provide live orderbook updates by token ID,
but ForecastOS v1 does not implement streaming. Future streaming support must remain
read-only and must not subscribe to authenticated user channels.
