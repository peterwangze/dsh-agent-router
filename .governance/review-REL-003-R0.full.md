# REL-003 R0 审查报告（Code Reviewer，独立只读实例）

- **round**: R0（前轮引用：EVO-005 R0——`.governance/review-EVO-005-R0.full.md`，F-1~F-7 修复依据）
- **审查对象**: `git diff ac3976c..850b30c` 逐 commit——dcd44fa（F-1）/ 6dbe57d（F-2）/ fbdfc61（F-4~F-7 P3 批次）/ d78dc00（peerDeps rc.8 + lock）/ 850b30c（version 0.3.0）；6 文件 +175/−64，与 triage 声明范围完全一致（**越权 = 0 成立**，client.js / README / CHANGELOG 均未动——归 Release 段，与 triage JSON 分段一致）
- **审查结论**: **APPROVED_WITH_NOTES（unresolved_blockers=0）**
- **发现总表**: P0=0 / P1=0 / **P2=1（N-1）** / **P3=3（N-2/N-3/N-4）**——零阻塞；前轮 F-1/F-2 两个 P1 均验证闭合

## 发现总表

| # | 级别 | 位置 | 事实 | 建议 |
|---|------|------|------|------|
| N-1 | P2 | pnpm-lock.yaml:44-45（importers 解析 0.1.0-rc.6）vs :89（dsh-agent@0.1.0-rc.8 peerDependencies 要求 dsh-typert-protocol ^0.1.0-rc.8）/:276（dsh-agent@rc.8 snapshot 内 typert-protocol 实际解析 0.1.0-rc.6） | 本次 dsh-agent 解析 rc.6→rc.8 后，其 peer 要求 typert-protocol ^rc.8，而 dev 图内 dependencies 依锁仍解析 rc.6——范围外 peer（pnpm 警告级，不阻断 install，与 Developer 自报 exit 0 相容）。dependencies 三包（dsh-llm/dsh-tools/dsh-typert-protocol）specifier 维持 rc.6 **与 DEC-025 D-4b / version-plan A-4b 裁决范围一致（裁决仅 peerDependencies——A-4 全节只讨论 peerDeps 锚定），非违规**；且生产新装时 ^0.1.0-rc.6 范围会解析到 rc.8（EV-072 实测宿主环境），故仅构成 dev 图与生产图的轻微漂移 + 一条 unmet-peer 警告 | 遗留候选：Release 段评估 dependencies 三包对齐 bump（或锁刷新）使 dev/生产解析一致并消除 unmet peer；如维持现状，建议在 Release 披露面记录该 dev 图状态 |
| N-2 | P3 | 850b30c commit message（"DEC-025 D-1a 双主题：EVO-005 设备码降级通道 + peerDeps 宿主 rc.8 对齐"） | DEC-025 原文 D-1a 双主题 = "C-1 订阅接入 + C-3 统计持久化"；commit message 把 D-2a/D-4b 的内容冠在 D-1a 名下。版本号裁决本身（0.2.1→0.3.0 MINOR）与 D-1a/v0.3.0 范围一致，无实质影响；commit 已入史不可改 | CHANGELOG（Release 段权威面）撰写时以 DEC-025 原文口径描述双主题，不沿用该措辞 |
| N-3 | P3 | lib/service.js:3343（transport 重试记 `preset_device_login_fail` + reason `poll_transport_error`） | 瞬时非终态传输错误复用 login_fail 事件 kind，仅靠 reason 区分——按 kind 过滤的消费者会把瞬时重试计入"登录失败"；P8 可观测性满足（非静默、可判别），但 kind 语义略宽 | 未来若消费 oauthEvents 做面板统计，注意 reason 维度过滤；或演进为独立 kind |
| N-4 | P3 | lib/service.js:3419-3423（cancelled 复查）→ :3548（persistPresetLogin 内 write） | F-1 剩余竞态面评估：:3419 检查与 :3548 write 发起点之间**无 await（同一同步块，JS 单线程不可交错）**；剩余窗口仅剩 write 自身 fs I/O 进行中与 logout delete() 的 OS 级交错（毫秒级），且 R0 处方即"persist 前复查"——已逐字交付，窗口较修复前（整个兑换 fetch，秒级）收窄约三个数量级 | 接受为已知剩余面；如未来需彻底闭合，可加 write 后复查 + 补偿删除（非本段义务） |

## 审查重点逐项裁决

1. **F-1 修复忠实度与竞态测试有效性 ✅**：复查位于 :3419（fetch 完成 + JSON 解析后、persistPresetLogin 前）——与 R0 处方逐字一致；同步块分析见 N-4（剩余窗口可接受）。终态 'cancelled' 经 :3334 正确回写 + finally（:3369-3370）清 Map/resolve。竞态测试（smoke.mjs 5b 块）**真实构造交错**：tokenUrl 桩在兑换 fetch 进行中 `await deviceService.oauthLogout(...)` 完整落定后才放行响应——确定性复现目标窗口。判别力三重：旧代码下 (a) persist 写盘 → existsSync 断言失败 (b) status='ok' ≠ 'cancelled' 失败 (c) 旅程断言 raceCancelledIdx===0 && raceLogoutIdx===1 失败；"登出后零 login_ok" 断言逻辑正确。oauthLogout 无双发风险（事件仅 loop 顶 :3328 与 exchange :3420 两处）。
2. **F-2 修复忠实度 ✅**：transport:true 仅附于网络错误路径（oauth-credentials.js:313 catch 块），协议拒绝/畸形响应路径无标志——既有 failed 语义不变。终止性：transport 分支不 break → 落入 :3357 expiresAt 检查 → 过期即 terminal expired；退避 `session.intervalMs += transportAdd`（:3345，默认 5000）**累计递增**，15 分钟窗口内重试次数自然有界（约 ≤19 次）。poll_transport_error vs poll_rejected 区分完整（:3343/:3349）；测试双路径两层级覆盖成立；附带 redirect_uri 守卫断言（EVO-005 协议事实回归看护——超预期好实践）。
3. **P3 批次保真 ✅**：F-4 JSDoc 补 4 事件后与 grep 全量 kind 清单（11 种）完全一致；F-5 修正为事实（六处 throw 消息实读均不含 body）；F-6 `Math.floor(timeoutMs/1000)`（:3304）与 `expiresAt`（:3281）同一局部变量——同源成立；F-7 地板值 + 注入守卫（>0 才生效）不破坏提速注入。
4. **bump 一致性 ✅（附 N-1/N-2）**：peerDeps 恰 8 包 rc.6→rc.8（package.json:49-56 实读）；dependencies 3 包维持 ^rc.6 = D-4b/A-4b 裁决范围（非违规）；lock 机械一致（importers 同步 + peer-suffix 哈希正确传导）；version 0.3.0 MINOR 与 D-1a 一致；850b30c 仅动 package.json 1 行。
5. **测试账目 ✅**：静态精确计数 smoke +8（F-6×1 + F-7×1 + F-2 服务级×3 + F-1 竞态×3）/ oauth-credentials +2 → 918、98 与自报吻合；账目链 873→908→918 连续自洽。全量 exit 0 为 Developer 自报 + 静态增量交叉验证。
6. **AI 专项 + P 原则 ✅**：AI 5 项全过（mock 零残留——fetch 还原在改动区后仍生效；transport 为自定义归一标志 JSDoc 声明非幻觉 API）；P4 零回退 ✅ / P8 净改善（poll_transport_error 显式判别）✅ / P7 零敏感值 ✅ / P9 rc.8 对齐即宿主防御 + parity 14/14 ✅。

## 五维度结论

正确性 ✅（F-1/F-2 机制逐行验证成立）/ 安全性 ✅（P7 零 token 26 处复核；竞态修复属安全语义修复）/ 可维护性 ✅（JSDoc 对齐 + 常量分立）/ 性能 ✅（消灭 1ms 热轮询；退避有界）/ 测试覆盖 ✅（竞态判别三重 + 双路径两层级 + 注入判别）

## 硬门槛自检

P0=0 ✅ / 5 维度 100% ✅ / 每条发现 P0-P3+位置+事实+建议 ✅ / 设计一致性（DEC-025 三项对照）✅ / AI 专项 5/5 ✅ / 只读约束遵守 ✅

**结论：APPROVED_WITH_NOTES，unresolved_blockers=0**（N-1 P2 建议 Release 段裁量 + N-2~N-4 P3 记账随行；F-1/F-2 两 P1 闭合验证成立，可进入 Release 资产段）
