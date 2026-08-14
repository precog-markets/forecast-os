#!/bin/sh
set -e

REPO="precog-markets/forecast-os"
BINARY="forecast"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

get_asset_name() {
  os=$(uname -s)
  arch=$(uname -m)

  case "$os" in
    Darwin)
      case "$arch" in
        x86_64) echo "forecast-darwin-x86_64" ;;
        arm64)  echo "forecast-darwin-arm64" ;;
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64)  echo "forecast-linux-x86_64" ;;
        aarch64) echo "forecast-linux-aarch64" ;;
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
      esac
      ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac
}

resolve_tag() {
  if [ -n "$FORECAST_VERSION" ]; then
    echo "$FORECAST_VERSION"
    return
  fi

  tag=$(curl -sSf "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
  if [ -z "$tag" ]; then
    echo "Error: could not determine latest release" >&2
    echo "Set FORECAST_VERSION to install a specific tag (for example FORECAST_VERSION=2.0)." >&2
    exit 1
  fi
  echo "$tag"
}

main() {
  asset_name=$(get_asset_name)
  tag=$(resolve_tag)

  url="https://github.com/${REPO}/releases/download/${tag}/${asset_name}"
  checksums_url="https://github.com/${REPO}/releases/download/${tag}/checksums.txt"

  echo "Installing ${BINARY} ${tag} (${asset_name})..."

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  curl -sSfL "$url" -o "$tmpdir/$asset_name"
  if ! curl -sSfL "$checksums_url" -o "$tmpdir/checksums.txt"; then
    echo "Error: checksums.txt is required but was not found on release ${tag}" >&2
    exit 1
  fi

  expected_hash=$(grep "$asset_name" "$tmpdir/checksums.txt" | awk '{print $1}')
  if [ -z "$expected_hash" ]; then
    echo "Error: no checksum found for $asset_name" >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    actual_hash=$(sha256sum "$tmpdir/$asset_name" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual_hash=$(shasum -a 256 "$tmpdir/$asset_name" | awk '{print $1}')
  else
    echo "Error: need sha256sum or shasum to verify download" >&2
    exit 1
  fi

  if [ "$actual_hash" != "$expected_hash" ]; then
    echo "Error: checksum mismatch!" >&2
    echo "  Expected: $expected_hash" >&2
    echo "  Got:      $actual_hash" >&2
    echo "The downloaded file may have been tampered with. Aborting." >&2
    exit 1
  fi

  echo "Checksum verified."
  chmod +x "$tmpdir/$asset_name"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$tmpdir/$asset_name" "$INSTALL_DIR/$BINARY"
  else
    sudo mv "$tmpdir/$asset_name" "$INSTALL_DIR/$BINARY"
  fi

  echo "Installed ${BINARY} to ${INSTALL_DIR}/${BINARY}"
  echo "Run 'forecast --help' to get started."
}

main
