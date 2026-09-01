// EVO-014 真机取证脚本：create-seed 与 switch-seed 判别（只读 API + 一次空白会话创建）
// 用法：node .governance/tmp-repro-014.mjs
const BASE = 'http://127.0.0.1:3080'
let n = 0
async function call(method, payload) {
  const rpcId = `repro-${Date.now()}-${n++}`
  const res = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: payload ?? {} }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`HTTP ${res.status} non-JSON: ${text.slice(0, 200)}`) }
  return json
}
const okv = (r) => (r?.result?.ok ? r.result.value : null)
const errOf = (r) => (r?.result?.ok ? null : JSON.stringify(r?.result?.error ?? r).slice(0, 300))

const summary = (v) => v ? `${v.current?.provider ?? '?'}/${v.current?.model ?? '?'}` : '(null)'

// 1. workspaces
const wl = await call('workspace.list', {})
const workspaces = okv(wl)?.workspaces ?? okv(wl) ?? []
console.log('workspaces:', JSON.stringify(workspaces).slice(0, 300))
const ws = Array.isArray(workspaces) && workspaces.length > 0 ? workspaces[0] : null
const wsId = ws?.workspaceId ?? ws?.id ?? null
console.log('using workspaceId:', wsId, errOf(wl) ?? '')

// 2. global default readout
const models0 = null

// 3. create blank session under novel-writing (main= cucloud/DeepSeek-V4-Pro)
const created = await call('session.create', { ...(wsId ? { workspaceId: wsId } : {}), agentPreset: 'novel-writing' })
const session = okv(created)?.sessionId ?? okv(created)?.session?.id ?? null
console.log('created session:', session, errOf(created) ?? '')
if (!session) process.exit(1)

// 4. models right after create
const m1 = await call('session.models', { sessionId: session })
const v1 = okv(m1)
console.log('A. create-seed (novel-writing, expect cucloud/DeepSeek-V4-Pro):', summary(v1), errOf(m1) ?? '')

// 5. switch preset to standard (main= deepseek-official/deepseek-v4-flash-vision-exp)
const sw = await call('agentPreset.select', { sessionId: session, agentPreset: 'standard' })
console.log('switch to standard:', JSON.stringify(okv(sw) ?? errOf(sw)).slice(0, 200))

// 6. models after switch
const m2 = await call('session.models', { sessionId: session })
const v2 = okv(m2)
console.log('B. switch-seed (standard, expect deepseek-official/deepseek-v4-flash-vision-exp):', summary(v2), errOf(m2) ?? '')

// 7. switch to governance (main= glm/glm-5.3)
const sw2 = await call('agentPreset.select', { sessionId: session, agentPreset: 'governance' })
console.log('switch to governance:', JSON.stringify(okv(sw2) ?? errOf(sw2)).slice(0, 200))
const m3 = await call('session.models', { sessionId: session })
console.log('C. switch-seed (governance, expect glm/glm-5.3):', summary(okv(m3)), errOf(m3) ?? '')
console.log('DONE. session left blank (GUI hides blank sessions); id =', session)
