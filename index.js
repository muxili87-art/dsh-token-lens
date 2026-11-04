/**
 * Host half of the usage dashboard.
 *
 * Folds the durable Session logs (`ctx.sessionQuery`) into per-day usage
 * buckets and serves them as one authenticated JSON route that the browser
 * panel reads. Persisted sessions are cached on disk by log size; live
 * sessions are folded incrementally from their in-memory events.
 */
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DAY, createEntry, foldEvents, normalizePricing, queryRequests, summarize } from './fold.js'

export const name = 'usage-dashboard'
export const inject = ['webServer', 'connection', 'sessionQuery', 'sessions']

const ROUTE_PATH = '/usage-dashboard/summary'
const REQUESTS_PATH = '/usage-dashboard/requests'
const CACHE_VERSION = 3
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const CACHE_PATH = join(DSH_HOME, 'usage-dashboard', 'cache.v1.json')
const SETTLE_MS = 2200
const REPEAT_WINDOW_MS = 300_000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function errorText(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

export function apply(ctx) {
  const controller = new AbortController()
  const sessions = new Map()
  const state = {
    tz: null,
    cacheLoaded: false,
    scanDone: false,
    scanned: 0,
    total: 0,
    error: null,
    errors: [],
    coverage: { sessions: 0, live: 0, cached: 0, errors: 0 },
    lastScanAt: 0,
    writing: false,
  }
  let scanPromise = null
  let pricingPromise = null

  function pricing() {
    if (pricingPromise === null) {
      pricingPromise = readFile(join(PLUGIN_DIR, 'pricing.json'), 'utf8')
        .then((text) => normalizePricing(JSON.parse(text)))
        .catch(() => normalizePricing(null))
    }
    return pricingPromise
  }

  async function hydrate(tz) {
    state.cacheLoaded = true
    state.tz = tz
    try {
      const doc = JSON.parse(await readFile(CACHE_PATH, 'utf8'))
      if (doc.version !== CACHE_VERSION || doc.tz !== tz || !doc.entries) return
      for (const [id, saved] of Object.entries(doc.entries)) {
        const entry = createEntry()
        entry.days = saved.days && typeof saved.days === 'object' ? saved.days : {}
        entry.lastSeq = typeof saved.lastSeq === 'number' ? saved.lastSeq : -1
        entry.lastTime = typeof saved.lastTime === 'number' ? saved.lastTime : 0
        entry.size = typeof saved.size === 'number' ? saved.size : null
        entry.title = typeof saved.title === 'string' ? saved.title : ''
        entry.reqs = Array.isArray(saved.reqs) ? saved.reqs : []
        entry.fails = Array.isArray(saved.fails) ? saved.fails : []
        entry.seeded = saved.seeded === true
        entry.seedFrom = typeof saved.seedFrom === 'number' ? saved.seedFrom : 0
        sessions.set(id, entry)
      }
    } catch {
      // No cache yet (or an unreadable one): every session is folded again.
    }
  }

  async function persist(tz) {
    if (state.writing) return
    state.writing = true
    try {
      const entries = {}
      for (const [id, entry] of sessions) {
        if (entry.live || entry.error || entry.size === null) continue
        entries[id] = {
          size: entry.size,
          lastSeq: entry.lastSeq,
          lastTime: entry.lastTime,
          title: entry.title,
          days: entry.days,
          reqs: entry.reqs,
          fails: entry.fails,
          seeded: entry.seeded,
          seedFrom: entry.seedFrom,
        }
      }
      await mkdir(dirname(CACHE_PATH), { recursive: true })
      const temporary = CACHE_PATH + '.tmp'
      await writeFile(temporary, JSON.stringify({ version: CACHE_VERSION, tz, savedAt: Date.now(), entries }))
      await rename(temporary, CACHE_PATH)
    } catch {
      // A cache write failure never fails the request; the next scan refolds.
    } finally {
      state.writing = false
    }
  }

  async function collect(tz) {
    const signal = controller.signal
    if (!state.cacheLoaded) await hydrate(tz)
    const records = await ctx.sessionQuery.listSessions(signal)
    const sizes = new Map()
    const persistence = ctx.get('sessionPersistence')
    if (persistence !== undefined) {
      try {
        for (const snapshot of await persistence.list({ signal })) sizes.set(snapshot.header.id, snapshot.sizeBytes)
      } catch {
        // Without snapshots every list is still correct, just less incremental.
      }
    }
    const ordered = [...records].sort((left, right) => (right.header.createdAt || 0) - (left.header.createdAt || 0))
    state.total = ordered.length
    state.coverage = { sessions: ordered.length, live: 0, cached: sizes.size, errors: 0 }
    state.scanned = 0
    let durable = false

    for (const record of ordered) {
      if (signal.aborted) return
      const id = record.header.id
      const live = record.live ? ctx.sessions.get(id) : undefined
      if (record.live) state.coverage.live += 1
      const size = sizes.get(id)
      let entry = sessions.get(id)
      const now = Date.now()

      // Fork-inherited prefix: a seeded continuation replays the parent log
      // with original timestamps. The list header carries `isSeeded`, so the
      // boundary is known before folding (foldEvents also pre-scans events
      // and `session/end-seed` as a fallback and keeps the later boundary).
      if (record.header && record.header.isSeeded === true) {
        if (entry === undefined) entry = createEntry()
        entry.seeded = true
        const seededAt = record.header.createdAt
        if (typeof seededAt === 'number' && seededAt > entry.seedFrom) entry.seedFrom = seededAt
      }

      if (entry !== undefined && live === undefined) {
        if (entry.size !== null && size !== undefined && entry.size === size && entry.error === null) {
          state.scanned += 1
          continue
        }
        if (size === undefined && entry.fetchedAt > 0 && now - entry.fetchedAt < REPEAT_WINDOW_MS) {
          state.scanned += 1
          continue
        }
      }

      try {
        if (live !== undefined) {
          if (entry === undefined) entry = createEntry()
          const from = entry.lastSeq >= 0 ? entry.lastSeq + 1 : 0
          const events = live.snapshotEvents(from)
          if (events.length > 0) foldEvents(entry, events, tz)
          entry.live = true
          entry.size = typeof size === 'number' ? size : null
          entry.fetchedAt = now
          entry.error = null
          sessions.set(id, entry)
        } else {
          const snapshot = await ctx.sessionQuery.readSession(id)
          const fresh = createEntry()
          foldEvents(fresh, snapshot.events, tz)
          fresh.live = false
          fresh.size = typeof size === 'number' ? size : null
          fresh.fetchedAt = now
          fresh.error = null
          sessions.set(id, fresh)
          durable = true
        }
      } catch (error) {
        if (entry === undefined) entry = createEntry()
        const message = errorText(error)
        if (entry.days !== undefined && Object.keys(entry.days).length > 0) {
          // Keep the previously folded data and retry this session on the next scan.
          entry.warning = message
        } else {
          entry.error = message
          state.coverage.errors += 1
          if (state.errors.length < 30) state.errors.push({ session: id, message })
        }
        entry.fetchedAt = now
        sessions.set(id, entry)
      }
      state.scanned += 1
      await sleep(0)
    }

    state.scanDone = true
    state.lastScanAt = Date.now()
    if (durable) await persist(tz)
  }

  function ensureScan(tz) {
    if (scanPromise !== null) return scanPromise
    state.scanDone = false
    state.error = null
    state.scanned = 0
    state.errors = []
    scanPromise = collect(tz)
      .catch((error) => {
        state.error = errorText(error)
        state.scanDone = true
      })
      .finally(() => {
        scanPromise = null
      })
    return scanPromise
  }

  function readQuery(req) {
    const url = new URL(String(req.url || '/'), 'http://localhost')
    const rawFrom = Number(url.searchParams.get('from'))
    const rawTo = Number(url.searchParams.get('to'))
    const rawTz = Number(url.searchParams.get('tz'))
    const from = Number.isFinite(rawFrom) ? Math.max(0, rawFrom) : 0
    const to = Number.isFinite(rawTo) && rawTo > 0 ? rawTo : Date.now()
    const tz = Number.isFinite(rawTz) ? Math.max(-840, Math.min(840, Math.round(rawTz))) : 0
    return { url, from, to, tz }
  }

  function applyTz(tz) {
    if (tz !== state.tz) {
      sessions.clear()
      state.cacheLoaded = false
      state.scanDone = false
      state.tz = tz
    }
  }

  function progress() {
    return {
      status: state.scanDone ? 'ready' : 'scanning',
      progress: { done: state.scanned, total: state.total },
      scannedAt: state.lastScanAt || null,
      error: state.error,
      errors: state.errors,
      coverage: state.coverage,
    }
  }

  function reject(req, res) {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('allow', 'GET')
      res.end()
      return true
    }
    return false
  }

  async function handler(req, res) {
    if (reject(req, res)) return
    const { url, from, to, tz } = readQuery(req)
    applyTz(tz)
    try {
      const scan = ensureScan(tz)
      await Promise.race([scan, sleep(SETTLE_MS)])
      const doc = await pricing()
      const mode = url.searchParams.get('mode')
      const summary = summarize(sessions, from, to, tz, doc, { mode })
      sendJson(res, 200, {
        ...progress(),
        currency: doc.currency,
        symbol: doc.symbol,
        ...summary,
      })
    } catch (error) {
      sendJson(res, 500, { status: 'error', error: errorText(error) })
    }
  }

  async function requestsHandler(req, res) {
    if (reject(req, res)) return
    const { url, from, to, tz } = readQuery(req)
    applyTz(tz)
    try {
      const scan = ensureScan(tz)
      await Promise.race([scan, sleep(SETTLE_MS)])
      const doc = await pricing()
      const result = queryRequests(sessions, from, to, tz, doc, {
        view: url.searchParams.get('view'),
        model: url.searchParams.get('model'),
        q: url.searchParams.get('q'),
        sort: url.searchParams.get('sort'),
        order: url.searchParams.get('order'),
        offset: Number(url.searchParams.get('offset')),
        limit: Number(url.searchParams.get('limit')),
      })
      sendJson(res, 200, {
        ...progress(),
        currency: doc.currency,
        symbol: doc.symbol,
        ...result,
      })
    } catch (error) {
      sendJson(res, 500, { status: 'error', error: errorText(error) })
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler }),
    'usage-dashboard: GET ' + ROUTE_PATH,
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: REQUESTS_PATH, handler: requestsHandler }),
    'usage-dashboard: GET ' + REQUESTS_PATH,
  )
  ctx.effect(() => () => controller.abort(), 'usage-dashboard: stop session scans')
}

export { DAY }
