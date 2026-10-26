#!/bin/bash

SESSION_FILE="$HOME/.claude/session-current.json"

# Check if file exists
if [[ ! -f "$SESSION_FILE" ]]; then
  echo "[no session]"
  exit 0
fi

# Read stats using sed (no jq dependency)
session_id_short=$(sed -n 's/.*"session_id_short"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SESSION_FILE" 2>/dev/null)
start_time=$(sed -n 's/.*"start_time"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$SESSION_FILE" 2>/dev/null)
total_tokens=$(sed -n 's/.*"total_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$SESSION_FILE" 2>/dev/null)

# Validate
if [[ -z "$session_id_short" || -z "$start_time" || "$start_time" == "0" ]]; then
  echo "[no session]"
  exit 0
fi

# Calculate elapsed time
now=$(date +%s)
elapsed=$((now - start_time))

# Format elapsed time (mm:ss or Xm Ys)
if [[ $elapsed -lt 60 ]]; then
  time_str="${elapsed}s"
elif [[ $elapsed -lt 3600 ]]; then
  minutes=$((elapsed / 60))
  seconds=$((elapsed % 60))
  time_str="${minutes}m ${seconds}s"
else
  hours=$((elapsed / 3600))
  remainder=$((elapsed % 3600))
  minutes=$((remainder / 60))
  time_str="${hours}h ${minutes}m"
fi

# Format tokens with thousands separator (if printf supports %'d, use it; else fall back)
formatted_tokens=$(printf "%'d" "$total_tokens" 2>/dev/null || echo "$total_tokens")

echo "[$session_id_short] $time_str | $formatted_tokens tok"
