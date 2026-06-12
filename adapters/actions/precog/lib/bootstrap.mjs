import { setNetwork } from "./client.mjs";

export function bootstrapFromArgs(args) {
  if (args.network) setNetwork(args.network);
}
