#!/usr/bin/env node
import { PRECOG_POSITIONS_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: PRECOG_POSITIONS_REL, label: "Precog positions script" });
