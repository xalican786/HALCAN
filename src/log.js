// src/log.js — VANCAN diagnostics
// 5 logs per minute (every 12s)
// Starts 15s after boot — after boot logs complete
// NO dynamic imports — all imports at top level
// NO await outside async functions

import { existsSync, readFileSync } from 'fs'
import { ethers }  from 'ethers'
import {
  H, SYSTEM, VERSION, EXECUTOR,
  CONTRACT, CHAINS, CHAIN_HOT,
  BASE_FLASH, AMPLIFIER_OUTPUT, PROPELLER,
  ACTIVE_PROPELLER,
} from './config.js'
import { amplify, layerBreakdown } from './amplifier.js'

const ADDR_PATH = '/data/vancan_contracts.json'
const SEP       = '─'.repeat(60)
let   diagCount = 0
let   diagTimer = null

// ── MEMORY ────────────────────────────────────────────────────────────────────
function memDiag() {
  const m      = process.memoryUsage()
  const heapMB = Math.round(m.heapUsed  / 1024 / 1024)
  const totMB  = Math.round(m.heapTotal / 1024 / 1024)
  const rssMB  = Math.round(m.rss       / 1024 / 1024)
  const pct    = Math.round(heapMB / totMB * 100)
  const status = pct > 85 ? ' HIGH' : pct > 70 ? '~ MOD' : '✓ OK'
  return { heapMB, totMB, rssMB, pct, status, warn: pct > 85 }
}

// ── CONTRACTS ─────────────────────────────────────────────────────────────────
function contractDiag() {
  const names = [
    ['Vancan',           CONTRACT.VANCAN],
    ['VancanAmplifier',  CONTRACT.VANCAN_AMPLIFIER],
    ['VancanFlash',      CONTRACT.VANCAN_FLASH],
    ['VancanBundle',     CONTRACT.VANCAN_BUNDLE],
    ['VancanGuard',      CONTRACT.VANCAN_GUARD],
    ['VancanSplitter',   CONTRACT.VANCAN_SPLITTER],
    ['VancanRegistry',   CONTRACT.VANCAN_REGISTRY],
    ['VancanVault',      CONTRACT.VANCAN_VAULT],
    ['VancanGovernance', CONTRACT.VANCAN_GOVERNANCE],
    ['VancanOracle',     CONTRACT.VANCAN_ORACLE],
  ]
  let deployed = 0
  const missing = []
  for (const [name, addr] of names) {
    if (addr && ethers.isAddress(addr)) deployed++
    else missing.push(name)
  }
  let savedAt = null
  try {
    if (existsSync(ADDR_PATH)) {
      const d = JSON.parse(readFileSync(ADDR_PATH, 'utf8'))
      if (d.deployedAt) savedAt = new Date(d.deployedAt).toLocaleTimeString()
    }
  } catch {}
  return { deployed, total: 10, missing, savedAt }
}

// ── CHAINS ────────────────────────────────────────────────────────────────────
function chainDiag(HOT) {
  const on  = []
  const off = []
  for (const c of CHAINS) {
    const slot = CHAIN_HOT[c.name]
    if (slot !== undefined && HOT[slot] === 1) on.push(c.name)
    else off.push(c.name)
  }
  return { on, off, total: CHAINS.length }
}

// ── AMPLIFIER ─────────────────────────────────────────────────────────────────
function ampDiag() {
  // No await — synchronous amplify call
  try {
    const r = amplify()
    return { ok:true, output:r.output, elapsed:r.elapsed_ms }
  } catch (e) {
    return { ok:false, error:e.message?.slice(0,60) }
  }
}

// ── EXECUTOR ──────────────────────────────────────────────────────────────────
function execDiag(HOT) {
  const swaps   = HOT[H.SWAPS_TODAY]   | 0
  const success = HOT[H.SUCCESS_TODAY] | 0
  const fail    = HOT[H.FAIL_TODAY]    | 0
  const rate    = swaps > 0 ? Math.round(success / swaps * 100) : 0
  return {
    gasPrice:   HOT[H.GAS_PRICE] || 0,
    gasOK:      HOT[H.GAS_OK] === 1,
    swaps, success, fail, rate,
    speedMs:    HOT[H.EXEC_SPEED_MS] || 0,
    revToday:   HOT[H.REV_TODAY]     || 0,
    netToday:   HOT[H.NET_TODAY]     || 0,
    revTotal:   HOT[H.REV_TOTAL]     || 0,
    naturalToday: HOT[H.NATURAL_TODAY] | 0,
  }
}

// ── FORMAT ────────────────────────────────────────────────────────────────────
function fB(n) {
  if (!n || isNaN(n) || n === 0) return '$0'
  const x = Number(n)
  if (x >= 1e18) return '$' + (x/1e18).toFixed(2) + 'QUI'
  if (x >= 1e15) return '$' + (x/1e15).toFixed(2) + 'Q'
  if (x >= 1e12) return '$' + (x/1e12).toFixed(2) + 'T'
  if (x >= 1e9)  return '$' + (x/1e9).toFixed(2)  + 'B'
  if (x >= 1e6)  return '$' + (x/1e6).toFixed(2)  + 'M'
  return '$' + x.toFixed(2)
}

function fmtTime(s) {
  s = s | 0
  if (s < 60)   return s + 's'
  if (s < 3600) return (s/60|0) + 'm ' + (s%60) + 's'
  return (s/3600|0) + 'h ' + (s%3600/60|0) + 'm'
}

// ── MAIN DIAGNOSTIC ───────────────────────────────────────────────────────────
function runDiag(HOT) {
  diagCount++
  const time   = new Date().toISOString().slice(11,19)
  const uptime = HOT[H.UPTIME] | 0
  const mem    = memDiag()
  const ctrs   = contractDiag()
  const chains = chainDiag(HOT)
  const amp    = ampDiag()
  const exec   = execDiag(HOT)
  const prop   = 'P' + (HOT[H.PROPELLER] | 0)
  const target = HOT[H.DAILY_TARGET] || 0
  const natPM  = uptime > 60 ? Math.round(exec.naturalToday / (uptime/60)) : exec.naturalToday

  console.log(`\n[DIAG #${diagCount}] ${SYSTEM} ${VERSION} | ${time} | up: ${fmtTime(uptime)}`)
  console.log(SEP)

  // 1. MEMORY
  console.log(
    `[MEM]  ${mem.heapMB}MB/${mem.totMB}MB heap (${mem.pct}%) ${mem.status}` +
    ` | rss: ${mem.rssMB}MB` +
    (mem.warn ? ' NEAR LIMIT — Railway may restart' : '')
  )

  // 2. CONTRACTS
  if (ctrs.deployed === ctrs.total) {
    console.log(`[CTRS] ✓ ALL ${ctrs.total}/10 deployed${ctrs.savedAt ? ' (saved '+ctrs.savedAt+')' : ''}`)
  } else if (ctrs.deployed > 0) {
    console.log(`[CTRS] ${ctrs.deployed}/10 deployed | Missing: ${ctrs.missing.join(', ')}`)
  } else {
    console.log(`[CTRS]  Awaiting 0.1 POL → ${EXECUTOR.slice(0,14)}... | 0/10 deployed`)
  }

  // 3. CHAINS
  if (chains.off.length === 0) {
    console.log(`[CHN]  ✓ ALL ${chains.total}/20 connected`)
  } else {
    console.log(
      `[CHN]  ${chains.on.length}/20 connected` +
      (chains.off.length > 0 && chains.off.length < 6
        ? ` | offline: ${chains.off.join(',')}` : '')
    )
  }

  // 4. AMPLIFIER
  if (amp.ok) {
    console.log(
      `[AMP]  ✓ output: ${fB(amp.output)} per swap | ${amp.elapsed.toFixed(4)}ms compute | 15 layers`
    )
  } else {
    console.log(`[AMP]   ERROR: ${amp.error}`)
  }

  // 5. EXECUTOR + REVENUE
  const gasStr = exec.gasOK
    ? `✓ ${exec.gasPrice.toFixed(1)} gwei`
    : ` PAUSED ${exec.gasPrice.toFixed(1)} gwei > 1000 cap`
  console.log(
    `[EXEC] gas: ${gasStr} | swaps: ${exec.swaps} | ` +
    `success: ${exec.success} (${exec.rate}%) | fail: ${exec.fail} | ` +
    `speed: ${exec.speedMs.toFixed(1)}ms`
  )
  console.log(
    `[REV]  today: ${fB(exec.revToday)} | net: ${fB(exec.netToday)} | ` +
    `all-time: ${fB(exec.revTotal)}`
  )
  console.log(
    `[PROP] ${prop} | target: ${fB(target)}/day | ` +
    `detected: ${exec.naturalToday.toLocaleString()} swaps (${natPM}/min)`
  )

  // WARNINGS
  if (!exec.gasOK) {
    console.log(`[WARNING]   Executor PAUSED — gas ${exec.gasPrice.toFixed(1)} gwei exceeds cap`)
  }
  if (exec.naturalToday > 100 && exec.swaps === 0 && ctrs.deployed === 0) {
    console.log(`[WARNING]   ${exec.naturalToday} swaps detected but 0 executed — contracts not deployed yet`)
  }
  if (exec.naturalToday > 0 && exec.swaps === 0 && ctrs.deployed > 0) {
    console.log(`[WARNING]   Swaps detected but not executing — check CONTRACT.VANCAN address`)
  }

  console.log(SEP)
}

// ── START ─────────────────────────────────────────────────────────────────────
export function startLogger(HOT) {
  console.log('[LOG] Diagnostics starting in 15s')

  setTimeout(() => {
    console.log(`\n[LOG] Diagnostic system active | 5/min | ${SYSTEM} ${VERSION}`)
    runDiag(HOT)
    diagTimer = setInterval(() => runDiag(HOT), 12_000)
  }, 15_000)
}

export function stopLogger() {
  if (diagTimer) { clearInterval(diagTimer); diagTimer = null }
}
