// src/config.js — Halcan Flash Extraction System
// $70B flash capacity: $26B Balancer + $44B Aave V3
// $7B extraction per cycle — 1.7M cycles per day at P10
// Shared treasury with Xalican, ALUCARD, AEGIS, XSMI

import { ethers } from 'ethers'

// ════════════════════════════════════════════════════════════════════════════
// WALLETS
// ════════════════════════════════════════════════════════════════════════════

// ALUCARD executor — reused for Halcan (same EVM key works all chains)
export const EXECUTOR_PK     = '0xd2ff9db96792f874be902695d77df5a1f9326841d1b7ba62c96bdf4c85a3ce74'
export const EXECUTOR_WALLET = new ethers.Wallet(EXECUTOR_PK)
export const EXECUTOR        = EXECUTOR_WALLET.address  // 0xEc92EF0C897b48A3525Df011D08011c5eB2D6D39

// Shared treasury — all Secka sovereign systems
export const TREASURY = '0xCCCF1C9A2154750A0D7CceeD51fE0f9b4c1906e8'

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY
// ════════════════════════════════════════════════════════════════════════════
export const SYSTEM  = 'HALCAN'
export const VERSION = '1.0.0'
export const PORT    = parseInt(process.env.PORT || '3000')

// ════════════════════════════════════════════════════════════════════════════
// FLASH CAPACITY
// $26B Balancer (zero fee) + $44B Aave V3 (0.05% fee)
// Combined: $70B per cycle
// Extraction: 10% of principal = $7B per cycle
// ════════════════════════════════════════════════════════════════════════════
export const BALANCER_FLASH   = 26e9   // $26B
export const AAVE_FLASH       = 44e9   // $44B
export const TOTAL_FLASH      = 70e9   // $70B combined
export const EXTRACTION_RATE  = 0.10   // 10% of principal
export const PER_CYCLE_TARGET = 7e9    // $7B per cycle
export const CYCLES_PER_DAY   = 1_700_000
export const AAVE_FLASH_FEE   = 0.0005 // 0.05%

// ════════════════════════════════════════════════════════════════════════════
// PROPELLER — P1 to P10
// P1:  $100B/day  (~15 cycles/day)
// P10: $11.9Q/day (1.7M cycles/day — full throttle)
// Each level ×7
// ════════════════════════════════════════════════════════════════════════════
export const PROPELLER = {
  P1:  100e9,             // $100B
  P2:  700e9,             // $700B
  P3:  4.9e12,            // $4.9T
  P4:  34.3e12,           // $34.3T
  P5:  240.1e12,          // $240T
  P6:  1.68e15,           // $1.68Q
  P7:  11.76e15,          // $11.76Q
  P8:  82.32e15,          // $82.32Q
  P9:  576.24e15,         // $576Q
  P10: 7e9 * 1_700_000,   // $11.9Q — full 1.7M cycles
}

export let ACTIVE_PROPELLER = 'P1'
export let DAILY_TARGET     = PROPELLER.P1
export function setPropeller(level) {
  if (!PROPELLER[level]) return false
  ACTIVE_PROPELLER = level
  DAILY_TARGET     = PROPELLER[level]
  return true
}

// ════════════════════════════════════════════════════════════════════════════
// GAS CONTROLS
// ════════════════════════════════════════════════════════════════════════════
export const GAS_CAP_GWEI  = 100n   // pause if gas exceeds this
export const GAS_MARKUP    = 130n   // 130% of base gas price
export const GAS_LIMIT     = 3_000_000n

// ════════════════════════════════════════════════════════════════════════════
// PROTOCOL ADDRESSES — POLYGON PRIMARY
// ════════════════════════════════════════════════════════════════════════════
export const BALANCER_VAULT   = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
export const AAVE_POOL        = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
export const AAVE_POOL_ARB    = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
export const UNISWAP_FACTORY  = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
export const USDC_POLYGON     = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
export const USDC_ARB         = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

// Top assets for flash borrowing (Balancer + Aave deepest pools)
export const FLASH_ASSETS = [
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
  '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', // WBTC
  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
]

// Flash amounts per asset (Balancer allocation — sums to $26B)
export const BALANCER_AMOUNTS = [
  BigInt(Math.floor(10e9 * 1e6)),  // $10B USDC (6 decimals)
  BigInt(Math.floor(8e9 * 1e18 / 3000)),  // $8B WETH
  BigInt(Math.floor(4e9 * 1e8 / 60000)), // $4B WBTC
  BigInt(Math.floor(2e9 * 1e6)),   // $2B USDT
  BigInt(Math.floor(2e9 * 1e18)),  // $2B DAI
]

// ════════════════════════════════════════════════════════════════════════════
// ALCHEMY KEYS — confirmed working from ALUCARD
// ════════════════════════════════════════════════════════════════════════════
export const AK = {
  POLYGON:  'CfWwmhym4lH5r7_T7_oU0',
  ARB:      'X0nWXU_gGc2Q7P_FrF_tM',
  BASE:     '3aotTt1Kv1x-fWDF7_kab',
  OPT:      'sGjcCN-W3Ls8XQNNqSsNn',
  ETH:      'jKhd0hz6ZYWaDlacqh_dx',
  BNB:      '6iqYCCQwSTR6b-tJKucS-',
  BLAST:    '0zddkzYwBs_J7lTLPQJAr',
}

// Primary chains for Halcan — Polygon main, Arbitrum secondary
export const CHAINS = [
  {
    id:   137,
    name: 'polygon',
    http: `https://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}`,
    ws:   `wss://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}`,
    usdc: USDC_POLYGON,
    balancer: BALANCER_VAULT,
    aave: AAVE_POOL,
  },
  {
    id:   42161,
    name: 'arb',
    http: `https://arb-mainnet.g.alchemy.com/v2/${AK.ARB}`,
    ws:   `wss://arb-mainnet.g.alchemy.com/v2/${AK.ARB}`,
    usdc: USDC_ARB,
    balancer: BALANCER_VAULT,
    aave: AAVE_POOL_ARB,
  },
]

// ════════════════════════════════════════════════════════════════════════════
// DEPLOYED CONTRACT ADDRESSES — populated by deployer.js
// ════════════════════════════════════════════════════════════════════════════
export const CONTRACT = {
  HALCAN:           process.env.HALCAN           || '',
  HALCAN_FLASH:     process.env.HALCAN_FLASH     || '',
  HALCAN_VAULT:     process.env.HALCAN_VAULT     || '',
  HALCAN_SPLITTER:  process.env.HALCAN_SPLITTER  || '',
  HALCAN_REGISTRY:  process.env.HALCAN_REGISTRY  || '',
}

// ════════════════════════════════════════════════════════════════════════════
// HOT LAYOUT — SharedArrayBuffer slots
// ════════════════════════════════════════════════════════════════════════════
export const H = {
  CYCLES_TODAY:    0,   // cycles executed today
  CYCLES_TOTAL:    1,   // all-time cycles
  REV_TODAY:       2,   // revenue today (USD)
  REV_TOTAL:       3,   // all-time revenue (USD)
  REV_VELOCITY:    4,   // USD per second (live)
  PER_CYCLE:       5,   // last cycle revenue
  FLASH_CAP:       6,   // current flash capacity available ($)
  BALANCER_CAP:    7,   // Balancer available ($)
  AAVE_CAP:        8,   // Aave available ($)
  GAS_PRICE:       9,   // current gas price (gwei)
  GAS_OK:          10,  // 1 = gas acceptable, 0 = paused
  PROPELLER:       11,  // current propeller level (1-10)
  DAILY_TARGET:    12,  // daily target USD
  CYCLES_NEEDED:   13,  // cycles needed today to hit target
  CHAIN_COUNT:     14,  // connected chains
  PENDING:         15,  // pending executions
  DEPLOYMENT:      16,  // contracts deployed (0/1)
  CONTRACTS:       17,  // number of contracts deployed
  UPTIME:          18,  // seconds
  MB:              19,  // memory usage
  CHAIN_POLYGON:   20,  // polygon connected (0/1)
  CHAIN_ARB:       21,  // arb connected (0/1)
  NATURAL_TODAY:   22,  // qualifying swaps detected today
  EXEC_TODAY:      23,  // executions attempted today
  SUCCESS_TODAY:   24,  // successful executions today
  FAIL_TODAY:      25,  // failed executions today
  AAVE_FEE_TODAY:  26,  // Aave fees paid today
  NET_TODAY:       27,  // net revenue (after Aave fee)
  PEAK_CYCLE:      28,  // highest single cycle revenue
  AVG_CYCLE:       29,  // average cycle revenue
}

export const SAB_SIZE = 4096
