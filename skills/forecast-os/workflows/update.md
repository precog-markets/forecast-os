# Workflow: update the skill and CLI

Refresh the skill and its pinned CLI binary from the source of truth, `github.com/precog-markets/forecast-os`.

**Load only when the user asks to update.** Checking for updates does not load this file. When `check_updates.py` reports stale during normal use, tell the user what is stale and stop. Do not pull, reinstall, or run `install.sh` behind their back.

**Done when:** the skill checkout matches the remote default branch (or was reinstalled), and `forecast --version` runs against the pinned release.

Check first:

```bash
python scripts/check_updates.py
```

Exit 0 means current. Exit 1 names what is stale. If already current, say so and stop.

## Steps

Run these only after the user asked to update (or confirmed after you told them an update is available):

1. Update the skill. For a git checkout, pull the default branch. For a skills.sh install, re-run it:

```bash
git pull
npx skills add precog-markets/forecast-os
```

2. Install the pinned CLI. `scripts/install.sh` reads the pin from `metadata.json`; `FORECAST_VERSION` overrides it for testing unreleased builds:

```bash
INSTALL_DIR="$PWD" sh scripts/install.sh
./forecast --version
```

3. Confirm the binary answers. Run from a directory that resolves config if further commands are needed.

## Completion check

- `check_updates.py` exits 0, or each stale item it reported was refreshed.
- `forecast --version` prints a version.
