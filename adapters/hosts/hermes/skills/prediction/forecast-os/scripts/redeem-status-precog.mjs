#!/usr/bin/env node
import { PRECOG_REDEEM_STATUS_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_REDEEM_STATUS_REL, label: "Precog redeem status script" });
