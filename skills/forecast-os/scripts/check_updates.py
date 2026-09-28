#!/usr/bin/env python3
"""Check whether the skill and its pinned CLI are up to date. Read-only.

Compares three things and prints one line each:
1. Installed `forecast --version` (informational; the binary reports the CLI
   package version, not the release tag, so it never drives staleness).
2. Pinned CLI tag from metadata.json vs the latest forecast-os release tag.
3. Local skill checkout vs the remote default branch (skipped when this is
   not a git checkout, e.g. skills.sh installs).

Exit 0 when current, exit 1 with an update directive when stale. No downloads.
Stdlib only.

Usage:
  python check_updates.py [--api-url https://...] [--skill-dir ...]
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

SKILL_REPO = "precog-markets/forecast-os"


def read_metadata(skill_dir):
    # Load the version pin living next to the skill.
    path = os.path.join(skill_dir, "metadata.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def installed_cli_version():
    # Ask the binary on PATH for its version. Missing binary is not an error.
    try:
        out = subprocess.run(["forecast", "--version"], capture_output=True,
                             text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip() or None


def latest_release_tag(repo, api_base="https://api.github.com"):
    # Newest published release, prereleases included (mirrors install.sh).
    url = f"{api_base}/repos/{repo}/releases?per_page=5"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        releases = json.load(r)
    if not releases:
        raise RuntimeError("no releases found.")
    return releases[0]["tag_name"]


def skill_checkout_state(skill_dir):
    # Compare the local checkout against the remote default branch.
    # Returns (state, detail) with state in ok/stale/unknown.
    root = os.path.abspath(os.path.join(skill_dir, "..", ".."))
    if not os.path.isdir(os.path.join(root, ".git")):
        return "unknown", "not a git checkout."
    try:
        local = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root,
                               capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as e:
        return "unknown", f"git unavailable: {e}."
    if local.returncode != 0:
        return "unknown", "cannot read local HEAD."
    remote = subprocess.run(["git", "ls-remote", "origin", "HEAD"], cwd=root,
                            capture_output=True, text=True, timeout=30)
    if remote.returncode != 0 or not remote.stdout.strip():
        return "unknown", "cannot reach origin."
    remote_sha = remote.stdout.strip().split()[0]
    if remote_sha == local.stdout.strip():
        return "ok", f"at {remote_sha[:7]}."
    return "stale", f"local {local.stdout.strip()[:7]} vs origin {remote_sha[:7]}."


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser()
    p.add_argument("--skill-dir", default=os.path.join(here, ".."),
                   help="skill directory holding metadata.json")
    p.add_argument("--api-base", default="https://api.github.com")
    args = p.parse_args()

    stale = False
    try:
        metadata = read_metadata(args.skill_dir)
    except (OSError, ValueError) as e:
        print(f"metadata: unreadable ({e}).", file=sys.stderr)
        return 2
    repo = metadata.get("cli_repo", SKILL_REPO)
    pin = metadata.get("cli")
    print(f"skill: {metadata.get('skill')} (pin: cli {pin} from {repo}).")

    # Report the installed binary version for context only.
    installed = installed_cli_version()
    print(f"installed forecast: {installed if installed else 'missing'}.")

    # Stale when the pin trails the latest release tag.
    try:
        latest = latest_release_tag(repo, args.api_base)
    except Exception as e:
        print(f"releases: unreachable ({e}).", file=sys.stderr)
        return 2
    if pin == latest:
        print(f"cli pin: current ({pin}).")
    else:
        print(f"cli pin: stale (pin {pin}, latest {latest}). "
              f"Run scripts/install.sh to install {latest}.")
        stale = True

    # Stale when the checkout trails the remote default branch.
    state, detail = skill_checkout_state(args.skill_dir)
    print(f"skill checkout: {state} ({detail})")
    if state == "stale":
        print("Reinstall the skill (npx skills add precog-markets/forecast-os) "
              "or git pull the checkout.")
        stale = True

    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
