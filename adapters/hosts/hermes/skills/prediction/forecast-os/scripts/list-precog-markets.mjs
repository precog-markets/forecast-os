#!/usr/bin/env node
import { main } from "./precog-list-runtime.mjs";

try {
  await main();
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
