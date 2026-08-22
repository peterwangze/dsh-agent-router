# Review Record (machine-written by review-record)

- task: FIX-003
- round: R1
- date: 2026-08-22
- reviewer: Code Reviewer
- report: .governance/review-FIX-003-R1.md
- wiring: pending

**审查结论**: **APPROVED_WITH_NOTES**

unresolved_blockers=0

---

# FIX-003-R1 完整审查报告（原文恢复）

> 出处：review-record CLI --report 覆盖预防——备份恢复（2026-08-23）。

# Review 报告：FIX-003-R1（P0 热修独立审查，round 1）

- **任务 ID**：FIX-003-R1
- **审查对象**：commit `b6581c5e7d2e006bf30481c1de829921ec659b10`（+209/-4：lib/attachments.js +116 / lib/service.js +11 / tests/routing-paths.mjs +86）
- **审查人**：Code Reviewer Agent（round 1，无前轮引用）
- **日期**：2026-08-22（会话）
- **审查基准输入清单**：
  1. `.governance/diff-FIX-003-b6581c5.patch`（通读全文，295 行）
  2. `.governance/evidence-log.md` EV-053 行（RCA 三环事实链）
  3. `lib/attachments.js`（全文 600 行——M2 编址语义 + FIX-003 降级链）
  4. `lib/service.js`（runChat 预检 1157-1189 / resolveAttachmentIds 1954-1989 / selectAttachments 懒注册 1941-1950）
  5. `tests/routing-paths.mjs`（[B] 段 1-346 + D 段 437-539，重点 B13a/b、D11、D15）
  6. 宿主配置面：`C:\Users\peter\.dsh\settings.yaml`（只读；opencode-go-new 两处模型级 `input: [text, image]`）
- **宿主源码级交叉验证（本审查自取证据，非复述开发声明）**——npx cache `D:\AIData\Caches\npm\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`：
  - `dsh-llm-pi-ai/lib/index.js`：`declaredInput`(L286-288)、`input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput]`(L651)、`DEFAULT_INPUT=["text"]`(L862)、模型字段 schema `input: z.array(z.union(MODALITIES))`(L922，MODALITIES={text,image} L273-276)、`defaultInput` provider 级 schema(L942)、`[source.defaultInput ?? DEFAULT_INPUT]`(L1013)、`inputModalities: [...model.input]`(L1668/1687)、stream 时 `!model.input.includes("image")` → `UNSUPPORTED_CONTENT`(L1721)、配置文件目录 `declared: !catalog.has(provider)`(L2376)、`directoryEntries` 条目形状 `{provider, displayName, settingsNs, settingsPath, declared}`(L2367-2382)。
  - `dsh-llm/lib/index.js`：`listProviders() = [...adapters].map(({provider})=>({...provider}))`(L1240-1242)——目录条目无 declared；`listConfigurableProviders()` 返回 directory 值(1299-1304)；`registerConfigurableProviders` 校验/发布(1251-1294)。
  - `dsh-attachment-local/lib/index.js`：`ID_PATTERN=/^sha256:([a-f0-9]{64})$/`（小写严格）(L294)、`objectPath=join(root,"objects",sha256.slice(0,2),sha256)`(L305)、`ensureReference` 从 `ref.attachmentId` 取哈希，非法 → `INVALID_ATTACHMENT_REF`(L307-311)、`readImageFile` 先 digest 校验(L505)再 `metadata.mediaType!==ref.mediaType || data.byteLength!==ref.bytes || metadata.width!==ref.width || metadata.height!==ref.height → ATTACHMENT_CORRUPT`(L508)、`probeImage` 走 sharp(L125-135)、`readImage(ref)=readImageFile(root,ref)` 原样透传调用方 ref(L868-870)、store root=`resolveDshHome(config.dshHome)/attachments/v1`(L831)、mediaTypes 白名单仅 png/jpeg/webp/gif(L838-843)。
  - `dsh-home-paths/lib/index.js`：`resolveDshHome` 优先级 configured > `$DSH_HOME` > `~/.dsh`(L65-77)、默认 `join(homedir(), ".dsh")`(L50)。
  - **未独立验证项（红线标注）**：routing-paths 98/98、smoke 849/0、stats、parity 14 与"真机完整 ref 宿主读取成功 56730B 912×510"为 Coordinator/Developer 提供的测试事实——本审查无执行权限（Bash 禁用），**未复跑**；宿主重启/热载后 settings 生效为用户动作，**未验证**；当前宿主进程 `DSH_HOME` 环境变量是否设置**未验证**（影响 F-1，见下）。

---

## 一、逐维度结论（5 维度全覆盖）

### 维度 1：正确性（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 逻辑正确 | ⚠ 主链路正确（宿主源码验证），**F-1 例外**（见发现清单） |
| 2 | 边界条件 | ⚠ 三处边界偏差：F-1（env 缺省路径根）、F-2（VP8X 截断尺寸）、F-4（大小写一致性）；均已 fail-safe |
| 3 | 并发安全 | ✅ 新增路径无共享可变状态；懒注册幂等由 registerEntry 去重保证（B8 仍通过） |
| 4 | 资源管理 | ✅ readFileBytes 由 Node 管理句柄；无新增泄漏 |

正确性主线验证（逐链）：
- **环②预检**：新分支 `listConfigurableProviders` 优先——dsh-llm `listConfigurableProviders()` 返回 `{provider, displayName, settingsNs, settingsPath, declared}`（无 `id` 键；代码 `item.id ?? item.provider` 恰落到 `provider`，正确）；dsh-llm-pi-ai 对非 pi-ai 目录路由恒 `declared: true`（L2376）→ opencode-go-new 跳过预检 ✓；该 API 缺失时回退 listProviders（旧宿主形态，D11 夹具即此形态）✓。
- **环③自取证**：对象路径 `objects/<前2>/<hex>` 与宿主 `objectPath`（L305）逐字符一致 ✓；完整 ref 与宿主 `readImageFile` 元数据精确匹配校验（L508）语义对位 ✓；宿主仍拒时内容哈希兜底与宿主 digest 校验（L505）同构 ✓。
- **环①配置**：模型级 `input` 是宿主 schema 合法字段（L922），枚举 `text/image` 合法（L273-276），优先级 `entry.input ?? base.input ?? defaultInput`（L651）确认为模型级覆盖 defaultInput ✓；`resolveModelInfo` 暴露 `inputModalities=[...model.input]`（L1668/1687）→ 预检放行路径成立 ✓；宿主 stream 端 `UNSUPPORTED_CONTENT`（L1721）作为端点兜底 ✓。副作用检查：opencode-go-new 其余 3 个模型（deepseek-v4-flash/muse-spark-1.2-contributor/gpt-5.6-luna）无 input 声明 → 行为不变（`base?.input`=undefined → `[...defaultInput]`=["text"]，与修复前一致）✓ 零副作用。
- **M2 既有语义零破坏**：非法 id 四形态（普通名/短 hex/null/4096 超长）在 byId 的 `isAttachmentId` 门之前拒绝（B5a-d 通过）；LRU 200 不变（B10）；URL 下载不变（B9）；未知 id → `ATTACHMENT_UNKNOWN` code+message 双断言不变（B6）✓。

### 维度 2：安全性（4/4 项 —— 疑区 (a) 逐项排查结案）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 输入校验 | ✅ 见下逐项 |
| 2 | 注入防护 | ✅ 见下逐项 |
| 3 | 敏感数据 | ✅ 无密钥/token 硬编码（diff 全量核对） |
| 4 | 权限检查 | ✅ 自取证仅读宿主内容寻址库，且输出受哈希门约束，见下 |

疑区 (a) 专项排查（逐一结案）：
- **对象路径遍历注入**：`sha = String(id).replace(/^sha256:/i,'')` 后 `!/^[0-9a-f]{64}$/.test(sha) → undefined`（attachments.js:397）——仅 64 位 hex，无 `/`、`\`、`..`、转义字符；`join(root,'objects',sha.slice(0,2),sha)` 无法逃逸根目录 ✓ 安全。
- **任意目录读取**：读取路径被固定为 `$DSH_HOME/attachments/v1/objects/<2hex>/<64hex>` 单形态；即使 DSH_HOME 可控，可读对象仅限该形态；且输出仅两种：①宿主 readImage 返回（宿主自身校验）；②自取证字节——**仅当 `contentHashId(data) === id` 才接受**（attachments.js:418），即调用方必须已持有该内容哈希（内容寻址身份），无信息外带通道 ✓ 安全。补充：self-probe 在宿主 full-ref 仍拒时先过 `detectImageMediaType`+`probeImageDimensions`（魔数+尺寸双门）再哈希门 —— 三层门控 ✓。symbolic-link 跟随限于宿主库路径（与宿主同一信任面），且输出仍受哈希门约束（P3 记录）。
- **内容哈希兜底健壮性**：`sha256:${hex}` 全串比对（非前缀），无截断；与宿主 `digest(data)!==sha256`（L505）同数学（仅大小写敏感性差异见 F-4，宿主更严格，方向一致）。非恒定时间比对——id 为会话内已知值，无时序侧信道现实威胁（P3 记录）。
- **畸形文件**：`probeImageDimensions` JPEG/WebP 扫描有界（循环条件 `i+9 < u8.length`、`len<2→undefined`、逐格式长度门），无越界读/无死循环；魔数伪造需同时通过宿主库内 hash==id（伪造即不同 id）→ 无法注入。**F-2 例外**：VP8X 截断（24-29 字节）返回 {1,1} 而非 undefined（元数据错但无越界/无崩溃）。
- **降级不改变 M2 语义**：非法 id 先拒（byId 门）→ 新代码只影响"宿主读失败"分支；失败映射仍为 undefined → ATTACHMENT_UNKNOWN（B6）✓；LRU/URL/物化/W-3 会话作用域缓存均未触碰 ✓。

### 维度 3：可维护性（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 命名可读 | ✅ `lazyImageFromObjectFile`/`dshHomeAttachmentsRoot`/`probeImageDimensions` 意图明确 |
| 2 | 函数长度 | ✅ 新增函数均 <50 行 |
| 3 | 重复代码 | ✅ 与 service.js detectImageMediaType 同构为既有已知债务（头部注释已声明 Step 5b 收敛），非本次引入 |
| 4 | 注释质量 | ⚠ 总体良好；**F-1 处注释与实现矛盾**（"env 缺失回退 ~/.dsh" vs 代码回退 homedir() 无 .dsh） |

### 维度 4：性能（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 避免不必要循环 | ✅ JPEG 标记扫描 O(n) 有界；无嵌套 |
| 2 | 数据结构选择 | ✅ 复用现有 Map 注册表/LRU |
| 3 | 懒加载 | ✅ 自取证仅在裸 id 宿主读失败时触发，且成功后不再读（B13b） |
| 4 | 批量操作 | ✅ 每次懒注册至多 2 次宿主读取 + 1 次文件读；条目缓存后零重读 |

### 维度 5：测试覆盖（3.5/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 核心路径有测试 | ✅ B13a/b（自取证成功链）、D15（declared 真实形态）、B13 判别性严格（旧代码必 undefined） |
| 2 | 边界测试 | ✅ DSH_HOME 显式设置 + 对象文件构造；抽查 B5b/B6/B10/B12 均与既有语义自洽 |
| 3 | 错误路径测试 | ⚠ **F-3**：哈希兜底分支（宿主仍拒→哈希通过接受/哈希不符→undefined）与 env 缺省 fallback 无测试 |
| 4 | 覆盖率达标 | ✅ 本次新增 3 断言（95+3=98）；覆盖率运行事实引用 Coordinator（未独立复跑） |

B13a/b 判别性自洽复核（抽查，非机械相信）：
- B13a：mock 宿主面 `width/bytes 非 number → throw`（裸 id 必败）、`attachmentId===id` 且完整 ref → 放行；自取证构造的 PNG（912×510，IHDR 校验位正确）→ `detectImageMediaType` ✓、`probeImageDimensions`（u32be(16)=0x390=912、u32be(20)=0x1FE=510）✓ → 完整 ref → 宿主放行 → entry 字段断言（mediaType/width/height/bytes）精确匹配 ✓。旧代码（唯一 catch → undefined）下 `!!entry` 必败 ✓ 判别成立。
- B13b：第二次 byId 命中 Map（同一对象引用）✓ 判别成立（无此断言可掩护重复宿主读取）。
- D15：fixture 无 listConfigurableProviders 的 D11 走回退分支（旧宿主形态）——新旧两形态各有一测 ✓；D15 临时覆写 `listProviders`（去 declared 模拟真实形态）→ 旧逻辑必预检拒（resolveModelInfo ['text'] → "不支持图片输入" reject）→ 判别成立。瑕疵：该场景以未捕获 rejection 崩套件而非干净 FAIL（见 F-5，P3）。
- 抽样 B5b（短 hex 拒）、B6（ATTACHMENT_UNKNOWN code+message 双断言——新代码失败分支仍出 undefined → resolve 抛 '附件不可解析' → 断言保留）、B10（LRU 200+逐出最旧）、B12（大小写容忍）→ 均与变更后行为自洽 ✓。

---

## 二、设计一致性（已比对：v3 §4.3.1/§5.1 M2 语义 + adapter 契约）

- M2 注册表契约（§4.3.1）：id↔路径↔files 三向映射、LRU 200、错误码表——不变 ✓
- W-2 懒注册降级设计（"未注册但合法（宿主可读）→ 读成功注册；失败 → ATTACHMENT_UNKNOWN"）——FIX-003 在"宿主可读但裸 id 校验失败"的中间态上延长降级链，**符合原契约方向**（不会从"读不到"退化为"读不到"更严），未改变错误语义 ✓
- 与 ADR/既有审查（review-FIX-002-R8 语义权威、review-RES-002 M2 语义）无冲突 ✓
- 宿主接口契约：listConfigurableProviders/readImage/resolveModelInfo 均经源码验证为真实存在且形状匹配，非幻觉 API ✓（AI 专项逐条见下）

---

## 三、AI 代码专项（5 项逐条）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | mock 残留 | ✅ 产品代码零 mock；测试夹具标注"独立 root/临时替换"且有 finally 恢复 |
| 2 | 硬编码返回值 | ✅ probeImageDimensions/detectImageMediaType 为真实现；请求路径无私货值 |
| 3 | 幻觉 API 调用 | ✅ `listConfigurableProviders`/`listProviders`/`resolveModelInfo`/`readImage` 均宿主源码实证；`readImageFile` 的 ATTACHMENT_CORRUPT 语义、`declared` 来源、`input` 优先级全部源码核对一致 |
| 4 | 未实现 TODO | ✅ 无；todo 无；fallback 注释与实现对应（唯 F-1 注释/实现矛盾——见 F-1） |
| 5 | 过度实现 | ✅ 未发现：probeImageDimensions 4 格式覆盖对齐宿主 mediaTypes 白名单（L838-843）；无画蛇添足分支 |

---

## 四、发现清单（每条：级别 / 位置 / 事实 / 建议）

### F-1（**P1** — 关键，建议本轮修，可遗留 1 行修复）：`lib/attachments.js:423-426` `dshHomeAttachmentsRoot()` env 缺省回退路径与宿主默认根不一致
- **位置**：attachments.js:422-426（`dshHomeAttachmentsRoot`）。
- **事实**（源码级）：宿主 `resolveDshHome` 优先级 = configured > `$DSH_HOME` > `~/.dsh`（dsh-home-paths L65-77），默认 `join(homedir(), '.dsh')`（L50）；实例根 = resolveDshHome(...)/attachments/v1（dsh-attachment-local L831）；EV-053 实测对象在 `~/.dsh/attachments/v1/objects/f3/…`。插件代码：`home = DSH_HOME env || homedir()` → 根 = `homedir()/attachments/v1`（**无 `.dsh`**）。自身注释（L422）声明"env 缺失回退 ~/.dsh"，与实现矛盾；npx cache 全库搜索确认**无任何包向进程 env 写入 DSH_HOME**（唯一出口是 dsh-shell-env 注入子进程），宿主进程侧 DSH_HOME 是否导出取决于用户 shell 配置——未验证。
- **影响**：若宿主进程 env 无 DSH_HOME（默认配置，最常见形态），自取证读 `C:\Users\peter\attachments\v1\…`（错）→ ENOENT → undefined → 与修复前同（ATTACHMENT_UNKNOWN）——**懒注册自取证修复在该形态下失活**，跨轮 id 指代（attachmentIds）路径仍坏。fail-safe（无回归/无数据风险），但 P0 目标可能部分未达。
- **修复建议（1 行）**：`const home = DSH_HOME || join(homedir(), '.dsh')`（对齐 resolveDshHome 默认；configured-home 场景另行纳入——插件无该配置面，可 P3 记录）。配套测试：B13 变体删除 env 后断言 root=`join(homedir(),'.dsh'),'attachments','v1'`。
- **处置建议**：计入遗留项随下一热修/常规批次落地（P1 非阻塞，见遗留下限裁决）；Coordinator 若能确认本机宿主进程 DSH_HOME env 未设置，建议提前至 P0 快速返工（F-1 修复 + F-3 测试一并）。

### F-2（**P2** — 建议）：`lib/attachments.js:103-157` `probeImageDimensions` WebP VP8X 分支长度门 off-by-N
- **位置**：L105（入口 `u8.length < 24` return undefined）vs L137-139（读 u8[24..29]，VP8X 需 ≥30 字节）。
- **事实**：24-29 字节截断 VP8X 头 → `u8[24..29]` 越界 undefined → 位运算归 0 → 返回 `{width:1, height:1}` 而非 undefined；仅元数据错（无越界异常/无崩溃；VP8L 分支有 `u8.length<25` 内门、VP8 lossy 分支 w=0 自然拒、PNG/GIF/JPEG 门正确）。
- **影响**：仅畸形存储对象（现实概率极低——宿主 admission 全解码）路径下尺寸元数据失真；进入哈希兜底时以 1×1 注册 → 下游缩略图/尺寸声明偏差。
- **建议**：WebP 分支入口加 `if (u8.length < 30) return undefined`（或 VP8X 分支内改 `u8.length < 30`）。

### F-3（**P1** — 关键/测试看护，建议本轮补）：哈希兜底分支与 env 缺省 fallback 无测试
- **位置**：tests/routing-paths.mjs B13 块（L300-346）；`lib/attachments.js` L413-419。
- **事实**：B13a 仅覆盖"自取证→宿主 full-ref 成功"路径；**未覆盖**：①宿主 full-ref 仍拒 → 内容哈希匹配 → 兜底接受；②哈希不符 → undefined（安全门失效判别）；③空/非图片/损坏对象 → undefined；④env 缺省 fallback（F-1 该缺陷正因此漏网）。
- **影响**：P0 修复中最具安全语义的分支（P5/P7 原则守护点）与 F-1 回归无护栏。
- **建议**：B13c（宿主恒拒 + 哈希一致 → 接受且 entry.bytes/width 断言）、B13d（对象字节改一字节 → hash 不符 → byId undefined）、B13e（DSH_HOME env 不设 → 断言根路径）。均为产物级判别无需真实宿主。

### F-4（**P3** — 讨论/记录）：兜底哈希比对大小写敏感
- **位置**：attachments.js:418 `contentHashId(data) !== id`。
- **事实**：contentHashId 恒小写；id 允许大写（isAttachmentId /i，B12 断言大小写容忍）；宿主 ID_PATTERN 仅小写（L294）→ 大写 id 在宿主面同样失败，方向一致，无放大风险；但插件自己的 isAttachmentId 容忍度宽于宿主（既有差异，非 b6581c5 引入）。
- **建议**：不改/记录；若后续统一，可 `id.toLowerCase()` 后比对。

### F-5（**P3** — 讨论/测试卫生）：D15 判别经未捕获 rejection 失败
- **位置**：tests/routing-paths.mjs L531-533。
- **事实**：旧逻辑场景下 `service.run` 直接 reject 使整文件非零退出（判别仍有效但噪声大）；`check()` 本身不抛，断言应捕获。
- **建议**：`let out; try { out = await service.run(...) } catch (e) { out = { ok: false, error: e } }` 后断言（可选）。

### F-6（**P3** — 讨论/知识分享）：配置面为逐模型声明——泛化性边界说明
- **位置**：`C:\Users\peter\.dsh\settings.yaml` L101-104 / L114-117（模型级 input）。
- **事实**：opencode-go-new 路由 6 个模型中仅 2 个声明 input；该路由混合真·纯文本模型（deepseek-v4-flash）与视觉模型，**因而 provider 级 defaultInput 不可行**（会误声明 flash 为视觉）；逐模型声明是正确精度而非白名单偷懒（凭据：模式在 schema 内合法且 crazy-code/联通已用 provider 级 defaultInput 佐证两种位置皆合法）。
- **建议**：README/AGENTS 配置节加一行"opencode-go-new 路由模型需按真实能力声明模型级 input"；对 gpt-5.6-luna/muse-spark-1.2-contributor 的真实模态做一次核对（当前未声明 = 宿主按 text-only 判，若实际视觉能力则属配置面后续缺口，非本 commit 引入）。

### F-7（**P3** — 讨论）：自取证读取无显式大小上限
- **位置**：attachments.js:402-406。
- **事实**：直读对象文件全量入内存；宿主 admission 归一化上限 maxBytes≈4MB（dsh-attachment-local L846-848）实际有界；无 stat 预检。
- **建议**：不改/记录；如需防御性可 stat 后比对 ATTACHMENT_FILE_MAX_BYTES。

### F-8（**P3** — 讨论/治理）：宿主配置面变更未入 git
- **位置**：settings.yaml（宿主外）。EV-053 已记录"配置面非仓库变更 + 回滚=删两处 input 块"。
- **建议**：满足 P0 场景审计性；考虑在下一次发布 CHANGELOG/README 记一行（多机迁移时需重放），列为 P3 记录即可。

---

## 五、硬门槛裁决

| 门槛项 | 阈值 | 结果 |
|--------|------|------|
| P0 阻塞问题数 | = 0 | ✅ **0**（F-1/F-3 判 P1 非阻塞：fail-safe、环境条件性、可遗留；若 Coordinator 确认本机 DSH_HOME env 未设，F-1 应升级 P0 重新评估——见报告正文） |
| 5 维度全覆盖 | 100% | ✅ 全部逐项给结论 |
| 每条发现标注级别 | 100% | ✅ F-1~F-8：P1×2、P2×1、P3×5 |
| 设计一致性检查 | 已完成 | ✅ 与 v3 §4.3.1/§5.1、W-2、W-3、既有审查语义一致 |
| AI 代码专项 5 项 | 全部完成 | ✅ 详见第三节 |

**未验证项（红线声明，不得视为已通过）**：①测试套件运行结果（98/98、smoke 849/0、stats、parity 14）——引用 Coordinator 事实，未独立复跑；②"真机完整 ref 宿主读取成功 56730B"——引用开发声明，未复现；③宿主重启/热载后 settings 生效——用户动作，未验证；④本机宿主进程 DSH_HOME env 状态——未验证（F-1 条件）。

---

## 六、P5 泛化性验证结论（Developer 声明核验）

Developer 声称"逐项适配而非白名单硬编码"——**核验通过（插件面）**：
- 预检修复：改查询**通用宿主 API 目录面**（listConfigurableProviders，任何 adapter/任何 provider 生效），非 provider 名单注入 → 机制级 ✓（源码核验：dsh-llm 该方法为通用目录，pi-ai adapter 的 `declared` 由 `!catalog.has(provider)` 对任意自定义路由成立）
- 自取证：**内容寻址通用机制**（任意 sha256 id、4 格式探测 ×3 层门控），非该两模型特判 → 机制级 ✓；宿主对象路径/校验语义逐字符源码对位 → 非"猜",非单点
- 测试：B13/D15 以判别性断言锁定机制而非快照值 ✓
- 配置面：逐模型声明为宿主 schema 决定的正确精度（路由模型混合视觉/纯文本，provider 级 defaultInput 会误声明）→ 数据面声明而非代码白名单（F-6 佐证）
- **结论**：P5 无违规；F-1 属于该机制的一个实现缺陷（默认路径常量错误），非设计上的单点化。

**项目质量原则逐条对照**：P1 基于事实 ✅（RCA 三环全部经宿主源码第二次独立验证：`declared` 来源 L2376、`listProviders` 形状 L1240、`readImageFile` 校验 L508、`input` 优先级 L651、对象路径 L305——全部一致）；P2 全面分析 ⚠（漏 env 缺省根判断——F-1，计 P1）；P3 原功能影响 ✅；P4 测试看护 ⚠（F-3 缺口，计 P1）；P5 ✅；P6 高质量 ✅；P7 安全性 ✅（三层门控 + 内容寻址不变量，F-2/4/7 均 fail-safe）；编程要求 1-4 ✅（单一职责、零冗余、单 commit 承载单根因修复）。

---

## 七、审查结论

> **verdict: APPROVED_WITH_NOTES**
>
> **unresolved_blockers: 0**

- **裁决说明**：P0=0、5 维度 100%、AI 专项 5/5、设计一致性通过、P5 核验通过；RCA 三环修复经宿主源码级独立验证全部对位。附有 2 个 P1 遗留项（F-1 一行修复 + F-3 补 3 断言）与 6 个 P3 记录项——均非 BLOCKING（fail-safe、无数据/安全风险、环境条件性）。
- **遗留项**：
  - F-1（P1，🕐 建议随下一热修批次）：`join(homedir(), '.dsh')` 回退 + B13e 测试；若 Coordinator 确认本机宿主进程 DSH_HOME env 未设置，应提前至 P0 返工（F-1+F-3 同批）。
  - F-3（P1，🕐 同批）：B13c/B13d/B13e 三条判别。
  - F-2（P2，🕐 同批或下批）：VP8X 长度门。
  - F-4~F-8（P3 记录，无截止）。
- **通过含义**：硬门槛通过；不代表真实链路已验证（见未验证项）——宿主重启后的真机验证仍为发布前必做（用户动作）。

**输入清单（审结）**：diff 存档 / EV-053 / attachments.js / service.js / routing-paths.mjs / settings.yaml / 宿主源码七处（dsh-llm-pi-ai L286/L651/L862/L922/L942/L1013/L1668/L1687/L1721/L2376/L2367-2382 / dsh-llm L1240/L1251-1304 / dsh-attachment-local L294/L305/L307-311/L508/L125-135/L831/L838-843/L868-870 / dsh-home-paths L50/L65-77 / package.json 依赖面 / dsh-shell-env L83）。

