#!/usr/bin/env node
console.error(
  [
    "sell.mjs no longer signs with a local PRIVATE_KEY.",
    "",
    "1. Quote:  node quote.mjs --market <id> --outcome <n> --shares <n>",
    "2. Prepare: node prepare_sell.mjs --market <id> --outcome <n> --shares <n> --min <amount> --wallet-address <0x...>",
    "3. Submit:  node ../../wallets/<bankr|privy|base-mcp>/resolve_trade.mjs --input <trade.json>",
    "",
    "Use --network mainnet for Bankr, Privy, and Base MCP wallet adapters.",
  ].join("\n"),
);
process.exit(1);
