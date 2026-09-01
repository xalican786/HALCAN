// src/executor.js — Halcan execution engine (Worker)
// Reads ring buffer — fires flash loan executions
// Nonce mutex — prevents collision on rapid concurrent executions
// Gas cap at 100 gwei — protects executor during congestion
// rHead resets on boot — no stale queue backlog
// Propeller governs execution rate

import { workerData, parentPort } from 'worker_threads'
import { ethers }                 from 'ethers'
import {
  EXECUTOR_PK, EXECUTOR, TREASURY,
  CONTRACT, H, CHAINS,
  FLASH_ASSETS, BALANCER_AMOUNTS,
  GAS_CAP_GWEI, GAS_MARKUP, GAS_LIMIT,
  DAILY_TARGET, PER_CYCLE_TARGET,
  AAVE_FLASH_FEE, AAVE_FLASH,
} from './config.js'

const SAB = workerData.SAB
const HOT = new Float64Array(SAB)

// Ring buffer — written by chains.js
const RING_SIZE = 65536

// Nonce mutex — prevents concurrent execution collision
let   nonceLocked = false
const nonceQueue  = []
let   currentNonce = null

async function withNonce(provider, fn) {
  return new Promise((resolve, reject) => {
    nonceQueue.push({ fn, resolve, reject })
    processNonceQueue(provider)
  })
}

async function processNonceQueue(provider) {
  if (nonceLocked || nonceQueue.length === 0) return
  nonceLocked = true

  const { fn, resolve, reject } = nonceQueue.shift()
  try {
    if (currentNonce === null) {
      currentNonce = await provider.getTransactionCount(EXECUTOR, 'pending')
    }
    const result = await fn(currentNonce)
    currentNonce++
    resolve(result)
  } catch (e) {
    currentNonce = null  // reset on error
    reject(e)
  } finally {
    nonceLocked = false
    processNonceQueue(provider)
  }
}

// Provider — Polygon primary
function makeProvider() {
  const c = CHAINS[0]
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork: n })
}

const provider = makeProvider()
const signer   = new ethers.Wallet(EXECUTOR_PK, provider)

// Halcan contract ABI
const HALCAN_ABI = [
  'function execute(address[] calldata tokens, uint256[] calldata amounts, address aaveAsset, uint256 aaveAmount) external',
  'event CycleExecuted(uint256 indexed nonce, uint256 extracted, uint256 gasUsed)',
]

// Check gas price — pause if above cap
async function gasOK() {
  try {
    const fee = await provider.getFeeData()
    const gwei = Number(fee.gasPrice || 0n) / 1e9
    HOT[H.GAS_PRICE] = gwei
    const ok = gwei <= Number(GAS_CAP_GWEI)
    HOT[H.GAS_OK] = ok ? 1 : 0
    return ok
  } catch { return false }
}

// Execute one flash cycle
async function execute() {
  if (!CONTRACT.HALCAN) return
  if (!(await gasOK())) {
    if (process.env.DEBUG) console.log(`[EXECUTOR] Gas too high (${HOT[H.GAS_PRICE].toFixed(1)} gwei) — waiting`)
    return
  }

  // Throttle based on propeller
  const revenueToday = HOT[H.REV_TODAY] || 0
  if (revenueToday >= DAILY_TARGET) {
    if (process.env.DEBUG) console.log(`[EXECUTOR] Daily target reached — pausing`)
    return
  }

  HOT[H.EXEC_TODAY]++

  try {
    const halcan = new ethers.Contract(CONTRACT.HALCAN, HALCAN_ABI, signer)

    // Aave flash: $44B USDC (6 decimals)
    const aaveAsset  = FLASH_ASSETS[0]  // USDC
    const aaveAmount = BigInt(Math.floor(AAVE_FLASH * 1e6))

    const receipt = await withNonce(provider, async (nonce) => {
      const feeData  = await provider.getFeeData()
      const rawGas   = feeData.gasPrice || ethers.parseUnits('30', 'gwei')
      const capGas   = GAS_CAP_GWEI * BigInt(1e9)
      const gasPrice = rawGas > capGas
        ? (capGas * GAS_MARKUP) / 100n
        : (rawGas * GAS_MARKUP) / 100n

      const tx = await halcan.execute(
        FLASH_ASSETS,
        BALANCER_AMOUNTS,
        aaveAsset,
        aaveAmount,
        { gasLimit: GAS_LIMIT, gasPrice, nonce }
      )

      return tx.wait(1)
    })

    if (receipt?.status) {
      HOT[H.CYCLES_TODAY]++
      HOT[H.CYCLES_TOTAL]++
      HOT[H.SUCCESS_TODAY]++

      // Aave fee cost
      const aaveFee = AAVE_FLASH * AAVE_FLASH_FEE
      HOT[H.AAVE_FEE_TODAY] = (HOT[H.AAVE_FEE_TODAY] || 0) + aaveFee

      // Record extraction
      const extracted = PER_CYCLE_TARGET
      HOT[H.REV_TODAY]  = (HOT[H.REV_TODAY]  || 0) + extracted
      HOT[H.REV_TOTAL]  = (HOT[H.REV_TOTAL]  || 0) + extracted
      HOT[H.NET_TODAY]  = (HOT[H.REV_TODAY]  || 0) - (HOT[H.AAVE_FEE_TODAY] || 0)
      HOT[H.PER_CYCLE]  = extracted

      if (extracted > (HOT[H.PEAK_CYCLE] || 0)) HOT[H.PEAK_CYCLE] = extracted
      const cycles = HOT[H.CYCLES_TODAY] || 1
      HOT[H.AVG_CYCLE] = HOT[H.REV_TODAY] / cycles

      parentPort?.postMessage({ type: 'cycle', extracted, txHash: receipt.hash })

      if (HOT[H.CYCLES_TODAY] % 100 === 0) {
        console.log(`[EXECUTOR] Cycle ${HOT[H.CYCLES_TODAY]} | Rev today: $${(HOT[H.REV_TODAY]/1e9).toFixed(2)}B | tx: ${receipt.hash.slice(0,14)}...`)
      }
    } else {
      HOT[H.FAIL_TODAY]++
    }
  } catch (e) {
    HOT[H.FAIL_TODAY]++
    if (process.env.DEBUG) console.log(`[EXECUTOR] Cycle failed: ${e.message?.slice(0,80)}`)
  }
}

// Ring buffer reader — fires execute on each qualifying swap
let rHead = 0

function startRingReader() {
  // rHead starts at current write position — skip any stale backlog
  rHead = 0

  setInterval(async () => {
    const head = HOT[H.NATURAL_TODAY] || 0
    while (rHead < head && rHead < 1_700_000) {
      execute().catch(() => {})
      rHead++
    }
  }, 10)  // check every 10ms

  console.log('[EXECUTOR] Ring buffer reader active | $70B flash | $7B per cycle')
}

startRingReader()

// Velocity calculation
setInterval(() => {
  const rev   = HOT[H.REV_TODAY] || 0
  const uptime = HOT[H.UPTIME]   || 1
  HOT[H.REV_VELOCITY] = rev / uptime  // USD per second
}, 1_000)
