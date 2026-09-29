#!/usr/bin/env python3
"""Check whether the skill and its pinned CLI are up to date. Read-only.

Compares three things and prints one line each:
1. Installed `forecast --version` (informational; the binary reports the CLI
   package version, not the release tag, so it never drives staleness).
2. Pinned CLI tag from metadata.json vs the latest forecast-os release tag.
3. Local skill checkout vs the remote default branch (skipped when this is
   not a git checkout, e.g. skills.sh installs).

Exit 0 when current, exit 1 when stale (informational only; the caller
tells the user and waits for them to ask before updating). No downloads.
Stdlib only.

Usage:
  python check_updates.py [--api-base https://api.github.com] [--skill-dir ...]
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

# The skill and its CLI binary both ship from this repo's releases.
SKILL_REPO = "precog-markets/forecast-os"


def read_metadata(skill_dir):
    """Load the version pin living next to the skill.

    metadata.json is the single source of truth for which CLI release the
    skill was tested against. It holds the skill version, the pinned CLI
    tag, and the repo that publishes both.
    """
    path = os.path.join(skill_dir, "metadata.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def installed_cli_version():
    """Ask the binary on PATH for its version.

    The binary reports the CLI package version (for example 0.3.3), not the
    release tag (for example 2.0). This is informational context only; it
    never drives staleness. A missing or failing binary returns None.
    """
    try:
        out = subprocess.run(
            ["forecast", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        # Case: the binary is missing or cannot run.
        return None
    if out.returncode != 0:
        # Case: the binary ran but failed.
        return None
    return out.stdout.strip() or None


def latest_release_tag(repo, api_base="https://api.github.com"):
    """Return the newest published release tag for the repo.

    Prereleases are included, mirroring install.sh. The newest release is
    the first entry in the GitHub releases list.
    """
    url = f"{api_base}/repos/{repo}/releases?per_page=5"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        releases = json.load(r)
    if not releases:
        # Case: the repo has no published releases.
        raise RuntimeError("no releases found.")
    return releases[0]["tag_name"]


def skill_checkout_state(skill_dir):
    """Compare the local skill checkout against the remote default branch.

    Returns a (state, detail) pair. State is one of:
    - ok: the checkout matches the remote default branch.
    - stale: the checkout trails the remote default branch.
    - unknown: the checkout cannot be compared (not a git repo, no network).
    """
    # The skill lives two levels below the repo root (skills/forecast-os/).
    root = os.path.abspath(os.path.join(skill_dir, "..", ".."))
    if not os.path.isdir(os.path.join(root, ".git")):
        # Case: not a git checkout (for example a skills.sh install).
        return "unknown", "not a git checkout."

    # Read the local HEAD commit.
    try:
        local = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as e:
        # Case: git is unavailable or the command failed.
        return "unknown", f"git unavailable: {e}."
    if local.returncode != 0:
        # Case: cannot read the local HEAD.
        return "unknown", "cannot read local HEAD."

    # Read the remote default branch HEAD.
    try:
        remote = subprocess.run(
            ["git", "ls-remote", "origin", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as e:
        # Case: git is unavailable or the command failed.
        return "unknown", f"git unavailable: {e}."
    if remote.returncode != 0 or not remote.stdout.strip():
        # Case: cannot reach the remote.
        return "unknown", "cannot reach origin."

    # Compare the two commit SHAs.
    remote_sha = remote.stdout.strip().split()[0]
    local_sha = local.stdout.strip()
    if remote_sha == local_sha:
        # Case: the checkout matches the remote.
        return "ok", f"at {remote_sha[:7]}."
    # Case: the checkout trails the remote.
    return "stale", f"local {local_sha[:7]} vs origin {remote_sha[:7]}."


def main():
    """Run the update check and report each comparison."""
    # Resolve the skill directory (defaults to the parent of scripts/).
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser()
    p.add_argument(
        "--skill-dir",
        default=os.path.join(here, ".."),
        help="skill directory holding metadata.json",
    )
    p.add_argument(
        "--api-base",
        default="https://api.github.com",
        help="GitHub API base URL",
    )
    args = p.parse_args()

    stale = False

    # Load the version pin from metadata.json.
    try:
        metadata = read_metadata(args.skill_dir)
    except (OSError, ValueError) as e:
        # Case: metadata.json is missing or unreadable.
        print(f"metadata: unreadable ({e}).", file=sys.stderr)
        return 2
    repo = metadata.get("cli_repo", SKILL_REPO)
    pin = metadata.get("cli")
    skill_version = metadata.get("skill")
    print(f"skill: {skill_version} (pin: cli {pin} from {repo}).")

    # Report the installed binary version for context only.
    installed = installed_cli_version()
    if installed:
        print(f"installed forecast: {installed}.")
    else:
        print("installed forecast: missing.")

    # Compare the pinned CLI tag against the latest release.
    try:
        latest = latest_release_tag(repo, args.api_base)
    except Exception as e:
        # Case: the releases feed is unreachable.
        print(f"releases: unreachable ({e}).", file=sys.stderr)
        return 2
    if pin == latest:
        # Case: the pin matches the latest release.
        print(f"cli pin: current ({pin}).")
    else:
        # Case: the pin trails the latest release.
        print(f"cli pin: stale (pin {pin}, latest {latest}).")
        print(f"Update available: CLI {latest} (pinned {pin}). "
              "Ask the user before running scripts/install.sh.")
        stale = True

    # Compare the local skill checkout against the remote default branch.
    state, detail = skill_checkout_state(args.skill_dir)
    print(f"skill checkout: {state} ({detail})")
    if state == "stale":
        # Case: the checkout trails the remote.
        print("Update available: skill checkout trails origin. "
              "Ask the user before git pull or "
              "npx skills add precog-markets/forecast-os.")
        stale = True

    # Exit 1 when stale so callers can inform the user. Do not auto-update.
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
