// src/dashboard.js — Halcan operator dashboard
// 5 tabs: Overview | Propeller | Chains | FTW | System
// FTW: burn USDC profit → ModemPay → fiat withdrawal
// WebSocket live 500ms updates

import { createRequire }  from 'module'
import { createServer }   from 'http'
import { existsSync }     from 'fs'
import { fileURLToPath }  from 'url'
import path               from 'path'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const _req  = createRequire(import.meta.url)
const express             = _req(path.join(__dir, '../node_modules/express'))
const { WebSocketServer } = _req(path.join(__dir, '../node_modules/ws'))

import {
  H, PORT, SYSTEM, VERSION, EXECUTOR, SAB_SIZE,
  TOTAL_FLASH, BALANCER_FLASH, AAVE_FLASH,
  PER_CYCLE_TARGET, PROPELLER, CONTRACT,
} from './config.js'
import { activatePropeller, getPropellerStats, getProgress, getVelocity } from './propeller.js'
import { getCycleLog }  from './treasury.js'
import { send as mpSend, calcFee } from './adapters/modempay.js'

let SAB_REF = null
const WS_CLIENTS = new Set()
const hot = () => SAB_REF ? new Float64Array(SAB_REF) : null

// ── FULL STATE ─────────────────────────────────────────────────────────────────
function fullState() {
  const H2 = hot()
  if (!H2) return { type: 'state', ts: Date.now(), booting: true }

  return {
    type: 'state', ts: Date.now(),
    // Flash
    flashCap:     H2[H.FLASH_CAP],
    balancerCap:  H2[H.BALANCER_CAP],
    aaveCap:      H2[H.AAVE_CAP],
    // Cycles
    cyclesToday:  H2[H.CYCLES_TODAY]  | 0,
    cyclesTotal:  H2[H.CYCLES_TOTAL]  | 0,
    cyclesNeeded: H2[H.CYCLES_NEEDED] | 0,
    naturalToday: H2[H.NATURAL_TODAY] | 0,
    execToday:    H2[H.EXEC_TODAY]    | 0,
    successToday: H2[H.SUCCESS_TODAY] | 0,
    failToday:    H2[H.FAIL_TODAY]    | 0,
    // Revenue
    revToday:     H2[H.REV_TODAY],
    revTotal:     H2[H.REV_TOTAL],
    netToday:     H2[H.NET_TODAY],
    aaveFeeToday: H2[H.AAVE_FEE_TODAY],
    perCycle:     H2[H.PER_CYCLE],
    peakCycle:    H2[H.PEAK_CYCLE],
    avgCycle:     H2[H.AVG_CYCLE],
    velocity:     getVelocity(H2),
    progress:     getProgress(H2),
    // Propeller
    propeller:      'P' + (H2[H.PROPELLER] | 0),
    dailyTarget:    H2[H.DAILY_TARGET],
    propellerStats: getPropellerStats(),
    // Chains
    chainCount:   H2[H.CHAIN_COUNT]   | 0,
    chainPolygon: H2[H.CHAIN_POLYGON] === 1,
    chainArb:     H2[H.CHAIN_ARB]     === 1,
    // Gas
    gasPrice: H2[H.GAS_PRICE],
    gasOK:    H2[H.GAS_OK] === 1,
    // System
    contracts:  H2[H.CONTRACTS]  | 0,
    deployment: H2[H.DEPLOYMENT] === 1,
    uptime:     H2[H.UPTIME]     | 0,
    mb:         H2[H.MB]         | 0,
    executor:   EXECUTOR,
    halcanAddr: CONTRACT.HALCAN  || '',
    version:    VERSION,
    wsClients:  WS_CLIENTS.size,
    // TREASURY NEVER INCLUDED
  }
}

function broadcast(data) {
  const p = JSON.stringify(data)
  for (const ws of WS_CLIENTS) {
    if (ws.readyState === 1) try { ws.send(p) } catch { WS_CLIENTS.delete(ws) }
  }
}

setInterval(() => { if (WS_CLIENTS.size > 0) broadcast(fullState()) }, 500)

// ── EXPRESS ───────────────────────────────────────────────────────────────────
const app = express()
const srv = createServer(app)
const wss = new WebSocketServer({ server: srv, perMessageDeflate: false })

app.use(express.json({ limit: '512kb' }))
app.use(express.static(path.join(__dir, '../dashboard')))

app.get('/', (_, res) => {
  const p = path.join(__dir, '../dashboard/halcan.html')
  existsSync(p) ? res.sendFile(p) : res.status(404).send('halcan.html missing')
})

app.get('/ping', (_, res) => {
  const H2 = hot()
  res.json({
    ok:      true,
    system:  SYSTEM,
    uptime:  H2?.[H.UPTIME] | 0,
    deployed:H2?.[H.DEPLOYMENT] === 1,
  })
})

// ── STATE ─────────────────────────────────────────────────────────────────────
app.get('/api/state',  (_, res) => res.json(fullState()))
app.get('/api/cycles', (_, res) => {
  res.json({ cycles: getCycleLog(50), total: hot()?.[H.CYCLES_TOTAL] | 0 })
})

// ── PROPELLER ─────────────────────────────────────────────────────────────────
app.post('/api/propeller', (req, res) => {
  const { level } = req.body
  const H2 = hot(); if (!H2) return res.status(503).json({ error: 'not ready' })
  const ok = activatePropeller(level, H2)
  res.json({ ok, level, target: PROPELLER[level] })
})

// ── FTW — USDC profit → ModemPay → fiat ──────────────────────────────────────
// Halcan earns USDC in the treasury from flash extractions.
// Operator withdraws any amount via ModemPay.
// Treasury USDC comes from Xalican + Halcan combined revenue.

app.post('/api/ftw/quote', (req, res) => {
  const { amount, network } = req.body
  if (!amount) return res.status(400).json({ error: 'amount required' })
  const fees = calcFee(parseFloat(amount), network || 'wave')
  res.json({ ...fees, ts: Date.now() })
})

app.post('/api/ftw/withdraw', async (req, res) => {
  const {
    amount, type, phone, accountNumber,
    accountName, swiftCode, network, address,
  } = req.body

  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required' })

  const key = process.env.MODEMPAY_SECRET_KEY || ''
  if (!key) return res.status(400).json({ error: 'MODEMPAY_SECRET_KEY not set in Railway Variables' })

  try {
    const result = await mpSend(key, {
      type, amount: parseFloat(amount),
      phone, accountNumber, accountName,
      swiftCode, network, address,
    })
    broadcast({ type: 'ftw', amount })
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message?.slice(0, 120) })
  }
})

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
wss.on('connection', ws => {
  WS_CLIENTS.add(ws)
  ws.send(JSON.stringify(fullState()))
  ws.on('close', () => WS_CLIENTS.delete(ws))
  ws.on('error', () => WS_CLIENTS.delete(ws))
})

export function startDashboard(SAB) {
  SAB_REF = SAB
  srv.listen(PORT, () => {
    console.log(`[DASHBOARD] Halcan :${PORT} | 5 tabs | FTW active | /ping`)
  })
}
