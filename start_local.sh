#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Load .env — splits only on the FIRST = so values with & = + are safe
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue   # skip comments
  [[ -z "${line//[[:space:]]/}" ]] && continue   # skip blank lines
  key="${line%%=*}"
  value="${line#*=}"
  [[ -z "$key" ]] && continue
  export "$key=$value"
done < .env

npm run dev
