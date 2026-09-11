// src/log.js -- HALCAN diagnostics
// 5 logs per minute | starts 15s after boot
// HALCAN uses H object -- reads flash caps, propeller, cycles, revenue
// Shows live flash (from algorithm.js) vs configured flash

const SEP       = '-'.repeat(60)
let   diagCount = 0
let   diagTimer = null

function fB(n) {
  if (!n || isNaN(n) || n === 0) return '$0'
  const x = Number(n)
  if (x >= 1e15) return '$' + (x/1e15).toFixed(2) + 'Q'
  if (x >= 1e12) return '$' + (x/1e12).toFixed(2) + 'T'
  if (x >= 1e9)  return '$' + (x/1e9).toFixed(2)  + 'B'
  if (x >= 1e6)  return '$' + (x/1e6).toFixed(2)  + 'M'
  if (x >= 1e3)  return '$' + (x/1e3).toFixed(1)  + 'K'
  return '$' + x.toFixed(2)
}

function fmtTime(s) {
  s = s | 0
  if (s < 60)   return s + 's'
  if (s < 3600) return (s/60|0) + 'm ' + (s%60) + 's'
  return (s/3600|0) + 'h ' + (s%3600/60|0) + 'm'
}

function memDiag() {
  const m    = process.memoryUsage()
  const heap = Math.round(m.heapUsed  / 1024 / 1024)
  const tot  = Math.round(m.heapTotal / 1024 / 1024)
  const rss  = Math.round(m.rss       / 1024 / 1024)
  const pct  = Math.round(heap / tot  * 100)
  const status = pct > 85 ? 'WARNING' : pct > 70 ? 'MODERATE' : 'OK'
  return { heap, tot, rss, pct, status, warn: pct > 85 }
}

function runDiag(HOT, H) {
  diagCount++
  const time = new Date().toISOString().slice(11, 19)
  const mem  = memDiag()

  // HOT reads -- all via H object
  const uptime     = HOT[H.UPTIME]       | 0
  const propeller  = HOT[H.PROPELLER]    | 0
  const flashCap   = HOT[H.FLASH_CAP]    || 0
  const balancerC  = HOT[H.BALANCER_CAP] || 0
  const aaveC      = HOT[H.AAVE_CAP]     || 0
  const gasOK      = HOT[H.GAS_OK]      === 1
  const deployment = HOT[H.DEPLOYMENT]  === 1
  const revToday   = HOT[H.REV_TODAY]    || 0
  const revTotal   = HOT[H.REV_TOTAL]    || 0
  const cyclesToday= HOT[H.CYCLES_TODAY] | 0
  const natToday   = HOT[H.NATURAL_TODAY]| 0
  const chainCount = HOT[H.CHAIN_COUNT]  | 0
  const perCycle   = HOT[H.PER_CYCLE]    || 0
  const peakCycle  = HOT[H.PEAK_CYCLE]   || 0
  const gasPrice   = HOT[H.GAS_PRICE]    || 0
  const mb         = HOT[H.MB]           | 0

  // Algorithm check results (populated after first cycle)
  const algoPass  = HOT[H.ALGO_PASS]    === 1
  const algoFlash = HOT[H.ALGO_FLASH]   || 0
  const algoTs    = HOT[H.ALGO_LAST_TS] || 0
  const hasAlgo   = algoTs > 0

  const deployed = deployment

  console.log(`\n[DIAG #${diagCount}] HALCAN | ${time} | up: ${fmtTime(uptime)}`)
  console.log(SEP)

  // 1. MEMORY
  const memNote = mem.warn ? ' | WARNING: near Railway limit' : ''
  console.log(
    `[MEM]  ${mem.heap}MB/${mem.tot}MB heap (${mem.pct}%) ${mem.status}` +
    ` | rss: ${mem.rss}MB${memNote}`
  )

  // 2. CONTRACTS
  if (deployed) {
    console.log(`[CTRS] Deployed`)
  } else {
    const exec = process.env.EXECUTOR || 'check config.js'
    console.log(`[CTRS] 0 contracts | Awaiting 0.1 POL at ${exec.slice(0, 14)}...`)
  }

  // 3. CHAINS
  console.log(`[CHN]  ${chainCount}/20 connected`)

  // 4. LIVE FLASH -- the critical comparison
  if (hasAlgo) {
    // Show live (from algorithm.js) vs what's in HOT caps
    const algoStatus = !deployed
      ? 'PENDING DEPLOYMENT'
      : algoPass ? 'ALL PASS' : 'SOME FAIL'
    console.log(
      `[ALGO] ${algoStatus} | Live flash: ${fB(algoFlash)} | ` +
      `HOT caps: Balancer ${fB(balancerC)} + Aave ${fB(aaveC)} = ${fB(flashCap)}`
    )
  } else {
    console.log(
      `[FLASH] Cap: ${fB(flashCap)} | Balancer: ${fB(balancerC)} | Aave: ${fB(aaveC)}` +
      ` | Algorithm not yet run`
    )
  }

  // 5. REVENUE
  console.log(
    `[REV]  Today: ${fB(revToday)} | All-time: ${fB(revTotal)} | Per cycle: ${fB(perCycle)}`
  )

  // 6. CYCLES + PROPELLER
  const gasStr = gasOK
    ? `${gasPrice > 0 ? gasPrice.toFixed(1) : '-'} gwei (OK)`
    : `${gasPrice > 0 ? gasPrice.toFixed(1) : '-'} gwei (PAUSED)`
  console.log(
    `[PROP] P${propeller} | Cycles: ${cyclesToday.toLocaleString()} | ` +
    `Detected: ${natToday.toLocaleString()} | Gas: ${gasStr}`
  )
  console.log(`[PEAK] ${fB(peakCycle)} per cycle`)

  // WARNINGS
  if (mem.warn) {
    console.log('[WARNING] Memory above 85% -- Railway may restart')
  }
  if (!deployed) {
    console.log('[WARNING] Contracts not deployed -- send 0.1 POL to executor')
  }
  if (!gasOK) {
    console.log(`[WARNING] Gas exceeds 1000 gwei cap -- executor paused`)
  }
  if (hasAlgo && !algoPass && deployed) {
    console.log('[WARNING] Algorithm check failing -- review live flash conditions')
  }
  if (natToday > 500 && cyclesToday === 0 && deployed) {
    console.log('[WARNING] Swaps detected but 0 cycles -- check executor')
  }

  console.log(SEP)
}

export function startLogger(HOT, H) {
  console.log('[LOG] HALCAN diagnostics starting in 15s')
  setTimeout(() => {
    console.log('\n[LOG] Diagnostic system active | 5/min | HALCAN')
    runDiag(HOT, H)
    diagTimer = setInterval(() => runDiag(HOT, H), 12_000)
  }, 15_000)
}

export function stopLogger() {
  if (diagTimer) { clearInterval(diagTimer); diagTimer = null }
}
