# Review — FIX-012 R0（文本模型发图自动多模态接管：图片条件化武装 + armedBy 来源语义）

- **Round**: R0
- **Task**: FIX-012 — 文本模型贴图被宿主准入拦截（MODEL_DOES_NOT_SUPPORT_IMAGES），自动接管需 takeoverDefaultModel===true（FIX-002 默认 false）→ 永不自动切 twin。用户裁决 2026-08-30：贴图即切、发送后保持
- **Commits**: `c3831b4`（lib/client.js + tests/fix-012-image-takeover.mjs）+ `4f26846`（镜像同步 tests/served-client.js，与 lib/client.js 全等——一并审查）
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 审查者无命令面（Bash ❌）；宿主侧关键假设已直接读取宿主源码核验（非仅采信任务书）。

## 审查证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| 宿主 selectModel 零图片校验 | `@deepseek-ai/dsh-host-apiproxy/lib/index.js:2596-2630`（直接读取） | 仅 resolveCallConfig + 写 `selectionFor(...).current` + best-effort saveDefaultModelSelection——对会话历史/草稿图片**零校验**（旧注释假设证伪成立）✓ |
| 宿主 prompt 准入 | 同上 `:2749-2760`（实际 :2755-2759） | `hasImage → resolveModelInfo → inputModalities 不含 image → MODEL_DOES_NOT_SUPPORT_IMAGES` ✓ |
| pi-ai 时点拦截 | `@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1721` | `containsImage && !model.input.includes("image")` → UNSUPPORTED_CONTENT ✓ |
| 武装条件 | `lib/client.js:3259-3261` | `imageCount`（input.imageIds 长度，null 安全）+ `takeoverArmed = multimodalAgentsOf(catalog).length > 0 && (takeoverDefaultModel === true \|\| imageCount > 0)` + `imageConditional` ✓ |
| 记忆写入/升级/保持 | `lib/client.js:3282`（armedBy: imageConditional ? 'image' : 'switch'）/ `:3283-3288`（armed 重跑升级 switch）/ `:3290-3298`（image 来源永不自动还原 + 用户改走清记忆）/ `:3299-3311`（switch 来源既有还原链） | 与组件头注释承诺一致 ✓ |
| effect 清理/取消 | `lib/client.js:3265/3316-3317` | cancelled 标志 + cleanup ✓ |
| 测试钩子 | `lib/client.js:3770-3774`（exports.ModelTakeover/setRouterCatalog）；`package.json:16-26`（dsh.client web 消费 apply/inject） | 宿主消费面不受影响（附加导出惰性）✓ |
| 判别测试 | `tests/fix-012-image-takeover.mjs`（310 行，18 断言） | Q1/S1/SW3/SW5 四项在旧逻辑下必败（逻辑级，非仅钩子缺失）✓ |
| 镜像 | `tests/served-client.js` 与 `lib/client.js` 均 3777 行；12 个对齐区域抽样逐行一致（95-116/415/672/860-881/1194/1450-1469/2063-2071/2210-2227/2905-2922/3165-3310/3255-3272/3768-3774） | 全等主张强支持（未逐字节穷举——无命令面，标注为抽样一致）✓ |

## 维度 1：正确性

- **武装条件正确**：四象限语义 = 存在多模态 agent 且（开关 true 或待发图片>0）。默认开关 false + 纯文本轮 → 不接管（FIX-002 主权保留）；贴图 → 立即接管（用户裁决）✓。
- **发送后保持**：imageCount 1→0（发送或移除，观测面不可区分）→ armed 变 false → image 分支**不发起任何 selectModel**（:3292-3298）——不依赖「宿主拒绝还原」这一已证伪假设 ✓。
- **循环重入/幂等**：selectModel 成功写记忆 → 下次 effect 运行见 wrapped + 记忆 → 升级分支零调用（SW5 断言零重复接管）；宿主 selectModel 为纯写（实证），无递归风险 ✓。
- **null-catalog 安全**：catalog null → multimodalAgentsOf=[] → armed=false → 走记忆分支；image 记忆保持、switch 记忆还原——与 FIX-002 既有 null 行为一致（非新回归，见 P3-2）✓。
- **手动 twin 尊重**：wrapped 且无记忆 → 任何分支零调用（F3-2 贴图场景经推演仍绿：手动 twin 已 wrapped + 无记忆 → no-op）✓。
- **升级链**：开关开启（无图在途）→ armed 重跑 → armedBy 升级 switch → 关闭 → 既有还原（SW3-SW6 断言全链）✓；**边界缺口见 P2-1**。
- 资源/并发：无新增共享可变状态（takeoverMemory 为 FIX-002-R7 既有模块级 Map，key 按 sessionId）；effect 清理正确 ✓。

## 维度 2：安全性

- 纯只读 host API 消费（sessions.models/selectModel——签名与宿主源码 :2586-2595/:2596-2630 一致）；无注入面/无敏感数据/无权限变化 ✓。

## 维度 3：可维护性

- 组件头注释（:3222-3244）完整记录用户裁决、宿主实证结论（selectModel 零校验/准入两点式）、不可区分性论证与「永不自动还原」理由——事实链闭环，非角色叙事 ✓；armedBy 命名表达来源语义 ✓。
- **P2-1（见发现表）**：effect deps 缺 `imageConditional`。
- 测试钩子导出有注释说明用途（:3770-3774），宿主仅消费 apply/inject（package.json dsh.client 声明）✓。

## 维度 4：性能

- effect 仅在 deps（sessionId/api/takeoverArmed/imageCount）变化时运行，单次 O(1) 检查 + 至多一次 RPC；无循环/无懒加载问题 ✓。

## 维度 5：测试覆盖

- 18 断言覆盖：四象限（Q1-Q4）/ 贴图即切（S1）/ 发送后零还原（S2，mock 返回 ok——不依赖宿主拒绝假设）/ 移除同保持（S3）/ 手动 twin 不撤销（M1）/ 纯文本不切（M2）/ 开关还原（SW1-SW2）/ 升级链（SW3-SW6）✓。
- RED 判别：Q1/S1/SW3/SW5 在旧逻辑（armed 仅看开关）下必败（逐条推演：旧逻辑 SW3 无接管 → SW4 平凡绿 → SW5 接管发生 → 断言 0 调用必败）✓。
- 回归护栏：client-render F3-1/F3-2（开关 false 不接管/不撤销手动 twin）在新逻辑下经推演仍绿（F3-2 贴图场景：manual twin 已 wrapped + 无记忆 → armed 分支零调用）✓；全量门控采信 Coordinator 证据（15/15 套件 exit 0，fix-012 18 断言）。
- 未覆盖：deps 边界缺口场景（P2-1）无测试。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（mock 全部在 tests/ 显式夹具；lib 零 mock）✓ |
| 硬编码返回值 | 无（接管/记忆全部经真实 sessions API 结果驱动）✓ |
| 幻觉 API | 无——sessions.models/selectModel 签名与宿主 apiproxy :2586-2595/:2596-2630 逐行核验；WRAP_SUFFIX 与宿主 wrapper 一致（客户端既有定义）✓ |
| 未实现 TODO | 无（lib grep 零命中；「永不自动还原」为有意设计并经用户裁决 + Coordinator 确认接受，非未实现）✓ |
| 过度实现 | 无（武装条件 + armedBy 两处逻辑扩展，注释详尽；无无关重构）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P2-1 | lib/client.js:3317（deps 缺 `imageConditional`；相关分支 :3283-3288） | 开关在**图片在途时**开启/关闭不改变 takeoverArmed → effect 不重跑 → armedBy 不升级为 switch；「在途开启→在途关闭→移除图片」交错下记忆保持 'image' → 移除后不还原，与组件头承诺「开启 takeoverDefaultModel 后关闭 → 走既有还原」存在未声明的边界条件（注释未限定「无图在途」） | 窄交错窗口；核心裁决（贴图即切、发送后保持）不受影响；无数据风险；开关显式关闭后 twin 保持至用户手动切换 | 将 `imageConditional` 纳入 deps（或依赖 catalog 版本重跑升级分支）；并在注释中声明该边界；P2 建议，可遗留台账 |
| P3-1 | lib/client.js:3770-3774 | 测试钩子导出（ModelTakeover/setRouterCatalog）为附加导出 | 宿主仅消费 apply/inject（package.json dsh.client web），附加键惰性无害 | 无需处理 |
| P3-2 | lib/client.js:3262-3317 | catalog 瞬时 null（settings 事件 → 轮询间隙）时 switch 记忆会走还原再重接管（churn） | FIX-002 既有行为（armed 条件本就含 catalog 判定），非本修复引入 | 讨论项 |
| P3-3 | 镜像 4f26846 | served-client.js 与 lib/client.js 全等经 8 区域抽样 + 行数一致支持，未逐字节穷举（无命令面）；且测试套件无机械镜像一致性检查（CONTRIBUTING.md 手工规则） | 未来漂移无自动拦截 | 建议后续在 smoke 加字节级一致性检查（P3 讨论） |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=1（建议，有遗留计划：deps 补 imageConditional 或注释声明边界）/ P3=3
- 5 维度全覆盖；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P2-1 列入后续跟踪（不阻塞合并；核心用户裁决已兑现且经 18 断言锁定）。
