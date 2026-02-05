#!/bin/bash
# Script to fix MSIX MinVersion for Microsoft Store compatibility

set -e

MSIX_FILE="$1"
if [ -z "$MSIX_FILE" ]; then
    echo "Usage: ./fix-msix-version.sh <msix-file>"
    exit 1
fi

TEMP_DIR="temp_msix_fix"
OUTPUT_FILE="${MSIX_FILE%.msix}-fixed.msix"

echo "Fixing MinVersion in $MSIX_FILE..."

# Create temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Extract MSIX (it's a zip file)
cd "$TEMP_DIR"
unzip -q "../$MSIX_FILE"

# Fix the MinVersion in AppxManifest.xml
# Change from 10.0.14316.0 to 10.0.19041.0 (Windows 10 2004)
sed -i 's/MinVersion="10.0.14316.0"/MinVersion="10.0.19041.0"/g' AppxManifest.xml
sed -i 's/MaxVersionTested="10.0.14316.0"/MaxVersionTested="10.0.22621.0"/g' AppxManifest.xml

echo "Updated MinVersion to 10.0.19041.0"

# Repackage (need to use makeappx)
cd ..

# Check if makeappx is available
if command -v makeappx.exe &> /dev/null; then
    makeappx.exe pack /d "$TEMP_DIR" /p "$OUTPUT_FILE" /o
elif [ -f "/c/Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64/makeappx.exe" ]; then
    "/c/Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64/makeappx.exe" pack /d "$TEMP_DIR" /p "$OUTPUT_FILE" /o
else
    # Fallback: just zip it (won't work for Store but good for testing)
    echo "makeappx not found, creating zip (rename to .msix)"
    cd "$TEMP_DIR"
    zip -r -q "../$OUTPUT_FILE" .
    cd ..
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo "Created: $OUTPUT_FILE"
echo "Done!"
