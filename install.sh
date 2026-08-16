#!/bin/sh
# dsh-agent-router 安装脚本（macOS / Linux / Git Bash）
# 在线：curl -fsSL https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.sh | sh
# 离线：解压发行包后，在包目录内执行  ./install.sh --local .
# 环境变量 DSH_HOME 可覆盖配置目录（默认 ~/.dsh）；--profile 指定目标 profile（默认 web）。

set -e

REPO_URL="https://github.com/peterwangze/dsh-agent-router.git"
REF="main"
LOCAL_PATH=""
PROFILE="web"
PLUGIN="dsh-agent-router"
OLD_PLUGIN="dsh-router"

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --local) LOCAL_PATH="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    -h|--help)
      echo "用法: ./install.sh [--ref <分支>] [--repo <git地址>] [--local <离线包目录>] [--profile <profile>]"
      exit 0 ;;
    *) echo "未知参数: $1（--help 查看用法）"; exit 1 ;;
  esac
done

step() { echo "==> $*"; }

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

# ── 1. 定位源码 ────────────────────────────────────────────────────────
if [ -n "$LOCAL_PATH" ]; then
  SRC="$(cd "$LOCAL_PATH" && pwd)"
  if [ ! -f "$SRC/package.json" ]; then
    echo "离线安装目录无效：$SRC 下找不到 package.json（请指向解压后的包根目录）" >&2
    exit 1
  fi
  step "离线模式：使用本地源码 $SRC"
else
  SRC="$DSH_HOME/plugins-src/$PLUGIN"
  if [ -d "$SRC/.git" ]; then
    step "源码目录已存在，git pull 更新（分支 $REF）…"
    git -C "$SRC" fetch --depth 1 origin "$REF"
    git -C "$SRC" checkout -q "$REF"
    git -C "$SRC" pull -q --ff-only origin "$REF"
  else
    step "git clone $REPO_URL（分支 $REF）…"
    mkdir -p "$(dirname "$SRC")"
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$SRC"
  fi
fi

# ── 2. 链接 / 拷贝到 profiles/node_modules ─────────────────────────────
NODE_MODULES="$DSH_HOME/profiles/node_modules"
DST="$NODE_MODULES/$PLUGIN"
OLD_DST="$NODE_MODULES/$OLD_PLUGIN"
mkdir -p "$NODE_MODULES"

# 旧名迁移：指向同一源码的旧符号链接直接移除，由本脚本以新名重建。
if [ -L "$OLD_DST" ]; then
  step "迁移：移除旧链接 $OLD_DST"
  rm -f "$OLD_DST"
elif [ -e "$OLD_DST" ]; then
  echo "警告：发现旧目录 $OLD_DST（非链接）：如不再使用请手动删除" >&2
fi

if [ -e "$DST" ] || [ -L "$DST" ]; then
  if [ ! -L "$DST" ]; then
    echo "$DST 已存在且不是符号链接：请先手动移除后重试" >&2
    exit 1
  fi
  step "链接已存在：$DST"
else
  if ln -s "$SRC" "$DST" 2>/dev/null; then
    step "已创建符号链接：$DST -> $SRC"
  else
    step "符号链接创建失败：改用目录拷贝…"
    rm -rf "$DST"
    mkdir -p "$DST"
    (cd "$SRC" && tar -cf - --exclude=.git --exclude=node_modules --exclude=.router-files --exclude=tests .) | (cd "$DST" && tar -xf -)
    step "拷贝完成：$DST"
  fi
fi

# ── 3. 幂等写入 cordis.patch.yml（宿主平面两行：router + tool-router）──
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
mkdir -p "$PROFILE_DIR"
PATCH="$PROFILE_DIR/cordis.patch.yml"

patch_template() {
  cat <<EOF
# Added by dsh-agent-router installer: host-plane rows for multi-model routing.
# - \`router\`      : router service + Agent Routing settings page + /api/router/* Remote
# - \`tool-router\` : route_agent tool + router:agents prompt section (visible to ALL agent presets)
- insert:
    - id: router
      name: $PLUGIN
    - id: tool-router
      name: $PLUGIN/tool
EOF
}

if [ ! -f "$PATCH" ]; then
  step "创建 $PATCH"
  patch_template > "$PATCH"
else
  # 旧名迁移
  if grep -q "name: $OLD_PLUGIN" "$PATCH"; then
    sed -i.bak "s/name: $OLD_PLUGIN/name: $PLUGIN/g" "$PATCH" && rm -f "$PATCH.bak"
    step "已更新 $PATCH（旧名 $OLD_PLUGIN 迁移为 $PLUGIN）"
  fi
  if grep -q "name: $PLUGIN" "$PATCH"; then
    step "$PATCH 已配置，跳过"
  else
    LC_ALL=C awk -v plugin="$PLUGIN" '
      { gsub(/\r$/, ""); lines[NR] = $0 }
      /^[[:space:]]*(-[[:space:]]+)?insert:[[:space:]]*$/ && !found { L = NR; found = 1 }
      END {
        if (!found) {
          # `[]`（空数组 = 禁用层形态）不能与新增条目并存：直接用 insert 条目替换该行。
          empty = 0
          for (i = 1; i <= NR; i++) if (lines[i] ~ /^[[:space:]]*\[\][[:space:]]*$/) { empty = i; break }
          if (empty > 0) {
            for (i = 1; i < empty; i++) print lines[i]
            print "- insert:"
            print "    - id: router"
            print "      name: " plugin
            print "    - id: tool-router"
            print "      name: " plugin "/tool"
            for (i = empty + 1; i <= NR; i++) print lines[i]
            exit
          }
          for (i = 1; i <= NR; i++) print lines[i]
          print ""
          print "- insert:"
          print "    - id: router"
          print "      name: " plugin
          print "    - id: tool-router"
          print "      name: " plugin "/tool"
          exit
        }
        s = lines[L]; match(s, /[^[:space:]]/)
        insert_indent = RSTART > 0 ? RSTART - 1 : 0
        P = L; item_indent = 0
        for (i = L + 1; i <= NR; i++) {
          line = lines[i]
          if (line ~ /^[[:space:]]*$/) continue
          if (line ~ /^[[:space:]]*#/) continue
          match(line, /[^[:space:]]/)
          ind = RSTART > 0 ? RSTART - 1 : 0
          if (line ~ /^[[:space:]]*-[[:space:]]/) {
            if (ind <= insert_indent) break
            if (item_indent == 0) item_indent = ind
            P = i
          } else {
            if (ind <= insert_indent) break
            if (item_indent == 0) item_indent = ind
            P = i
          }
        }
        if (item_indent == 0) item_indent = 4
        pad = ""; for (j = 0; j < item_indent; j++) pad = pad " "
        for (i = 1; i <= P; i++) print lines[i]
        print pad "- id: router"
        print pad "  name: " plugin
        print pad "- id: tool-router"
        print pad "  name: " plugin "/tool"
        for (i = P + 1; i <= NR; i++) print lines[i]
      }' "$PATCH" > "$PATCH.tmp" && mv "$PATCH.tmp" "$PATCH"
    step "已更新 $PATCH（插入 router / tool-router 宿主行）"
  fi
fi

echo ""
echo "✓ $PLUGIN 安装完成（源码：$SRC；profile：$PROFILE）"
echo "  请重启 DSH，然后在「设置 → Agent 路由」添加专业 Agent。"
