export const kalshiMarket = {
  ticker: "KXBTC-26JUN-T100000",
  event_ticker: "KXBTC-26JUN",
  series_ticker: "KXBTC",
  title: "Bitcoin above $100,000 on Jun 30, 2026?",
  subtitle: "Bitcoin price",
  yes_sub_title: "Above $100,000",
  no_sub_title: "At or below $100,000",
  status: "open",
  yes_bid: 56,
  yes_ask: 58,
  no_bid: 42,
  no_ask: 44,
  last_price: 57,
  volume: 123456,
  volume_24h: 7890,
  open_interest: 4567,
  close_time: "2026-06-30T20:00:00Z",
};

export const kalshiSeries = {
  ticker: "KXBTC",
  title: "Crypto bitcoin markets",
  category: "Crypto",
};

export const kalshiEvent = {
  event: {
    event_ticker: "KXBTC-26JUN",
    series_ticker: "KXBTC",
    title: "Bitcoin price on Jun 30, 2026",
    category: "Crypto",
    status: "open",
    volume_24h: 7890,
  },
  markets: [kalshiMarket],
};

export const kalshiOrderbook = {
  orderbook: {
    yes: [
      [56, 100],
      [55, 50],
    ],
    no: [
      [42, 80],
      [41, 70],
    ],
  },
};

export function createKalshiFixtureFetch() {
  const calls = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.hostname === "external-api.kalshi.com" && url.pathname === "/trade-api/v2/series") {
      return jsonResponse({ series: [kalshiSeries], cursor: "" });
    }
    if (url.hostname === "external-api.kalshi.com" && url.pathname === "/trade-api/v2/markets") {
      return jsonResponse({ markets: [kalshiMarket], cursor: "" });
    }
    if (url.hostname === "external-api.kalshi.com" && url.pathname === "/trade-api/v2/events/KXBTC-26JUN") {
      return jsonResponse(kalshiEvent);
    }
    if (url.hostname === "external-api.kalshi.com" && url.pathname === "/trade-api/v2/markets/KXBTC-26JUN-T100000/orderbook") {
      return jsonResponse(kalshiOrderbook);
    }
    return new Response(JSON.stringify({ error: "missing fixture", url: url.toString() }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
  fetcher.calls = calls;
  return fetcher;
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
