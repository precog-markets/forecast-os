export const polymarketEvent = {
  id: "event-1",
  slug: "fed-decision-in-october",
  title: "Fed decision in October",
  active: true,
  closed: false,
  volume: "12345",
  liquidity: "6789",
  endDate: "2026-10-31T00:00:00Z",
  markets: [
    {
      id: "market-1",
      conditionId: "0xcondition",
      slug: "fed-decision-in-october",
      question: "What will the Fed decide in October?",
      active: true,
      closed: false,
      outcomes: "[\"Cut\",\"Hold\",\"Hike\"]",
      clobTokenIds: "[\"token-cut\",\"token-hold\",\"token-hike\"]",
      outcomePrices: "[\"0.25\",\"0.60\",\"0.15\"]",
      endDate: "2026-10-31T00:00:00Z",
    },
  ],
};

export const polymarketBook = {
  bids: [
    { price: "0.59", size: "100" },
    { price: "0.58", size: "50" },
  ],
  asks: [
    { price: "0.61", size: "80" },
    { price: "0.62", size: "70" },
  ],
  tick_size: "0.01",
  min_order_size: "5",
  neg_risk: false,
};

export function createPolymarketFixtureFetch() {
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gamma-api.polymarket.com" && url.pathname === "/events") {
      return jsonResponse([polymarketEvent]);
    }
    if (url.hostname === "gamma-api.polymarket.com" && url.pathname === "/markets") {
      return jsonResponse(polymarketEvent.markets);
    }
    if (url.hostname === "clob.polymarket.com" && url.pathname === "/book") {
      return jsonResponse(polymarketBook);
    }
    if (url.hostname === "clob.polymarket.com" && url.pathname === "/midpoint") {
      return jsonResponse({ mid: "0.60" });
    }
    if (url.hostname === "clob.polymarket.com" && url.pathname === "/spread") {
      return jsonResponse({ spread: "0.02" });
    }
    if (url.hostname === "clob.polymarket.com" && url.pathname === "/last-trade-price") {
      return jsonResponse({ price: "0.61", side: "BUY" });
    }
    if (url.hostname === "clob.polymarket.com" && url.pathname === "/price") {
      return jsonResponse({ price: url.searchParams.get("side") === "BUY" ? "0.61" : "0.59" });
    }
    return new Response(JSON.stringify({ error: "missing fixture", url: url.toString() }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
