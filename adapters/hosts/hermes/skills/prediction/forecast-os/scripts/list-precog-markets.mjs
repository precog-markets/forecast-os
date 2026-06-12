#!/usr/bin/env node
import { PRECOG_LIST_MARKETS_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_LIST_MARKETS_REL, label: "Precog list markets script" });
