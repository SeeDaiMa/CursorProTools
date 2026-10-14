#!/bin/sh
set -eu
PATCH_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PATCH_BUILD="$PATCH_DIR/build-$(date +%Y%m%d-%H%M%S)"
echo 'Save your work and fully quit Cursor before continuing.'
python3 "$PATCH_DIR/patch.py" prepare --output "$PATCH_BUILD"
python3 "$PATCH_DIR/patch.py" install "$PATCH_BUILD"
echo "Keep this backup directory for rollback: $PATCH_BUILD"
echo 'Reopen Cursor, open the model picker, and inspect MAX Mode.'
