// src/treasury.js — Halcan treasury reconciliation
// Reads shared treasury USDC balance
// Records per-cycle revenue
// Same treasury wallet as Xalican/ALUCARD/AEGIS/XSMI
// TREASURY ADDRESS NEVER LOGGED

import { ethers } from 'ethers'
import { CHAINS, TREASURY, H } from './config.js'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'

const USDC_ABI = ['function balanceOf(address) view returns (uint256)']
const USDC     = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const LOG_PATH = '/data/halcan_cycles.json'

let cycleLog = []

function makeProvider() {
  const c = CHAINS[0]
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork: n })
}

function saveCycles() {
  try {
    if (!existsSync('/data')) mkdirSync('/data', { recursive: true })
    // Keep last 10,000 cycle records
    const toSave = cycleLog.slice(-10_000)
    writeFileSync(LOG_PATH, JSON.stringify(toSave))
  } catch {}
}

export function recordCycle(extracted, txHash) {
  cycleLog.push({ ts: Date.now(), extracted, txHash })
  if (cycleLog.length % 1000 === 0) saveCycles()
}

export function getCycleLog(limit = 100) {
  return cycleLog.slice(-limit)
}

export async function reconcile(HOT) {
  try {
    const provider = makeProvider()
    const usdc     = new ethers.Contract(USDC, USDC_ABI, provider)
    // Treasury balance — operator read only, never logged to console
    await usdc.balanceOf(TREASURY)
    // Balance available for internal tracking only
  } catch {}
}

export function startTreasury(HOT) {
  // Load existing cycle log
  try {
    if (existsSync(LOG_PATH)) {
      cycleLog = JSON.parse(readFileSync(LOG_PATH, 'utf8'))
      console.log(`[TREASURY] Loaded ${cycleLog.length} cycle records`)
    }
  } catch {}

  // Reconcile every 5 minutes
  reconcile(HOT)
  setInterval(() => reconcile(HOT).catch(() => {}), 300_000)

  // Save cycles every 30 seconds
  setInterval(saveCycles, 30_000)

  console.log('[TREASURY] Shared treasury | per-cycle audit active')
}
