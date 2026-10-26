#!/bin/bash

SESSION_FILE="$HOME/.claude/session-current.json"

# Read JSON from stdin
json_input=$(cat)

# Extract fields using sed (more robust for JSON)
session_id=$(echo "$json_input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
input_tokens=$(echo "$json_input" | sed -n 's/.*"input_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
output_tokens=$(echo "$json_input" | sed -n 's/.*"output_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
cache_read_tokens=$(echo "$json_input" | sed -n 's/.*"cache_read_input_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')

# Exit if no session_id (malformed input)
if [[ -z "$session_id" ]]; then
  exit 0
fi

now=$(date +%s)
session_id_short="${session_id:0:6}"
input_tokens=${input_tokens:-0}
output_tokens=${output_tokens:-0}
cache_read_tokens=${cache_read_tokens:-0}
current_tokens=$((input_tokens + output_tokens + cache_read_tokens))

# Check if file exists and has same session_id
if [[ -f "$SESSION_FILE" ]]; then
  existing_id=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SESSION_FILE" 2>/dev/null)

  if [[ "$existing_id" == "$session_id" ]]; then
    # Same session — accumulate tokens
    old_input=$(sed -n 's/.*"total_input_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$SESSION_FILE" || echo "0")
    old_output=$(sed -n 's/.*"total_output_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$SESSION_FILE" || echo "0")
    old_cache=$(sed -n 's/.*"total_cache_read_tokens"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$SESSION_FILE" || echo "0")
    start_time=$(sed -n 's/.*"start_time"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$SESSION_FILE")

    old_input=${old_input:-0}
    old_output=${old_output:-0}
    old_cache=${old_cache:-0}

    new_input=$((old_input + input_tokens))
    new_output=$((old_output + output_tokens))
    new_cache=$((old_cache + cache_read_tokens))
    new_total=$((new_input + new_output + new_cache))
  else
    # New session — reset
    start_time=$now
    new_input=$input_tokens
    new_output=$output_tokens
    new_cache=$cache_read_tokens
    new_total=$current_tokens
  fi
else
  # File doesn't exist — new session
  start_time=$now
  new_input=$input_tokens
  new_output=$output_tokens
  new_cache=$cache_read_tokens
  new_total=$current_tokens
fi

# Write updated stats
cat > "$SESSION_FILE" <<EOF
{
  "session_id": "$session_id",
  "session_id_short": "$session_id_short",
  "start_time": $start_time,
  "last_updated": $now,
  "total_input_tokens": $new_input,
  "total_output_tokens": $new_output,
  "total_cache_read_tokens": $new_cache,
  "total_tokens": $new_total
}
EOF
