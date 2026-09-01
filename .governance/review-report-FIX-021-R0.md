# Review — FIX-021 R0（directAssetUrlOf 兜底序补 id 字段，一行级 P0 修复）

- **Round**: R0
- **Task**: FIX-021 — EVO-012 复验失败真根因：宿主浏览器侧 image content block 的 attachment 归一化字段为 `id`（dsh-client-ui-conversation 实证——浏览器 store 形状与持久化 jsonl 的 attachmentId 不同），id-only ref 推导空 → RouteImage 走 imageData RPC → 宿主网关 rejected → 用户见错误按钮
- **Commit**: `2e945f6`，base 04231a7
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-31
- **范围说明**: 无命令面；门控采信 Coordinator（16/16 + 宿主服务 bundle 已含修复 watch 推送验证）。

## 快审要点核验

① **兜底正确性** ✓ — `lib/client.js:3755-3761`：优先序 **url > attachmentId > id**（attachmentId 为标记规范字段优先，id 兜底浏览器归一化形状——注释 :3747-3752 完整记录形状差异取证）；按序取首个非空 string（互斥语义正确）；encodeURIComponent 统一出口（:3760 三字段同一出口——含 id——防路径注入）✓。

② **id 兜底误伤面** ✓ — 非 sha256 形态的 ref.id → 推导 url → 服务端 isAttachmentId 白名单 404 → onError → RPC 回退——与 attachmentId 兜底同一天然边界（安全性不变）；id 为 sha256 形态（宿主归一化同值）→ 推导直达正确；零误伤（最坏 = 404 + RPC 回退 = 批一既有行为）✓。

③ **判别质量** ✓ — client-render :1146-1186 五断言：id-only 推导（:1180 RED——批二推导空走 RPC）/ attachmentId 仍推导（:1181）/ url 优先于 id（:1182 优先序判别）/ 零 RPC（:1183 RED——批二对 id-only 调 RPC）/ 展开态零 RPC（:1186）——RED 2 断言复现用户错误按钮路径，GREEN 三字段优先序 + 零 RPC 覆盖 ✓。

④ **RCA 教训注记** ✓ — 注释（:3747-3752）完整：jsonl 持久化（attachmentId）vs 浏览器 store（id）形状差异 + 宿主归一化 + 根因链（推导空 → RPC → rejected → 错误按钮）——与用户复验路径逐字对应 ✓。

## 结论

**APPROVED**（P0=0 / P1=0 / P2=0 / P3=0 新增）

- 一行级修复正确；判别真 RED（两条复现用户路径）；安全性天然边界不变（404 → onError → RPC 回退）；RCA 注记完整。
- 既有台账延续：EVO-012 R1 P2-1（url 分支白名单纵深建议）未涉及本修复（url 分支未动）——延续。
