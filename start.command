#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '需要 Node.js 22 或更新版本。安装后重新打开此文件。'
  read '?按回车关闭…'
  exit 1
fi
node server.mjs --open
if [[ $? -ne 0 ]]; then
  read '?启动未完成，请查看上面的提示。按回车关闭…'
fi
