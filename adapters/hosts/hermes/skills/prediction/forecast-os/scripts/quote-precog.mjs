#!/usr/bin/env node
import { PRECOG_QUOTE_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_QUOTE_REL, label: "Precog quote script" });
