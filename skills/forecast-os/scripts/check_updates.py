#!/usr/bin/env python3
"""Check whether the skill and its pinned CLI are up to date. Read-only.

Compares the metadata.json CLI pin to the latest forecast-os release, and
(when this is a git checkout) local HEAD to origin/HEAD. Installed
`forecast --version` is printed for context only; it never drives staleness.

Exit 0 when current (or skipped by --periodic), exit 1 when stale, exit 2
on unreadable metadata or unreachable releases. No downloads. Stdlib only.
Informational only: the caller tells the user and waits before updating.

Usage:
  python check_updates.py [--periodic] [--max-age-days 7]
    [--api-base https://api.github.com] [--skill-dir ...]
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

SKILL_REPO = 'precog-markets/forecast-os'  # skill + CLI ship from this repo's releases
STAMP_NAME = '.last_update_check'  # written after a network check; keeps --periodic quiet
DEFAULT_MAX_AGE_DAYS = 7  # at most one network check per week


def stamp_path(skill_dir):
    path = os.path.join(skill_dir, STAMP_NAME)
    return path


def checked_within(skill_dir, max_age_days):
    # True when the stamp is newer than max_age_days (UTC)
    path = stamp_path(skill_dir)
    try:
        with open(path, encoding='utf-8') as f:
            stamped = f.read().strip()
    except OSError:
        return False
    try:
        stamped_day = datetime.strptime(stamped, '%Y-%m-%d').date()
    except ValueError:
        return False
    today = datetime.now(timezone.utc).date()
    fresh = stamped_day >= today - timedelta(days=max_age_days)
    return fresh


def write_stamp(skill_dir):
    # Record that a network check ran (UTC date)
    path = stamp_path(skill_dir)
    today = datetime.now(timezone.utc).date().isoformat()
    with open(path, 'w', encoding='utf-8') as f:
        f.write(today + '\n')


def read_metadata(skill_dir):
    # metadata.json is the pin for which CLI release the skill was tested against
    path = os.path.join(skill_dir, 'metadata.json')
    with open(path, encoding='utf-8') as f:
        metadata = json.load(f)
    return metadata


def installed_cli_version():
    # Binary reports package version (e.g. 0.3.3), not the release tag; context only
    try:
        out = subprocess.run(
            ['forecast', '--version'],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    version = out.stdout.strip() or None
    return version


def latest_release_tag(repo, api_base='https://api.github.com'):
    # Newest published release (prereleases included), mirroring install.sh
    url = f'{api_base}/repos/{repo}/releases?per_page=5'
    req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        releases = json.load(r)
    if not releases:
        raise RuntimeError('no releases found.')
    tag = releases[0]['tag_name']
    return tag


def skill_checkout_state(skill_dir):
    # Compare local HEAD to origin/HEAD. Returns (state, detail): ok | stale | unknown.
    # The skill lives two levels below the repo root (skills/forecast-os/).
    root = os.path.abspath(os.path.join(skill_dir, '..', '..'))
    if not os.path.isdir(os.path.join(root, '.git')):
        return 'unknown', 'not a git checkout.'

    try:
        local = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as e:
        return 'unknown', f'git unavailable: {e}.'
    if local.returncode != 0:
        return 'unknown', 'cannot read local HEAD.'

    try:
        remote = subprocess.run(
            ['git', 'ls-remote', 'origin', 'HEAD'],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as e:
        return 'unknown', f'git unavailable: {e}.'
    if remote.returncode != 0 or not remote.stdout.strip():
        return 'unknown', 'cannot reach origin.'

    remote_sha = remote.stdout.strip().split()[0]
    local_sha = local.stdout.strip()
    if remote_sha == local_sha:
        return 'ok', f'at {remote_sha[:7]}.'

    # Checkout trails the remote default branch
    return 'stale', f'local {local_sha[:7]} vs origin {remote_sha[:7]}.'


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser()
    p.add_argument(
        '--skill-dir',
        default=os.path.join(here, '..'),
        help='skill directory holding metadata.json',
    )
    p.add_argument(
        '--api-base',
        default='https://api.github.com',
        help='GitHub API base URL',
    )
    p.add_argument(
        '--periodic',
        action='store_true',
        help='skip the network check when a stamp is still fresh',
    )
    p.add_argument(
        '--max-age-days',
        type=int,
        default=DEFAULT_MAX_AGE_DAYS,
        help=f'with --periodic, skip if checked within this many days '
             f'(default {DEFAULT_MAX_AGE_DAYS})',
    )
    args = p.parse_args()

    # Stay quiet when a check already ran within max-age-days
    if args.periodic and checked_within(args.skill_dir, args.max_age_days):
        return 0

    stale = False

    # Load the version pin from metadata.json
    try:
        metadata = read_metadata(args.skill_dir)
    except (OSError, ValueError) as e:
        print(f'metadata: unreadable ({e}).', file=sys.stderr)
        return 2
    repo = metadata.get('cli_repo', SKILL_REPO)
    pin = metadata.get('cli')
    skill_version = metadata.get('skill')
    print(f'skill: {skill_version} (pin: cli {pin} from {repo}).')

    # Report installed binary version for context only
    installed = installed_cli_version()
    if installed:
        print(f'installed forecast: {installed}.')
    else:
        print('installed forecast: missing.')

    # Compare the pinned CLI tag against the latest release
    try:
        latest = latest_release_tag(repo, args.api_base)
    except Exception as e:  # pylint: disable=broad-except
        print(f'releases: unreachable ({e}).', file=sys.stderr)
        return 2
    if pin == latest:
        print(f'cli pin: current ({pin}).')
    else:
        print(f'cli pin: stale (pin {pin}, latest {latest}).')
        print(f'Update available: CLI {latest} (pinned {pin}). '
              'Ask the user before running scripts/install.sh.')
        stale = True

    # Compare the local skill checkout against the remote default branch
    state, detail = skill_checkout_state(args.skill_dir)
    print(f'skill checkout: {state} ({detail})')
    if state == 'stale':
        print('Update available: skill checkout trails origin. '
              'Ask the user before git pull or '
              'npx skills add precog-markets/forecast-os.')
        stale = True

    # Stamp is optional; a write failure must not hide staleness
    try:
        write_stamp(args.skill_dir)
    except OSError:
        pass

    # Exit 1 when stale so callers can inform the user. Do not auto-update.
    if stale:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
