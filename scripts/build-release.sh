#!/bin/sh
# Build the distributable plugin zip: dist/dsh-usage-dashboard-<version>.zip
set -e
cd "$(dirname "$0")/.."
node scripts/doctor.mjs > /dev/null
version=$(node -p "require('./package.json').version")
stage="dist/dsh-usage-dashboard"
rm -rf "$stage"
mkdir -p "$stage"
for item in package.json index.js fold.js client.js cordis.patch.yml pricing.json icon.svg README.md LICENSE; do
  cp "$item" "$stage/"
done
mkdir -p "$stage/locale"
cp locale/*.json "$stage/locale/"
rm -f "dist/dsh-usage-dashboard-$version.zip"
( cd dist && zip -qr "dsh-usage-dashboard-$version.zip" dsh-usage-dashboard )
echo "built dist/dsh-usage-dashboard-$version.zip"
