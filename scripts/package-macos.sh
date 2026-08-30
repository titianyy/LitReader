#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
app_dir="$project_dir/dist/LitReader.app"
contents_dir="$app_dir/Contents"

rm -rf "$app_dir"
mkdir -p "$contents_dir/MacOS" "$contents_dir/Resources"
mkdir -p "$project_dir/build/clang-module-cache"
export CLANG_MODULE_CACHE_PATH="$project_dir/build/clang-module-cache"

xcrun clang \
  "$project_dir/macos/LitReaderApp.m" \
  -fobjc-arc \
  -fmodules \
  -mmacosx-version-min=13.0 \
  -arch arm64 \
  -arch x86_64 \
  -O \
  -framework AppKit \
  -framework WebKit \
  -framework UniformTypeIdentifiers \
  -o "$contents_dir/MacOS/LitReader"

cp "$project_dir/macos/Info.plist" "$contents_dir/Info.plist"
cp "$project_dir/LitReader.html" "$contents_dir/Resources/LitReader.html"

codesign --force --deep --sign - "$app_dir"
rm -f "$project_dir/dist/LitReader-macOS.zip"
ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$project_dir/dist/LitReader-macOS.zip"

echo "Packaged $app_dir"
