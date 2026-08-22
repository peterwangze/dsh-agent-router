# FIX-001 代码审查报告 · Round 6

| 项 | 值 |
|---|---|
| Task ID | FIX-001（P0 生产热修：宿主 dsh-llm 0.1.1-rc.2 prepared-dispatch 接口演进兼容） |
| 审查对象 | commit `f1c4c918fd06f38671eaf99f78bc51853be4878f` |
| 前一提交 | 564e18c（EVO-002 Step 4b，R5 已审 APPROVED_WITH_NOTES） |
| 后续提交 | d264f03（FIX-002，**不在本次范围**，R7 队列） |
| 实现模式 | **降级模式**：Coordinator 直接编辑（子代理通道当日 3 例实例失败；用户批准先例）。降级不豁免独立审查——本报告即该审查。**独立性声明：作者与审查者同源（同一会话）**，已按对等严格度执行（见 R6-F1：审查对作者自己的证据提出证伪级发现）。 |
| 审查方式 | 只读静态核验（未执行命令/测试）；f1c4c91 非 HEAD（其上已有 FIX-002）——文件读取法扣除 FIX-002 已知改动面（EV-035 记载：wrapper.js 接管段 / schemas.js 开关 / smoke.mjs 接管测试段），f1c4c91 涉及的三处区域（wrapper prepareCall 段 / adapter-parity 全文 / smoke 夹具段）均未被 FIX-002 触碰，读取即 commit 状态成立 |

## 锚点核实

- `.git/refs/heads/main` = d264f03（f1c4c91 之上恰一次 FIX-002 提交）
- `.git/logs/HEAD` :117 佐证 `564e18c → f1c4c91` 恰一次提交（C4 单 commit 单主题）
- smoke.mjs FIX-001 标记 grep = 7 处（6 夹具 + 1 负向见证注释）与申报一致

## RCA 主张核验（对 EV-034 事实链）

| 主张 | 核验 |
|---|---|
| 宿主 adapterStream :1568 每次分发先调 adapter.prepareCall | ✓ 宿主源码直读（本仓 node_modules 副本 :1568） |
| 基类默认 prepareCall（:1126-1131）绑定 this.resolveModel/stream | ✓ 直读；**基类原型仅 5 具体方法，stream 为抽象声明（无运行时实现）** |
| twin 手工对象字面量缺 prepareCall 即全量断裂 | ✓ 探针 A/B 输出采信（会话记录）+ 契约推演一致 |
| 宿主文本模型边界投影（:1585 projectImagesForTextModel） | ✓ 直读（投影后消息无图块，分发经 forAdapter :1592） |

## 五维度结论

| 维度 | 结论 | 依据 |
|---|---|---|
| 正确性 | **✓ 通过** | twin.prepareCall 绑定命名引用 `adapter.resolveModel/adapter.stream`（wrapper.js:328-332）——绑定 twin 自身，无 original() 转发；签名 (route, model, signal) 对齐宿主 (provider, model, signal)；返回 {model, stream} 形状与 PreparedAdapterCall 契约一致；signal 透传 resolveModel ✓；TDZ 安全（adapter 引用均在调用时）。6 夹具绑定逐一核实各自作用域常量（mmEscapeAdapter 显式覆写规避 spread 闭包错绑，:1830 注释说明）。负向见证双判别：投影失败→textAdapter 遇图抛错→finish=error→红；投影成功但残留图→every 断言红。 |
| 安全性 | **✓ 通过** | 纯接口适配层：无输入解析/无凭据面/无注入面变化。JSDoc 无敏感信息。 |
| 可维护性 | **✓ 通过（含 R6-F4）** | 命名重构最小（return 字面量 → const adapter + return）；JSDoc 完整交代"为什么显式实现/为什么绑定自身"（后续维护者的关键上下文）。行号锚点漂移风险见 F4。 |
| 性能 | **✓ 通过** | prepareCall 为被动实现（宿主本就调用，twin 此前是崩溃），无新增调用路径/无热路径开销；命名引用 vs this 绑定零成本差异。 |
| 测试覆盖 | **⚠ 部分通过（R6-F1）** | 产品修复侧覆盖充分：smoke 655 断言含真实 LlmRuntime 经宿主 adapterStream 的 twin 全链（7.5/7.6 段）——prepareCall 修复的行为证据有效。**但新增看护网 adapter-parity.mjs 的断言因入口守卫缺陷从未实际执行**（见 F1）——看护覆盖"存在但未生效"。 |

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | ✓ 无——产品代码（wrapper.js）零测试构造；fake llm/adapter 仅存在于测试文件 |
| 硬编码返回值 | ✓ 无——prepareCall 无字面量短路；唯一常量 WRAP_SUFFIX 为既有导出 |
| 幻觉 API | ✓ 无——prepareCall 契约对宿主源码逐行核验（:1126-1131/:1568-1571）；参数/返回形状均有出处 |
| 未实现 TODO | ✓ 无——无 TODO/FIXME/debugger 标记 |
| 过度实现 | ✓ 无——最小方法补齐 + 最小命名重构；无顺手改动（commit 恰 3 文件 +188/-3） |

## 发现列表

### R6-F1（P1 关键）— parity 测试独立入口守卫在 Windows 永假：断言从未执行，EV-034 parity 证据系空转通过

- **位置**：tests/adapter-parity.mjs:120
- **事实**：守卫 \`import.meta.url === \`file://${process.argv[1]}\`\`——Windows 下 `process.argv[1]` 为反斜杠盘符路径（`D:\...`），`import.meta.url` 为 `file:///D:/...`（三斜杠 + 正斜杠），**两者永不相等** → `invoked` 恒 false → 独立运行静默跳过全部断言、exit 0（假绿）。
- **后果链**：① parity 断言在独立模式从未执行（会话中多次运行输出为空但 exit=0 佐证）；② parity 未接线 smoke（接线债已登记）→ **parity 断言在任何模式均未执行过**；③ EV-034 声称的 "parity exit=0" 回归证据为**空转通过（vacuous pass）**——证据效力缺陷，须修订；④ RISK-003 缓解措施①（接口奇偶看护）当前实际为零保护。
- **对照**：项目内已有可移植先例 tests/oauth-credentials.mjs:324 `import.meta.url === pathToFileURL(process.argv[1]).href`（Developer 子代理产物，独立运行真实输出断言数）——FIX-001 作者未沿用。
- **降级模式风险实证**：作者复跑时输出为空未起疑——Coordinator 降级编辑的验证纪律缺口，如实记录。
- **修复（绑定 FIX-001b，Step 5 合并前 MUST 落地）**：守卫改 pathToFileURL 比较；修复后真实运行并记录断言数；EV-034 补"parity 证据修订"注记。

### R6-F2（P2 建议）— 静态契约清单无法检测宿主未来新增方法：看护网对 RISK-003 主形态无效；动态枚举可行且简单

- **位置**：tests/adapter-parity.mjs:16-23（ADAPTER_CONTRACT 静态数组）+ :53 注释宣称"宿主未来新增契约方法而 twin 未跟进 → 此处红 = 预警"
- **事实**：静态清单只检查已知 6 项——宿主**未来新增**方法不在清单内即不检查，断言保持绿——宣称的预警能力不成立（恰是 RISK-003 的主风险形态：未知未来方法）。
- **关键新事实（本次审查取证）**：宿主**实际导出** `LlmAdapter` 基类（node_modules/@deepseek-ai/dsh-llm/lib/index.js:1658 导出面；:1073 类定义）——文件头注释"若宿主导出基类可改为动态枚举"的条件**成立**，静态清单是本可避免的弱化。
- **修法（随 FIX-001b）**：`import { LlmAdapter } from '@deepseek-ai/dsh-llm'` → 契约 = 并集（`Object.getOwnPropertyNames(LlmAdapter.prototype)` 过滤 constructor 的 **5 项具体方法** + 静态补 `'stream'`）——**注意：stream 为抽象声明，运行时原型上不存在，纯枚举会漏检**，必须并集。宿主未来加方法自动进枚举，预警才真实生效。

### R6-F3（P3 讨论）— test 3 断言偏弱：未验证 marker 注入内容

- **位置**：tests/adapter-parity.mjs:99
- **事实**：`seen.length > 0` 只证明消息透传，未断言 `options.system` 含 'MARKER'（marker 注入才是改写路径的核心证据）。一行增强（记录 system 进 seen 并断言 includes）。当前判别力由 sawImage===false 承载，可用。

### R6-F4（P3 讨论）— JSDoc 行号锚点会随宿主版本漂移

- **位置**：lib/wrapper.js:318（":1568"）
- **事实**：宿主库更新即漂移（R2 审查 W-2 同型问题）。建议改函数名/语义锚点（"adapterStream 内 prepareCall 调用点"）。轻微，随下次触碰顺手改。

### R6-F5（P3 讨论）— makeFakeLlm 的 llm.stream 不记录入参

- **位置**：tests/adapter-parity.mjs:43-46
- **事实**：fake llm.stream 忽略 options（test 3/4 通过运行时替换绕开）——若后续断言需检查透传参数需先增强 fake。观察级，当前不影响判别。

## 裁决项（任务书指定）

| 裁决 | 结论 |
|---|---|
| 1. twin.prepareCall 绑定正确性 | **✓ 通过**——绑定 twin 自身（命名引用），无 original() 转发；"prepared dispatch 绕过 twin 改写"的静默破坏路径不存在；test 2/3/4 的双路径断言设计正确（虽因 F1 未执行） |
| 2. 6 夹具各自绑定自身 | **✓ 通过**——含 mmEscapeAdapter spread 陷阱显式覆写（:1830 注释）；双 textAdapter 块作用域闭包各自正确 |
| 3. 负向见证语义更新 | **✓ 通过**——保护意图（裸图永不达文本 adapter）保持且判别力双重（finish=stop + every 无图）；系宿主行为事实适应非放松 |
| 4. 契约清单与 types 一致性 | **✓ 内容一致**（6/6）——但静态性局限见 R6-F2 |
| 5. Coordinator 编辑质量 | **✓ 通过**——恰 3 文件（stat +188/-3 核实）；产品代码零测试残留；无越权。**但 F1 暴露降级模式验证纪律缺口**（输出为空未起疑）——降级模式后续执行须增加"输出非空 + 断言计数非零"的硬校验步骤 |

## 自报事项核实（EV-034）

| 声称 | 核验 |
|---|---|
| "parity exit=0" | **证伪——空转通过**（F1；输出为空即断言未运行的直接证据） |
| smoke FAILS=0 exit=0（12→0） | ✓ 采信（Coordinator 复跑记录 + post-commit hook 输出 + 会话留痕三者互证） |
| 探针 A/B（bare=error / with=stop） | ✓ 采信（会话记录） |
| 恰 3 文件 +188/-3 | ✓ 采信（commit stat） |

## 终态

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- **发现计数：P0=0 / P1=1 / P2=1 / P3=3**
- 关闭条件适用（SKILL）：P0=0 且 P1>0（有遗留计划）→ **有条件通过**
- **绑定条件（MUST，Step 5 合并前落地）**：FIX-001b 小 commit——① 守卫改 `pathToFileURL` 可移植写法 + 真实运行记录断言数（R6-F1）；② 契约清单改动态枚举并集（含 stream 抽象项补集）（R6-F2）；③ marker 断言一行增强（R6-F3 顺手）；④ EV-034 补 parity 证据修订注记。
- 产品修复本体（wrapper.js twin prepareCall）**无阻断问题**，行为证据（smoke 655 全绿含真实宿主 prepared-dispatch 全链）有效。
- R6-F4/F5 留台账随下次触碰顺手处理。

## 审查局限声明

- 未执行任何命令/测试（角色约束）；测试运行数值采信 Coordinator 复跑记录并逐项标注
- f1c4c91 非 HEAD，diff 精确行数无法直读——以 reflog + FIX-002 改动面记载（EV-035）+ 三区域未被触碰的交叉验证替代，diff ±计数标"未验证"
- 降级模式独立性折损（作者=审查者同源）已声明；对等严格度以 F1（对作者自身证据的证伪级发现）为证
