#!/usr/bin/env bash
# 開發流程第 7 步：把分支 fast-forward 併回 main，移除它的 worktree 並刪除分支。不會 push。
#
# 用法：scripts/finish-worktree.sh <分支名稱>
# 例：  scripts/finish-worktree.sh feat/snapshot-note
#
# 動手之前先做完所有檢查，遇到下列任何一種情況就停下來、不做任何變更：
# - 分支不存在，或它就在主目錄（不是另外建立的 worktree）
# - 分支沒有 worktree，也還沒併入 main
# - 該分支的 worktree 或主目錄有未 commit 或未追蹤的變更，或讀不到它們的 git status
# - 主目錄不在 main
# - 分支還沒併入 main，而 main 有該分支沒有的 commit，無法 fast-forward
#
# 檢查通過後依序合併、移除 worktree、刪除分支，已經做過的步驟會略過：分支已經在 main 裡
# 就不合併，分支已經沒有 worktree 就只刪除分支。所以合併之後才失敗時（例如刪除分支失敗），
# 排除原因後再執行一次同樣的指令，就會接著把剩下的步驟做完。
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
# 之後的 git 指令都在主目錄執行：從即將被移除的 worktree 內呼叫時，目前目錄會消失
cd "$main_root"

if ! git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then
  echo "錯誤：分支 ${branch} 不存在（git branch 可列出現有的分支）。" >&2
  exit 1
fi

# 該分支所在的 worktree：每筆以「worktree <路徑>」開頭，其後有一行「branch refs/heads/<分支>」。
# 上一次執行已經移除 worktree 時是空字串
target="$(git worktree list --porcelain | awk -v ref="branch refs/heads/$branch" '
  /^worktree / { path = substr($0, 10) }
  $0 == ref { print path; exit }
')"

if [ "$target" = "$main_root" ]; then
  echo "錯誤：${branch} 目前在主目錄 ${main_root}，不是另外建立的 worktree，沒有可以收尾的對象。" >&2
  exit 1
fi

# 分支的 commit 是否都已經在 main 裡：先前合併過，或上一次執行在合併之後中斷
if git merge-base --is-ancestor "$branch" main; then
  merged=yes
else
  merged=no
fi

if [ -z "$target" ] && [ "$merged" = no ]; then
  echo "錯誤：分支 ${branch} 沒有 worktree（git worktree list 可列出現有的 worktree），也還沒併入 main，沒有可以收尾的對象。" >&2
  exit 1
fi

# 有未 commit 或未追蹤的變更時回傳 0（被 .gitignore 忽略的檔案不算，例如 node_modules）。
# git status 本身失敗時無從判斷有沒有變更，直接中止，不當成「沒有變更」
has_changes() {
  local output
  if ! output="$(git -C "$1" status --porcelain)"; then
    echo "錯誤：讀不到 ${1} 的 git status（原因見上方 git 的訊息），未做任何變更。" >&2
    exit 1
  fi
  [ -n "$output" ]
}

if [ -n "$target" ] && has_changes "$target"; then
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

# 還沒併入時，main 必須是該分支的祖先才能 fast-forward
if [ "$merged" = no ] && ! git merge-base --is-ancestor main "$branch"; then
  echo "錯誤：main 有 ${branch} 沒有的 commit，無法 fast-forward，未做任何變更。" >&2
  echo "請在 worktree ${target} 內執行 git rebase main，重做開發流程第 5 步（驗證）後再執行一次。" >&2
  exit 1
fi

# 檢查到此為止，以下開始變更
if [ "$merged" = yes ]; then
  echo "${branch} 的 commit 已經都在 main 裡，略過合併。"
else
  git merge --ff-only "$branch"
fi

# 走到這裡分支已經在 main 裡：之後的步驟失敗時，重新執行會略過合併、接著做完
stop_unfinished() {
  echo "錯誤：收尾沒有做完，${branch} 已併入 main。排除上方 git 回報的問題後再執行一次同樣的指令，會接著做完剩下的步驟。" >&2
  exit 1
}

if [ -n "$target" ]; then
  git worktree remove "$target" || stop_unfinished
fi
git branch -d "$branch" || stop_unfinished

echo
echo "${branch} 已併入 main，worktree 與分支都已移除。"
echo "尚未 push：push 到 main 就會部署，由使用者決定。"
