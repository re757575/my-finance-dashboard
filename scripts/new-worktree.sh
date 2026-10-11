#!/usr/bin/env bash
# 開發流程第 1 步：從 main 建立新分支與 git worktree，並安裝依賴。
#
# 用法：scripts/new-worktree.sh <分支名稱>
# 例：  scripts/new-worktree.sh feat/snapshot-note
#       → ../my-finance-dashboard-snapshot-note（分支 feat/snapshot-note）
#
# 依賴一定要在 worktree 內用 npm ci 安裝，不可把 node_modules 連結到主目錄：
# - npm ci 的 prepare 會產生 .husky/_；少了它 pre-commit 不會執行，而且沒有任何錯誤訊息
# - 連結到主目錄時，dev server 會拒絕載入 node_modules 內的字型檔（403）
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "用法：scripts/new-worktree.sh <分支名稱>（例：feat/snapshot-note）" >&2
  exit 1
fi

branch="$1"
# worktree list 的第一筆一定是主目錄，從任何一個 worktree 執行都指向同一處
main_root="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
target="$(dirname "$main_root")/$(basename "$main_root")-${branch##*/}"

git -C "$main_root" worktree add "$target" -b "$branch" main
(cd "$target" && npm ci)

if [ ! -d "$target/.husky/_" ]; then
  echo "錯誤：$target/.husky/_ 不存在，pre-commit 不會執行。" >&2
  exit 1
fi

echo
echo "worktree：$target"
echo "分支：    $branch"
