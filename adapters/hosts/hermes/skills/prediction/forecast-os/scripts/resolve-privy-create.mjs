#!/usr/bin/env node
// Forward Hermes Privy create signing to the canonical ForecastOS Privy adapter.
import { PRIVY_ADAPTER_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({
  relPath: PRIVY_ADAPTER_REL,
  label: "Privy create resolver",
  usePrivyError: true,
});
