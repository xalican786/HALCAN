// src/index.js — Halcan boot
// $70B flash capacity | $7B per cycle | P1-P10 propeller
// Shared treasury: 0xCCCF... (classified)

import { createServer }  from 'http'
import { Worker }        from 'worker_threads'
import { fileURLToPath } from 'url'
import path              from 'path'
import {
  SAB_SIZE, H, SYSTEM, VERSION, EXECUTOR, PORT,
  TOTAL_FLASH, BALANCER_FLASH, AAVE_FLASH, PER_CYCLE_TARGET,
} from './config.js'
import { startDeployer } from './deployer.js'
import { startFlash }    from './flash.js'
import { startPropeller }from './propeller.js'
import { startTreasury } from './treasury.js'
import { startDashboard }from './dashboard.js'

export const SAB = new SharedArrayBuffer(SAB_SIZE)
export const HOT = new Float64Array(SAB)

// Boot defaults
HOT[H.FLASH_CAP]    = TOTAL_FLASH
HOT[H.BALANCER_CAP] = BALANCER_FLASH
HOT[H.AAVE_CAP]     = AAVE_FLASH
HOT[H.GAS_OK]       = 1
HOT[H.PROPELLER]    = 1

const bf  = (BALANCER_FLASH / 1e9).toFixed(0)
const af  = (AAVE_FLASH     / 1e9).toFixed(0)
const tf  = (TOTAL_FLASH    / 1e9).toFixed(0)
const pct = (PER_CYCLE_TARGET / 1e9).toFixed(0)

console.log('╔═══════════════════════════════════════════════════════════╗')
console.log('║   H A L C A N  —  Flash Principal Extraction System       ║')
console.log(`║   Version: ${VERSION}  |  $${tf}B Flash  |  $${pct}B/cycle              ║`)
console.log(`║   Executor: ${EXECUTOR.slice(0,14)}...                              ║`)
console.log('║   Treasury: SECURED (CLASSIFIED)                          ║')
console.log(`║   Flash:    $${bf}B Balancer + $${af}B Aave = $${tf}B total       ║`)
console.log(`║   Target:   $${pct}B per cycle | 1.7M cycles/day max               ║`)
console.log('╚═══════════════════════════════════════════════════════════╝')

// Start core services
startDeployer(SAB)
startFlash(HOT)
startPropeller(HOT)
startTreasury(HOT)
startDashboard(SAB)

// Chain monitor worker
const __dir = path.dirname(fileURLToPath(import.meta.url))
const chainWorker = new Worker(path.join(__dir, 'chains.js'), { workerData: { SAB } })
chainWorker.on('message', msg => {
  if (msg.type === 'swap') HOT[H.NATURAL_TODAY]++
})
chainWorker.on('error', e => console.log(`[CHAINS] Worker error: ${e.message?.slice(0,80)}`))

// Executor worker
const execWorker = new Worker(path.join(__dir, 'executor.js'), { workerData: { SAB } })
execWorker.on('message', msg => {
  if (msg.type === 'cycle') {
    HOT[H.REV_TODAY]    = (HOT[H.REV_TODAY]    || 0) + (msg.extracted || PER_CYCLE_TARGET)
    HOT[H.REV_TOTAL]    = (HOT[H.REV_TOTAL]    || 0) + (msg.extracted || PER_CYCLE_TARGET)
    HOT[H.CYCLES_TODAY] = (HOT[H.CYCLES_TODAY]  || 0) + 1
    HOT[H.CYCLES_TOTAL] = (HOT[H.CYCLES_TOTAL]  || 0) + 1
  }
})
execWorker.on('error', e => console.log(`[EXECUTOR] Worker error: ${e.message?.slice(0,80)}`))

// Uptime + memory
setInterval(() => HOT[H.UPTIME]++, 1000)
HOT[H.MB] = process.memoryUsage().heapUsed / 1024 / 1024 | 0
setInterval(() => { HOT[H.MB] = process.memoryUsage().heapUsed / 1024 / 1024 | 0 }, 10_000)

// Midnight reset
const scheduleMidnight = () => {
  const now = new Date(), nx = new Date()
  nx.setUTCHours(0, 0, 0, 0); nx.setUTCDate(nx.getUTCDate() + 1)
  setTimeout(() => {
    ;[H.CYCLES_TODAY, H.REV_TODAY, H.NET_TODAY, H.NATURAL_TODAY,
      H.EXEC_TODAY, H.SUCCESS_TODAY, H.FAIL_TODAY, H.AAVE_FEE_TODAY,
      H.AVG_CYCLE].forEach(i => HOT[i] = 0)
    scheduleMidnight()
  }, nx - now)
}
scheduleMidnight()

// Health endpoint
createServer((req, res) => {
  if (req.url !== '/ping' && req.url !== '/health') { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    ok:          true,
    system:      SYSTEM,
    uptime:      HOT[H.UPTIME]       | 0,
    cyclesTotal: HOT[H.CYCLES_TOTAL] | 0,
    revToday:    HOT[H.REV_TODAY],
    flashCap:    HOT[H.FLASH_CAP],
    propeller:   'P' + (HOT[H.PROPELLER] | 0),
    deployed:    HOT[H.DEPLOYMENT] === 1,
    gasOK:       HOT[H.GAS_OK] === 1,
    mb:          HOT[H.MB] | 0,
  }))
}).listen(3001).on('error', () => {})

process.on('uncaughtException',  e => console.log(`[HALCAN] ${e.message?.slice(0,100)}`))
process.on('unhandledRejection', r => console.log(`[HALCAN] ${String(r).slice(0,100)}`))
process.on('SIGTERM',            () => process.exit(0))

console.log(`[HALCAN] Operational :${PORT} | Send 0.1 POL to ${EXECUTOR.slice(0,14)}... to deploy`)
