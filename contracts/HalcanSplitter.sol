// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// HalcanSplitter — Profit routing
// 100% of all extracted capital routes to treasury
// No splits. No fees. No deductions. Treasury gets everything.
// Operator can add secondary routes if needed (future bridges)

interface IERC20 {
    function transfer(address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
}

contract HalcanSplitter {
    address public immutable OPERATOR;
    address public immutable TREASURY;

    uint256 public totalRouted;
    uint256 public routeCount;

    event Routed(address indexed token, uint256 amount, address indexed to);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "HS: op"); _; }
    modifier onlyHalcan()   { require(msg.sender == OPERATOR || authorized[msg.sender], "HS: not halcan"); _; }

    mapping(address => bool) public authorized;

    constructor(address _op, address _treasury) {
        OPERATOR = _op;
        TREASURY = _treasury;
    }

    // Route all of a token to treasury — called after every cycle
    function route(address token) external onlyHalcan returns (uint256 amount) {
        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) return 0;
        IERC20(token).transfer(TREASURY, amount);
        totalRouted += amount;
        routeCount++;
        emit Routed(token, amount, TREASURY);
    }

    // Route multiple tokens at once — called at end of flash cycle
    function routeAll(address[] calldata tokens) external onlyHalcan {
        for (uint256 i; i < tokens.length; i++) {
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (bal > 0) {
                IERC20(tokens[i]).transfer(TREASURY, bal);
                totalRouted += bal;
                routeCount++;
                emit Routed(tokens[i], bal, TREASURY);
            }
        }
    }

    function authorize(address addr, bool auth) external onlyOperator { authorized[addr] = auth; }

    function emergencySweep(address token) external onlyOperator {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(TREASURY, bal);
    }

    receive() external payable {}
}
