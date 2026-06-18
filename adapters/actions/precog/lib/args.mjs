// CLI argument utilities shared by trading scripts.

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[arg.slice(2)] = true;
      } else {
        args[arg.slice(2)] = argv[++i];
      }
    }
  }
  return args;
}

export function requireArgs(args, required) {
  const missing = required.filter((key) => !(key in args));
  if (missing.length) {
    console.error(`Missing required args: ${missing.map((key) => `--${key}`).join(", ")}`);
    process.exit(1);
  }
}
