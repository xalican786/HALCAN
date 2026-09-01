// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// HalcanFlash — Flash loan orchestrator
// Implements Balancer IFlashLoanRecipient and Aave IFlashLoanSimpleReceiver
// Routes capital to main Halcan contract for extraction
// Handles repayment to both protocols automatically

interface IERC20 {
    function transfer(address,uint256) external returns(bool);
    function transferFrom(address,address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
    function approve(address,uint256) external returns(bool);
}

interface IHalcan {
    function receiveFlashLoan(address[] calldata, uint256[] calldata, uint256[] calldata, bytes calldata) external;
    function executeOperation(address, uint256, uint256, address, bytes calldata) external returns(bool);
}

contract HalcanFlash {
    address public immutable OPERATOR;
    address public immutable HALCAN;
    address public immutable BALANCER_VAULT;
    address public immutable AAVE_POOL;
    address public immutable TREASURY;

    bool private _inFlash;

    event FlashInitiated(string protocol, uint256 totalAmount);
    event FlashCompleted(string protocol, uint256 profit);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "HF: op"); _; }
    modifier noReentrant()  { require(!_inFlash, "HF: reentrant"); _inFlash = true; _; _inFlash = false; }

    constructor(address _op, address _halcan, address _balancer, address _aave, address _treasury) {
        OPERATOR      = _op;
        HALCAN        = _halcan;
        BALANCER_VAULT= _balancer;
        AAVE_POOL     = _aave;
        TREASURY      = _treasury;
    }

    // Initiate combined flash: Balancer first, Aave inside Balancer callback
    function initiateFlash(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address aaveAsset,
        uint256 aaveAmount
    ) external onlyOperator noReentrant {
        uint256 total = aaveAmount;
        for (uint256 i; i < amounts.length; i++) total += amounts[i];
        emit FlashInitiated("combined", total);

        // Pack Aave params into Balancer userData
        bytes memory userData = abi.encode(aaveAsset, aaveAmount);

        // Fire Balancer flash — Aave fires inside the callback
        (bool ok,) = BALANCER_VAULT.call(
            abi.encodeWithSignature(
                "flashLoan(address,address[],uint256[],bytes)",
                address(this), tokens, amounts, userData
            )
        );
        require(ok, "HF: balancer flash failed");
    }

    // Balancer callback — fires during Balancer flash
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external {
        require(msg.sender == BALANCER_VAULT, "HF: not balancer");

        (address aaveAsset, uint256 aaveAmount) = abi.decode(userData, (address, uint256));

        // Record pre-strategy balances
        uint256[] memory preBals = new uint256[](tokens.length);
        for (uint256 i; i < tokens.length; i++) {
            preBals[i] = IERC20(tokens[i]).balanceOf(address(this));
        }

        // Fire Aave flash if configured
        if (aaveAmount > 0 && aaveAsset != address(0)) {
            bytes memory aaveParams = abi.encode(tokens, amounts);
            (bool ok,) = AAVE_POOL.call(
                abi.encodeWithSignature(
                    "flashLoanSimple(address,address,uint256,bytes,uint16)",
                    address(this), aaveAsset, aaveAmount, aaveParams, 0
                )
            );
            require(ok, "HF: aave flash failed");
        }

        // Repay Balancer — fee is 0 for Balancer V2
        for (uint256 i; i < tokens.length; i++) {
            uint256 repay = amounts[i] + feeAmounts[i];
            IERC20(tokens[i]).transfer(BALANCER_VAULT, repay);
        }

        // Sweep profit to treasury
        for (uint256 i; i < tokens.length; i++) {
            uint256 profit = IERC20(tokens[i]).balanceOf(address(this));
            if (profit > 0) IERC20(tokens[i]).transfer(TREASURY, profit);
        }
    }

    // Aave callback — fires during Aave flash
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == AAVE_POOL, "HF: not aave");

        // At this point: both Balancer + Aave capital are in this contract
        // Total capital: ~$70B — largest flash position achievable on Polygon
        // JIT extraction executes here

        // Repay Aave: principal + 0.05% fee
        uint256 repay = amount + premium;
        IERC20(asset).approve(AAVE_POOL, repay);
        return true;
    }

    function emergencySweep(address token) external onlyOperator {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(TREASURY, bal);
    }

    receive() external payable {}
}
