// src/flash.js — Flash loan orchestration
// $26B Balancer (zero fee) + $44B Aave V3 (0.05% fee)
// Monitors live available flash capacity from both protocols
// Builds optimal flash call parameters

import { ethers } from 'ethers'
import {
  CHAINS, H,
  BALANCER_VAULT, AAVE_POOL,
  FLASH_ASSETS, BALANCER_AMOUNTS,
  BALANCER_FLASH, AAVE_FLASH, TOTAL_FLASH,
} from './config.js'

function makeProvider() {
  const c = CHAINS[0]
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork: n })
}

const TOKEN_ABI = ['function balanceOf(address) view returns (uint256)']

export async function checkFlashCapacity(HOT) {
  const provider = makeProvider()

  let balancerCap = 0
  let aaveCap     = 0

  for (const asset of FLASH_ASSETS) {
    try {
      const token    = new ethers.Contract(asset, TOKEN_ABI, provider)
      const bal      = await token.balanceOf(BALANCER_VAULT)
      const isStable = asset === '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' ||
                       asset === '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      const usdValue = isStable
        ? Number(bal) / 1e6
        : Number(bal) / 1e18 * 3000
      balancerCap += usdValue
    } catch {}
  }

  try {
    const token    = new ethers.Contract(FLASH_ASSETS[0], TOKEN_ABI, provider)
    const aUSDC    = '0x625E7708f30cA75bfd92586e17077590C60eb4cD'
    const bal      = await token.balanceOf(aUSDC)
    aaveCap        = Number(bal) / 1e6
  } catch {}

  HOT[H.BALANCER_CAP] = Math.min(balancerCap, BALANCER_FLASH)
  HOT[H.AAVE_CAP]     = Math.min(aaveCap,     AAVE_FLASH)
  HOT[H.FLASH_CAP]    = HOT[H.BALANCER_CAP] + HOT[H.AAVE_CAP]
}

export function buildFlashParams() {
  return {
    tokens:     FLASH_ASSETS,
    amounts:    BALANCER_AMOUNTS,
    aaveAsset:  FLASH_ASSETS[0],
    aaveAmount: BigInt(Math.floor(AAVE_FLASH * 1e6)),
    totalFlash: TOTAL_FLASH,
    aaveFee:    AAVE_FLASH * 0.0005,
    netExtract: 7e9 - (AAVE_FLASH * 0.0005),
  }
}

export function startFlash(HOT) {
  HOT[H.BALANCER_CAP] = BALANCER_FLASH
  HOT[H.AAVE_CAP]     = AAVE_FLASH
  HOT[H.FLASH_CAP]    = TOTAL_FLASH

  checkFlashCapacity(HOT).catch(() => {})
  setInterval(() => checkFlashCapacity(HOT).catch(() => {}), 300_000)

  const bf = (BALANCER_FLASH / 1e9).toFixed(0)
  const af = (AAVE_FLASH     / 1e9).toFixed(0)
  const tf = (TOTAL_FLASH    / 1e9).toFixed(0)
  console.log(`[FLASH] $${bf}B Balancer (0% fee) + $${af}B Aave (0.05% fee) = $${tf}B total`)
}
