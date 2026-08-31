# Review — FIX-015 R0（EVO-009 真机验证失败防御性修复链）

- **Round**: R0
- **Task**: FIX-015 — EVO-009 真机验证失败防御链（用户已保存账号 models 变空根因未定 + placeholder 幻觉 + 幽灵卡误导；用户元批评「怀疑要有实际证据」已采纳留档）
- **Commits**: `e170cf2`（oauth-llm.js sync inactive 可观测）/ `fef785b`（client.js 幽灵卡过滤 + 订阅卡空模型提示 + 判别 + 镜像）/ `c9a8deb`（实预填 + 保存防呆）/ `86fb209`（savePresetModels 读写对称单点）/ `af6a1f8`（防御全覆盖 + 取证留档），base 4b59d09
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 无命令面；以任务书指定变更点 + 当前文件状态核验；写路径盘点独立 grep 复核（非采信注释声称）；门控采信 Coordinator 证据（16/16 套件 exit 0，smoke 含 8 条 FIX-015 断言）。

## 审查证据链（全部可复查）

| 关注点 | 证据 | 结论 |
|---|---|---|
| ①读写对称单点 | `lib/client.js:2237-2244` presetModelsDraftOf（draft 优先 → 已存 join → 已登录空预填 → ''）；调用点 `:2250`（savePresetModels raw）+ `:2557`（显示 modelsValue）——同一函数引用 | **真同源** ✓ |
| ②mergePresetModels 并集 | `lib/client.js:1193-1197`（并集保序去重，非数组兜底）；discoverOauth `:2387` 失败路径**提前 return 不写**；`:2391` 空发现并集=原值幂等；服务端 oauthDiscover 全路径恒返回 models 数组（`lib/service.js:3642/3644/3649/3656/3664/3670`）→ `:2394` 无 undefined 崩溃 | ✓ |
| ③实预填触发 | `lib/client.js:2242`（`presetLoggedIn === true` 且 saved 空才填，位于 `:2241` saved>0 分支之后——**不覆盖已有非空值**）；未登录空 → `:2243` ''（placeholder 保留） | ✓ |
| ④幽灵卡过滤 | `lib/client.js:1851/:2021` `startsWith('oauth:')` continue；服务端统计键形态实证 `oauth:${accountId}` / `oauth:pool:${poolId}`（`lib/service.js:790-810/:1134-1153`）；插件账号 id 由 ID_PATTERN `/^[a-z][a-z0-9-]*$/`（client.js:848）约束**不含冒号** | 零碰撞 ✓（P3-1 理论讨论） |
| ⑤warn 去重 | `lib/oauth-llm.js:422-439`：签名（entries ids 排序 join）比较先于登录探测（:427）→ 状态翻转才探测+发；三条复位路径（:424 无账号 / :425 models 非空 / :436 未登录）→ 复发空态重新告警；sync 无条件调用（:467）覆盖 unregister 分支 | ✓ |
| ⑥防御盘点 | 独立 grep `path: ['oauthAccounts'` 复核 6 客户端写路径：`:2075` unset（deleteOauthAccount）/ `:2107` set 新建（addPresetAccount，去重循环 :2100-2101）/ `:2222` unset（deletePresetAccount）/ `:2252` set models（savePresetModels 守卫）/ `:2392` set models（discoverOauth 并集）/ `:2479` set 新建（oauthAddToPool，去重循环 :2462-2463）；service.js grep `oauthAccounts.*models` **零内部写**（1 透传 = settings save 白名单）——与注释声称「6 条 client + 1 透传」一致 | ✓ |
| ⑦判别测试 | `tests/client-render.mjs:1199-1281` 8 断言 + 取证留档注释（:1203-1213：已证事实链①②③④ + 根因未定 + 元批评引用 + 防御面覆盖说明） | ✓ |
| 镜像 | `tests/served-client.js` 与 lib 均 3844 行；FIX-015 关键行抽样逐行一致（416/417/675/676/1183-1196/2105/2237-2248/2388/2391/3841） | ✓ |
| 文案键 | `lib/client.js:416-417/:675-676` presetModelsEmpty / presetModelsEmptyNotice 中英齐全语义一致 | ✓ |

## 维度 1：正确性

- **读写对称**：draft 优先（含用户清空 ''）→ 无 draft 时保存回退已存值（未编辑保存 = 幂等原值，绝不空覆盖）——显示与保存同源，防缩小闭环（:2232-2233 注释 + :1275 判别）。已登录空 → 实预填三件套（:2242）；未登录空 → ''（placeholder 视觉提示非值，保存 '' → [] = 幂等——未登录账号原本就空，不覆盖任何非空）✓。
- **savePresetModels**（:2249-2259）：split 支持中英文逗号 + trim + filter；已登录空结果 → 防呆 notice（:2254-2256）而非「已保存」✓。
- **mergePresetModels 调用链**：任何发现结果（空/失败）不可能缩小已有非空列表；失败路径提前 return 不写 ✓。
- **warn 语义**：已登录+启用但 models 空 → 去重 warn（含指引文案「设置 → Agent 路由 → ChatGPT 订阅登录」）；未登录不算（正常态）；无账号/models 非空复位签名 → 复发空态重新告警（:464-466 注释的「激活 → 清空模型」转换场景被覆盖）✓。
- 边界：modelsValue 空串/空白 trim 判定（:1222）✓；draft '' 与预填互斥（draft 优先）✓。

## 维度 2：安全性

- 纯展示层 + 可观测性改动：无新输入面（mutate 路径既有白名单透传）；warn 文案无敏感信息；无凭据涉及 ✓。

## 维度 3：可维护性

- PRESET_MODEL_DEFAULTS 单一来源（:1185）——placeholder/新建预填/实预填共用，P5 禁止复制字面量 ✓（:2105 `[...PRESET_MODEL_DEFAULTS]` 同源）。
- 取证留档注释（client-render :1203-1213）质量高：事实链逐条标注已证/未定/排除项，引用元批评原文，防御面与测试断言一一对应——符合「怀疑要有实际证据，不得默认归因用户操作」✓。
- 各写路径注释防缩小证明（:2096/:2388/:2477）与实现一致 ✓。

## 维度 4：性能

- warn 探测：签名比较先于登录探测（:427）→ 登录探测（文件读）仅状态变化时执行；sync 无条件调用 but modelsOf/entries 同步 O(n) 零探测（:464-467 注释如实）✓。

## 维度 5：测试覆盖

- 8 条断言判别性：幽灵卡（:1223 旧代码必含 oauth:chatgpt 必败）/ 实预填（:1237 旧代码空值必败）/ 无幻觉提示（:1238）/ 保存真实三件套（:1245 旧代码存空必败）/ 清空后提示（:1249）/ 防呆 notice（:1255 旧代码「已保存」必败）/ **根因判别**（:1275 旧代码无回退存 [] 覆盖 → 必败——铁证链 fixture：已存 ['gpt-5.4-mini'] + 无 draft + 保存 = 原值）/ 并集回归锁定（:1279 非判别——测试注释如实声明「旧代码同为并集语义」，属回归护栏正确用法）✓。
- 判别序列正确：presetEmptyModelsMode 复位后才做根因判别（fixture 需非空，:1262）✓。
- 覆盖缺口（P3 讨论）：oauth-llm 侧 warn 路径无独立断言（warn 去重逻辑未在测试中直驱——client-render 只覆盖 client 面；oauth-main-model.mjs 未加空 models warn 断言）。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（fixture 显式构造；lib 零 mock）✓ |
| 硬编码返回值 | 无（PRESET_MODEL_DEFAULTS 为常量单源而非散落硬编码；无伪造响应）✓ |
| 幻觉 API | 无（全部真实函数调用；oauthDiscover 服务端形状实测）✓ |
| 未实现 TODO | 无（lib grep 零命中；「根因未定」为如实留档非占位）✓ |
| 过度实现 | 无（每修有判别/注释/证明；防御盘点成体系但改动均小且单一目的）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | lib/client.js:1851/:2021 | `startsWith('oauth:')` 过滤判据为前缀约定：若未来宿主允许 pi-ai provider id 以 oauth: 开头 → 展示层隐藏该类卡 | 插件账号 id（ID_PATTERN 无冒号）零碰撞；pi-ai 命名空间以 oauth: 开头仅理论可能，且即使发生仅影响展示 | 讨论项：可留待宿主命名空间演进时再精确化 |
| P3-2 | lib/client.js:2385 | discoverOauth 的 remote() 调用无 try/catch（RPC 抛错 → unhandled rejection） | 既有 EVO-002 模式，非本任务引入；RPC 网关层失败面 | 讨论项 |
| P3-3 | lib/oauth-llm.js:426-427 | warn 签名不含登录态：登录→登出→再登录不重新告警 | 已告警过的状态重复无意义；复发空态（登出→登录）仍可经复位路径告警 | 讨论项 |
| P3-4 | tests（覆盖缺口） | oauth-llm 侧 maybeWarnEmptyModels 去重/复位/未登录不告警无独立断言 | client 面 8 断言完整；warn 逻辑靠代码审查覆盖 | 讨论项：可在 oauth-main-model.mjs 补空 models + 登录态 warn 断言 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=4（讨论级）
- 5 维度全覆盖；7 个审查关注点逐项核验（全部满足）；写路径盘点独立复核与注释声称一致；判别测试质量高（含根因判别真必败 + 回归锁定如实标注）；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P3 均为讨论项，无关闭截止要求。
