export const precogMarket = {
  id: 503,
  master_market_id: 503,
  master_address: "0x00000000000c109080dfa976923384b97165a57a",
  chain_id: 8453,
  question: "Who will finish first in Brazil's presidential election first round?",
  category: "Politics",
  outcomes: "Lula,Flavio Bolsonaro,Other",
  outcomes_prices: "0.62,0.25,0.13",
  status: "OPEN",
  funding_amount: 100,
};

export function createPrecogFixtureFetch() {
  const calls = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.hostname === "service.precog.markets" && url.pathname === "/api/v1/markets/") {
      return jsonResponse([precogMarket]);
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
