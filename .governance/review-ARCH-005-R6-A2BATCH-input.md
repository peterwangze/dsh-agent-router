# 代码审查报告 — ARCH-005 / A2 批（HD-003 codec create() 工厂迁移）（Code Reviewer，round 6 / unit A2-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 6 --unit A2 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged diff（先审后提交）；P2 F-1/F-2 已退回原 Developer commit 内收口。

**Round**: R1（A2 批首轮）
**审查对象**: staged 未 commit 6 文件（lib/rpc.js +30/−7、lib/client.js +11/−3、tests/served-client.js 镜像、tests/rpc-shadow-guard.mjs +153/−12、tests/host-abi-health.mjs +8/−2、tests/smoke.mjs +4/−2）
**审查模式**: 零采信自报——全部判据独立实读宿主源码 / 独立复算 / 独立复跑取证

## 审查结论：APPROVED_WITH_NOTES

`unresolved_blockers = 0`（P0=0，P1=0，P2×2 + P3×3 非阻塞）

---

## 一、独立复跑结果

| 命令 | 结果 | 对照 |
|---|---|---|
| `node tests/rpc-shadow-guard.mjs`（chcp 65001） | **39 断言全绿 exit 0**，含 §6 真树段（靶子 APPDATA npm-global）+ 负控 throw 逐字命中 | 一致 ✓ |
| `node tests/run-all.mjs`（chcp 65001） | **20/21**，smoke 恰 2 条 sh 臂 + 1 skipped；host-contract #SKIP 0 | 逐项一致 ✓ |
| 镜像 blob 复算 | 双侧 `448a7c94559b5f8736dc5cc15f21c48172b1c246`；cmp 零差异 | 字节恒等 ✓ |

红演示不重放；静态可判别性核验成立——旧形态回退命中四层独立判红面（§4 creatable 前置闸 :201-205 / §4 结构性在场 :216-218 / §5 formAudit :249 / §6 真树双通道 validateCodec throw）；§6 负控即判红能力的机器复演。

## 二、审查重点逐项结论

**1. 单点正确性 — 通过**。`strictCodec`（lib/rpc.js:29-35）键集恰 `{mode, typeSymbol, create}`，与宿主 validateCodec（:562-566 实读）兼容；typeSymbol 非空即可（不强制唯一——参数位共用 types#request 为批前既有语义非回归）；`create()` 闭包交回同一 schema 对象与宿主 materialize 一次性求值（:510 `??=`）兼容；宿主自证形态对照（api-remotes :11666-11680）同构；index.js:305 纯透传正确零触碰；19 条描述子全经两 helper 无旁路。

**2. 真树校验 authenticity — 通过（含 F-3 注释锚点微漂移）**。import 命中真实 0.2.0-rc.2 全局树，被测面全部真码；ctx 垫片三面锚定宿主源码成立（cordis :1782 / typert-registry :398/:147/:357）；负控 throw 逐字断言复跑绿；宿主树缺失显式 skip（BR-03）。

**3. P5 零残留 — 独立复算通过**。codec 位 `schema:` 键字面量 0 命中；全仓 `.schema` codec 属性访问 0 命中；§5 键集判据恰三键——双侧 38 位机器看护（每描述子恰 1 参数实读核对）。

**4. 镜像纪律 — 通过**。blob ID 恒等 + host-abi-health §3 判据绿。

**5. 锁外 2 文件裁定 — 均机械必需无夹带**。smoke.mjs :269/:275（旧 `.schema` 消费位不改即 TypeError，diff 仅两行）；host-abi-health.mjs :180（同强制）+ ANCHOR_CASES 入册（9h-5 机器强制——本批 rpc.js 注释新增 2 处宿主锚未入表即红；stale:[] 合理 + fresh 双锚经实读核验值准确）。

**6. AI 专项五查 — 零命中**（§6 stub 为锚定宿主源码的最小垫片，P10-④ 合规）。

**7. 设计一致性**：§6 A2 行四验收门逐项对上；文件面超出设计清单的三文件全部机器强制（设计清单是上界不是配额）。

## 三、Findings（全部非阻塞）

| # | 级别 | 位置 | 问题 | 建议 |
|---|---|---|---|---|
| F-1 | **P2** | tests/rpc-shadow-guard.mjs:280-291 | §6 候选链次序 `PACKAGES → SOURCE` 与注释「host-contract 同款首段」不符（host-contract :455-456 实为 SOURCE 优先）；双 env 同设时两守卫可解析不同树；注释事实性失准 | 对齐次序或改写注释 |
| F-2 | **P2** | tests/rpc-shadow-guard.mjs:39-42 vs :258-276/:315-336 | check() 仅收两参，§5/§6 诊断第三参被静默丢弃——判红时失败清单不打印，与 §4「诊断优先」惯例不一致；P8 失败可观测弱化 | check() 增第三参打印或判据前 console.error |
| F-3 | P3 | :300/:227 | 锚行号微漂移（cordis provide 实 :1782 / remotes.register 实 :1664 / validateCodec 起 :562）；对象语义正确判据不受影响 | 下批顺手勘正 |
| F-4 | P3 | :294-295 | 宿主树缺失机器断言基线 39→36，summary 不标 skip 计数 | 可选附计数 |
| F-5 | P3 | 交付自报 | 「stash 往返」未一手复放；独立裁定静态因果零交叉成立（smoke diff 仅 rpc 段 2 行，失败两臂在 install-entry sh 段） | 无需动作；CI 权威背书 |

## 四、硬门槛裁决

P0=0；5 维度全覆盖；findings 标注 5/5；设计一致性完成；AI 专项 5/5。F-1/F-2 随本批收口（Coordinator 已退回 Developer）；F-3/F-4/F-5 登记遗留。
