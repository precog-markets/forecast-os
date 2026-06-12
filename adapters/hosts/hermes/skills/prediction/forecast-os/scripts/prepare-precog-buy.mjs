#!/usr/bin/env node
import { PRECOG_PREPARE_BUY_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_PREPARE_BUY_REL, label: "Precog prepare buy script" });
