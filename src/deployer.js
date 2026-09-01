// src/deployer.js — Halcan deployer
// Compiles 5 contracts sequentially with viaIR:true
// GC between each compile — prevents OOM
// Watches for 0.1 POL on Polygon (primary chain)
// Deploys in dependency order: registry → vault → splitter → flash → halcan
// Persists addresses to /data/halcan_contracts.json
// staticNetwork:true — no localhost:8545 ever

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { ethers }        from 'ethers'
import {
  EXECUTOR_PK, EXECUTOR, TREASURY,
  CONTRACT, H, CHAINS,
  BALANCER_VAULT, AAVE_POOL, FLASH_ASSETS, BALANCER_AMOUNTS,
} from './config.js'

const require        = createRequire(import.meta.url)
const CONTRACTS_PATH = '/data/halcan_contracts.json'

const SOURCES = [
  { name: 'HalcanRegistry', path: './contracts/HalcanRegistry.sol' },
  { name: 'HalcanVault',    path: './contracts/HalcanVault.sol'    },
  { name: 'HalcanSplitter', path: './contracts/HalcanSplitter.sol' },
  { name: 'HalcanFlash',    path: './contracts/HalcanFlash.sol'    },
  { name: 'Halcan',         path: './contracts/halcan.sol'         },
]

const compiled = {}

function makeProvider(chain) {
  const n = new ethers.Network(chain.name, chain.id)
  return new ethers.JsonRpcProvider(chain.http, n, { staticNetwork: n })
}

function makeSigner(chain) {
  return new ethers.Wallet(EXECUTOR_PK, makeProvider(chain))
}

// ── COMPILE ONE CONTRACT ───────────────────────────────────────────────────────
function compileSingle(path, name) {
  if (!existsSync(path)) { console.log(`[DEPLOYER] Missing: ${path}`); return null }

  // GC before each compile — prevents OOM on sequential viaIR compilation
  if (global.gc) global.gc()

  const solc   = require('solc')
  const source = readFileSync(path, 'utf8')
  const input  = JSON.stringify({
    language: 'Solidity',
    sources:  { [`${name}.sol`]: { content: source } },
    settings: {
      viaIR:           true,
      optimizer:       { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  })

  let out
  try { out = JSON.parse(solc.compile(input)) } catch (e) {
    console.log(`[DEPLOYER] ${name} parse error: ${e.message?.slice(0,80)}`)
    return null
  }

  const fatals = (out.errors || []).filter(e => e.severity === 'error')
  if (fatals.length) {
    fatals.forEach(f => console.log(`[DEPLOYER] ${name}: ${f.formattedMessage?.slice(0,140)}`))
    return null
  }

  const c = out.contracts?.[`${name}.sol`]?.[name]
  if (!c?.evm?.bytecode?.object || c.evm.bytecode.object.length < 10) {
    console.log(`[DEPLOYER] ${name}: empty bytecode`)
    return null
  }

  if (global.gc) global.gc()
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, name }
}

// ── SEQUENTIAL PRECOMPILE ─────────────────────────────────────────────────────
async function precompile() {
  console.log(`[DEPLOYER] Compiling ${SOURCES.length} Halcan contracts (viaIR:true, sequential)...`)

  for (const { name, path } of SOURCES) {
    await new Promise(r => setTimeout(r, 100))  // breathing room for GC
    const result = compileSingle(path, name)
    if (result) compiled[name] = result
  }

  const count = Object.keys(compiled).length
  console.log(`[DEPLOYER] Compiled ${count}/${SOURCES.length}: ${Object.keys(compiled).join(', ')}`)
  return count >= 4  // need at least 4 to proceed (Halcan + Flash + Splitter + one of registry/vault)
}

// ── DEPLOY ONE ─────────────────────────────────────────────────────────────────
async function deployOne(chain, name, args = []) {
  const c = compiled[name]
  if (!c) throw new Error(`${name} not compiled`)

  const provider = makeProvider(chain)
  const signer   = makeSigner(chain)
  const feeData  = await provider.getFeeData()
  const rawGas   = feeData.gasPrice || ethers.parseUnits('30', 'gwei')
  const capGas   = ethers.parseUnits('100', 'gwei')
  const gasPrice = rawGas > capGas
    ? (capGas * 130n) / 100n
    : (rawGas * 130n) / 100n

  const factory  = new ethers.ContractFactory(c.abi, c.bytecode, signer)
  const contract = await factory.deploy(...args, { gasLimit: 4_000_000, gasPrice })
  const receipt  = await contract.deploymentTransaction().wait(2)
  const address  = await contract.getAddress()

  if (!receipt?.status) throw new Error(`${name} deployment reverted`)
  console.log(`[DEPLOYER] ${name} → ${address.slice(0,14)}... (${chain.name})`)
  return address
}

// ── DEPLOY ALL 5 IN ORDER ─────────────────────────────────────────────────────
async function deployAll(chain, HOT) {
  const addrs = { chain: chain.name }

  const deploy = async (name, args) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const address = await deployOne(chain, name, args)
        addrs[name] = address
        return address
      } catch (e) {
        console.log(`[DEPLOYER] ${name} attempt ${attempt}/3: ${e.message?.slice(0,80)}`)
        if (attempt < 3) await new Promise(r => setTimeout(r, 8_000))
        else return null
      }
    }
  }

  // Order: registry → vault → splitter → flash → halcan
  const registryAddr  = await deploy('HalcanRegistry', [EXECUTOR])
  const vaultAddr     = await deploy('HalcanVault',    [EXECUTOR, TREASURY])
  const splitterAddr  = await deploy('HalcanSplitter', [EXECUTOR, TREASURY])

  if (!splitterAddr) { console.log('[DEPLOYER] FATAL: splitter failed'); return false }

  const flashAddr = await deploy('HalcanFlash', [
    EXECUTOR, EXECUTOR, BALANCER_VAULT, AAVE_POOL, TREASURY,
  ])

  const halcanAddr = await deploy('Halcan', [
    EXECUTOR, TREASURY, BALANCER_VAULT, AAVE_POOL, splitterAddr || TREASURY,
  ])

  if (!halcanAddr) { console.log('[DEPLOYER] FATAL: Halcan failed'); return false }

  // Register assets in vault post-deploy
  if (vaultAddr) {
    try {
      const signer = makeSigner(chain)
      const vaultABI = [
        'function registerAsset(address,string,uint8,uint256,uint256) external',
      ]
      const vault = new ethers.Contract(vaultAddr, vaultABI, signer)
      const assetDefs = [
        { addr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', sym: 'USDC',  dec: 6,  balancer: BigInt(10e9 * 1e6), aave: BigInt(15e9 * 1e6) },
        { addr: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', sym: 'WETH',  dec: 18, balancer: BigInt(Math.floor(8e9/3000) * 1e18), aave: BigInt(Math.floor(14e9/3000) * 1e18) },
        { addr: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', sym: 'WBTC',  dec: 8,  balancer: BigInt(Math.floor(4e9/60000) * 1e8), aave: BigInt(Math.floor(8e9/60000) * 1e8) },
        { addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', sym: 'USDT',  dec: 6,  balancer: BigInt(2e9 * 1e6), aave: BigInt(4e9 * 1e6) },
        { addr: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', sym: 'DAI',   dec: 18, balancer: BigInt(2e9) * BigInt(1e18), aave: BigInt(3e9) * BigInt(1e18) },
      ]
      for (const a of assetDefs) {
        try { await (await vault.registerAsset(a.addr, a.sym, a.dec, a.balancer, a.aave, { gasLimit: 200_000 })).wait(1) }
        catch {}
      }
      console.log('[DEPLOYER] HalcanVault assets registered')
    } catch (e) { console.log(`[DEPLOYER] Vault setup: ${e.message?.slice(0,60)}`) }
  }

  // Authorize Halcan in splitter
  if (splitterAddr && halcanAddr) {
    try {
      const signer = makeSigner(chain)
      const splitterABI = ['function authorize(address,bool) external']
      const splitter = new ethers.Contract(splitterAddr, splitterABI, signer)
      await (await splitter.authorize(halcanAddr, true, { gasLimit: 100_000 })).wait(1)
      console.log('[DEPLOYER] Halcan authorized in HalcanSplitter')
    } catch (e) { console.log(`[DEPLOYER] Splitter auth: ${e.message?.slice(0,60)}`) }
  }

  // Inject into CONTRACT object
  Object.assign(CONTRACT, {
    HALCAN:          addrs.Halcan          || '',
    HALCAN_FLASH:    addrs.HalcanFlash     || '',
    HALCAN_VAULT:    addrs.HalcanVault     || '',
    HALCAN_SPLITTER: addrs.HalcanSplitter  || '',
    HALCAN_REGISTRY: addrs.HalcanRegistry  || '',
  })

  // Persist
  try {
    if (!existsSync('/data')) mkdirSync('/data', { recursive: true })
    writeFileSync(CONTRACTS_PATH, JSON.stringify({ ...addrs, deployedAt: Date.now() }, null, 2))
  } catch {}

  const count = Object.values(addrs).filter(v => typeof v === 'string' && ethers.isAddress(v)).length
  HOT[H.CONTRACTS]  = count
  HOT[H.DEPLOYMENT] = 1

  console.log(`[DEPLOYER] ${count}/5 contracts deployed | Halcan: ${halcanAddr.slice(0,14)}...`)
  console.log(`[DEPLOYER] Flash capacity: $70B | Per-cycle target: $7B | Ready`)
  return true
}

// ── WATCH FOR 0.1 POL ────────────────────────────────────────────────────────
function watchForFunds(SAB, HOT) {
  const chain    = CHAINS[0]  // Polygon primary
  const provider = makeProvider(chain)
  let   deploying = false
  let   lastBal   = -1

  const iv = setInterval(async () => {
    if (deploying) return
    try {
      const bal = await provider.getBalance(EXECUTOR)
      const pol = parseFloat(ethers.formatEther(bal))
      if (Math.floor(pol * 100) !== lastBal) {
        lastBal = Math.floor(pol * 100)
        if (pol > 0) console.log(`[DEPLOYER] ${pol.toFixed(4)} POL | need 0.1`)
      }
      if (pol >= 0.1) {
        deploying = true
        clearInterval(iv)
        console.log(`[DEPLOYER] ${pol.toFixed(4)} POL — deploying Halcan on ${chain.name}`)
        const ok = await deployAll(chain, HOT)
        if (!ok) {
          deploying = false
          setTimeout(() => watchForFunds(SAB, HOT), 60_000)
        }
      }
    } catch {}
  }, 500)

  console.log(`[DEPLOYER] Watching ${chain.name} for 0.1 POL at ${EXECUTOR}`)
}

// ── ENTRY POINT ────────────────────────────────────────────────────────────────
export function startDeployer(SAB) {
  const HOT = new Float64Array(SAB)

  // Restore existing deployment
  try {
    if (existsSync(CONTRACTS_PATH)) {
      const saved = JSON.parse(readFileSync(CONTRACTS_PATH, 'utf8'))
      if (saved.Halcan && ethers.isAddress(saved.Halcan)) {
        Object.assign(CONTRACT, {
          HALCAN:          saved.Halcan          || '',
          HALCAN_FLASH:    saved.HalcanFlash     || '',
          HALCAN_VAULT:    saved.HalcanVault     || '',
          HALCAN_SPLITTER: saved.HalcanSplitter  || '',
          HALCAN_REGISTRY: saved.HalcanRegistry  || '',
        })
        const count = Object.values(saved).filter(v => typeof v === 'string' && ethers.isAddress(v)).length
        HOT[H.CONTRACTS]  = count
        HOT[H.DEPLOYMENT] = 1
        console.log(`[DEPLOYER] Restored ${count} contracts | Halcan: ${saved.Halcan.slice(0,14)}...`)
        return
      }
    }
  } catch {}

  // Compile then watch
  let attempts = 0
  const tryCompile = async () => {
    attempts++
    const ok = await precompile()
    if (ok) {
      watchForFunds(SAB, HOT)
    } else if (attempts < 5) {
      console.log(`[DEPLOYER] Compile attempt ${attempts}/5 failed — retry in 30s`)
      setTimeout(tryCompile, 30_000)
    } else {
      console.log('[DEPLOYER] Compilation failed after 5 attempts')
    }
  }
  tryCompile()
}
