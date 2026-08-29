# FIX-007 R0 审查报告（Code Reviewer）——落盘版

Round: R0（初审）| 对象: commit b816601（docs/FIX-007-RCA.md + lib/attachments.js + lib/service.js + tests/attachments.mjs，+579/−40）| 方式: 只读（逐行+宿主 rc.2 源码实读+RFC 6386/libwebp 对照；未执行命令——运行结果均为 Developer 自报并标注）
结论: **APPROVED_WITH_NOTES（unresolved_blockers=0）** | P0=0 / P1=1 / P2=2 / P3=7

## RCA 主张逐条验证（宿主源码实读）
R1 裸 id 恒拒 ✅（dsh-attachment-local:493-513 readImageFile 全等校验）；R2 VP8 偏移确坏 ✅（旧代码 u8[14..17] 非帧标签；新代码规范正确）；R3 签名= client.js:417-424 ✅（逐字符一致；wImageDataRequest/schemas:614-623 width/height 必填字段表一致）；R4 readImageRequest+归一化 ✅（index.js:871 实读 + REQUEST_IMAGE_QUALITIES）；R5 构造即 provide 脆弱性 ✅（index.js:154 先于 :157/:158）。宿主 API 消费真实性：无幻觉调用 ✅。

## 审查重点结论
1. **VP8 字节数学 ✅ 通过**：FourCC 0x38+0x20（:164-173）✓；关键帧位 0（帧标签 bit0，RFC 6386 正确——0x20&0x01）✓；宽高 u16le(26)/(28)&0x3fff 直存实际值 ✓（640×480=0x0280 规范自洽）；VP8L 28 位 LSB-first +1 ✓（测试向量 2f 3f c1 31 00=320×200 独立复算）；VP8X 24 位 ✓；u8.length<30 门槛无越界读 ✓。附 P3 两项：F-5 缺起始码校验（下游宿主校验兜底）/ F-6 ALPH-first 盲区（存量限制）。
2. **readStoredImage 单点 ✅ 通过**：调用图无环无自入；降级链有界（≤1 条目-ref + 1 对象读 + 探测 + 1 重试 + 哈希兜底）；失败终态有信号（ATTACHMENT_UNKNOWN/ok:false）；回填一致性（进程内注册表自洽）；插件探测器与 sharp 取值一致性核验（EXIF-JPEG 由宿主归一化保证）。
3. **R1/R3 修复忠实度 ✅ 通过（R3 一处设计偏差=F-1 P1）**：grep 8 处 readImage 调用点——无残留裸 id 缺陷点；materialize/read/imageData 三路均经单点；resolveAttachmentIds 主路径补全成立（R3 客户端拒绝面修复）；**残留窄路径：条目缺元数据+自取证双重失败时仍产出兜底畸形 ref 且零诊断事件——与 RCA F-3 明文「缺失即 fail-loud」不符（F-1）**。
4. **P5 泛化 ✅ 通过**：lib/ grep rc.2/rc.8 零命中（仅 docs）；形状适配零版本判定（FIX-006 prepareCall 同型）。
5. **R3/R5 认证 ✅**：client.js:417-424 实读逐字符一致；router_catalog_empty（:779-781）仅未知 id + 空目录触发——健康目录拼错 id 不误报；scopeAttached/enabled 字段区分 + 双通道可观测。
6. **测试质量 ✅ 附注**：strict-host mock 逐字符复刻 rc.2 readImageFile（对象布局/校验消息同构）；14 条断言 = F-1a-e(5)+F-3a-d(4)+F-2a-e(5) 与 +14/932 自洽；真实 store 脚本 20 个在盘（fix007-verify.mjs 实读：DSH_HOME 隔离 + 7 格式×4 路）；缺口：畸形 ref 降级路径（F-1 场景）无测试。
7. **P9 盲区命名 ✅**：附 parity 无守卫/PNG-only/单通路注入三盲区与本审查独立发现一致；FIX-008 候选登记（附件 parity 守卫/R5 根因/F-6/F-10 加固/真实 sharp 字节测试入 smoke）。

## 五维度：正确性 ✅（附 F-1）/ 安全性 ✅（对象路径 `^[0-9a-f]{64}$` 无穿越 + 标记注入净化 + 无硬编码）/ 可维护性 ✅（附 F-7/F-8 改进项）/ 性能 ✅（附 F-3 埋点盲区）/ 测试覆盖 ✅（附 P1 关联缺口）。
AI 专项 5 项：mock 残留无 / 硬编码无 / 幻觉 API 无（宿主源码实读）/ TODO 无 / 过度实现无显著项。

## 发现
- **F-1（P1·P8-violation）** service.js:2084-2112：双重失败（缺元数据+自取证失败）时仍以兜底值产出派发 ref（mediaType:'image/png'/bytes:0/width-height 条件展开）——与 RCA F-3「缺失即 fail-loud」明文相悖；无诊断事件；无测试。触发面窄（附件已不可读时旧代码同样产出——非回归），主目标已达成。修法二选一：(a) 代码对齐——降级产出前 recordCapabilityEvent('attachment_ref_degraded') 或 throw ATTACHMENT_UNKNOWN（≈5 行）；(b) 修订 RCA F-3 文本为「尽力而为+降级事件」并补事件——任一方向均须消除静默。
- **F-2（P2）** RCA:169/ tests:417,425 注释失真（RCA 写 0xC0===0、测试写 width-1/top 2 bits）——实现才是规范正确（bit0 帧类型+14 位直存）——代码勿改，文档/注释修正防后人按文档「纠正」代码。
- **F-3（P2）** service.js:2496-2513：F-4 耗时埋点只包住首次 readImage；自取证降级慢路径未计量。
- **F-4（P3）** attachments.js:578 消息区分「未注册」vs「已注册但元数据不可恢复」。
- **F-5（P3）** :164-173 补 VP8 起始码校验（9d 01 2a 对齐 libwebp）。
- **F-6（P3）** :134 ALPH-first 盲区——FIX-008 候选。
- **F-7（P3）** :460-472 自取证重注册覆盖 source/workspacePath，与 lazyRegisterById 双份平行逻辑——收敛候选。
- **F-8（P3）** tests:314 死计数器。
- **F-9（P3）** triage 越域补记（裁定：attachments.mjs 断言归属/ docs-RCA 报告产出 可接受；tool/index 未动成立）。
- **F-10（P3）** service.js:2610-2625/:1466 存量同类 P8 隐患——FIX-008 候选。

## 越域裁定：tests/attachments.mjs ✅ 可接受（FIX-006 F-2 先例，triage 补记）；docs/FIX-007-RCA.md ✅ 可接受；tool/index 未动 ✅ 成立（RCA 判定）——实际触碰面小于申报面，无实质越域。

## 结论
APPROVED_WITH_NOTES/0——R1/R2/R4/R5 忠实且规范级+宿主级双验证；R3 主路径成立、残留 F-1（P1）建议本轮闭合（5 行降级事件或 RCA 修订+事件+路径测试）；F-2/F-3 随本轮；P3 登记。未独立重放项（smoke 932+1/先红 10/七格式/311.9s）以在盘脚本+静态机理佐证并标注自报。
