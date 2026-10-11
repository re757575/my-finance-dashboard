#!/usr/bin/env bash
# 開發流程第 7 步：把分支 fast-forward 併回 main，移除它的 worktree 並刪除分支。不會 push。
#
# 用法：scripts/finish-worktree.sh <分支名稱>
# 例：  scripts/finish-worktree.sh feat/snapshot-note
#
# 所有檢查都在動手之前完成，任何一項沒過就停下來、不做任何變更：
# - 該分支的 worktree 有未 commit 或未追蹤的變更
# - 主目錄不在 main，或有未 commit／未追蹤的變更
# - main 有該分支沒有的 commit，無法 fast-forward
#
# 訊息裡的變數一律寫成 ${變數}：macOS 內建的 bash 3.2 會把緊接在後的全形標點的位元組
# 併進變數名稱，在 set -u 之下以 unbound variable 中止。
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "用法：scripts/finish-worktree.sh <分支名稱>（例：feat/snapshot-note）" >&2
  exit 1
fi

branch="$1"
# worktree list 的第一筆一定是主目錄，從任何一個 worktree 執行都指向同一處
main_root="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
# 該分支所在的 worktree：每筆以「worktree <路徑>」開頭，其後有一行「branch refs/heads/<分支>」
target="$(git worktree list --porcelain | awk -v ref="branch refs/heads/$branch" '
  /^worktree / { path = substr($0, 10) }
  $0 == ref { print path; exit }
')"

if [ -z "$target" ]; then
  echo "錯誤：找不到分支 ${branch} 的 worktree（git worktree list 可列出現有的 worktree）。" >&2
  exit 1
fi

if [ "$target" = "$main_root" ]; then
  echo "錯誤：${branch} 目前在主目錄 ${main_root}，不是另外建立的 worktree，沒有可以收尾的對象。" >&2
  exit 1
fi

# 之後的 git 指令都在主目錄執行：從即將被移除的 worktree 內呼叫時，目前目錄會消失
cd "$main_root"

# 有未 commit 或未追蹤的變更時回傳 0（被 .gitignore 忽略的檔案不算，例如 node_modules）
has_changes() {
  [ -n "$(git -C "$1" status --porcelain)" ]
}

if has_changes "$target"; then
  echo "錯誤：worktree ${target} 有未 commit 或未追蹤的變更，請先 commit 或移除。" >&2
  git -C "$target" status --short >&2
  exit 1
fi

main_branch="$(git symbolic-ref --quiet --short HEAD || echo "分離的 HEAD")"
if [ "$main_branch" != main ]; then
  echo "錯誤：主目錄 ${main_root} 不在 main（目前是 ${main_branch}）。請先確認原因，再切回 main。" >&2
  exit 1
fi

if has_changes "$main_root"; then
  echo "錯誤：主目錄 ${main_root} 有未 commit 或未追蹤的變更。這些變更不屬於 ${branch}，請先確認來源再處理。" >&2
  git status --short >&2
  exit 1
fi

# main 必須是該分支的祖先才能 fast-forward
if ! git merge-base --is-ancestor main "$branch"; then
  echo "錯誤：main 有 ${branch} 沒有的 commit，無法 fast-forward，未做任何變更。" >&2
  echo "請在 worktree ${target} 內執行 git rebase main，重做開發流程第 5 步（驗證）後再執行一次。" >&2
  exit 1
fi

git merge --ff-only "$branch"
git worktree remove "$target"
git branch -d "$branch"

echo
echo "已將 ${branch} 併入 main，並移除 worktree 與分支。"
echo "尚未 push：push 到 main 就會部署，由使用者決定。"
