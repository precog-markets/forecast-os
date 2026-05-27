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

export const polymarketBrazilEvent = {
  id: "45915",
  slug: "brazil-presidential-election",
  title: "Brazil Presidential Election",
  active: true,
  closed: false,
  volume: "46824896.459836",
  liquidity: "1769790.44726",
  endDate: "2026-10-04T00:00:00Z",
  markets: [
    {
      id: "market-brazil-lula",
      conditionId: "0xbrazil-lula",
      slug: "will-lula-win-the-2026-brazilian-presidential-election",
      question: "Will Lula win the 2026 Brazilian presidential election?",
      active: true,
      closed: false,
      outcomes: ["Yes", "No"],
      clobTokenIds: ["token-lula-yes", "token-lula-no"],
      outcomePrices: ["0.43", "0.57"],
      endDate: "2026-10-04T00:00:00Z",
    },
    {
      id: "market-brazil-flavio",
      conditionId: "0xbrazil-flavio",
      slug: "will-flavio-bolsonaro-win-the-2026-brazilian-presidential-election",
      question: "Will Flavio Bolsonaro win the 2026 Brazilian presidential election?",
      active: true,
      closed: false,
      outcomes: ["Yes", "No"],
      clobTokenIds: ["token-flavio-yes", "token-flavio-no"],
      outcomePrices: ["0.25", "0.75"],
      endDate: "2026-10-04T00:00:00Z",
    },
  ],
};

export const polymarketColombiaEvent = {
  id: "colombia-1",
  slug: "colombia-election-who-will-advance-to-2nd-round",
  title: "Colombia Election: Who will advance to 2nd round?",
  active: true,
  closed: false,
  markets: [
    {
      id: "market-colombia",
      conditionId: "0xcolombia",
      slug: "will-colombia-candidate-advance-to-the-second-round",
      question: "Will Colombia candidate advance to the second round?",
      active: true,
      closed: false,
      outcomes: ["Yes", "No"],
      clobTokenIds: ["token-colombia-yes", "token-colombia-no"],
      outcomePrices: ["0.1", "0.9"],
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
  const calls = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.hostname === "gamma-api.polymarket.com" && url.pathname === "/public-search") {
      return jsonResponse({
        events: [polymarketBrazilEvent, polymarketColombiaEvent],
        hasMore: true,
        profiles: [{ id: "profile-should-not-leak" }],
        tags: [{ id: "tag-should-not-leak" }],
      });
    }
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
  fetcher.calls = calls;
  return fetcher;
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
