#!/usr/bin/env node
/**
 * Bundle doctor — validates this package against the DeepSeek Harness bundle
 * contract, before it ever reaches someone's machine.
 *
 * The rules below mirror the host's `client-modules` activation scan: a
 * package that declares `dsh.client` but exports no `./client` bundle makes
 * DSH abort its whole plugin assembly at startup (the app then fails to boot).
 *
 * Run: `npm run doctor` (or `npm run verify` for syntax + contract).
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const fail = (message, hint) => {
  results.push({ ok: false, message, hint })
}
const pass = (message) => results.push({ ok: true, message })

const readJson = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'))

let pkg
try {
  pkg = readJson('package.json')
  pass('package.json 可解析')
} catch (error) {
  fail('package.json 无法解析', String(error && error.message))
  report()
}

if (typeof pkg.name !== 'string' || pkg.name.length === 0) fail('package.json 缺少 name')
else pass(`包名 ${pkg.name}`)

if (pkg.type !== 'module') fail('package.json 必须声明 "type": "module"', '宿主以 ESM 载入插件入口')
else pass('type: module')

// ---- dsh.bundle -----------------------------------------------------------
const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
if (typeof patch !== 'string') {
  fail('缺少 dsh.bundle.patch', 'bundle patch 让宿主把插件行插进组合')
} else if (!existsSync(join(root, patch))) {
  fail(`dsh.bundle.patch 指向的文件不存在：${patch}`)
} else {
  pass(`bundle patch：${patch}`)
  const yaml = readFileSync(join(root, patch), 'utf8')
  const names = [...yaml.matchAll(/^\s*name:\s*['"]?([^'"\n]+)['"]?\s*$/gm)].map((m) => m[1].trim())
  if (names.length === 0) fail(`${patch} 没有声明插件行 name`)
  else if (!names.includes(pkg.name)) {
    fail(
      `${patch} 的行名与包名不一致（行名 ${names.join(', ')} ≠ 包名 ${pkg.name}）`,
      '宿主按包名解析插件行，名称必须一致',
    )
  } else pass(`patch 行名与包名一致：${pkg.name}`)
}

// ---- dsh.client -----------------------------------------------------------
const client = pkg.dsh && pkg.dsh.client
let declaresClient = false
if (client !== undefined) {
  if (typeof client !== 'object' || client === null) fail('dsh.client 必须是对象')
  else {
    declaresClient = true
    if (typeof client.platform !== 'string') fail('dsh.client.platform 必须是字符串')
    else if (client.platform !== 'web') fail(`dsh.client.platform 目前只支持 "web"（当前 ${client.platform}）`)
    else pass('dsh.client.platform = web')

    if (client.immediately !== undefined && typeof client.immediately !== 'boolean') {
      fail('dsh.client.immediately 必须是布尔值')
    } else pass('dsh.client.immediately 合法')

    for (const field of ['inject', 'external']) {
      const value = client[field]
      if (value === undefined) continue
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
        fail(`dsh.client.${field} 必须是字符串数组`)
      } else pass(`dsh.client.${field} 合法（${value.length} 项）`)
    }
  }
}

// ---- exports["./client"] --------------------------------------------------
// Exactly the rule the host enforces; without it the app aborts at startup.
const exportsField = pkg.exports
let clientRel
if (declaresClient) {
  if (typeof exportsField !== 'object' || exportsField === null) {
    fail(
      '声明了 dsh.client，但 package.json 没有 exports 映射',
      '宿主启动时报错：declares dsh.client but exports no "./client" bundle',
    )
  } else {
    const entry = exportsField['./client']
    if (entry === undefined) {
      fail(
        'exports 缺少 "./client" 子路径',
        '宿主启动时报错：declares dsh.client but exports no "./client" bundle',
      )
    } else if (typeof entry === 'string') {
      clientRel = entry
    } else if (typeof entry === 'object' && entry !== null && typeof entry.default === 'string') {
      clientRel = entry.default
    } else {
      fail('exports["./client"] 必须是字符串，或带字符串 default 的对象')
    }
    if (clientRel !== undefined) {
      if (!existsSync(join(root, clientRel))) fail(`exports["./client"] 指向的文件不存在：${clientRel}`)
      else pass(`exports["./client"] → ${clientRel}`)
    }
  }
}

// ---- package root export --------------------------------------------------
const rootExport = exportsField && exportsField['.']
const rootRel = typeof rootExport === 'string' ? rootExport : rootExport && typeof rootExport === 'object' ? rootExport.default : undefined
if (typeof rootRel !== 'string') fail('exports 缺少 "." 入口', '宿主以包名导入 Host 半侧')
else if (!existsSync(join(root, rootRel))) fail(`exports["."] 指向的文件不存在：${rootRel}`)
else pass(`exports["."] → ${rootRel}`)

// ---- client bundle identity ----------------------------------------------
if (clientRel !== undefined && existsSync(join(root, clientRel))) {
  const source = readFileSync(join(root, clientRel), 'utf8')
  const match = /__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/.exec(source)
  if (match === null) {
    fail(`${clientRel} 里找不到 __ModuleLoader__.load({ id: ... })`)
  } else if (match[1] !== pkg.name) {
    fail(
      `客户端 bundle 的模块 id 与包名不一致（${match[1]} ≠ ${pkg.name}）`,
      '启动图按包名装载客户端模块，id 必须一致',
    )
  } else pass(`客户端模块 id 与包名一致：${pkg.name}`)
}

// ---- runtime files --------------------------------------------------------
const required = ['index.js', 'fold.js', 'client.js', 'pricing.json', 'locale/zh.json', 'locale/en.json', 'icon.svg']
const missing = required.filter((file) => !existsSync(join(root, file)))
if (missing.length > 0) fail(`缺少运行文件：${missing.join(', ')}`)
else pass('运行文件齐全')

report()

function report() {
  const failed = results.filter((item) => !item.ok)
  for (const item of results) {
    if (item.ok) console.log(`  \x1b[32m✓\x1b[0m ${item.message}`)
    else {
      console.log(`  \x1b[31m✗\x1b[0m ${item.message}`)
      if (item.hint) console.log(`    \x1b[2m↳ ${item.hint}\x1b[0m`)
    }
  }
  console.log('')
  if (failed.length > 0) {
    console.error(`bundle doctor：${failed.length} 项不通过 —— 这样发布出去会让宿主启动失败。`)
    process.exit(1)
  }
  console.log('bundle doctor：全部通过，可以发布。')
  process.exit(0)
}
