// src/chains.js — Halcan chain monitor (Worker)
// Raw eth_subscribe on Polygon + Arbitrum
// Detects qualifying swaps and writes to ring buffer
// No eth_getFilterChanges — raw WebSocket only
// staticNetwork:true — no localhost:8545

import { workerData, parentPort } from 'worker_threads'
import { createRequire }          from 'module'
import { ethers }                 from 'ethers'
import { CHAINS, H }              from './config.js'

const _req = createRequire(import.meta.url)
const ws   = _req('ws')

const SAB = workerData.SAB
const HOT = new Float64Array(SAB)
const RING_SIZE = 65536

// Ring buffer — each slot: [flashSize, estimatedProfit]
const RING_FS = new Float64Array(new SharedArrayBuffer(RING_SIZE * 8))
const RING_EP = new Float64Array(new SharedArrayBuffer(RING_SIZE * 8))

let writeHead = 0

function writeRing(flashSize, estimatedProfit) {
  const slot = writeHead % RING_SIZE
  RING_FS[slot] = flashSize
  RING_EP[slot] = estimatedProfit
  writeHead++
  parentPort.postMessage({ type: 'swap', slot, flashSize, estimatedProfit, head: writeHead })
}

// Uniswap V3 Swap event signature
const SWAP_SIG = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'

// Min swap size to qualify — $100K equivalent
const MIN_SWAP_USD = 100_000

function connectChain(chain) {
  let socket, reconnectTimer

  const connect = () => {
    try { socket?.terminate() } catch {}

    socket = new ws(chain.ws)

    socket.on('open', () => {
      HOT[chain.id === 137 ? H.CHAIN_POLYGON : H.CHAIN_ARB] = 1

      // Subscribe to all Uniswap V3 swap events
      socket.send(JSON.stringify({
        jsonrpc: '2.0', id: chain.id, method: 'eth_subscribe',
        params: ['logs', { topics: [SWAP_SIG] }],
      }))

      console.log(`[CHAINS] ${chain.name} connected`)
      HOT[H.CHAIN_COUNT] = (HOT[H.CHAIN_COUNT] || 0) + 1
    })

    socket.on('message', raw => {
      try {
        const msg = JSON.parse(raw)
        if (!msg?.params?.result) return
        const log = msg.params.result

        // Decode swap: amount0, amount1, sqrtPriceX96, liquidity, tick
        if (log.data?.length >= 10) {
          const data = log.data.replace('0x', '')
          // amount0 and amount1 are first two 32-byte words
          const amt0 = BigInt('0x' + data.slice(0, 64))
          const amt1 = BigInt('0x' + data.slice(64, 128))

          // Estimate USD value (rough — USDC amounts are 6 decimals)
          const usdEst = Number(amt0 > amt1 ? amt0 : amt1) / 1e6

          if (usdEst >= MIN_SWAP_USD) {
            // Qualifying swap detected — write to ring buffer
            writeRing(70e9, usdEst * 0.003)  // flash=$70B, profit=0.3% of swap
            HOT[H.NATURAL_TODAY]++
          }
        }
      } catch {}
    })

    socket.on('close', () => {
      HOT[chain.id === 137 ? H.CHAIN_POLYGON : H.CHAIN_ARB] = 0
      HOT[H.CHAIN_COUNT] = Math.max(0, (HOT[H.CHAIN_COUNT] || 1) - 1)
      reconnectTimer = setTimeout(connect, 3_000)
    })

    socket.on('error', () => {
      reconnectTimer = setTimeout(connect, 5_000)
    })
  }

  connect()
}

// Connect all chains
for (const chain of CHAINS) connectChain(chain)

// Export ring buffer for executor
export { RING_FS, RING_EP }
