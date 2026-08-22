# Review 报告：FIX-003C-R1（FIX-003 R1 遗留三修批次独立审查，round 1）

- **任务 ID**：FIX-003C-R1
- **审查对象**：commit `078251671e024758eb82e9fbc7b1996f5ac16245`（2 文件 +59/-5：lib/attachments.js + tests/routing-paths.mjs）
- **审查人**：Code Reviewer Agent（本批次 round 1，无本批次前轮引用；前轮上下文 = review-FIX-003-R1）
- **日期**：2026-08-23（会话）
- **审查基准输入清单**：
  1. `.governance/diff-FIX-003C-0782516.patch`（通读全文，117 行——MUST 首先通读 ✓）
  2. `.governance/review-FIX-003-R1.md`（通读——F-1/F-2/F-3 原始发现定义 + F-4~F-8 台账 ✓）
  3. `.governance/evidence-log.md` EV-053 / EV-056 行（RCA 事实链 + 三修声明 ✓）
  4. `.governance/plan-tracker.md` L49（FIX-003C 任务记录 + 成功标准锚定 ✓）
  5. `lib/attachments.js`（全文 604 行——probeImageDimensions L103-160 / lazyImageFromObjectFile L398-423 / dshHomeAttachmentsRoot L425-430）
  6. `tests/routing-paths.mjs`（B13 块 L301-396 + 头部 check/runner L74-90/L936-941）
  7. 宿主源码级交叉验证（只读）：`D:\AIData\Caches\npm\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh-home-paths\lib\index.js`（L11 `DSH_HOME_DIR_NAME=".dsh"`、L49-51 `defaultDshHome()=join(homedir(),'.dsh')`、L73-76 `resolveDshHome` 优先级 configured > $DSH_HOME(trim>0) > default）与 `dsh-attachment-local\lib\index.js`（L294 `ID_PATTERN=/^sha256:([a-f0-9]{64})$/` 小写严格、L296-298 `digest()` 小写 hex、L304-306 `objectPath=join(root,"objects",sha.slice(0,2),sha)`、L493-513 `readImageFile`：L495 ensureReference→L498 读对象→L505 `digest(data)!==sha256→ATTACHMENT_CORRUPT`→L508 元数据校验、L831 `root=resolve(join(resolveDshHome(config.dshHome),"attachments","v1"))`、L868-870 `readImage(ref,signal)=readImageFile(root,ref,signal)`）
- **审查结论**：**APPROVED**
- **unresolved_blockers: 0**

---

## 一、逐维度结论（5 维度全覆盖）

### 维度 1：正确性（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 逻辑正确 | ✅ F-1/F-2/F-3 三处修复逐一验证（见下逐条）；前轮 F-2 越界读问题关闭 |
| 2 | 边界条件 | ✅ 30 字节 WebP 门覆盖 VP8X/VP8L/VP8 三分支最严需求；env 缺省分支与宿主默认逐字符一致 |
| 3 | 并发安全 | ✅ 变更无新增共享可变状态（纯函数 gate + 无状态根路径计算） |
| 4 | 资源管理 | ✅ 无新增句柄/连接；B13e 的 env 临时删除有 finally 恢复（L374-381） |

**F-1 修复验证（疑区 b）**：
- 补丁后代码 `join(homedir(), '.dsh')`（attachments.js:428）与宿主 `defaultDshHome()` = `join(homedir(), DSH_HOME_DIR_NAME)`，`DSH_HOME_DIR_NAME = ".dsh"`（dsh-home-paths L11/L49-51）——**逐字符一致** ✓；宿主 `resolveDshHome`（L73-76）在 configured 为 undefined 且 $DSH_HOME 非空 trim 时取 env、否则取 default——插件 env 缺省回退恰与宿主 default 对齐 ✓。
- **行为矩阵**：①env 设置（真值）→ 插件 `join(env,'attachments','v1')`，宿主 `resolve(expandHomePath(env))/attachments/v1`——正常绝对路径下同值（本机 DSH_HOME 已设，EV-053/EV-056 事实；修复前后该路径相同，纯防御性对齐 ✓）；②env 未设或缺省 → 插件 `join(homedir(),'.dsh','attachments','v1')` = 宿主 `resolveDshHome()/attachments/v1`（L831）✓ **F-1 关闭**。
- 残余差异（非本 commit 引入，见 G-1/G-2 P3 记录）：env-set 分支不应用 expandHomePath（`~` 前缀不展开）、空白值语义（宿主 trim > 0 视为未设，插件真值判断视为已设）、宿主支持 configured 覆盖（config.dshHome）而插件无该配置面——三者均属 b6581c5 既有形态，FIX-003C 作用范围仅 default 分支，不构成缺陷。

**F-2 修复验证（疑区 c）**：
- WebP 容器规范：VP8X chunk payload 10 字节 = flags(1)+reserved(3)+canvas width-1(字节 4-6, LE24)+height-1(字节 7-9, LE24)；chunk 起始于文件偏移 20 → 宽/高字段位于偏移 **24-26 / 27-29**，完整 VP8X 头 = **30 字节**（20+10）。代码 `w=1+(u8[24]|u8[25]<<8|u8[26]<<16)`、`h=1+(u8[27]|u8[28]<<8|u8[29]<<16)`（attachments.js:141-142）与规范**逐字段对位** ✓；门 `u8.length < 30 → undefined`（L138）正确。
- VP8L 覆盖核查：VP8L 分支实际读 u8[21..23]（需 ≥24），旧内门 `<25`；改统一 `<30` 后，25~29 字节 VP8L 头从"解析得 w/h"变为 undefined——**该区间仅畸形/不可解码对象可达**（正经 VP8L 图像远大于 30B；宿主 admission full-decode 不会入库存放 25~29B 对象；且探测结果还要过哈希门）。对合法图像**零回退**，方向为收窄畸形拒绝 ✓（G-1 P3 记录）。
- VP8 lossy 分支读 u16be(26)/u16be(28)（需 ≥30）——30 门同样覆盖 ✓。入口门 `<24`、PNG/JPEG/GIF 分支未触碰 ✓。
- **合法 30+ 字节 VP8X 头不被误拒**：门仅拒 <30（截断），30+ 正常走分支 ✓。

**F-3 修复验证（疑区 a/d/e）——四条断言逐条推演**（判别性成立，非机械相信）：

- **B13c**（宿主恒拒 + 哈希一致 → 兜底接受）：L344-352。`regRootStrict` 的 `readImage` 恒 throw（裸 id 与完整 ref 均拒——真实模拟"宿主仍拒"）→ byId → lazyRegisterById 首次 readImage throw → lazyImageFromObjectFile：`sha` 校验→`join(root,'objects',sha.slice(0,2),sha)`（与宿主 objectPath L304-306 同构）→ 读文件（DSH_HOME=tmpHome 在此刻为设置态，L311）→ detectImageMediaType='image/png'→probe={912,510}→构造完整 ref{attachmentId,mediaType,width,height,bytes}→**再走宿主 readImage(ref) 仍 throw**（L417 catch）→ 哈希门 `contentHashId(png)===id` 通过（内容=原 png，id=原 png 的 sha256）→ 返回 {ref,data} → 注册 → `!!entryC && mediaType==='image/png' && bytes===png.length && width===912 && height===510` ✓。判别：兜底分支缺失（唯一 catch → undefined）→ `!!entryC` 必败 ✓；与 b6581c5 实现一致性——本补丁未触碰 lazyImageFromObjectFile（diff 无该区域 hunk），链式结构与 R1 报告描述一致 ✓。
- **B13d**（哈希不符 → 兜底拒绝）：L353-369。`badPng` = 原 png 末字节 +1（仍 912×510 合法 PNG 探测通过——IHDR 未被改动；末字节在 64B 填充区末尾 0x3f→0x40）；id = badPng 的 sha256；对象文件**目录名/文件名 = badId 哈希，内容 = 原 png**（哈希不符——模拟半写/冒充）→ 同一链走到哈希门：`contentHashId(png)`（=原 png 的 sha，全串比对非前缀）`!== badId` → undefined ✓。判别：**哈希门缺失（接受任何合法 PNG 字节）→ lazyImageFromObjectFile 无条件返回 {ref,data} → 注册成功 entryD 必 defined → `entryD===undefined` 必败** ✓——判别逻辑成立。安全语义（P7 守卫点）现被断言锁定 ✓。
- **B13e**（env 缺省回退）：L370-382。`delete process.env.DSH_HOME`（先存 prevEnv=tmpHome）→ `regE.dshHomeAttachmentsRoot() === join(homedir(), '.dsh', 'attachments', 'v1')`。**纯拼接断言**：仅调用 dshHomeAttachmentsRoot()（不读文件、无 readImage、无 fsService 依赖——new Context() 零提供即可）→ 不触真实用户目录 ✓；生产 `join(join(homedir(),'.dsh'),'attachments','v1')` 与测试期望 `join(homedir(),'.dsh','attachments','v1')` 为同一 join 语义（join 结合性恒等）✓ 无平台特有问题（win32 homedir() 与 node:path join 双方同源同用）✓；finally 恢复 prevEnv ✓（外层 finally 恢复 prevDshHome ✓ 双层嵌套恢复正确）。判别：旧代码（homedir() 无 .dsh）→ 路径缺 `.dsh` 段 → 必败 ✓（与 EV-056 红相 B13e FAIL 一致）。
- **B13f**（VP8X 截断头）：L383-390。27 字节夹具：'RIFF'+size0+'WEBP'+'VP8X'+chunk-size=10（16 字节 + [16]=0x0a，其余补零）→ probeImageDimensions：入口 27≥24 → WebP 分支魔数 ✓ → **新门 27<30 → undefined** ✓。判别：旧门（仅 <24）下走 VP8X 分支，u8[24..26]=0（界内）、u8[27..29]=undefined（越界）→ 位运算归 0 → `{1,1}` ≠ undefined → 必败 ✓（与 EV-056 红相 B13f FAIL 一致）。

### 维度 2：安全性（4/4 项 —— 疑区 (e) 逐项结案）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 输入校验 | ✅ B13d 新增断言使"哈希门失效即失败"成为可复查事实；F-2 门收紧截断 WebP 头（不再以 1×1 元数据注册） |
| 2 | 注入防护 | ✅ 变更不新增任何输入面/路径拼接（根路径常量 .dsh 段无注入源；sha 仍受 64hex 正则 + slice 形态约束——L399-403 未触碰） |
| 3 | 敏感数据 | ✅ diff 全量核对：无密钥/token/凭据硬编码 |
| 4 | 权限检查 | ✅ 自取证链读路径不变（宿主库单形态），输出仍受 contentHashId===id 哈希门约束；本 commit 未放宽任何门（仅收紧 WebP 门 + 补测试断言） |

**哈希门同构性（疑区 a 第二部分）**：插件 `contentHashId(data) !== id`（L421，`sha256:${小写hex}` 全串比对）与宿主 L505 `digest$1(data) !== sha256`（同 SHA-256 小写 hex；sha256 由 ensureReference 经 ID_PATTERN L294 小写严格提取）——**同数学同构** ✓。大小写维度：宿主更严（大写 id 在 L294 即 INVALID_ATTACHMENT_REF，先于读文件）；插件 isAttachmentId /i 放宽 → 大写 id 在自取证据面走 `sha` 正则 /i（L400）→ Windows 大小写不敏感文件系统下能读到对象文件 → 哈希门（小写 vs 大写）必拒 → undefined；Linux 下 ENOENT → undefined——**两平台终态一致（拒绝），方向与宿主一致（宿主更严）**，F-4 记录结论维持 ✓（此差异为 b6581c5 既有，非本 commit 引入，P3 台账保留）。

### 维度 3：可维护性（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 命名可读 | ✅ 门常量 30 以注释说明规范依据（offset 24/27 起 3 字节宽高），意图清晰 |
| 2 | 函数长度 | ✅ 无函数体膨胀（Gate 3 行 + home 表达式 1 行） |
| 3 | 重复代码 | ✅ 无新增重复；B13e 测试中重复 join 表达式为产品-测试独立性（判别优先），合规 |
| 4 | 注释质量 | ✅ **F-1 注释/实现矛盾已消除**（L425-426 注释与 L428 实现一致，且标注 FIX-003C F-1 溯源）；F-2 注释准确描述 cut-off 语义（"24-29 字节截断头此前越界位运算归 0 → {1,1} 而非 undefined"——对 length 27 情形逐字为真：u8[24..26] 界内零值、u8[27..29] undefined→位运算 0） |

### 维度 4：性能（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 避免不必要循环 | ✅ 无循环新增；门为 O(1) 常数比较 |
| 2 | 数据结构选择 | ✅ 不变 |
| 3 | 懒加载 | ✅ 自取证触发面不变（仅兜底分支时序）；新增断言复用已有对象（B13c/d 不额外写对象） |
| 4 | 批量操作 | ✅ 每条新断言至多 1 次文件读（B13c 读已有对象；B13d 写 1 对象文件；B13e/f 零 I/O）；B13d 的 mkdirSync/writeFileSync 在 tmpHome 下，finally rmSync 清理 ✓ |

### 维度 5：测试覆盖（4/4 项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 核心路径有测试 | ✅ F-3 核心四项（哈希兜底接受/哈希不符拒绝/env 回退路径）全部落断言（B13c/d/e）——正是 R1 判定"最具安全语义的分支无护栏"的点位 |
| 2 | 边界测试 | ✅ B13f（VP8X 截断头 27B——F-2 修复精确边界）；B13e env 删除/恢复边界 |
| 3 | 错误路径测试 | ✅ B13d 模拟半写/冒充对象（目录名哈希≠内容哈希）——安全拒绝路径显式断言；B13c 模拟宿主恒拒（readImage 裸 id 与完整 ref 双侧均 throw）——兜底接受路径显式断言 |
| 4 | 覆盖率达标 | ✅ 102/102（98 基线零回退 + 4 新增）——**引用 Coordinator/EV-056 事实（多次复跑；smoke 849/0），本审查无执行权限未复跑**（红线声明见 §六） |

测试卫生：新增 4 断言均使用 `check()`（非抛错型），失败即计数 fail>0 → exit 1（L939），混入既有套件无语义冲突；B13c/d/e/f 均在外层 try（process.env 与 tmpHome 的恢复 finally L391-395）内，env 泄漏风险为零 ✓。B13e 与 B13f 在旧代码下的 FAIL 判据（EV-056 红相）+ 本报告独立推演一致 ✓。

---

## 二、疑区 (a)-(f) 专项结论（逐项）

- **(a) B13d 哈希门判别性**：成立（推演见 §一 维度 1 F-3 验证）；哈希门与宿主 digest 校验同构（同 SHA-256 小写 hex 全串比对；宿主经 ID_PATTERN 更严方向，F-4 维持）。
- **(b) F-1 对齐**：逐字符一致（`join(homedir(), '.dsh')` vs `defaultDshHome()`）；行为矩阵（env 设/不设）见 §一 维度 1——default 分支完全对齐；env 分支差异为既有形态（G-2 P3）。
- **(c) F-2 无损性**：30 门与 VP8X 规范字段（24-26 宽 / 27-29 高）精确对位；VP8L 25~29B 畸形头行为收窄（无合法图回退，G-1 P3）；VP8 lossy（需 u8[29]）亦被覆盖；30+ 合法头零误拒。
- **(d) B13e 测试设计**：纯拼接断言、零真实目录触达、零宿主面依赖、win32 无特例、双层 env 恢复正确、判别性（旧代码必败）成立。
- **(e) B13c 判别**："宿主恒拒"夹具（双侧 throw）真模拟 readImage 失败；兜底链（读对象→探测→构造 ref→再走宿主→仍拒→哈希兜底）与 b6581c5 实现一致（本 commit 未触碰该函数）；判别成立。
- **(f) 范围纪律**：diff 存档恰 2 文件（lib/attachments.js + tests/routing-paths.mjs），+59/-5 与 EV-056 声明一致；hunk 仅落于 probeImageDimensions WebP 门区、dshHomeAttachmentsRoot、B13 断言与 import 行——**未顺带修改 F-4~F-8 相关面（P3 台账保留不动：isAttachmentId /i、D15 判定、settings.yaml、配置面声明、无 stat 预检均未触碰）**；无跨域改动（未触 service.js/smoke/stats/EVO-002 域）✓。

---

## 三、AI 代码专项（5 项逐条）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | mock 残留 | ✅ 产品代码零 mock；B13c/d 夹具标注"宿主恒拒"且仅作测试桩，B13e 纯计算无桩 |
| 2 | 硬编码返回值 | ✅ 无（门常量 30 为规范依据非魔法结果；断言目标 912×510 为伪 PNG 的真实探测产物） |
| 3 | 幻觉 API 调用 | ✅ 零新增 API——仅复用 `homedir`（import 已存在 L30）、`join`（L31）、`readImage`（宿主 L868 实证）与既有 probe 逻辑；`join(homedir(), '.dsh')` 与宿主默认逐字符核对 |
| 4 | 未实现 TODO | ✅ 无 TODO；注释与实现逐字对应（F-1 矛盾已消） |
| 5 | 过度实现 | ✅ 未发现：无多余分支/防御；新断言恰覆盖 R1 F-3 建议的三条 + F-2 边界一条，无画蛇添足 |

---

## 四、设计一致性（已比对 v3 §4.3.1 / §5.1 M2 契约 + 宿主接口契约）

- M2 注册表契约（id↔路径↔files 三向映射 / LRU 200 / 错误码表）——不变 ✓
- W-2 懒注册降级链语义（失败 → ATTACHMENT_UNKNOWN）——hash 门/探测语义未变，F-2 门收紧不改变错误映射 ✓
- 与宿主契约：对象路径 (L304-306)、digest 校验 (L505)、store root (L831)、readImage 签名 (L868) 全部源码级对位 ✓；F-1 修复后插件默认根与宿主 resolveDshHome 默认一致——消除 R1 指出的"自取证据面与宿主实际库根不一致"失活风险 ✓
- 与 ADR/既有审查（review-FIX-002-R8、review-RES-002）无冲突 ✓

---

## 五、发现清单（每条：级别 / 位置 / 事实 / 建议）

### G-1（**P3** 讨论/记录）：VP8L 25~29 字节畸形头行为收窄（旧解析 → 新 undefined）
- **位置**：lib/attachments.js:138（统一 30 门替代旧 VP8L `<25` 内门 L145 移除）。
- **事实**：VP8L 分支实际仅需 u8[21..23]（≥24B）；25~29B 区间的 VP8L 头在旧代码下解析出 w/h（readable if malformed），新代码 undefined。该区间文件不可能为可解码图像（VP8L 最小 bitstream 之后还需熵编码数据；宿主 admission full-decode 不会入库），且探测结果仍需哈希门——实践不可达。
- **建议**：不改/记录；如追求规范刚性，可写注释说明"VP8L 头 24B、VP8X 头 30B，统一取最严 30 为 WebP 分支门槛"（当前注释已隐含）。P3 无截止。

### G-2（**P3** 讨论/记录）：env-set 分支与宿主 resolveDshHome 的残余语义差异（非本 commit 引入）
- **位置**：lib/attachments.js:428（`typeof DSH_HOME==='string' && DSH_HOME` 真值判断）。
- **事实**：宿主（dsh-home-paths L73-76）对空/空白 env 视为未设（`trim().length>0`）并对 env 值应用 expandHomePath/resolve；插件真值判断（`'   '` 视为已设）且不展开 `~`。属 b6581c5 既有形态，FIX-003C 仅对齐 default 分支（注释与声明作用范围一致）；宿主 configured 覆盖（config.dshHome）插件不可见亦为既有已知（R1 F-1 修复建议已注明"configured-home 场景另行纳入"）。
- **建议**：P3 记录；若后续统一可用 `env.trim() ? env : join(homedir(),'.dsh')` 并可选 expandHomePath；不改不阻塞。

### G-3（**P3** 讨论/测试卫生）：F-3 原"空/非图片/损坏对象 → undefined"子项仍无独立断言
- **位置**：tests/routing-paths.mjs B13 块（L341-390 之后）。
- **事实**：R1 F-3 事实项③（非图片/损坏对象）未在任何推荐断言中落地（R1 建议即 B13c/d/e 三条——已全落地 + B13f 增补）；该子项被 detectImageMediaType（L411）/probe（L414）门控 + 哈希门间接守护，无害但无直接看护。
- **建议**：可选 B13g（向 objDir 写一个 64hex 文件名为魔数不符字节 → byId undefined）；P3 无截止，不阻塞。

---

## 六、硬门槛裁决

| 门槛项 | 阈值 | 结果 |
|--------|------|------|
| P0 阻塞问题数 | = 0 | ✅ **0**（G-1~G-3 均 P3 非阻塞；F-1/F-2/F-3 三项前轮发现全部关闭） |
| 5 维度全覆盖 | 100% | ✅ 逐项给结论 |
| 每条发现标注级别 | 100% | ✅ G-1~G-3：P3×3 |
| 设计一致性检查 | 已完成 | ✅ §四 |
| AI 代码专项 5 项 | 全部完成 | ✅ §三 5/5 |

**未验证项（红线声明，不得视为已通过）**：①测试套件运行结果（routing-paths 102/102、smoke 849/0、红相 2 FAIL）——引用 Coordinator/EV-056/Developer 事实，本审查无执行权限（Bash 禁用）**未复跑**；②"本机 DSH_HOME env 已设"——EV-053/EV-056 记录事实，未独立探查（不影响修复正确性——修复恰为 env 未设形态的防御对齐）；③b6581c5 实现逐行差异——仅可比对 diff 存档与现行文件（本 commit 未触碰 lazyImageFromObjectFile，从而与 R1 报告描述一致），未做两 commit 源码 diff。

---

## 七、审查结论

> **verdict: APPROVED**
>
> **unresolved_blockers: 0**

- **裁决说明**：R1 遗留三项（F-1 P1 / F-2 P2 / F-3 P1）在 0782516 全部关闭并经本审查独立源码级验证——F-1 与宿主 `defaultDshHome` 逐字符一致、行为矩阵确认 default 分支对齐；F-2 30 门与 VP8X 规范字段精确对位、VP8L/VP8 无合法图回退；F-3 B13c/d/e/f 四条断言判别性全部成立（含 B13d"哈希门缺失必败"与 B13a-f 红相一致性推演）。P0=0、5 维度 100%、AI 专项 5/5、设计一致性通过、范围纪律 ✓（恰 2 文件、P3 台账未动、无跨域）。附 G-1~G-3 三条 P3 讨论记录——均非 BLOCKING。
- **前轮发现对照**：F-1 已修复 ✓ / F-2 已修复 ✓ / F-3 已修复 ✓（B13c/d/e/f）；F-4（哈希大小写 R1 已定 P3 保留）——本 commit 未触碰，方向一致性复核维持（宿主更严）✓；F-5~F-8 台账保留未动 ✓。
- **通过含义**：硬门槛通过；不代表真实链路已验证——宿主重启后真机视觉调用/气泡图片验证仍为发布前必做（用户动作，见 EV-053/EV-056 与 plan-tracker FIX-003 行）。
