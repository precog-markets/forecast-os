export const precogMarket = {
  id: 503,
  master_market_id: 503,
  master_address: "0x00000000000c109080dfa976923384b97165a57a",
  chain_id: 8453,
  name: "Who wins Brazil's Presidential election first round?",
  question: "",
  category: "Politics",
  outcomes: "Lula,Flavio Bolsonaro,Other",
  outcomes_prices: "0.62,0.25,0.13",
  status: "OPEN",
  funding_amount: 100,
};

export const legacyPrecogMarket = {
  id: 31,
  master_market_id: 503,
  master_address: "0x1eB90323aE74E5FBc3241c1D074cFd0b117d7e8E",
  chain_id: 8453,
  name: "Older market with a colliding master market id",
  description: "This closed market should not win over the configured Precog deployment.",
  category: "AI",
  outcomes: "Gemini,ChatGPT,Other",
  outcomes_prices: null,
  status: "CLOSED",
  funding_amount: 3000,
};

export const brazilWorldCupMarket = {
  id: 504,
  master_market_id: 504,
  master_address: "0x00000000000c109080dfa976923384b97165a57a",
  chain_id: 8453,
  name: "How far will Brazil advance in the FIFA World Cup?",
  description: "Resolves to the furthest round Brazil reaches before elimination, including the first knockout round or winning the tournament.",
  category: "Sports",
  outcomes: "Group Stage,Round of 16,Quarterfinals,Champions",
  outcomes_prices: "0.2,0.3,0.3,0.2",
  status: "OPEN",
  funding_amount: 100,
};

export function createPrecogFixtureFetch() {
  const calls = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.hostname === "service.precog.markets" && url.pathname === "/api/v1/markets/") {
      if (url.searchParams.has("master_market_id")) {
        return jsonResponse([legacyPrecogMarket, precogMarket]);
      }
      return jsonResponse([brazilWorldCupMarket, precogMarket]);
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
