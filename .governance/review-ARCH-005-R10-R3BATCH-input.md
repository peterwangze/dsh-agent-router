# ARCH-005 / R3 批 代码审查报告（Code Reviewer，round 10 / unit R3-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本；机器登记 = review-record --task ARCH-005 --round 10 --unit R3 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged R3 域 3 文件（scoped diff）；P2-1 已退回原 Developer 一行防护修复。

**Round**: R1（R3 域首审）| **范围**: git diff --cached -- tests/host-contract.mjs tests/host-version-snapshot.mjs .github/workflows/ci.yml（+361/−47；ci.yml 零删除行——既有 guard job 逐字节不变 diff 复算证实）| **纪律**：零采信自报，实读/实跑。

---

## 一、审查结论

**APPROVED_WITH_NOTES**（unresolved_blockers = 0；P0=0，P1=0，P2×1〔可遗留，已退回修复〕，P3×4）

零阻塞。核心交付（DSH_BASELINE 参数化 + since 分代 + CI matrix + 三条红演示）全部经独立复跑证实，与设计 §6 R3 行 / §2-B 四维-c 逐项对齐，无设计偏离。

## 二、独立复跑结果

| 门 | 独立结果 | 对照 |
|---|---|---|
| primary 默认 host-contract | **128 断言全绿 0 skip exit 0**（npm-global 0.2.0 树） | 一致（122+7 新判据−1 删除副本锁定=128 对账吻合） |
| primary snapshot | **30 断言全绿 exit 0** | 自报 29——实际 30（P3-3） |
| 全量网（chcp） | **21/22 PASS + smoke 恰 2 sh 臂 + #SKIP 0** | 一致；2 sh 臂经 R0 批审查记录证实为既有基线——**零回退成立** |
| frozen 复跑（开发者 pack 树复用） | **125 断言 + 3 skip exit 0**；8/8 版本精确命中 frozen 档案 | 一致 |
| frozen 全量网 | **21 PASS + #SKIP 4（host-contract×3, snapshot×1）** + smoke 2 sh 臂 | 与 ci.yml 头部预测逐条吻合 |
| primary job 等价 | `DSH_BASELINE=0.2.0`/`primary`/纯空白 → 128 断言 | 一致 |
| 红演示 (a) 基线错位 | 7a 红（8 项缺失清单）+ 7b 红（{presets,authorable}≠{presets}）+ 8 包告警 exit 1 | 一致且**独立证实 0.1.5 树 agentPresets 实读形态** |
| 红演示 (b) 9.9.9 | 两套件 FAIL + fail-closed 收口 exit 1 | P8 闭合独立证实 |
| 红演示 (c) 反向错位 | 125 绿（19⊆27 吸收语义正确）+ future 注记 + 可见 skip | 一致 |
| yaml 结构（PyYAML） | 3 jobs；禁用开关/needs/fail-fast false/matrix fromJSON/env DSH_BASELINE/同门控命令 | 一致 |
| yaml 零版本字面量 | semver 扫可执行 run: 块 **0 命中**（版本串全在注释） | 一致 |
| 内嵌脚本实跑 | ids=["0.1.5","0.2.0"]；frozen→0.1.5 组解析；9.9.9→exit 1 不写 GITHUB_ENV | 一致 |
| ANCHOR_CASES 保全 | 9h R-1 全绿（ci.yml 3 fresh/stale 0） | 一致 |
| 夹具争用 | cordis 4.0.1 健康 symlink，Context 可加载 | R2 残响已闭合 |

## 三、Findings

**P2-1（建议修改，已退回修复）— ci.yml:182-184/:236 两段内嵌脚本 marker 缺失防护是死守卫**：marker 消失时 indexOf(-1)→0 → 提取到全文首个 `[` → resolve 产出 [null,...] → 下游 exit 1——fail-closed 不破但诊断迂回；与测试侧 arrayOf（先判 start<0）防护强度不对等。一行修复/处。同源注意：注册表提取逻辑三处并存（数据单源成立、旧副本已删 P5 满足，提取实现未汇入单路径——设计文件面约束性取舍，建议后续批收口共享脚本）。

**P3-1 — snapshot:195-201 §0b 失败计数双记**：check() 已 failures++ 后手动再 ++ → 单逻辑失败显示 2 FAILURE(S)；exit 语义正确，纯日志精度。

**P3-2 — host-contract:1062 7a futureMirror 注记措辞**：「更低代际」仅树=所选基线时成立；反向错位场景宿主表为更高代际，陈述相反（另有版本告警 skip 兜底，判据不受影响）。

**P3-3 — 自报计数**：snapshot 断言实为 30（预期 29）——staged 净增 1（§0b）；登记供门控基线修正。

**P3-4（边界如实登记，非缺陷）— CI 矩阵树不含 typert-registry/settings** ⇒ A2/A3 行为判据在矩阵 job 与 guard job 同为 BR-03 可见 skip（回显可见非静默）。排除论证静态核验成立（0.2.0 专属行为断言对 0.1.5 树必红且无 since 可分代）；frozen job skip 为真实分代降级（文案指明原因）不构成误导噪声；净效果 = 未扩展亦未收窄 CI 覆盖面。

## 四、逐审查重点裁定

1. **参数化 + P5 强化 ✓**：选择语义实跑证实；副本删除→new Function 权威提取复用既有 arrayOf/stripComments 单路径；fail-closed 三判据红即收口（提取失败臂静态核验：判据块位于 HOST_DECLARED_RANGE 解引用之前无 null 崩栈窗口）；**声明面恒 primary 经活体证实**（frozen 实跑中 S3 仍对 ^0.2.0-rc.2 求等且绿）。
2. **since 分代 ✓**：全部锚/schema since 与双树实读对照（agentPresets 0.1.5 形态独立证实）；minorOf 四象限静态核验正确；4 条完备性判据判别力实在（注记缺失→期望集走 fail 方向整体红，无静默缝）；7a 分代 + events.js 单源注记不复制（27/27 注记实读吻合）。
3. **CI matrix 设计 ✓**：结构/开关/同命令/8 包=HOST_KEY_PACKAGES 逐项核对（tarball 命名+strip 形态正确，pack 树本地复用验证）；零版本字面量独立复算；排除两包论证成立；guard job 零删除。
4. **红演示 ✓**：(a)(b)(c) 全部独立重放（非仅推演）。
5. **验收独立复跑 ✓** 全项（含开发者 $TEMP 证据树核验复用）。
6. **夹具争用 ✓**。
7. **AI 五查 ✓**。

## 五、五维度 + AI 专项 + 硬门槛

五维度全过（正确性/安全性[new Function 同信任域无提权]/可维护性[附 P2-1/P3-2]/性能/测试覆盖[核心+边界+错误路径判别性判据红绿双演示]）。AI 五查零命中。硬门槛 P0=0/五维度 100%/标级 100%/设计一致性完成。

**遗留**：P2-1（已退回一行防护）；P3-1/P3-2 顺手修；P3-3 门控预期值改 30。**后续义务（非阻塞）**：CI 首跑后复核矩阵两 job 全绿与 ubuntu #SKIP 形态；npm registry 0.1.5 tarball 可解析性首跑确认（ci.yml 头部已标注）。**P-violation**：无 P0/P1；P2-1 涉 P5 实现路径汇入弱化形态（数据单源成立旧路径已删失败响亮——约束性取舍，登记）。
