#!/usr/bin/env node
import { PRECOG_PREPARE_SELL_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_PREPARE_SELL_REL, label: "Precog prepare sell script" });
