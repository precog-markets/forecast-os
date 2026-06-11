import { configureCredentials, setNetwork } from "./client.mjs";

export function bootstrapFromArgs(args) {
  configureCredentials({
    privateKey: args["private-key"],
    envFile: args["env-file"],
  });
  if (args.network) setNetwork(args.network);
}
