#!/usr/bin/env bash
set -euo pipefail

# Install a fixed Google CLI instead of relying on the hosted image's optional SDK.
: "${RUNNER_TEMP:?Missing runner scratch directory}"
: "${GITHUB_ENV:?Missing Actions environment file}"
scratch="$(mktemp -d "$RUNNER_TEMP/comic-android-tools.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
curl --fail --location --proto '=https' --proto-redir '=https' --retry 2 \
  'https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip' -o "$scratch/tools.zip"
echo "7ec965280a073311c339e571cd5de778b9975026cfcbe79f2b1cdcb1e15317ee  $scratch/tools.zip" | sha256sum --check --status
sdk="$RUNNER_TEMP/comic-android-sdk"
mkdir -p "$sdk/cmdline-tools"
unzip -q "$scratch/tools.zip" -d "$scratch/unpacked"
mv "$scratch/unpacked/cmdline-tools" "$sdk/cmdline-tools/19.0"
manager="$sdk/cmdline-tools/19.0/bin/sdkmanager"
# yes may receive SIGPIPE once all licenses are accepted; preserve sdkmanager's result.
(set +o pipefail; yes | "$manager" --sdk_root="$sdk" --licenses >/dev/null)
"$manager" --sdk_root="$sdk" "$@"
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\n' "$sdk" "$sdk" >> "$GITHUB_ENV"
