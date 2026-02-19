#!/bin/bash
# Claude Code pre-commit quality gate
# Runs lint, typecheck, and format check before allowing commits.
# If any check fails, the commit is blocked.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Skip if this is an amend (user explicitly requested)
if echo "$COMMAND" | grep -qE '\-\-amend'; then
  exit 0
fi

ERRORS=""

# Run ESLint
echo "Running ESLint..." >&2
if ! npm run lint --silent 2>&1; then
  ERRORS="$ERRORS\n- ESLint failed. Run 'npm run lint:fix' then 'npm run lint' to resolve."
fi

# Run TypeScript type check
echo "Running TypeScript type check..." >&2
if ! npm run typecheck --silent 2>&1; then
  ERRORS="$ERRORS\n- TypeScript type check failed. Run 'npm run typecheck' to see errors."
fi

# Run Prettier format check
echo "Running Prettier format check..." >&2
if ! npm run format:check --silent 2>&1; then
  ERRORS="$ERRORS\n- Prettier format check failed. Run 'npm run format' then 'npm run format:check' to resolve."
fi

if [ -n "$ERRORS" ]; then
  REASON=$(printf "Pre-commit checks failed:\n%b\n\nFix these issues before committing." "$ERRORS")
  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
fi

# All checks passed
exit 0
