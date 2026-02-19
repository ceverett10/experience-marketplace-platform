#!/bin/bash
# Blocks Claude from running dangerous git commands

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Block patterns:
#   git config       - changing git settings
#   git push --force - force pushing (rewriting remote history)
#   git push -f      - same as above (short flag)
#   git reset --hard - discarding all local changes
#   git clean -f     - deleting untracked files
#   git branch -D    - force-deleting branches
if echo "$COMMAND" | grep -qiE '(git\s+config|git\s+push\s.*--(force|no-verify)|git\s+push\s.*\s-f\b|git\s+reset\s+--hard|git\s+clean\s+-f|git\s+branch\s+-D)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Blocked: this git command is not allowed. Ask the user to run it manually."
    }
  }'
  exit 0
fi

# Allow everything else
exit 0
