#!/usr/bin/env bash

# This script searches through all .js files in the specified directory
# (and its subdirectories) to find references to Chrome extension APIs
# or another specified object pattern used in place of 'chrome'. 
# It uses ripgrep (rg) to locate calls like objectName().x.y(...) or objectName.x.y(...),
# extracts only the matching parts, removes the trailing parenthesis,
# and then outputs a sorted list of unique API calls.
#
# Usage:
#   ./find_chrome_apis.sh /path/to/directory [OBJECT_NAME]
#
# Examples:
#   ./find_chrome_apis.sh /path/to/directory          # defaults to 'chrome'
#   ./find_chrome_apis.sh /path/to/directory chrome   # explicitly 'chrome'
#   ./find_chrome_apis.sh /path/to/directory browser  # firefox extensions
#   ./find_chrome_apis.sh /path/to/directory "browser_polyfill_default()"
#
# Requirements:
# - ripgrep (rg)
# - sed
# - sort & uniq (usually available by default on most Unix systems)

if [ -z "$1" ]; then
  echo "Usage: $0 DIRECTORY [OBJECT_NAME]"
  exit 1
fi

DIRECTORY="$1"
OBJECT_NAME="${2:-chrome}"  # Default to 'chrome' if not provided

# Escape all regex special characters in the object name
ESCAPED_OBJECT_NAME=$(printf '%s' "$OBJECT_NAME" | sed 's/[][(){}|.^$*+?\\/-]/\\&/g')

rg --glob '*.js' --only-matching --no-filename "${ESCAPED_OBJECT_NAME}\.[A-Za-z_]\w*(\.[A-Za-z_]\w*)*\(" "$DIRECTORY" \
  | sed 's/($//' \
  | sort \
  | uniq
