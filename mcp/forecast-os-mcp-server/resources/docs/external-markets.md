# External Market Reads

ForecastOS can use external prediction-market data as read-only context for drafting,
research, comparison, and public price checks. These tools live in the MCP server and
must not advance ForecastOS workflow state.

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

`polymarket` is implemented first. `kalshi` is reserved for the same shape and should
return a clear not-implemented result until a Kalshi provider is added.

## Read-Only Tools

- `forecastos_search_markets`: discover external markets by provider, query, slug,
  tag, status, limit, and offset.
- `forecastos_get_market`: read one event or market by provider-specific identifier.
- `forecastos_get_market_prices`: read public outcome/token prices.
- `forecastos_get_market_orderbook`: read public orderbook depth when the provider
  supports it.

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
