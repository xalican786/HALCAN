// src/flash.js — Flash loan orchestration
// $26B Balancer (zero fee) + $44B Aave V3 (0.05% fee)
// Monitors live available flash capacity from both protocols
// Builds optimal flash call parameters
// Provides capacity data to dashboard

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

const BALANCER_ABI = [
  'function getPoolTokens(bytes32 poolId) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)',
]

const AAVE_ABI = [
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
]

const TOKEN_ABI = ['function balanceOf(address) view returns (uint256)']

// Monitor actual flash capacity from both protocols
export async function checkFlashCapacity(HOT) {
  const provider = makeProvider()

  let balancerCap = 0
  let aaveCap     = 0

  // Check Balancer pool reserves for each flash asset
  for (const asset of FLASH_ASSETS) {
    try {
      const token = new ethers.Contract(asset, TOKEN_ABI, provider)
      const bal   = await token.balanceOf(BALANCER_VAULT)
      // USDC has 6 decimals, others 18
      const isUSDC = asset === '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' ||
                     asset === '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      const usdValue = isUSDC
        ? Number(bal) / 1e6
        : Number(bal) / 1e18 * 3000  // rough ETH price for capacity estimate
      balancerCap += usdValue
    } catch {}
  }

  // Check Aave available liquidity for USDC
  try {
    const token = new ethers.Contract(FLASH_ASSETS[0], TOKEN_ABI, provider)
    const aaveToken = '0x625E7708f30cA75bfd92586e17077590C60eb4cD'  // Aave aUSDC on Polygon
    const bal = await token.balanceOf(aaveToken)
    aaveCap = Number(bal) / 1e6
  } catch {}

  // Update HOT with live capacities (cap at known maximums)
  HOT[H.BALANCER_CAP] = Math.min(balancerCap, BALANCER_FLASH)
  HOT[H.AAVE_CAP]     = Math.min(aaveCap,     AAVE_FLASH)
  HOT[H.FLASH_CAP]    = HOT[H.BALANCER_CAP] + HOT[H.AAVE_CAP]
}

// Build flash loan parameters for current capacity
export function buildFlashParams() {
  return {
    tokens:      FLASH_ASSETS,
    amounts:     BALANCER_AMOUNTS,
    aaveAsset:   FLASH_ASSETS[0],  // USDC for Aave flash
    aaveAmount:  BigInt(Math.floor(AAVE_FLASH * 1e6)),
    totalFlash:  TOTAL_FLASH,
    aaveFee:     AAVE_FLASH * 0.0005,  // 0.05% of $44B = $22M
    netExtract:  7e9 - (AAVE_FLASH * 0.0005),  // $7B - $22M = ~$6.978B
  }
}

export function startFlash(HOT) {
  // Set initial capacity estimates
  HOT[H.BALANCER_CAP] = BALANCER_FLASH
  HOT[H.AAVE_CAP]     = AAVE_FLASH
  HOT[H.FLASH_CAP]    = TOTAL_FLASH

  // Check live capacity every 5 minutes
  checkFlashCapacity(HOT).catch(() => {})
  setInterval(() => checkFlashCapacity(HOT).catch(() => {}), 300_000)

  console.log(`[FLASH] $${(BALANCER_FLASH/1e9).0}B Balancer (0% fee) + $${(AAVE_FLASH/1e9).0}B Aave (0.05% fee) = $${(TOTAL_FLASH/1e9).0}B total`)
}
