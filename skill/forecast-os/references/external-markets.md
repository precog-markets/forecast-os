# External Market Reads

ForecastOS can use external prediction-market data as read-only context for drafting,
research, comparison, and public price checks. These tools live in the MCP server and
must not advance ForecastOS workflow state. Creation defaults to Precog; external
markets are read-only and cannot receive ForecastOS creation or funding actions.
Use this workflow whenever an agent needs market-implied context for a future
event, decision/planning uncertainty, odds/probability, or the question "is there
a prediction market about this?"

## Provider Envelope

External market tools use the same provider envelope so additional providers can be
added without changing the top-level tool surface:

```json
{
  "provider": "polymarket",
  "identifier": {
    "polymarket": {
      "slug": "example-event",
      "condition_id": "0x...",
      "token_id": "123"
    },
    "kalshi": {
      "ticker": "EXAMPLE-26",
      "event_ticker": "EXAMPLE",
      "series_ticker": "KXEXAMPLE"
    }
  }
}
```

`polymarket` and `kalshi` are implemented as read-only providers. Kalshi keyword
search uses a persistent Aeon-style open-market cache by default because Kalshi
does not expose a Polymarket-style native free-text query endpoint. Use
`cache_mode: "refresh"` to rebuild the cache, or `cache_mode: "bypass"` to use a
bounded live page scan with local filtering.

## Read-Only Tools

- `forecastos_search_markets`: discover external markets by provider, query, slug,
  tag, status, limit, offset, and Kalshi `cache_mode` when needed.
- `forecastos_get_market`: read one event or market by provider-specific identifier.
- `forecastos_get_market_prices`: read public outcome/token prices.
- `forecastos_get_market_orderbook`: read public orderbook depth when the provider
  supports it.

## Market Discovery Workflow

For prediction-market questions, search provider data before guessing a
probability. Always check providers in this order unless the user explicitly asks
for one venue: Precog first, then Kalshi, then Polymarket. For niche topics,
search multiple aliases: acronym, full event name, product/game/title, organizer,
teams/entities, category, and common shorthand.
Use `forecastos_search_markets` and the provider API-backed tools rather than
generic search-engine result pages. If ForecastOS MCP tools are unavailable, say
that clearly and use only direct read-only provider API paths when available.
For Precog discovery, use the deployed market endpoint `/api/v1/markets/` with
status filters such as `status=OPEN`; do not use the upcoming-market lifecycle endpoint for ordinary market discovery.
Precog market reads must use the current ForecastOS config from
`FORECASTOS_STATE_DIR/config.local.json` or `FORECASTOS_STATE_DIR/config.json`
before falling back to bundled MCP resource defaults, so updated API keys are
picked up without relying on stale synced resources.

Use Kalshi keyword search through the persistent cache by default. If the cache
needs a manual refresh, set `cache_mode: "refresh"`; if a live bounded scan is
needed, set `cache_mode: "bypass"`. Use official web sources only to verify the
event, schedule, teams, or resolution context after market discovery.

Use Polymarket keyword search through the Gamma `/public-search` endpoint. This
is the native search path for events, markets, and profiles; ForecastOS keeps
only event/market results and trims raw payloads so broad queries do not hide
relevant events behind MCP response truncation. Direct slug, tag, and no-query
Polymarket reads may still use `/events`, while price and orderbook reads stay
on the public CLOB endpoints.

If no external market is found, report that no matching market was found and
avoid presenting a guessed probability as market-implied. External market prices
can inform decisions and drafts, but Polymarket, Kalshi, and similar providers
remain read-only and are never ForecastOS creation or funding venues.

Responses include:

```json
{
  "provider": "polymarket",
  "read_only": true,
  "source": "https://...",
  "retrieved_at": "2026-05-27T00:00:00.000Z",
  "normalized": {},
  "raw": {}
}
```

## Safety Rules

- Do not use external market tools for trading, order placement, cancellation, user
  account reads, authentication, wallet activity, bridges, relayers, token operations,
  signing, or swaps.
- Do not use external market providers such as Polymarket or Kalshi as creation
  venues. They can inform a draft, but ForecastOS live creation and funding flow
  targets Precog only.
- Do not write external market results into `.forecastos/` as workflow state unless
  a ForecastOS action explicitly stores them as ordinary read-only context.
- Do not treat external prices as ForecastOS market prices unless the source field
  identifies ForecastOS/Precog.
- Preserve raw provider payloads in MCP responses for operator/debug context, but
  summarize only the relevant normalized fields in normal chat.

## Adding Providers

When adding another provider such as Kalshi:

- Keep the top-level MCP tools unchanged.
- Add a provider-specific identifier object under `identifier`.
- Normalize to the same output keys: identity, title/question, outcomes, prices,
  volume/liquidity, close/resolution times, source URL, and raw payload.
- Keep default tests fixture-backed and put live network checks behind an explicit
  environment variable.
