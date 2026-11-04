#!/bin/sh
# Build the distributable plugin zip: dist/dsh-usage-dashboard-<version>.zip
set -e
cd "$(dirname "$0")/.."
node scripts/doctor.mjs > /dev/null
version=$(node -p "require('./package.json').version")
name=$(node -p "require('./package.json').name")
stage="dist/$name"
rm -rf "$stage"
mkdir -p "$stage"
for item in package.json index.js fold.js client.js cordis.patch.yml pricing.json icon.svg README.md README.en.md LICENSE; do
  cp "$item" "$stage/"
done
mkdir -p "$stage/locale"
cp locale/*.json "$stage/locale/"
rm -f "dist/$name-$version.zip"
( cd dist && zip -qr "$name-$version.zip" "$name" )
echo "built dist/$name-$version.zip"
