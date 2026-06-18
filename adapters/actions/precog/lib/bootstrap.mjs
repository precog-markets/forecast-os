import { setNetwork } from "./client.mjs";
import { resolveMarketContext } from "./market_resolve.mjs";

export async function bootstrapFromArgs(args, deps = {}) {
  if (args.market || args["master-market-id"]) {
    const marketContext = await resolveMarketContext(args, deps);
    args.__marketContext = marketContext;
    setNetwork(marketContext.network);
    return marketContext;
  }
  if (args.network) setNetwork(args.network);
  return null;
}
