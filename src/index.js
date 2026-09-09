// src/index.js -- HALCAN boot
// Flash Principal Extraction -- $70B configured | live reads via algorithm.js
// log.js already exists -- imported here
// algorithm.js: live flash replaces TOTAL_FLASH before every cycle
// 20 chains | P1-P10 propeller | shared treasury

import { createServer }  from 'http'
import { Worker }        from 'worker_threads'
import { fileURLToPath } from 'url'
import path              from 'path'

import {
  SAB_SIZE, H, SYSTEM, VERSION,
  EXECUTOR, TREASURY,
  PORT, TOTAL_FLASH, BALANCER_FLASH, AAVE_FLASH,
  PER_CYCLE_TARGET, WS_CHAINS, CHAINS,
} from './config.js'

import { startDeployer }  from './deployer.js'
import { startFlash }     from './flash.js'
import { startPropeller } from './propeller.js'
import { startTreasury }  from './treasury.js'
import { startDashboard } from './dashboard.js'
import { startLogger }    from './log.js'
import { getLiveFlash }   from './algorithm.js'

// ── SHARED MEMORY ─────────────────────────────────────────────────────────────
export const SAB = new SharedArrayBuffer(SAB_SIZE)
export const HOT = new Float64Array(SAB)

// Boot defaults -- configured values, overwritten by live reads immediately
HOT[H.FLASH_CAP]    = TOTAL_FLASH    // $70B configured -- live read below
HOT[H.BALANCER_CAP] = BALANCER_FLASH // $26B configured
HOT[H.AAVE_CAP]     = AAVE_FLASH     // $44B configured
HOT[H.GAS_OK]       = 1
HOT[H.PROPELLER]    = 1

// Algorithm HOT slots -- populated by live reads
HOT[H.ALGO_PASS]    = 0
HOT[H.ALGO_FLASH]   = 0
HOT[H.ALGO_LAST_TS] = 0

// ── SAFETY ────────────────────────────────────────────────────────────────────
if (EXECUTOR === TREASURY) {
  console.error('[HALCAN] FATAL: executor === treasury -- check EXECUTOR_PK in config.js')
  process.exit(1)
}

// ── BANNER ────────────────────────────────────────────────────────────────────
const bf  = Math.floor(BALANCER_FLASH / 1e9)
const af  = Math.floor(AAVE_FLASH     / 1e9)
const tf  = Math.floor(TOTAL_FLASH    / 1e9)
const pct = Math.floor(PER_CYCLE_TARGET / 1e9)
const wsc = WS_CHAINS.length

console.log('╔═══════════════════════════════════════════════════════════╗')
console.log('║   H A L C A N  --  Flash Principal Extraction             ║')
console.log(`║   Version: ${VERSION}  |  $${tf}B configured | live reads active    ║`)
console.log(`║   Executor: ${EXECUTOR.slice(0,14)}...                              ║`)
console.log('║   Treasury: CLASSIFIED                                    ║')
console.log(`║   Configured: Balancer $${bf}B (0%) + Aave $${af}B (0.05%)     ║`)
console.log(`║   Live read: will replace configured on boot              ║`)
console.log(`║   Target:    $${pct}B/cycle | P1-P10 propeller               ║`)
console.log(`║   Chains:    ${wsc} WS chains | algorithm-gated              ║`)
console.log('╚═══════════════════════════════════════════════════════════╝')

// ── LIVE FLASH INIT -- algorithm.js takes responsibility for flash amounts ─────
// HALCAN configured: Balancer $26B + Aave $44B = $70B
// Algorithm reads actual vault balances -- sets HOT caps to confirmed amounts
// Executor reads HOT[H.FLASH_CAP] not config.js TOTAL_FLASH directly
// This is the critical change: configured numbers are ceiling, live is floor

getLiveFlash().then(result => {
  if (result.pass && result.total > 0) {
    // Update HOT with live amounts -- executor uses these
    HOT[H.FLASH_CAP]    = result.total
    HOT[H.BALANCER_CAP] = result.balancer
    HOT[H.AAVE_CAP]     = result.aave
    HOT[H.ALGO_FLASH]   = result.total
    HOT[H.ALGO_PASS]    = 1
    HOT[H.ALGO_LAST_TS] = Date.now()
    console.log(
      `[ALGORITHM] Live flash confirmed:` +
      ` Balancer $${(result.balancer/1e6).toFixed(2)}M` +
      ` + Aave $${(result.aave/1e6).toFixed(2)}M` +
      ` = $${(result.total/1e6).toFixed(2)}M total`
    )
    console.log(
      `[ALGORITHM] Configured was $${tf}B -- using live $${(result.total/1e6).toFixed(2)}M` +
      ` | extract target: $${(result.total*0.10/1e6).toFixed(2)}M (10%)`
    )
  } else {
    HOT[H.ALGO_PASS]    = 0
    HOT[H.ALGO_LAST_TS] = Date.now()
    console.log(`[ALGORITHM] Live read failed -- holding configured $${tf}B | will retry every 60s`)
  }
}).catch(() => {
  console.log('[ALGORITHM] Live flash init error -- holding configured values')
})

// ── SERVICES ──────────────────────────────────────────────────────────────────
startDeployer(SAB)
startFlash(HOT)
startPropeller(HOT)
startTreasury(HOT)
startDashboard(SAB)

// ── WORKERS ───────────────────────────────────────────────────────────────────
const __dir = path.dirname(fileURLToPath(import.meta.url))

const chainWorker = new Worker(
  path.join(__dir, 'chains.js'),
  {
    workerData:     { SAB },
    resourceLimits: {
      maxOldGenerationSizeMb:   80,
      maxYoungGenerationSizeMb: 16,
    },
  }
)
chainWorker.on('message', msg => {
  if (msg.type === 'swap') {
    HOT[H.NATURAL_TODAY] = (HOT[H.NATURAL_TODAY] || 0) + 1
  }
})
chainWorker.on('error', e => console.log(`[CHAINS] ${e.message?.slice(0, 80)}`))
chainWorker.on('exit',  c => { if (c !== 0) console.log(`[CHAINS] exited: ${c}`) })

const execWorker = new Worker(
  path.join(__dir, 'executor.js'),
  {
    workerData:     { SAB },
    resourceLimits: {
      maxOldGenerationSizeMb:   100,
      maxYoungGenerationSizeMb: 20,
    },
  }
)
execWorker.on('message', msg => {
  if (msg.type === 'cycle') {
    const x = msg.extracted || 0
    HOT[H.REV_TODAY]     = (HOT[H.REV_TODAY]     || 0) + x
    HOT[H.REV_TOTAL]     = (HOT[H.REV_TOTAL]      || 0) + x
    HOT[H.CYCLES_TODAY]  = (HOT[H.CYCLES_TODAY]    || 0) + 1
    HOT[H.EXEC_SPEED_MS] = msg.elapsed_ms || 1
    HOT[H.PER_CYCLE]     = x
    if (x > (HOT[H.PEAK_CYCLE] || 0)) HOT[H.PEAK_CYCLE] = x
  }
  // Executor reports algorithm check results back to main for log display
  if (msg.type === 'algo_check') {
    HOT[H.ALGO_PASS]    = msg.pass  ? 1 : 0
    HOT[H.ALGO_FLASH]   = msg.flash || 0
    HOT[H.ALGO_LAST_TS] = Date.now()
    // Update live flash caps from executor's most recent read
    if (msg.pass && msg.flash > 0) {
      HOT[H.FLASH_CAP]    = msg.flash
      HOT[H.BALANCER_CAP] = msg.flashBalancer || 0
      HOT[H.AAVE_CAP]     = msg.flashAave     || 0
    }
  }
})
execWorker.on('error', e => console.log(`[EXECUTOR] ${e.message?.slice(0, 80)}`))
execWorker.on('exit',  c => { if (c !== 0) console.log(`[EXECUTOR] exited: ${c}`) })

// ── TIMERS ────────────────────────────────────────────────────────────────────
setInterval(() => { HOT[H.UPTIME]++ }, 1_000)

setInterval(() => {
  HOT[H.MB] = process.memoryUsage().heapUsed / 1024 / 1024 | 0
}, 10_000)

// Background live flash refresh -- 60s
// Executor also reads live before every cycle
// This keeps HOT caps current between cycles
setInterval(() => {
  getLiveFlash().then(result => {
    if (result.pass && result.total > 0) {
      HOT[H.FLASH_CAP]    = result.total
      HOT[H.BALANCER_CAP] = result.balancer
      HOT[H.AAVE_CAP]     = result.aave
      HOT[H.ALGO_FLASH]   = result.total
    }
  }).catch(() => {})
}, 60_000)

const scheduleMidnight = () => {
  const nx = new Date()
  nx.setUTCHours(0, 0, 0, 0)
  nx.setUTCDate(nx.getUTCDate() + 1)
  setTimeout(() => {
    ;[
      H.CYCLES_TODAY, H.REV_TODAY,     H.NET_TODAY,
      H.NATURAL_TODAY,H.EXEC_TODAY,    H.SUCCESS_TODAY,
      H.FAIL_TODAY,   H.AAVE_FEE_TODAY,H.EXEC_SPEED_MS,
    ].forEach(i => { if (i !== undefined) HOT[i] = 0 })
    scheduleMidnight()
  }, nx - new Date())
}
scheduleMidnight()

// ── DIAGNOSTICS -- log.js already exists in HALCAN, imported above ────────────
// log.js reads HOT[H.*] slots directly -- no changes needed to log.js
// All live flash values already written to HOT above
// Starts 15s after boot | 5 diagnostics per minute
startLogger(HOT)

// ── HEALTH ENDPOINT ───────────────────────────────────────────────────────────
createServer((req, res) => {
  if (req.url !== '/health' && req.url !== '/ping') {
    res.writeHead(404); res.end(); return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    ok:         true,
    system:     SYSTEM,
    version:    VERSION,
    uptime:     HOT[H.UPTIME]      | 0,
    propeller:  HOT[H.PROPELLER]   | 0,
    flashCap:   HOT[H.FLASH_CAP],    // live flash amount
    algoPass:   HOT[H.ALGO_PASS]   === 1,
    algoFlash:  HOT[H.ALGO_FLASH],
    revToday:   HOT[H.REV_TODAY],
    cycles:     HOT[H.CYCLES_TODAY] | 0,
    deployed:   HOT[H.DEPLOYMENT]   === 1,
    gasOK:      HOT[H.GAS_OK]       === 1,
    executor:   EXECUTOR,
    treasury:   'CLASSIFIED',
    mb:         HOT[H.MB]           | 0,
  }))
}).listen(3001).on('error', () => {})

// ── PROCESS HANDLERS ──────────────────────────────────────────────────────────
process.on('uncaughtException',  e => console.log(`[HALCAN] ${e.message?.slice(0, 100)}`))
process.on('unhandledRejection', r => console.log(`[HALCAN] ${String(r).slice(0, 100)}`))
process.on('SIGTERM', () => {
  chainWorker.terminate()
  execWorker.terminate()
  process.exit(0)
})

console.log(`[HALCAN] Operational :${PORT || 3000} | ${wsc} chains | algorithm active | log active`)
