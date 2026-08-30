/**
 * FIX-011 判别测试：统计读侧 RPC 断裂（字段遮蔽方法）守卫。
 *
 * RCA（Coordinator 已实证，本测试复核）：
 * - v0.3.0（EVO-003 统计迁移）在 RouterService 构造器引入实例字段
 *   `this.stats = new StatsStore(...)`（lib/service.js:673），该自有属性
 *   遮蔽原型上的 RPC 方法 `stats()`（lib/service.js:3172，委托
 *   statsSnapshot()）。
 * - 宿主 typert 网关按 `descriptor.implementation ?? descriptor.method`
 *   经 `Reflect.get(receiver, implementation)` 解析方法并断言函数类型
 *   （dsh-api-gateway/lib/index.js:101-103）。`Reflect.get(service, 'stats')`
 *   命中实例字段（StatsStore 对象）→ 非函数 → RPC router/stats 返回
 *   method-unavailable → 设置页统计面板每 2s 轮询静默失败恒 0。
 * - 修复：ROUTER_DESCRIPTORS 中 stats 条目声明 `implementation:
 *   'statsSnapshot'`，网关据此绕开被遮蔽的名字绑定原型方法（字段保持原样
 *   ——内部有大量使用，不改 lib/service.js）。
 *
 * 判别性：旧代码（无 implementation 映射）运行本测试 stats 相关断言必败；
 * 修复后全绿。构造走生产路径（new RouterService + attach），stats 默认
 * persist=false 纯内存——不触碰 ~/.dsh 与 $DSH_HOME。
 *
 * 独立入口：node tests/rpc-shadow-guard.mjs（exit 0/1）。
 */
import { Context } from '@deepseek-ai/cordis'
import { ROUTER_DESCRIPTORS } from '../lib/rpc.js'
import { RouterService } from '../lib/service.js'

let failures = 0
let passed = 0
const check = (label, condition) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failures++; console.error(`FAIL  ${label}`) }
}

// 最小构造（tests/fix-009-image-solo.mjs 先例）：构造器不访问 settings/llm
// 等（惰性），stats 默认 persist=false 纯内存零磁盘。
const service = new RouterService(new Context())
service.attach({ get: () => ({ enabled: true, agents: {} }) })

// ── 1. 网关绑定契约守卫：每个描述符经 implementation ?? method 解析后
//      必须得到可调用方法（与 dsh-api-gateway/lib/index.js:101-103 同语义）。
console.log('descriptor → callable binding (gateway contract):')
for (const descriptor of ROUTER_DESCRIPTORS) {
  const key = descriptor.implementation ?? descriptor.method
  const method = Reflect.get(service, key)
  check(`descriptor ${descriptor.id}: Reflect.get(service, ${JSON.stringify(key)}) is callable`, typeof method === 'function')
}

// ── 2. stats 条目必须显式指向 statsSnapshot（字段遮蔽的绕行锚点）。
console.log('stats descriptor implementation:')
const statsDescriptor = ROUTER_DESCRIPTORS.find((d) => d.id === 'dsh-agent-router#router/stats')
check('stats descriptor declares implementation "statsSnapshot"', statsDescriptor?.implementation === 'statsSnapshot')

// ── 3. statsSnapshot 基础形状（ok/enabled/totals——设置页面板消费面）。
console.log('statsSnapshot shape:')
const snap = service.statsSnapshot()
check('statsSnapshot: ok === true', snap.ok === true)
check('statsSnapshot: enabled is boolean', typeof snap.enabled === 'boolean')
check('statsSnapshot: totals is array', Array.isArray(snap.totals))

console.log(failures === 0 ? `\nALL RPC SHADOW GUARD TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
