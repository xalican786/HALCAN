// src/chains.js — Halcan chain monitor (Worker)
// Connects to all 20 chains via raw eth_subscribe WebSocket
// Detects qualifying swaps on all 19 EVM chains
// Writes to ring buffer — executor reads and fires flash loan on Polygon
// staticNetwork:true — no localhost:8545 ever
// Same pattern as Xalican chains.js — confirmed working for 19 chains

import { workerData, parentPort } from 'worker_threads'
import { createRequire }          from 'module'

const _req = createRequire(import.meta.url)
const ws   = _req('ws')

import { WS_CHAINS, CHAIN_HOT, H } from './config.js'

const SAB = workerData.SAB
const HOT = new Float64Array(SAB)

// Ring buffer — 65536 slots
const RING_SIZE = 65536
let   writeHead = 0

// Uniswap V3 Swap event topic
const SWAP_SIG = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'

// Min USD value to qualify — $50K
const MIN_SWAP_USD = 50_000

function writeRing(flashSize, estimatedProfit) {
  const slot = writeHead % RING_SIZE
  writeHead++
  parentPort.postMessage({ type: 'swap', slot, flashSize, estimatedProfit, head: writeHead })
  HOT[H.NATURAL_TODAY] = (HOT[H.NATURAL_TODAY] || 0) + 1
}

function connectChain(chain) {
  if (!chain.ws) return  // skip Solana (no WS)

  const chainHotSlot = CHAIN_HOT[chain.name]
  let   socket, reconnecting = false

  const connect = () => {
    if (reconnecting) return
    try { socket?.terminate() } catch {}

    try {
      socket = new ws(chain.ws, { handshakeTimeout: 10_000 })
    } catch { return }

    socket.on('open', () => {
      reconnecting = false
      if (chainHotSlot !== undefined) HOT[chainHotSlot] = 1
      HOT[H.CHAIN_COUNT] = Object.values(CHAIN_HOT)
        .filter(slot => HOT[slot] === 1).length

      // Subscribe to Uniswap V3 swap events
      socket.send(JSON.stringify({
        jsonrpc: '2.0', id: chain.id,
        method: 'eth_subscribe',
        params: ['logs', { topics: [SWAP_SIG] }],
      }))

      console.log(`[CHAINS] ${chain.name} connected`)
    })

    socket.on('message', raw => {
      try {
        const msg = JSON.parse(raw)
        if (!msg?.params?.result) return
        const log = msg.params.result
        if (!log?.data || log.data.length < 10) return

        // Decode swap amounts from log data
        const data = log.data.replace('0x', '')
        if (data.length < 128) return

        // amount0 and amount1 — first two 32-byte words
        const amt0Raw = data.slice(0, 64)
        const amt1Raw = data.slice(64, 128)

        // Handle signed integers (two's complement for negative amounts)
        const isNeg0 = amt0Raw[0] >= '8'
        const isNeg1 = amt1Raw[0] >= '8'
        const amt0 = isNeg0
          ? Number((BigInt('0x' + amt0Raw) - BigInt('0x' + 'f'.repeat(64)) - 1n) * -1n)
          : Number(BigInt('0x' + amt0Raw))
        const amt1 = isNeg1
          ? Number((BigInt('0x' + amt1Raw) - BigInt('0x' + 'f'.repeat(64)) - 1n) * -1n)
          : Number(BigInt('0x' + amt1Raw))

        // Estimate USD — assume USDC amounts (6 decimals) or ETH (18 decimals)
        const usdEst = Math.max(
          amt0 / 1e6,    // USDC
          amt1 / 1e6,
          amt0 / 1e18 * 3000,  // ETH
          amt1 / 1e18 * 3000,
        )

        if (usdEst >= MIN_SWAP_USD && usdEst < 1e15) {
          // Qualifying swap detected on any chain — triggers Polygon flash execution
          writeRing(70e9, 7e9)
        }
      } catch {}
    })

    socket.on('close', () => {
      if (chainHotSlot !== undefined) HOT[chainHotSlot] = 0
      HOT[H.CHAIN_COUNT] = Math.max(0, (HOT[H.CHAIN_COUNT] || 1) - 1)
      reconnecting = true
      setTimeout(() => { reconnecting = false; connect() }, 5_000)
    })

    socket.on('error', () => {
      reconnecting = true
      setTimeout(() => { reconnecting = false; connect() }, 8_000)
    })
  }

  // Stagger connections — avoid hammering Alchemy simultaneously
  const delay = WS_CHAINS.indexOf(chain) * 300
  setTimeout(connect, delay)
}

// Connect all 19 WS chains
for (const chain of WS_CHAINS) connectChain(chain)

console.log(`[CHAINS] Connecting ${WS_CHAINS.length} chains | Polygon primary | swap detection active`)
