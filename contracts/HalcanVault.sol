// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// HalcanVault — Asset registry for approved flash borrowing
// Tracks which assets can be used in flash loan cycles
// Records total flash capacity from Balancer and Aave
// Operator-controlled allowlist

interface IERC20 {
    function balanceOf(address) external view returns(uint256);
    function transfer(address,uint256) external returns(bool);
}

contract HalcanVault {
    address public immutable OPERATOR;
    address public immutable TREASURY;

    struct Asset {
        address token;
        string  symbol;
        uint8   decimals;
        uint256 balancerCap;  // max flash from Balancer (in token units)
        uint256 aaveCap;      // max flash from Aave (in token units)
        bool    active;
    }

    Asset[] public assets;
    mapping(address => uint256) public assetIndex;
    mapping(address => bool)    public assetExists;

    uint256 public totalBalancerCapUSD;   // $26B
    uint256 public totalAaveCapUSD;       // $44B
    uint256 public totalFlashCapUSD;      // $70B

    event AssetRegistered(address token, string symbol, uint256 balancerCap, uint256 aaveCap);
    event CapUpdated(uint256 totalBalancer, uint256 totalAave, uint256 total);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "HV: op"); _; }

    constructor(address _op, address _treasury) {
        OPERATOR = _op;
        TREASURY = _treasury;
        // Set initial capacity
        totalBalancerCapUSD = 26_000_000_000;
        totalAaveCapUSD     = 44_000_000_000;
        totalFlashCapUSD    = 70_000_000_000;
    }

    function registerAsset(
        address token,
        string calldata symbol,
        uint8   decimals,
        uint256 balancerCap,
        uint256 aaveCap
    ) external onlyOperator {
        require(!assetExists[token], "HV: exists");
        assetIndex[token] = assets.length;
        assets.push(Asset({
            token:       token,
            symbol:      symbol,
            decimals:    decimals,
            balancerCap: balancerCap,
            aaveCap:     aaveCap,
            active:      true
        }));
        assetExists[token] = true;
        emit AssetRegistered(token, symbol, balancerCap, aaveCap);
    }

    function updateCap(uint256 _balancer, uint256 _aave) external onlyOperator {
        totalBalancerCapUSD = _balancer;
        totalAaveCapUSD     = _aave;
        totalFlashCapUSD    = _balancer + _aave;
        emit CapUpdated(_balancer, _aave, totalFlashCapUSD);
    }

    function setAssetActive(address token, bool active) external onlyOperator {
        require(assetExists[token], "HV: not found");
        assets[assetIndex[token]].active = active;
    }

    function getActiveAssets() external view returns (Asset[] memory) {
        uint256 count;
        for (uint256 i; i < assets.length; i++) if (assets[i].active) count++;
        Asset[] memory active = new Asset[](count);
        uint256 j;
        for (uint256 i; i < assets.length; i++) if (assets[i].active) active[j++] = assets[i];
        return active;
    }

    function getFlashCap() external view returns (uint256 balancer, uint256 aave, uint256 total) {
        return (totalBalancerCapUSD, totalAaveCapUSD, totalFlashCapUSD);
    }

    function emergencySweep(address token) external onlyOperator {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(TREASURY, bal);
    }

    receive() external payable {}
}
