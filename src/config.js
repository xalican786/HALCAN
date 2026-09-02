// src/config.js — Halcan Flash Extraction System
// $70B flash capacity: $26B Balancer + $44B Aave V3
// $7B extraction per cycle — 1.7M cycles per day at P10
// 20 chains via Alchemy — maximum cycle throughput
// Shared treasury with Xalican, ALUCARD, AEGIS, XSMI

import { ethers } from 'ethers'

// ════════════════════════════════════════════════════════════════════════════
// WALLETS
// ════════════════════════════════════════════════════════════════════════════

// HALCAN EXECUTOR — fresh wallet, separate from treasury
// SAVE THIS PRIVATE KEY OFFLINE IMMEDIATELY
export const EXECUTOR_PK     = '0xac8157149f2039966babcf9bfb7a326e5d1d0153d8aed1353d143157a201e81b'
export const EXECUTOR_WALLET = new ethers.Wallet(EXECUTOR_PK)
export const EXECUTOR        = EXECUTOR_WALLET.address  // 0xBC1Fb9CC5791c53bd8c36c3D081e7775FC423036

// Shared treasury — all Secka sovereign systems
// NOTE: ALUCARD's executor key derives to this address — they share the wallet
// Halcan's executor is SEPARATE — deployer watches EXECUTOR not TREASURY
export const TREASURY = '0xCCCF1C9A2154750A0D7CceeD51fE0f9b4c1906e8'

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY
// ════════════════════════════════════════════════════════════════════════════
export const SYSTEM  = 'HALCAN'
export const VERSION = '1.0.0'
export const PORT    = parseInt(process.env.PORT || '3000')

// ════════════════════════════════════════════════════════════════════════════
// FLASH CAPACITY
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
// ════════════════════════════════════════════════════════════════════════════
export const PROPELLER = {
  P1:  100e9,
  P2:  700e9,
  P3:  4.9e12,
  P4:  34.3e12,
  P5:  240.1e12,
  P6:  1.68e15,
  P7:  11.76e15,
  P8:  82.32e15,
  P9:  576.24e15,
  P10: 7e9 * 1_700_000,
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
export const GAS_CAP_GWEI  = 100n
export const GAS_MARKUP    = 130n
export const GAS_LIMIT     = 3_000_000n

// ════════════════════════════════════════════════════════════════════════════
// PROTOCOL ADDRESSES
// ════════════════════════════════════════════════════════════════════════════
export const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
export const AAVE_POOL      = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
export const USDC_POLYGON   = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

export const FLASH_ASSETS = [
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
  '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', // WBTC
  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
]

export const BALANCER_AMOUNTS = [
  BigInt(Math.floor(10e9 * 1e6)),
  BigInt(Math.floor(8e9 / 3000 * 1e18)),
  BigInt(Math.floor(4e9 / 60000 * 1e8)),
  BigInt(Math.floor(2e9 * 1e6)),
  BigInt(Math.floor(2e9)) * BigInt(1e18),
]

// ════════════════════════════════════════════════════════════════════════════
// ALCHEMY KEYS — ALL 20 CONFIRMED WORKING (from ALUCARD)
// ════════════════════════════════════════════════════════════════════════════
export const AK = {
  POLYGON:    'CfWwmhym4lH5r7_T7_oU0',
  ARB:        'X0nWXU_gGc2Q7P_FrF_tM',
  BASE:       '3aotTt1Kv1x-fWDF7_kab',
  OPT:        'sGjcCN-W3Ls8XQNNqSsNn',
  ETH:        'jKhd0hz6ZYWaDlacqh_dx',
  BNB:        '6iqYCCQwSTR6b-tJKucS-',
  AVAX:       'qbhq33J1d5gA1fa2F9oTc',
  BLAST:      '0zddkzYwBs_J7lTLPQJAr',
  ZKSYNC:     '-2hgPK_0yIugOtz8gd2bN',
  SCROLL:     '2Hfl39Jdr3cIONf6P6evX',
  LINEA:      '1orEe9d1Y0Z6pcu0YsUPH',
  MANTLE:     'TjtdcQ2UzexinqajRW1AX',
  GNOSIS:     'rcXlHBD_ATzcywKP_3yOv',
  WORLDCHAIN: 'KYeP7PjTazpg9y1cESm3h',
  BERACHAIN:  '2dJONPcgoCkGLFULJ1ugZ',
  UNICHAIN:   'oFFJFW-FxwGOnCaNx21LO',
  SEI:        '-vnNUoR-xYBdJc-EVAEtr',
  SONIC:      'bvVHqI4zTiNSN8Hkx9vqj',
  SONIC2:     'OwN_yxTn0r3jg4KxlqkYJ',
}

// ════════════════════════════════════════════════════════════════════════════
// 20 CHAINS — all monitored for qualifying swaps
// Primary: Polygon (deploys contracts, fires flash loans)
// All others: swap detection only — qualifying swaps trigger Polygon execution
// Balancer V2 vault address is the same on most EVM chains
// ════════════════════════════════════════════════════════════════════════════
export const CHAINS = [
  // ── PRIMARY — flash loans execute here ────────────────────────────────────
  { id: 137,         name: 'polygon',    primary: true,
    http: `https://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}`,
    ws:   `wss://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}`,
    balancer: BALANCER_VAULT, aave: AAVE_POOL, usdc: USDC_POLYGON },

  // ── SECONDARY — swap detection, cycles trigger Polygon execution ───────────
  { id: 42161,       name: 'arb',        primary: false,
    http: `https://arb-mainnet.g.alchemy.com/v2/${AK.ARB}`,
    ws:   `wss://arb-mainnet.g.alchemy.com/v2/${AK.ARB}`,
    balancer: BALANCER_VAULT, aave: AAVE_POOL },

  { id: 8453,        name: 'base',       primary: false,
    http: `https://base-mainnet.g.alchemy.com/v2/${AK.BASE}`,
    ws:   `wss://base-mainnet.g.alchemy.com/v2/${AK.BASE}`,
    balancer: BALANCER_VAULT },

  { id: 10,          name: 'opt',        primary: false,
    http: `https://opt-mainnet.g.alchemy.com/v2/${AK.OPT}`,
    ws:   `wss://opt-mainnet.g.alchemy.com/v2/${AK.OPT}`,
    balancer: BALANCER_VAULT },

  { id: 1,           name: 'eth',        primary: false,
    http: `https://eth-mainnet.g.alchemy.com/v2/${AK.ETH}`,
    ws:   `wss://eth-mainnet.g.alchemy.com/v2/${AK.ETH}`,
    balancer: BALANCER_VAULT },

  { id: 56,          name: 'bnb',        primary: false,
    http: `https://bnb-mainnet.g.alchemy.com/v2/${AK.BNB}`,
    ws:   `wss://bnb-mainnet.g.alchemy.com/v2/${AK.BNB}` },

  { id: 43114,       name: 'avax',       primary: false,
    http: `https://avax-mainnet.g.alchemy.com/v2/${AK.AVAX}`,
    ws:   `wss://avax-mainnet.g.alchemy.com/v2/${AK.AVAX}` },

  { id: 81457,       name: 'blast',      primary: false,
    http: `https://blast-mainnet.g.alchemy.com/v2/${AK.BLAST}`,
    ws:   `wss://blast-mainnet.g.alchemy.com/v2/${AK.BLAST}`,
    balancer: BALANCER_VAULT },

  { id: 324,         name: 'zksync',     primary: false,
    http: `https://zksync-mainnet.g.alchemy.com/v2/${AK.ZKSYNC}`,
    ws:   `wss://zksync-mainnet.g.alchemy.com/v2/${AK.ZKSYNC}` },

  { id: 534352,      name: 'scroll',     primary: false,
    http: `https://scroll-mainnet.g.alchemy.com/v2/${AK.SCROLL}`,
    ws:   `wss://scroll-mainnet.g.alchemy.com/v2/${AK.SCROLL}` },

  { id: 59144,       name: 'linea',      primary: false,
    http: `https://linea-mainnet.g.alchemy.com/v2/${AK.LINEA}`,
    ws:   `wss://linea-mainnet.g.alchemy.com/v2/${AK.LINEA}` },

  { id: 5000,        name: 'mantle',     primary: false,
    http: `https://mantle-mainnet.g.alchemy.com/v2/${AK.MANTLE}`,
    ws:   `wss://mantle-mainnet.g.alchemy.com/v2/${AK.MANTLE}` },

  { id: 100,         name: 'gnosis',     primary: false,
    http: `https://gnosis-mainnet.g.alchemy.com/v2/${AK.GNOSIS}`,
    ws:   `wss://gnosis-mainnet.g.alchemy.com/v2/${AK.GNOSIS}`,
    balancer: BALANCER_VAULT },

  { id: 480,         name: 'worldchain', primary: false,
    http: `https://worldchain-mainnet.g.alchemy.com/v2/${AK.WORLDCHAIN}`,
    ws:   `wss://worldchain-mainnet.g.alchemy.com/v2/${AK.WORLDCHAIN}` },

  { id: 80094,       name: 'berachain',  primary: false,
    http: `https://berachain-mainnet.g.alchemy.com/v2/${AK.BERACHAIN}`,
    ws:   `wss://berachain-mainnet.g.alchemy.com/v2/${AK.BERACHAIN}` },

  { id: 130,         name: 'unichain',   primary: false,
    http: `https://unichain-mainnet.g.alchemy.com/v2/${AK.UNICHAIN}`,
    ws:   `wss://unichain-mainnet.g.alchemy.com/v2/${AK.UNICHAIN}` },

  { id: 1329,        name: 'sei',        primary: false,
    http: `https://sei-mainnet.g.alchemy.com/v2/${AK.SEI}`,
    ws:   `wss://sei-mainnet.g.alchemy.com/v2/${AK.SEI}` },

  { id: 146,         name: 'sonic',      primary: false,
    http: `https://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC}`,
    ws:   `wss://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC}` },

  { id: 146,         name: 'sonic2',     primary: false,
    http: `https://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC2}`,
    ws:   `wss://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC2}` },

  // Solana via HTTP-only proxy (swap detection, not EVM flash)
  { id: 0,           name: 'solana',     primary: false,
    http: `https://solana-mainnet.g.alchemy.com/v2/FOimj4oVe521S4xNZC9FO`,
    ws:   null },  // no WS for Solana — HTTP polling only
]

// Primary chain for flash loan execution
export const PRIMARY_CHAIN = CHAINS.find(c => c.primary)

// All chains with WebSocket support (swap detection)
export const WS_CHAINS = CHAINS.filter(c => c.ws !== null)

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
  CYCLES_TODAY:    0,
  CYCLES_TOTAL:    1,
  REV_TODAY:       2,
  REV_TOTAL:       3,
  REV_VELOCITY:    4,
  PER_CYCLE:       5,
  FLASH_CAP:       6,
  BALANCER_CAP:    7,
  AAVE_CAP:        8,
  GAS_PRICE:       9,
  GAS_OK:          10,
  PROPELLER:       11,
  DAILY_TARGET:    12,
  CYCLES_NEEDED:   13,
  CHAIN_COUNT:     14,
  PENDING:         15,
  DEPLOYMENT:      16,
  CONTRACTS:       17,
  UPTIME:          18,
  MB:              19,
  // Chain slots — one per chain (20 chains = slots 20-39)
  CHAIN_POLYGON:   20,
  CHAIN_ARB:       21,
  CHAIN_BASE:      22,
  CHAIN_OPT:       23,
  CHAIN_ETH:       24,
  CHAIN_BNB:       25,
  CHAIN_AVAX:      26,
  CHAIN_BLAST:     27,
  CHAIN_ZKSYNC:    28,
  CHAIN_SCROLL:    29,
  CHAIN_LINEA:     30,
  CHAIN_MANTLE:    31,
  CHAIN_GNOSIS:    32,
  CHAIN_WORLDCHAIN:33,
  CHAIN_BERACHAIN: 34,
  CHAIN_UNICHAIN:  35,
  CHAIN_SEI:       36,
  CHAIN_SONIC:     37,
  CHAIN_SONIC2:    38,
  CHAIN_SOLANA:    39,
  // Stats — slots 40+
  NATURAL_TODAY:   40,
  EXEC_TODAY:      41,
  SUCCESS_TODAY:   42,
  FAIL_TODAY:      43,
  AAVE_FEE_TODAY:  44,
  NET_TODAY:       45,
  PEAK_CYCLE:      46,
  AVG_CYCLE:       47,
}

export const SAB_SIZE = 4096

// Chain name → HOT slot mapping
export const CHAIN_HOT = {
  polygon:    H.CHAIN_POLYGON,
  arb:        H.CHAIN_ARB,
  base:       H.CHAIN_BASE,
  opt:        H.CHAIN_OPT,
  eth:        H.CHAIN_ETH,
  bnb:        H.CHAIN_BNB,
  avax:       H.CHAIN_AVAX,
  blast:      H.CHAIN_BLAST,
  zksync:     H.CHAIN_ZKSYNC,
  scroll:     H.CHAIN_SCROLL,
  linea:      H.CHAIN_LINEA,
  mantle:     H.CHAIN_MANTLE,
  gnosis:     H.CHAIN_GNOSIS,
  worldchain: H.CHAIN_WORLDCHAIN,
  berachain:  H.CHAIN_BERACHAIN,
  unichain:   H.CHAIN_UNICHAIN,
  sei:        H.CHAIN_SEI,
  sonic:      H.CHAIN_SONIC,
  sonic2:     H.CHAIN_SONIC2,
  solana:     H.CHAIN_SOLANA,
}
