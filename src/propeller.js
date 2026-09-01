// src/propeller.js — Halcan propeller P1-P10
// P1: $100B/day (~15 cycles) → P10: $11.9Q/day (1.7M cycles)
// Each level ×7
// Governs execution rate — throttles cycles to hit daily target
// Dashboard control — operator sets level

import { H, PROPELLER, DAILY_TARGET, setPropeller, ACTIVE_PROPELLER, PER_CYCLE_TARGET, CYCLES_PER_DAY } from './config.js'

export function getCyclesNeeded(HOT) {
  const revenueToday = HOT[H.REV_TODAY] || 0
  const remaining    = Math.max(0, DAILY_TARGET - revenueToday)
  return Math.ceil(remaining / PER_CYCLE_TARGET)
}

export function getVelocity(HOT) {
  const uptime = HOT[H.UPTIME] || 1
  const rev    = HOT[H.REV_TODAY] || 0
  return {
    perSecond: rev / uptime,
    perMinute: rev / uptime * 60,
    perHour:   rev / uptime * 3600,
    perDay:    rev / uptime * 86400,
  }
}

export function getProgress(HOT) {
  const target  = DAILY_TARGET
  const actual  = HOT[H.REV_TODAY] || 0
  const pct     = target > 0 ? Math.min(100, actual / target * 100) : 0
  return { target, actual, pct, remaining: Math.max(0, target - actual) }
}

export function activatePropeller(level, HOT) {
  const ok = setPropeller(level)
  if (!ok) return false
  HOT[H.PROPELLER]    = parseInt(level.replace('P', ''))
  HOT[H.DAILY_TARGET] = PROPELLER[level]
  HOT[H.CYCLES_NEEDED]= Math.ceil(PROPELLER[level] / PER_CYCLE_TARGET)
  console.log(`[PROPELLER] ${level} | Target: $${fmtBig(PROPELLER[level])}/day | Cycles: ${HOT[H.CYCLES_NEEDED].toLocaleString()}`)
  return true
}

function fmtBig(n) {
  if (n >= 1e15) return (n/1e15).toFixed(2) + 'Q'
  if (n >= 1e12) return (n/1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return (n/1e9).toFixed(2)  + 'B'
  return n.toString()
}

export function getPropellerStats() {
  return Object.entries(PROPELLER).map(([level, target]) => ({
    level,
    target,
    targetDisplay: '$' + fmtBig(target) + '/day',
    cyclesNeeded:  Math.ceil(target / PER_CYCLE_TARGET),
    active:        level === ACTIVE_PROPELLER,
  }))
}

export function startPropeller(HOT) {
  HOT[H.PROPELLER]    = 1  // P1 default
  HOT[H.DAILY_TARGET] = PROPELLER.P1
  HOT[H.CYCLES_NEEDED]= Math.ceil(PROPELLER.P1 / PER_CYCLE_TARGET)
  console.log(`[PROPELLER] P1 active | $100B/day target | ${HOT[H.CYCLES_NEEDED]} cycles needed`)
}
