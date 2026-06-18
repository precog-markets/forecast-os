#!/usr/bin/env node
console.error(
  [
    "buy.mjs no longer signs with a local PRIVATE_KEY.",
    "",
    "1. Quote:  node quote.mjs --market <id> --outcome <n> --cost <amount>",
    "2. Prepare: node prepare_buy.mjs --market <id> --outcome <n> --shares <n> --max <amount> --wallet-address <0x...>",
    "3. Submit:  node ../../wallets/<bankr|privy|base-mcp>/resolve_trade.mjs --input <trade.json>",
    "",
    "Use --network mainnet for Bankr, Privy, and Base MCP wallet adapters.",
  ].join("\n"),
);
process.exit(1);
