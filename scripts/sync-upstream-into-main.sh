#!/usr/bin/env bash
set -euo pipefail

main_branch="${MAIN_BRANCH:-main}"
upstream_branch="${UPSTREAM_BRANCH:-upstream}"
remote="${REMOTE:-origin}"
mode="${1:-prepare}"

usage() {
  cat <<EOF
Usage: $0 [prepare|record-only]

prepare     Update local branches, then start a no-commit merge of upstream into main.
record-only Update local branches, then create an "ours" merge commit with main content unchanged.

Environment:
  MAIN_BRANCH=$main_branch
  UPSTREAM_BRANCH=$upstream_branch
  REMOTE=$remote
EOF
}

require_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is dirty. Commit or stash changes first." >&2
    exit 1
  fi
}

fast_forward_branch() {
  local branch="$1"
  local ref="$2"

  git switch "$branch"
  git merge --ff-only "$ref"
}

case "$mode" in
  prepare | record-only) ;;
  -h | --help | help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

require_clean_worktree
git fetch "$remote" "$main_branch" "$upstream_branch"

fast_forward_branch "$upstream_branch" "$remote/$upstream_branch"
fast_forward_branch "$main_branch" "$remote/$main_branch"

case "$mode" in
  prepare)
    git merge --no-ff --no-commit "$upstream_branch"
    cat <<EOF

Merge is staged but not committed.

Keep main's version:
  git restore --source=HEAD -- path/to/file

Take upstream's version:
  git restore --source=$upstream_branch -- path/to/file

Pick hunks:
  git add -p path/to/file

Finish:
  git add .
  git commit -m "Merge upstream selectively"
EOF
    ;;
  record-only)
    git merge -s ours --no-ff "$upstream_branch" -m "Record upstream merge"
    ;;
esac
