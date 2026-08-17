/**
 * 客户端 UI 真实渲染测试：在 Node 里用迷你 React 驱动 lib/client.js
 * （浏览器包，window.__ModuleLoader__ 格式）完整渲染「Agent 路由」设置页，
 * 对渲染出的元素树做结构断言——覆盖宿主侧单测够不到的两类回归：
 * - 界面结构错误（如圆点组件里塞文字、按钮行错乱）；
 * - cli 卡片的「测试 → 登录」替换与登录状态指示。
 *
 * 迷你 React 只实现 useState/useEffect/useCallback/useRef + 路径化的
 * 组件实例帧 + 脏标记重渲染循环，足以走完 load()→ready→自动状态探测
 * 的完整状态流（effects 按 deps 语义去重，避免无限循环）。
 * @module dsh-agent-router/tests/client-render
 */

export async function runClientRender(check) {
  const { readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js'), 'utf8')

  // ── 迷你 React 运行时 ──────────────────────────────────────────────────
  const instances = new Map()
  const frameStack = []
  let dirty = false
  let renderErrors = []
  const currentFrame = () => frameStack[frameStack.length - 1]

  function createElement(type, props, ...children) {
    const flat = []
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false || child === true) continue
      flat.push(child)
    }
    const element = { type, props: { ...(props ?? {}) } }
    if (flat.length > 0) element.props.children = flat
    return element
  }

  function arraysEqual(a, b) {
    if (a === b) return true
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let index = 0; index < a.length; index++) {
      if (!Object.is(a[index], b[index])) return false
    }
    return true
  }

  /** 取当前帧的 hook 槽位（首次访问时初始化为空对象）。 */
  const hookSlot = (index) => {
    const inst = currentFrame()
    let value = inst.hooks[index]
    if (!value) value = inst.hooks[index] = {}
    return value
  }

  function useState(initial) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    if (!slot.has) {
      slot.has = true
      slot.value = typeof initial === 'function' ? initial() : initial
    }
    const setter = (value) => {
      const next = typeof value === 'function' ? value(slot.value) : value
      if (Object.is(next, slot.value)) return
      slot.value = next
      dirty = true
    }
    return [slot.value, setter]
  }

  function useEffect(fn, deps) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    slot.fn = fn
    inst.effects.push(slot)
    if (slot.deps === undefined || !arraysEqual(slot.deps, deps)) {
      slot.deps = deps
      slot.pending = true
    } else {
      slot.pending = false
    }
  }

  function useCallback(fn, deps) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    if (slot.has && arraysEqual(slot.deps, deps)) return slot.value
    slot.has = true
    slot.deps = deps
    slot.value = fn
    return fn
  }

  function useRef(value) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    if (!slot.has) {
      slot.has = true
      slot.value = { current: value }
    }
    return slot.value
  }

  const react = { createElement, useState, useEffect, useCallback, useRef }

  function callComponent(type, props, pathKey) {
    let inst = instances.get(pathKey)
    if (!inst) {
      inst = { hooks: [], hookIndex: 0, effects: [] }
      instances.set(pathKey, inst)
    }
    inst.hookIndex = 0
    inst.effects = []
    frameStack.push(inst)
    let result
    try {
      result = type(props)
    } catch (error) {
      renderErrors.push(error)
      result = null
    }
    frameStack.pop()
    for (const slot of inst.effects) {
      if (!slot.pending) continue
      try {
        slot.fn()
      } catch (error) {
        renderErrors.push(error)
      }
    }
    return result
  }

  function walk(node, pathKey) {
    if (node === null || node === undefined) return null
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map((child, index) => walk(child, `${pathKey}.${index}`)).filter((value) => value !== null)
    if (typeof node.type === 'function') return walk(callComponent(node.type, node.props, pathKey), pathKey)
    const children = node.props.children === undefined ? [] : Array.isArray(node.props.children) ? node.props.children : [node.props.children]
    return {
      type: node.type,
      props: node.props,
      children: children.map((child, index) => walk(child, `${pathKey}.${index}`)).filter((value) => value !== null),
    }
  }

  let rootElement = null
  let currentTree = null
  let walkPrefix = 'root'
  async function settle(maxTurns = 40) {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (dirty) {
        dirty = false
        renderErrors = []
        currentTree = walk(rootElement, walkPrefix)
      }
      await new Promise((resolve) => setImmediate(resolve))
      if (!dirty) {
        await new Promise((resolve) => setImmediate(resolve))
        if (!dirty) return currentTree
      }
    }
    return currentTree
  }
  /** 换一棵组件树渲染（独立实例路径，避免与设置页共享 hook 槽位）。 */
  async function renderInto(element, prefix, maxTurns = 40) {
    rootElement = element
    walkPrefix = prefix
    dirty = true
    return settle(maxTurns)
  }

  // ── 装配：评估浏览器包 → mock ctx → apply → 渲染 ─────────────────────
  const captured = { registrations: [], listeners: [] }
  const fakeWindow = {
    __ModuleLoader__: { load: (payload) => { captured.bundle = payload } },
    location: { search: '', pathname: '/' },
    history: { replaceState: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
    // 登录轮询依赖 setTimeout 真正回调（忽略延迟立即排队），否则轮询挂死。
    setTimeout: (fn) => { setImmediate(fn); return 0 },
    clearTimeout: () => {},
    confirm: () => true,
    open: () => {},
  }
  new Function('window', source)(fakeWindow)
  check('client bundle evaluates', !!captured.bundle && captured.bundle.id === 'dsh-agent-router' && typeof captured.bundle.factory === 'function')
  const bundleExports = captured.bundle.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  check('client exports apply/inject', typeof bundleExports.apply === 'function' && Array.isArray(bundleExports.inject))

  // cli 登录状态可切换：'ok' = 已登录；'logged-out' = 未登录（Not logged in）。
  // 登录轮询、刷新状态与未登录红色提示的回归断言共用。
  let cliStatusMode = 'ok'
  // 目录形态可切换：'withVision' = 有视觉 agent；'drawOnly' = 仅生图 agent
  // （composer 图片按钮/发送条必须隐藏——生图 agent 不消费附件图片）。
  let catalogMode = 'withVision'
  const remoteMock = {
    catalog: async () => ({
      ok: true,
      value: {
        ok: true, enabled: true, defaults: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
        agents: catalogMode === 'drawOnly'
          ? [
            { id: 'draw', name: '画图', type: 'image', enabled: true, description: 'd', capabilities: ['image'], provider: 'openai', model: 'dall-e-3', account: '', effectiveProvider: 'openai', effectiveModel: 'dall-e-3', source: 'agent' },
          ]
          : [
            { id: 'codex', name: 'Codex 助手', type: 'cli', enabled: true, description: 'd', capabilities: ['image'], provider: '', model: '', account: '', cliAgent: 'codexentry', effectiveProvider: 'cli:codexentry', effectiveModel: '', source: 'agent' },
            { id: 'vision', name: '视觉', type: 'chat', enabled: true, description: 'd', capabilities: ['image'], provider: '', model: '', account: '', effectiveProvider: 'deepseek-official', effectiveModel: 'deepseek-v4-pro', source: 'main' },
          ],
        oauthAccounts: [], pools: [], cliAgents: [
          { id: 'codexentry', name: 'Codex 子代理', enabled: true, command: 'codex', args: '', timeoutMs: 0, maxConcurrent: 1 },
        ],
      },
    }),
    config: async () => ({ ok: true, value: { ok: true, enabled: true, revision: 1, writable: true, value: {
      enabled: true,
      agents: {
        codex: { name: 'Codex 助手', type: 'cli', enabled: true, description: 'd', capabilities: ['image'], command: '', args: '', timeoutMs: 0, maxConcurrent: 1, cliAgent: 'codexentry' },
        vision: { name: '视觉', type: 'chat', enabled: true, description: 'd', capabilities: ['image'], provider: '', model: '', maxRounds: 1 },
      },
      oauthAccounts: {},
      pools: {},
      cliAgents: {
        codexentry: { name: 'Codex 子代理', enabled: true, command: 'codex', args: '', timeoutMs: 0, maxConcurrent: 1, loginArgs: '', statusArgs: '', modelsArgs: '' },
      },
    }, user: null } }),
    stats: async () => ({ ok: true, value: { ok: true, enabled: true, totals: [], recent: [], series: [], accountTotals: [], accountSeries: [] } }),
    save: async () => ({ ok: true, value: { ok: true, revision: 1 } }),
    reset: async () => ({ ok: true, value: { ok: true } }),
    test: async () => ({ ok: true, value: { ok: true, message: 'ok' } }),
    cliStatus: async () => cliStatusMode === 'logged-out'
      ? { ok: true, value: { ok: true, loggedIn: false, message: 'Not logged in' } }
      : { ok: true, value: { ok: true, loggedIn: true, message: '已登录' } },
    cliLogin: async () => ({ ok: true, value: { ok: true, message: '已在终端窗口启动' } }),
    cliModels: async () => ({ ok: true, value: { ok: true, message: '2 个模型', models: ['m1', 'm2'], source: 'cli' } }),
    imageData: async (request) => {
      captured.imageDataCalls.push(request)
      return { ok: true, value: { ok: true, message: 'ok', mediaType: 'image/png', data: 'aGk=', width: 2, height: 2 } }
    },
  }
  // 账号添加/编辑回归用记录：端点探测请求、llm-pi-ai 写入、凭据写入。
  // discoverMode 切 'fail' 模拟端点不可达（负向见证）。
  const discoverCalls = []
  const mutateCalls = []
  const credSetCalls = []
  let discoverMode = 'ok'
  // 模型接管面：会话当前选中 + 切换调用记录（视觉开→切包装组，关→切回）。
  let sessionCurrent = { provider: 'openai', model: 'gpt-4o' }
  const sessionSelectCalls = []
  const apiMock = {
    sessions: {
      models: async () => ({ result: { ok: true, value: { current: { ...sessionCurrent }, routable: true, groups: [], failures: [] } } }),
      selectModel: async (payload) => {
        sessionSelectCalls.push({ ...payload })
        sessionCurrent = { provider: payload.provider, model: payload.model }
        return { result: { ok: true, value: { selected: { provider: payload.provider, model: payload.model } } } }
      },
    },
    llm: {
      providers: async () => ({ result: { ok: true, value: { providers: [
        { provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: false, declared: false },
        { provider: 'gateway', displayName: 'Gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'gateway'], active: true, declared: true },
      ] } } }),
      models: async () => ({ result: { ok: true, value: { groups: [{ id: 'gateway', models: [{ id: 'old-m', name: 'Old M' }] }], failures: [] } } }),
      discoverModels: async (request) => {
        discoverCalls.push(request)
        if (discoverMode === 'fail') return { result: { ok: false, error: { message: 'could not reach https://gateway.example/v1/models' } } }
        return { result: { ok: true, value: { models: [{ id: 'm-a' }, { id: 'm-b', name: 'Model B', contextWindow: 65536, maxTokens: 4096 }] } } }
      },
    },
    settings: {
      describe: async () => ({ result: { ok: true, value: { namespaces: [{ ns: 'llm-pi-ai', value: { providers: { gateway: { api: 'openai-completions', baseURL: 'https://gateway.example/v1', models: [{ id: 'old-m', name: 'Old M' }] } } } }] } } }),
      mutate: async (payload) => {
        mutateCalls.push(payload)
        return { result: { ok: true } }
      },
    },
    credentials: {
      describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
      set: async (payload) => { credSetCalls.push(payload); return { result: { ok: true } } },
      unset: async () => ({ result: { ok: true } }),
    },
  }
  const zh = {}
  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    locale: {
      register: (_ns, tables) => { Object.assign(zh, tables.zh) },
      bind: () => (key) => zh[key] ?? key,
    },
    get: (key) => (key === 'connection' ? { api: apiMock } : key === 'remote.router' ? remoteMock : undefined),
    remote: { $mount: (contribution) => { captured.mount = contribution; return Promise.resolve() }, $on: (event, listener) => { captured.listeners.push({ event, listener }); return () => {} } },
    slots: {
      inject: (_slot, register) => { captured.registrations.push(register()); return () => {} },
      register: (descriptor, renderFn) => ({ ...descriptor, render: renderFn }),
    },
  }
  bundleExports.apply(ctx)
  const registrationOf = (name) => captured.registrations.find((reg) => reg && reg.name === name)
  const settingsReg = registrationOf('settings.section')
  check('settings section registered', !!settingsReg && typeof settingsReg.render === 'function')
  check('composer image slots registered', !!registrationOf('conversation.input.right') && !!registrationOf('tool.call.toolview'))
  check('toolview keyed to route_agent', registrationOf('tool.call.toolview') && registrationOf('tool.call.toolview').key === 'route_agent')
  // 浏览器侧 Remote 契约必须与宿主 rpc.js 同步包含 cli 三方法与 imageData（曾漏加导致按钮全失效）。
  check('client remotes include cli methods', !!captured.mount && ['cliStatus', 'cliLogin', 'cliModels'].every((method) => (captured.mount.descriptors ?? []).some((descriptor) => descriptor.method === method)))
  check('client remotes include image methods', !!captured.mount && (captured.mount.descriptors ?? []).some((descriptor) => descriptor.method === 'imageData'))
  rootElement = settingsReg.render({ api: apiMock, remote: () => remoteMock, remoteReady: Promise.resolve(), t: (key) => zh[key] ?? key, $on: () => () => {} })
  dirty = true
  currentTree = await settle()

  // ── 工具函数 ──────────────────────────────────────────────────────────
  const textOf = (node) => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join(' ')
    return (node.children ?? []).map(textOf).join(' ')
  }
  const findAll = (node, predicate, out = []) => {
    if (node === null || node === undefined) return out
    if (Array.isArray(node)) { for (const child of node) findAll(child, predicate, out); return out }
    if (predicate(node)) out.push(node)
    for (const child of node.children ?? []) findAll(child, predicate, out)
    return out
  }
  const hasClass = (node, token) => node && node.type && typeof node.props?.className === 'string' && node.props.className.includes(token)
  const buttonsOf = (tree) => findAll(tree, (node) => node && node.type === 'button')

  // ── 断言：渲染无异常 + 折叠摘要 ──────────────────────────────────────
  if (renderErrors.length > 0) {
    try {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'render-errors.txt'), renderErrors.map((error) => (error && error.stack ? error.stack : String(error))).join('\n---\n'))
    } catch { /* 调试输出失败忽略 */ }
  }
  check('client renders without errors', renderErrors.length === 0)
  check('client shows ready page', textOf(currentTree).includes(zh.agentsTitle))
  const heads = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-card-head'))
  check('agent cards rendered', heads.length >= 2)

  // ── 断言：cli 卡片展开 → 登录按钮替换测试按钮 + 状态指示 ─────────────
  const codexHead = heads.find((node) => textOf(node).includes('codex'))
  check('cli card head found', !!codexHead)
  if (codexHead) {
    codexHead.props.onClick()
    currentTree = await settle()
    const allButtons = buttonsOf(currentTree)
    const labels = allButtons.map(textOf)
    // 已登录状态显示「重新登录」，未登录显示「登录（打开终端窗口）」——
    // 两者都是登录语义；关键断言：cli 卡内不存在「测试」按钮。
    check('cli card login button replaces test', (labels.includes(zh.cliLogin) || labels.includes(zh.cliRelogin)) && !labels.includes(zh.test))
    check('cli card shows logged-in chip', textOf(currentTree).includes(zh.cliStatusLoggedIn))
    // 子代理是账号区条目：agent 卡片用「子代理」下拉选择，选项来自 cliAgents 目录。
    const selects = findAll(currentTree, (node) => node && node.type === 'select')
    check('cli card subagent select lists entries', selects.some((selectNode) => textOf(selectNode).includes('Codex 子代理') && textOf(selectNode).includes('codexentry')) && textOf(currentTree).includes(zh.fieldCliAgent))
    // 圆点组件绝不承载文字（此前 UI 错乱的根因）。
    const dots = findAll(currentTree, (node) => hasClass(node, 'dshrouter-dot'))
    check('status dots carry no text', dots.length > 0 && dots.every((dot) => (dot.children ?? []).every((child) => typeof child !== 'string')))
  }

  // ── 断言：chat 卡片展开 → 仍是「测试」按钮（其余类型不受影响）────────
  const visionHead = heads.find((node) => textOf(node).includes('vision'))
  check('chat card head found', !!visionHead)
  if (visionHead) {
    visionHead.props.onClick()
    currentTree = await settle()
    const labels = buttonsOf(currentTree).map(textOf)
    check('chat card keeps test button', labels.includes(zh.test))
  }

  // ── 断言：添加卡片模板是能力起点，不含 CLI 类别 ──────────────────────
  const addCards = findAll(currentTree, (node) => hasClass(node, 'dshrouter-add'))
  if (addCards.length > 0) {
    addCards[0].props.onClick()
    currentTree = await settle()
    const chipLabels = buttonsOf(currentTree).map(textOf)
    check('templates are capabilities, not cli categories', chipLabels.some((label) => label.includes(zh.presetVision)) && !chipLabels.some((label) => label.includes('Codex CLI 子代理') || label.includes('Claude Code 子代理') || label.includes('Gemini CLI 子代理')))
  }

  // ── 断言：子代理条目归入多模态账号区（可展开，含登录维护入口）────────
  const accountsHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.accountTitle))
  check('accounts category head found', !!accountsHead)
  if (accountsHead) {
    accountsHead.props.onClick()
    currentTree = await settle()
    check('subagents live under accounts', textOf(currentTree).includes(zh.cliTitle) && textOf(currentTree).includes('codexentry'))
    // OAuth/账号池收进「高级扩展」折叠卡片：默认不可见。
    check('oauth tucked into advanced section', !textOf(currentTree).includes(zh.oauthTitle))
    const cliCardHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-card-head')).find((node) => textOf(node).includes('codexentry'))
    check('subagent card rendered under accounts', !!cliCardHead)
    if (cliCardHead) {
      cliCardHead.props.onClick()
      currentTree = await settle()
      const labels = buttonsOf(currentTree).map(textOf)
      check('subagent card keeps login & fetch-models buttons', (labels.includes(zh.cliLogin) || labels.includes(zh.cliRelogin)) && labels.includes(zh.cliFetchModels))
    }
    const advancedHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.advancedSection))
    check('advanced section card present', !!advancedHead)
    if (advancedHead) {
      advancedHead.props.onClick()
      currentTree = await settle()
      check('advanced section reveals oauth & pools', textOf(currentTree).includes(zh.oauthTitle) && textOf(currentTree).includes(zh.poolIntro))
    }
  }

  // ── 断言：添加账号（＋ 自定义）模型留空时自动从端点拉取并随配置写入 ──
  // 负向见证：旧行为直接写无 models 的 profile → 宿主 llm-pi-ai 校验器
  // 报 "resolves no models" 拒绝写入；新行为必须先探测端点（与 cc-switch
  // 同款 GET /models），拉到才写入，拉不到中止并给出指引。
  const accountAddCard = findAll(currentTree, (node) => hasClass(node, 'dshrouter-add')).find((node) => textOf(node).includes(zh.addAccount))
  check('account add card found', !!accountAddCard)
  if (accountAddCard) {
    accountAddCard.props.onClick()
    currentTree = await settle()
    const customChip = buttonsOf(currentTree).find((node) => textOf(node).includes(zh.accountCustom))
    check('account add custom chip found', !!customChip)
    if (customChip) {
      customChip.props.onClick()
      currentTree = await settle()
      const inputByLabel = (label) => findAll(currentTree, (node) => node && node.type === 'input' && node.props && node.props['aria-label'] === label)[0]
      const fillAdd = (provider, baseUrl, key, models) => {
        const providerInput = inputByLabel(zh.fieldProviderId)
        if (providerInput) providerInput.props.onChange({ target: { value: provider } })
        const keyInput = inputByLabel(zh.accountKey)
        if (keyInput) keyInput.props.onChange({ target: { value: key } })
        const urlInput = inputByLabel(zh.accountBaseUrl)
        if (urlInput) urlInput.props.onChange({ target: { value: baseUrl } })
        const modelsInput = inputByLabel(zh.accountModelsField)
        if (modelsInput) modelsInput.props.onChange({ target: { value: models } })
      }
      const submitAdd = async () => {
        currentTree = await settle()
        const addButton = buttonsOf(currentTree).find((node) => textOf(node) === zh.accountAddProvider)
        if (addButton) addButton.props.onClick()
        currentTree = await settle()
        return addButton
      }
      // 场景 1：模型留空 + 端点可达 → 保存时自动拉取并写入发现的模型。
      fillAdd('crazy-code', 'https://gateway.example/v1', 'sk-test', '')
      const ready1 = await submitAdd()
      check('account add submit ready', !!ready1)
      check('custom add probes endpoint once', discoverCalls.length === 1 && discoverCalls[0].settingsNs === 'llm-pi-ai' && discoverCalls[0].provider === 'crazy-code' && discoverCalls[0].baseURL === 'https://gateway.example/v1' && discoverCalls[0].api === 'openai-completions' && discoverCalls[0].apiKey === 'sk-test')
      const crazyWrite = mutateCalls.find((call) => call.ns === 'llm-pi-ai' && Array.isArray(call.ops) && call.ops[0] && call.ops[0].path[1] === 'crazy-code')
      check('custom add writes discovered models', !!crazyWrite && Array.isArray(crazyWrite.ops[0].value.models) && crazyWrite.ops[0].value.models.length === 2 && crazyWrite.ops[0].value.models[0].id === 'm-a' && crazyWrite.ops[0].value.models[1].id === 'm-b' && crazyWrite.ops[0].value.models[1].name === 'Model B' && crazyWrite.ops[0].value.models[1].contextWindow === 65536 && crazyWrite.ops[0].value.models[1].maxTokens === 4096 && crazyWrite.ops[0].value.apiKeyEnv === 'CRAZY_CODE_API_KEY' && crazyWrite.ops[0].value.defaultInput.join(',') === 'text,image' && crazyWrite.ops[0].value.api === 'openai-completions' && crazyWrite.ops[0].value.baseURL === 'https://gateway.example/v1')
      check('custom add stores credential', credSetCalls.some((call) => call.ref === 'CRAZY_CODE_API_KEY' && call.value === 'sk-test'))

      // 场景 2：手工填写模型 → 原样写入，不探测端点（保持旧行为）。
      fillAdd('manual-gw', 'https://manual.example/v1', '', 'gpt-x, gpt-y')
      const ready2 = await submitAdd()
      check('manual add submit ready', !!ready2)
      const manualWrite = mutateCalls.find((call) => call.ns === 'llm-pi-ai' && Array.isArray(call.ops) && call.ops[0] && call.ops[0].path[1] === 'manual-gw')
      check('manual models skip probe', discoverCalls.length === 1)
      check('manual models written verbatim', !!manualWrite && Array.isArray(manualWrite.ops[0].value.models) && manualWrite.ops[0].value.models.length === 2 && manualWrite.ops[0].value.models[0].id === 'gpt-x' && manualWrite.ops[0].value.models[1].id === 'gpt-y' && !('apiKeyEnv' in manualWrite.ops[0].value))

      // 场景 3：同名内置服务商（目录路由）模型留空 → 不探测、不写 models
      // （按目录默认模型服务），保持旧行为。
      fillAdd('openai', 'https://api.openai.com/v1', 'sk-o', '')
      const ready3 = await submitAdd()
      check('catalog overwrite submit ready', !!ready3)
      const openaiWrite = mutateCalls.find((call) => call.ns === 'llm-pi-ai' && Array.isArray(call.ops) && call.ops[0] && call.ops[0].path[1] === 'openai')
      check('catalog route overwrite skips probe', discoverCalls.length === 1)
      check('catalog route overwrite omits models', !!openaiWrite && !('models' in openaiWrite.ops[0].value) && openaiWrite.ops[0].value.apiKeyEnv === 'OPENAI_API_KEY')

      // 场景 4：端点不可达 → 中止写入并给出明确指引（绝不写半成品配置）。
      const beforeFailWrites = mutateCalls.length
      discoverMode = 'fail'
      fillAdd('broken-gw', 'https://broken.example/v1', '', '')
      const ready4 = await submitAdd()
      check('failed add submit ready', !!ready4)
      check('failed discovery aborts write', mutateCalls.length === beforeFailWrites && discoverCalls.length === 2)
      check('failed discovery shows guidance', textOf(currentTree).includes(zh.accountDiscoverFailed) && textOf(currentTree).includes(zh.accountModelsRequiredHint))
      discoverMode = 'ok'
    }
  }

  // ── 断言：账号卡片编辑——自定义路由清空模型时自动拉取并原子写入；
  //  拉取失败时保留现有模型（绝不写坏已生效的配置）────────────────────
  const gatewayHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-card-head')).find((node) => textOf(node).includes('gateway'))
  check('declared account card head found', !!gatewayHead)
  if (gatewayHead) {
    gatewayHead.props.onClick()
    currentTree = await settle()
    // 按头部按钮定位账号卡片：其他卡片展开后的内容（如 agent 卡片的服务商
    // datalist 选项 "Gateway (gateway)"）同样含该字样，必须锚定在头部。
    const gatewayCard = () => findAll(currentTree, (node) => node && node.type === 'div' && hasClass(node, 'dshrouter-card')).find((node) => {
      const head = (node.children ?? []).find((child) => child && child.type === 'button' && hasClass(child, 'dshrouter-card-head'))
      return !!head && textOf(head).includes('gateway')
    })
    // 账号卡片的模型输入框没有 aria-label（仅添加表单有）：在卡片子树内按
    // 值定位（profile 里既有模型渲染为 'old-m'）。
    const gatewayModelsInput = () => {
      const card = gatewayCard()
      return card ? findAll(card, (node) => node && node.type === 'input').find((node) => node.props && node.props.value === 'old-m') : null
    }
    const gatewaySave = () => {
      const card = gatewayCard()
      return card ? findAll(card, (node) => node && node.type === 'button').find((node) => textOf(node) === zh.save) : null
    }
    const gatewayInput = gatewayModelsInput()
    check('declared account models field shown', !!gatewayInput)
    if (gatewayInput) {
      // 清空模型字段后保存：自动拉取 → 模型与 Base URL 合并进同一次原子写入。
      gatewayInput.props.onChange({ target: { value: '' } })
      currentTree = await settle()
      const beforeEditWrites = mutateCalls.length
      const saveButton = gatewaySave()
      check('declared account save button found', !!saveButton)
      if (saveButton) {
        saveButton.props.onClick()
        currentTree = await settle()
        const lastDiscover = discoverCalls[discoverCalls.length - 1]
        check('edit probes endpoint for declared route', lastDiscover && lastDiscover.provider === 'gateway' && lastDiscover.baseURL === 'https://gateway.example/v1' && lastDiscover.api === 'openai-completions' && !('apiKey' in lastDiscover))
        const gatewayEditWrite = mutateCalls.slice(beforeEditWrites).find((call) => call.ns === 'llm-pi-ai')
        const modelsOp = gatewayEditWrite ? gatewayEditWrite.ops.find((op) => op.path[2] === 'models') : null
        check('edit writes discovered models atomically', !!gatewayEditWrite && gatewayEditWrite.ops.length >= 4 && !!modelsOp && modelsOp.op === 'set' && Array.isArray(modelsOp.value) && modelsOp.value.length === 2 && modelsOp.value[0].id === 'm-a' && modelsOp.value[1].id === 'm-b' && gatewayEditWrite.ops.some((op) => op.path[2] === 'baseURL' && op.value === 'https://gateway.example/v1'))
        check('edit notice reports discovery', textOf(currentTree).includes(zh.accountDiscovered(2)))

        // 负向见证：拉取失败时保留现有模型列表——本次写入不含 models 操作。
        discoverMode = 'fail'
        const beforeFailEdit = mutateCalls.length
        const inputAgain = gatewayModelsInput()
        if (inputAgain) inputAgain.props.onChange({ target: { value: '' } })
        currentTree = await settle()
        const saveAgain = gatewaySave()
        if (saveAgain) saveAgain.props.onClick()
        currentTree = await settle()
        const failEditWrite = mutateCalls.slice(beforeFailEdit).find((call) => call.ns === 'llm-pi-ai')
        check('failed edit keeps models', !!failEditWrite && !failEditWrite.ops.some((op) => op.path[2] === 'models') && failEditWrite.ops.some((op) => op.path[2] === 'baseURL'))
        check('failed edit notice kept models', textOf(currentTree).includes(zh.accountModelsKept) && textOf(currentTree).includes(zh.accountDiscoverFailed))
        discoverMode = 'ok'
      }
    }
  }

  // ── 断言：cli 子代理登录体验——未登录红色醒目提示 + 登录轮询状态机 ──
  // 负向见证：宿主 cliLogin 曾引用未定义的 agent（ReferenceError），登录
  // 按钮永远报失败、只有「刷新状态」能显示已登录；轮询成功后 loginBusy
  // 不复位、按钮永久卡「等待登录…」。以下断言覆盖：未登录红字、登录后
  // 轮询自动刷新为已登录且按钮复位、轮询耗尽给出红色超时提示且按钮复位。
  const subCard = () => findAll(currentTree, (node) => node && node.type === 'div' && hasClass(node, 'dshrouter-card')).find((node) => {
    const head = (node.children ?? []).find((child) => child && child.type === 'button' && hasClass(child, 'dshrouter-card-head'))
    return !!head && textOf(head).includes('codexentry')
  })
  const subButtons = () => {
    const card = subCard()
    return card ? findAll(card, (node) => node && node.type === 'button') : []
  }
  const subCardFound = !!subCard()
  check('subagent card found for login flow', subCardFound)
  if (subCardFound) {
    // 场景 1：未登录 → 刷新状态后 chip 与状态消息均为红色醒目样式。
    cliStatusMode = 'logged-out'
    const refreshButton = subButtons().find((node) => textOf(node) === zh.cliStatusRefresh)
    check('subagent refresh status button found', !!refreshButton)
    if (refreshButton) {
      refreshButton.props.onClick()
      currentTree = await settle()
      const card = subCard()
      const redChips = card ? findAll(card, (node) => node && node.type === 'span' && hasClass(node, 'dshrouter-error') && textOf(node).includes(zh.cliStatusLoggedOut)) : []
      check('logged-out chip rendered red', redChips.length > 0)
      const redMessages = card ? findAll(card, (node) => node && node.type === 'p' && hasClass(node, 'dshrouter-error') && textOf(node).includes('Not logged in')) : []
      check('logged-out status message rendered red', redMessages.length > 0)

      // 场景 2：点击登录 → 轮询立即成功 → chip 已登录 + 按钮复位为「重新登录」。
      cliStatusMode = 'ok'
      const loginButton = subButtons().find((node) => textOf(node) === zh.cliLogin)
      check('subagent login button found', !!loginButton)
      if (loginButton) {
        loginButton.props.onClick()
        currentTree = await settle(120)
        const after = subCard()
        const afterButtons = after ? findAll(after, (node) => node && node.type === 'button') : []
        check('login poll flips chip to logged in', !!after && textOf(after).includes(zh.cliStatusLoggedIn) && textOf(after).includes('已登录：已登录'))
        check('login button resets after success', afterButtons.some((node) => textOf(node) === zh.cliRelogin) && !afterButtons.some((node) => textOf(node) === zh.cliLoginWaiting))

        // 场景 3：轮询耗尽（20 次都未登录）→ 红色超时提示 + 按钮复位为「登录」。
        cliStatusMode = 'logged-out'
        const reloginButton = afterButtons.find((node) => textOf(node) === zh.cliRelogin)
        check('subagent relogin button found', !!reloginButton)
        if (reloginButton) {
          reloginButton.props.onClick()
          currentTree = await settle(200)
          const timedOut = subCard()
          const timedOutButtons = timedOut ? findAll(timedOut, (node) => node && node.type === 'button') : []
          const timeoutNotice = timedOut ? findAll(timedOut, (node) => node && node.type === 'p' && hasClass(node, 'dshrouter-error') && textOf(node).includes(zh.cliLoginTimeoutHint)) : []
          check('login poll timeout shows red hint', timeoutNotice.length > 0)
          check('timeout flips chip back to logged out', !!timedOut && textOf(timedOut).includes(zh.cliStatusLoggedOut))
          check('login button resets after timeout', timedOutButtons.some((node) => textOf(node) === zh.cliLogin) && !timedOutButtons.some((node) => textOf(node) === zh.cliLoginWaiting))
        }
      }
    }
    cliStatusMode = 'ok'
  }

  // ── 断言：对话框图片通路（composer 附件按钮 / route_agent 工具卡片）──
  // 负向见证：旧版本无附件按钮（宿主准入直接拒绝图片），route_agent 生成
  // 图片以真实图片块写入工具结果（文本模型历史被击穿）。
  const tOf = (key) => zh[key] ?? key
  const imageToolReg = registrationOf('conversation.input.right')
  const toolCardReg = registrationOf('tool.call.toolview')
  const conversationMock = {
    createDraftImages: (files) => files.map((file, index) => ({ id: `draft-${index}-${file.name}`, previewUrl: 'blob:preview', file })),
  }
  const inputActionsMock = { addImages: () => true }
  captured.imageDataCalls = []

  // 附件按钮：多模态开启（有视觉 agent）时渲染；仅有生图 agent 时隐藏——与接管同信号。
  {
    const tree = await renderInto(imageToolReg.render({ t: tOf, router: () => remoteMock, conversation: () => conversationMock, inputActions: inputActionsMock }), 'imagetool')
    const attachButton = findAll(tree, (node) => node && node.type === 'button' && node.props && node.props['aria-label'] === tOf('attach'))
    check('composer attach button renders with vision agent', attachButton.length === 1)
    catalogMode = 'drawOnly'
    const listener = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
    if (listener) listener.listener()
    const hidden = await renderInto(imageToolReg.render({ t: tOf, router: () => remoteMock, conversation: () => conversationMock, inputActions: inputActionsMock }), 'imagetool')
    const attachHidden = findAll(hidden, (node) => node && node.type === 'button' && node.props && node.props['aria-label'] === tOf('attach'))
    check('composer attach button hidden without vision agent', attachHidden.length === 0)
    catalogMode = 'withVision'
    listener && listener.listener()
  }

  // 模型接管（无 UI 条目）：视觉开启 → 自动切包装组；已接管幂等；关闭 → 切回原 provider。
  {
    const takeoverReg = captured.registrations.find((reg) => reg && reg.id === 'router-model-takeover')
    check('model takeover entry registered', !!takeoverReg)
    if (takeoverReg) {
      const listener = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
      // 开启接管：纯文本当前选中 → 自动切到包装组。
      sessionCurrent = { provider: 'openai', model: 'gpt-4o' }
      sessionSelectCalls.length = 0
      await renderInto(takeoverReg.render({ sessionId: 'sess-1', input: { imageIds: [] }, api: apiMock }), 'takeover')
      check('takeover switches to wrap route', sessionSelectCalls.some((call) => call.provider === 'openai-router' && call.model === 'gpt-4o'))
      // 已接管：草稿变化（如贴图）重渲染不重复切（幂等，零竞态）。
      const before = sessionSelectCalls.length
      await renderInto(takeoverReg.render({ sessionId: 'sess-1', input: { imageIds: ['draft-1'] }, api: apiMock }), 'takeover')
      check('takeover idempotent when already wrapped', sessionSelectCalls.length === before)
      // 关闭视觉：包装组当前选中 → 切回原 provider。
      sessionCurrent = { provider: 'openai-router', model: 'gpt-4o' }
      sessionSelectCalls.length = 0
      catalogMode = 'drawOnly'
      listener && listener.listener()
      await new Promise((resolve) => setImmediate(resolve))
      await renderInto(takeoverReg.render({ sessionId: 'sess-1', input: { imageIds: [] }, api: apiMock }), 'takeover')
      check('takeover restores original provider on disable', sessionSelectCalls.some((call) => call.provider === 'openai' && call.model === 'gpt-4o'))
      catalogMode = 'withVision'
      listener && listener.listener()
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  // route_agent 工具卡片：解析标记渲染缩略图；兼容旧会话真实图片块；运行态显示处理中。
  {
    const settledBlock = {
      kind: 'tool-result',
      seq: 1,
      time: 1,
      callId: 'c1',
      call: { name: 'route_agent', argsRaw: '{"agent":"draw"}' },
      callTime: 1,
      content: [
        { type: 'text', text: '已生成图片（1024x1024）\n[router:image:{"attachmentId":"sha256:tv","mediaType":"image/png","bytes":4,"width":2,"height":2,"name":"router-draw.png"}]' },
        { type: 'text', text: '[openai/dall-e-3 · 输入 0 / 输出 0 tokens]' },
        { type: 'image', attachment: { attachmentId: 'sha256:old', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } },
      ],
      isError: false,
      subCalls: [],
    }
    const tree = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: settledBlock }), 'toolcard')
    const imgs = findAll(tree, (node) => node && node.type === 'img')
    check('tool card renders marker images', imgs.length === 2 && imgs.some((img) => img.props && img.props.src === 'data:image/png;base64,aGk='))
    check('tool card hides marker text', !textOf(tree).includes('[router:image:') && textOf(tree).includes('已生成图片'))
    check('tool card loads legacy image blocks', captured.imageDataCalls.some((call) => call.ref && call.ref.attachmentId === 'sha256:old') && captured.imageDataCalls.some((call) => call.ref && call.ref.attachmentId === 'sha256:tv'))
    const runningBlock = { callId: 'c2', name: 'route_agent', argsRaw: '{}', turn: 1, step: 1, time: 1, callView: null, subCalls: [] }
    const running = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: runningBlock }), 'toolcard-running')
    check('tool card running state', textOf(running).includes(tOf('toolRunning')))
    // 错误结果：展示错误文案，不渲染图片。
    const failedBlock = { ...settledBlock, isError: true, error: { name: 'Error', code: 'X' } }
    const failed = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: failedBlock }), 'toolcard-failed')
    check('tool card error state', textOf(failed).includes(tOf('statsFail')))
  }
}
