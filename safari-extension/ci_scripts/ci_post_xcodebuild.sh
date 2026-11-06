#!/usr/bin/env bash
set -euo pipefail

echo "⟹ Nexus Safari Manager — ci_post_xcodebuild"
echo "CI_XCODEBUILD_EXIT_CODE=${CI_XCODEBUILD_EXIT_CODE:-unknown}"
echo "CI_PRODUCT=${CI_PRODUCT:-}"
echo "CI_ARCHIVE_PATH=${CI_ARCHIVE_PATH:-}"

if [ "${CI_XCODEBUILD_EXIT_CODE:-1}" != "0" ]; then
  echo "xcodebuild failed — skipping archive summary"
  exit 0
fi

if [ -n "${CI_ARCHIVE_PATH:-}" ] && [ -d "${CI_ARCHIVE_PATH}" ]; then
  echo "Archive contents:"
  find "$CI_ARCHIVE_PATH" -maxdepth 3 -type d -print | head -n 40
fi

echo "✔ Post-xcodebuild complete"
