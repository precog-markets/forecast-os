#!/usr/bin/env node
import { PRECOG_PREPARE_REDEEM_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_PREPARE_REDEEM_REL, label: "Precog prepare redeem script" });
