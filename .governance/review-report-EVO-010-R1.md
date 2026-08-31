# Review — EVO-010 R1（R0 NEEDS_CHANGE 返工复审）

- **Round**: R1
- **Task**: EVO-010 — ChatGPT 主模型迁移宿主官方 openai-codex 路由（凭据桥 + 路由维护者）
- **Commit（本复审范围）**: `31ab145`（6 文件 +190/-44）+ 前序 3 commits（30dd55e/82ae39a/3ead43f 不变），base 3ead43f
- **前轮引用**: `.governance/review-report-EVO-010-R0.md`（R0 结论 NEEDS_CHANGE：P1=1 F-1 / P2=3 F-2,F-3,F-4 / P3=5 F-5~F-9）
- **审查者**: Code Reviewer（R1）
- **日期**: 2026-08-31
- **范围说明**: 纯只读 + 本报告文件；无命令面；门控采信 Coordinator 证据（16/16 套件 exit 0；镜像 hash 96B763CF 一致）。

## R0 findings 逐条比对

| R0 项 | 级别 | 状态 | 证据（文件:行） |
|---|---|---|---|
| **F-1**（parity 持败 → settings/updated 自激热回环，事件→写入指数增长） | P1 | **已修复** | ① trigger 分流：service.js:2727-2730（settings/updated 按 ns 分流——`ns === HOST_ROUTE_NS ? 'llm' : 'user'`）；② gate：host-route.js:270 `gateWrites = trigger === 'llm' && state.failures > 0` + 两个 gate 点（:309-316 ops 非空分支 / :332-338 idle 早退——**连 probe 都不跑**，回滚 mutate 事件源一并截断）；③ 环断裂推演：tick/boot 写 pass 失败 → 2 事件 → llm 事件 pass gate（零写零探）→ 无新事件 → 收敛；tick 30s 承载重试；user-modified 分支（:302-308）在 gate 前响应（手改尊重保持）；router ns 用户操作（'user'）不 gate 即时生效；失败计数不被 gate pass 翻倍（gate 分支不调 recordHostRouteFailure）✓ |
| F-1 判别测试 | — | **已修复** | 夹具盲区闭合：makeRouteHarness 增 `emitEvents`（:416-436——settings.mutate 后 `root.emit('settings/updated', HOST_ROUTE_NS)` 模拟宿主 diff-gated commit 事件）+ `settingsMutateFails`；F1-1（:590 mutate ≤2 有界——旧代码指数增长必败，Developer RED 实证 240s 挂死）/ F1-2（:591 lastAction='gated'）/ F1-3（:600 tick 自愈恢复）✓ |
| **F-2**（tick 旁路串行队列，注释不变量不符） | P2 | **已修复** | service.js:2733 `setInterval(() => { void this.queueHostRouteSync('tick') }, tickMs)`——tick 改走同一串行队列；runHostRouteTick 已移除（host-route.js 全文静态核验零导出零引用）；注释（:2717-2724）更新为如实描述 ✓ |
| **F-3**（HOST_ROUTE_REF 凭据滞留无清理） | P2 | **已修复** | host-route.js:395-409：maintain=false 分支 mutate 后**无条件** `credentials.unset(HOST_ROUTE_REF)`（idle 无条目也清——残留自上次登出）+ PoC ref 清理（:405-409）；user-modified 分支提前 return（:374-378——用户条目可能仍引用 ref，不误清）；F3-1 判别（:613 条目 unset + ref unset）✓ |
| **F-4**（transport 非路由决策——双组重名 + 切换不迁移会话，UI 语义超载） | P2 | **已修复** | ① 插件组过滤：oauth-llm.js:56-58 `pluginPresetAccounts`（normalizeTransport==='plugin'）→ modelsOf（:61-73）与 accountForModel（:76-82）**双面同源过滤**——host 账号模型不再注册进插件组（双组重名消除），默认 transport='host'（schema 默认）→ 插件组仅在有 plugin 账号时注册；② 披露文案：client.js:444 `presetTransportHint`（「实际调用走向以模型选择器所选分组为准（宿主官方 = openai-codex 组；插件内置 = ChatGPT 订阅组）；切换通路后既有会话请在模型选择器手动选组」）+ 渲染（:1277）+ 降级提示（:1291-1293）+ 状态行（:1237-1241）；F4-1/2 判别（:620/:627——host 不注册必败 / plugin 注册）✓ |
| **F-5**（断言计数口径偏差） | P3 | **未闭合（台账延续）** | 返工申报「~56 断言」vs 实测 81 个 check() 调用（grep 计数：REG3/CAT7/STR14/ERR3/KILL2/F15-6/F16-5/F17-7/ROUTE15/INJ3/TRA5/PAR1/STA2/F1-3/F3-1/F4-2/F7-1 = 81）——口径未核准，P3 延续（不影响通过） |
| **F-6**（resolve env 继承边角） | P3 | 未修复（台账——发布前小修批） | P3 低概率防御性改进，台账处置**恰当** ✓ |
| **F-7**（mutate 拒绝异常外溢，P8 口径不一） | P3 | **已修复** | host-route.js:317-328（maintain 分支 mutate try/catch → recordHostRouteFailure 统一链路 + host_route_maintain_fail 事件 + lastAction='mutate-rejected'）/ :380-390（清理分支同口径）；回滚 mutate 失败仍 warn 不计数（parity 已计数，避免重复）——合理；F7-1 判别（:633 失败计数 + 事件 + warn）✓ |
| **F-8**（刷新钩子失败计数双源） | P3 | 未修复（台账——发布前小修批） | 注意 queueHostRouteSync catch（service.js:2711 `failures += 1`）仍是第二计数点——但为 syncHostRoute 意外 throw 的兜底（内部失败路径已全覆盖 recordHostRouteFailure），性质可接受；台账处置**恰当** ✓ |
| **F-9**（状态行四因清单缺「已被手动修改」） | P3 | 未修复（台账——发布前小修批） | 文案精确性 P3，台账处置**恰当** ✓ |

## 新引入检查

1. **gate 语义边界**：失败态下 llm 事件 pass 只刷状态——「用户把 llm-pi-ai 条目改回自有形状」在失败态经 idle 分支 gate 早退（不 probe）→ 条目保留、tick 30s 内恢复 ✓ 可接受；user-modified 响应不受 gate 影响 ✓。
2. **F-4 默认 host 的用户可见行为变化**：既有账号（transport 未设置 → 归一 host）升级后插件组（ChatGPT 订阅）消失、官方 openai-codex 组出现——设计语义（F-4 目标：单组单协议栈），presetTransportHint 披露覆盖 ✓。
3. **F-3 不误清**：user-modified 提前 return（用户条目可能引用正式 ref）✓；mutate 失败（mutate-rejected 提前 return）条目仍在 → ref 不误清 ✓。
4. **gate 不 reset failures**：失败态保持至 tick 成功（recordHostRouteSuccess 清零）——否则事件流永远 gate ✓ 正确。
5. queue catch 计数双源（service.js:2711）——兜底性质，见 F-8 台账。
6. 镜像：Coordinator 采信 hash 96B763CF 一致（client.js transport 文案/开关与 served-client.js 同步）。

## 维度核验（返工面）

- 正确性 ✓（回环断裂推演完整：写 pass 失败 → 2 事件 → gate pass 零写零探 → 无新事件 → 收敛；计数不翻倍；恢复 ≤30s）；安全性 ✓（F-3 数据主权：凭据副本清理 + user-modified 防误清；P7 零 token 日志保持）；可维护性 ✓（trigger 参数语义注释完整、F-2 注释如实）；性能 ✓（gate pass 零 I/O；队列有界）；测试覆盖 ✓（F1-1 真判别 + emitEvents 夹具闭合 R0 盲区 + F3-1/F4-1/2/F7-1 判别齐；F-2 并发交错如实标注不可构造（:602-605），以代码审查面 + 行为保持闭环——诚实）。

## AI 代码专项 5 项（返工面）

| 项 | 结论 |
|---|---|
| mock 残留 | 无（emitEvents/settingsMutateFails 为判别夹具，产品零 mock）✓ |
| 硬编码 | 无（gate/trigger 逻辑纯参数驱动）✓ |
| 幻觉 API | 无（settings.mutate/credentials.unset/root.emit 均为既有实测契约）✓ |
| TODO | 无 ✓ |
| 过度实现 | 无（+190/-44 对应 6 项修复 + 判别；gate 两分支最小化）✓ |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=4（F-5 口径延续 + F-6/F-8/F-9 台账——处置恰当，随发布前小修批）
- R0 全部必修项（F-1 P1）与建议项（F-2/F-3/F-4/F-7）**已修复并经判别锁定**；无新引入阻塞；复审链闭合（round=1，通过终态）。
- 遗留台账：F-5 计数口径核准 + F-6/F-8/F-9 随发布前小修批（Developer 标注延续）。
