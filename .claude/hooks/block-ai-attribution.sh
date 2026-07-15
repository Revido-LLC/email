#!/bin/sh
# Block any git/gh command that would write AI-generation attribution into a
# commit message or PR description. Enforces the repo's no-attribution rule
# (CLAUDE.md) mechanically, so a slipped trailer fails the commit instead of
# landing in the public history. POSIX sh, no dependencies.
#
# Reads the PreToolUse Bash payload on stdin, lowercases ASCII, and:
#   - exits 0 immediately unless the command writes a message/PR body
#   - exits 2 (blocking) if any banned attribution marker is present
# Scanning the whole payload deliberately catches heredocs, inline -F message
# files, and amends -- anywhere the text could ride in.

payload=$(cat)
lower=$(printf '%s' "$payload" | tr '[:upper:]' '[:lower:]')

# Only inspect commands that publish authored text.
case "$lower" in
  *"git commit"* | *"git merge"* | *"gh pr create"* | *"gh pr merge"* | *"gh pr edit"*) ;;
  *) exit 0 ;;
esac

# Banned markers (already lowercased). Last entry is the JSON-escaped robot emoji.
for needle in \
  'co-authored-by: claude' \
  'generated with claude code' \
  'noreply@anthropic.com' \
  '🤖' \
  '\ud83e\udd16'; do
  case "$lower" in
    *"$needle"*)
      echo "block-ai-attribution: refusing this commit/PR -- it contains AI-generation attribution (\"$needle\")." >&2
      echo "Remove it. CLAUDE.md bans AI attribution anywhere in the git history." >&2
      exit 2
      ;;
  esac
done

exit 0
