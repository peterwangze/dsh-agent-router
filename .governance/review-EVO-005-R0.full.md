# EVO-005 R0 完整审查报告存档（补录 2026-08-27）

> 背景：REVIEW-EVO-005-R0 机器行的 report 输入文件（review-EVO-005-R0.input.md）已按 FIX-006 先例删除，CLI canonical 文件（review-EVO-005-R0.md）为元数据 wrapper——完整报告文本由此存档承载（REL-002 双审完整报告持久化先例的对齐补录；REL-003 Developer 备注 1 揭示存根引用缺口后补）。

## 结论：APPROVED_WITH_NOTES（unresolved_blockers=0；P0=0 / P1=2 / P2=1 / P3=5）

审查对象：6355eb7 / 65e7e34 / d49ed4c（diff 2646a22..d49ed4c，6 文件 +597/−30）；独立只读实例；测试运行为 Developer 自报 + 静态交叉验证。

### 协议事实溯源（13/13 相符，对照 .router-files/pi-ai-auth-oauth-openai-codex.js）
usercode POST {client_id}（:146-151）/ 响应三字段 + interval 归一（:161-166）/ 404 未启用（:153-155）/ interval 五条件校验 / 轮询 POST 双参（:181-189）/ 2xx 双字段必含（:190-198）/ 403,404→pending（:204-206）/ error 双形状（:208-214）/ deviceauth_authorization_pending 特有码（:215）/ slow_down 与其他终态（:218-224）/ **exchangeRedirectUri = auth.openai.com/deviceauth/callback ≠ 1455 死值（:30+:351）** / 兑换 form-urlencoded 四参（:112-126）/ 超时 900s（:31）。唯一标注假设 +5s（RFC 8628 §3.5；device-code.js 缺失于快照，glob 验证）——标注合规。

### 发现总表
- **F-1（P1）** lib/service.js:3315/3394 vs :3603-3607——登出×兑换 TOCTOU：cancelled 仅循环顶检查，exchangeDeviceCode persist 前无复查 → 登出后凭据复活窗口（W-5 声明未完全交付）。修法：persist 前 `if (session.cancelled) { recordOauthEvent('preset_device_cancelled',...); return 'cancelled' }` + 竞态判别测试
- **F-2（P1）** oauth-credentials.js:268-271 + service.js:3326-3331——瞬时传输错误终态化：网络错误归一 failed + 循环 break → 单次 ECONNRESET 杀死 15 分钟流程；reason 固定 poll_rejected 混淆传输/拒绝（P8）。修法：transport 判别标志 + 退避重试至 expiresAt + poll_transport_error 区分
- **F-3（P2）** client.js:2443-2468——设备码失败对客户端不可见（只观察 presetLoggedIn；15 分钟窗口空转；与 F-2 叠加）。遗留改进：catalog 暴露 deviceStatus
- **F-4（P3）** service.js:2585-2589 recordOauthEvent JSDoc kind 清单缺 4 个 preset_device_* 事件
- **F-5（P3）** oauth-credentials.js:229 vs :251 JSDoc 与代码不符（消息不含 body——行为更保守）
- **F-6（P3）** service.js:3296 expiresIn 硬编码 900（测试注入时背离）——由 timeoutMs/1000 推导
- **F-7（P3）** service.js:3268 interval=0 病态值 1ms 忙轮询——下限 1000ms
- **F-8（P3）** commit 消息断言计数措辞（headline 908=873+19+16 精确吻合，P4 成立）

### 五维度：正确性 ✅（附 F-1/F-2）/ 安全性 ✅（XSS 零 innerHTML、P7 零 token、0o600、无 SSRF）/ 可维护性 ✅（附 F-4/F-5）/ 性能 ✅（附 F-7）/ 测试覆盖 ✅（F-1 竞态路径缺口与发现一致）

### 重点裁决：门控一致性 ✅（oauthExperimental:3199→ToS:3205→starter:3210→loopback:3214 严格前置，kill-switch 纯粹性保持）；4b 断言改写 = D-2a 授权语义落地非掩盖回归（块 3 继续守卫 1455 空闲路径）；越域 3 处裁量正当（FIX-006 F-2 先例，事前申报优于先例）；persistPresetLogin 逐字等价成立；P4/P5/P7/P8/P9 全过无违反条目

### 处置：F-1/F-2 强烈建议随 v0.3.0 发布前 commit 闭合（→ REL-003 dcd44fa/6dbe57d 承接）+ F-1 竞态判别测试（→ 同）；F-3 随 catalog 状态面演进；F-4~F-8 记账随行（→ REL-003 fbdfc61 承接 F-4~F-7）
