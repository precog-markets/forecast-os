#!/usr/bin/env python3
"""Check whether the skill and its pinned CLI are up to date. Read-only.

Compares metadata.json CLI pin to the latest forecast-os release, and (when
this is a git checkout) local HEAD to origin/HEAD. Installed
`forecast --version` is context only. Exit 0 current (or --periodic skip),
exit 1 stale, exit 2 metadata/releases failure. No downloads. Stdlib only.

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


class UpdateCheckService:
    """Update check shaped after precog-tracker MarketService validate_*/get_*."""

    skill_repo = 'precog-markets/forecast-os'
    stamp_name = '.last_update_check'
    default_max_age_days = 7

    def __init__(self, skill_dir, api_base='https://api.github.com'):
        self.skill_dir = skill_dir
        self.api_base = api_base
        self.stale = False

    def checked_within(self, max_age_days):
        # Only for debug
        # print('Checking stamp age', skill_dir=self.skill_dir, max_age_days=max_age_days)

        path = os.path.join(self.skill_dir, self.stamp_name)
        try:
            # Get stamp content written by a previous network check
            with open(path, encoding='utf-8') as f:
                stamped = f.read().strip()
            stamped_day = datetime.strptime(stamped, '%Y-%m-%d').date()
            today = datetime.now(timezone.utc).date()

            # Check that the stamp is still within the allowed age
            if stamped_day < today - timedelta(days=max_age_days):
                return False

        except Exception:  # pylint: disable=broad-except
            # Stamp missing, corrupt, or unreadable means not checked yet
            return False

        # If all verifications went fine, return True
        return True

    def write_stamp(self):
        # Record that a network check ran (UTC date)
        path = os.path.join(self.skill_dir, self.stamp_name)
        today = datetime.now(timezone.utc).date().isoformat()
        with open(path, 'w', encoding='utf-8') as f:
            f.write(today + '\n')

    def read_metadata(self):
        # metadata.json is the pin for which CLI release the skill was tested against
        path = os.path.join(self.skill_dir, 'metadata.json')
        with open(path, encoding='utf-8') as f:
            metadata = json.load(f)
        return metadata

    def get_installed_cli_version(self):
        # Binary reports package version (e.g. 0.3.3), not the release tag
        version = None
        try:
            out = subprocess.run(
                ['forecast', '--version'],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if out.returncode == 0:
                version = out.stdout.strip()
                if not version:
                    version = None
        except Exception:  # pylint: disable=broad-except
            # Binary missing or cannot run
            pass

        return version

    def get_latest_release_tag(self, repo):
        # Newest published release (prereleases included), mirroring install.sh
        url = f'{self.api_base}/repos/{repo}/releases?per_page=5'
        req = urllib.request.Request(
            url, headers={'Accept': 'application/vnd.github+json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            releases = json.load(response)

        # Check that the releases feed returned at least one tag
        if not releases:
            raise Exception('no releases found')

        # Build and return the newest published tag
        tag = releases[0]['tag_name']
        return tag

    def get_skill_checkout_state(self):
        # Compare local HEAD to origin/HEAD. Returns (state, detail).
        # The skill lives two levels below the repo root (skills/forecast-os/).
        root = os.path.abspath(os.path.join(self.skill_dir, '..', '..'))
        state = 'unknown'
        detail = 'not a git checkout'

        # Check that this install is a git checkout before comparing SHAs
        if not os.path.isdir(os.path.join(root, '.git')):
            return state, detail

        try:
            # Get the local HEAD commit
            local = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if local.returncode != 0:
                detail = 'cannot read local HEAD'
                return state, detail

            # Get the remote default branch HEAD
            remote = subprocess.run(
                ['git', 'ls-remote', 'origin', 'HEAD'],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if remote.returncode != 0 or not remote.stdout.strip():
                detail = 'cannot reach origin'
                return state, detail

            # Check that local and remote SHAs match
            remote_sha = remote.stdout.strip().split()[0]
            local_sha = local.stdout.strip()
            if remote_sha == local_sha:
                state = 'ok'
                detail = f'at {remote_sha[:7]}'
            else:
                state = 'stale'
                detail = f'local {local_sha[:7]} vs origin {remote_sha[:7]}'

        except Exception as e:  # pylint: disable=broad-except
            detail = f'git unavailable: {e}'
            return state, detail

        return state, detail

    def run(self):
        # Only for debug
        # print('Running update check', skill_dir=self.skill_dir)

        # Get the version pin from metadata.json
        try:
            metadata = self.read_metadata()
        except Exception as e:  # pylint: disable=broad-except
            print(f'metadata: unreadable ({e})', file=sys.stderr)
            raise

        repo = metadata.get('cli_repo', self.skill_repo)
        pin = metadata.get('cli')
        skill_version = metadata.get('skill')
        print(f'skill: {skill_version} (pin: cli {pin} from {repo}).')

        # Report installed binary version for context only
        installed = self.get_installed_cli_version()
        if installed:
            print(f'installed forecast: {installed}.')
        else:
            print('installed forecast: missing.')

        # Check that the pinned CLI tag matches the latest release
        try:
            latest = self.get_latest_release_tag(repo)
        except Exception as e:  # pylint: disable=broad-except
            print(f'releases: unreachable ({e})', file=sys.stderr)
            raise

        if pin == latest:
            print(f'cli pin: current ({pin}).')
        else:
            print(f'cli pin: stale (pin {pin}, latest {latest}).')
            print(f'Update available: CLI {latest} (pinned {pin}). '
                  'Ask the user before running scripts/install.sh.')
            self.stale = True

        # Check that the local skill checkout matches the remote default branch
        state, detail = self.get_skill_checkout_state()
        print(f'skill checkout: {state} ({detail})')
        if state == 'stale':
            print('Update available: skill checkout trails origin. '
                  'Ask the user before git pull or '
                  'npx skills add precog-markets/forecast-os.')
            self.stale = True

        # Stamp is optional; a write failure must not hide staleness
        try:
            self.write_stamp()
        except Exception:  # pylint: disable=broad-except
            pass

        return self.stale


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
        default=UpdateCheckService.default_max_age_days,
        help=f'with --periodic, skip if checked within this many days '
             f'(default {UpdateCheckService.default_max_age_days})',
    )
    args = p.parse_args()

    # Initialize update check service
    service = UpdateCheckService(args.skill_dir, args.api_base)

    # Stay quiet when a check already ran within max-age-days
    if args.periodic and service.checked_within(args.max_age_days):
        return 0

    # Execute update check (prints status lines; raises on metadata/releases failure)
    try:
        stale = service.run()
    except Exception:  # pylint: disable=broad-except
        return 2

    # Exit 1 when stale so callers can inform the user. Do not auto-update.
    if stale:
        return 1

    # All checks passed OK
    return 0


if __name__ == '__main__':
    sys.exit(main())
