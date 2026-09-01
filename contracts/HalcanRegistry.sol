// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// HalcanRegistry — Chain and pool allowlist
// Operator-controlled registry of approved chains and target pools
// Halcan only executes on registered chains against registered pools
// Security layer — no rogue execution on unregistered targets

contract HalcanRegistry {
    address public immutable OPERATOR;

    struct Chain {
        uint256 chainId;
        string  name;
        address balancerVault;
        address aavePool;
        bool    active;
    }

    struct Pool {
        address poolAddress;
        address token0;
        address token1;
        uint24  fee;
        string  protocol;
        bool    active;
    }

    Chain[] public chains;
    Pool[]  public pools;

    mapping(uint256 => bool) public chainRegistered;
    mapping(address => bool) public poolRegistered;

    event ChainRegistered(uint256 chainId, string name);
    event PoolRegistered(address pool, string protocol);
    event ChainToggled(uint256 chainId, bool active);
    event PoolToggled(address pool, bool active);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "HR: op"); _; }

    constructor(address _op) {
        OPERATOR = _op;

        // Register Polygon at deployment
        chains.push(Chain({
            chainId:       137,
            name:          "polygon",
            balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
            aavePool:      0x794a61358D6845594F94dc1DB02A252b5b4814aD,
            active:        true
        }));
        chainRegistered[137] = true;

        // Register Arbitrum
        chains.push(Chain({
            chainId:       42161,
            name:          "arbitrum",
            balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
            aavePool:      0x794a61358D6845594F94dc1DB02A252b5b4814aD,
            active:        true
        }));
        chainRegistered[42161] = true;
    }

    function registerChain(
        uint256 chainId, string calldata name,
        address balancer, address aave
    ) external onlyOperator {
        require(!chainRegistered[chainId], "HR: chain exists");
        chains.push(Chain(chainId, name, balancer, aave, true));
        chainRegistered[chainId] = true;
        emit ChainRegistered(chainId, name);
    }

    function registerPool(
        address pool, address token0, address token1,
        uint24 fee, string calldata protocol
    ) external onlyOperator {
        require(!poolRegistered[pool], "HR: pool exists");
        pools.push(Pool(pool, token0, token1, fee, protocol, true));
        poolRegistered[pool] = true;
        emit PoolRegistered(pool, protocol);
    }

    function toggleChain(uint256 chainId, bool active) external onlyOperator {
        for (uint256 i; i < chains.length; i++) {
            if (chains[i].chainId == chainId) { chains[i].active = active; break; }
        }
        emit ChainToggled(chainId, active);
    }

    function togglePool(address pool, bool active) external onlyOperator {
        require(poolRegistered[pool], "HR: not found");
        for (uint256 i; i < pools.length; i++) {
            if (pools[i].poolAddress == pool) { pools[i].active = active; break; }
        }
        emit PoolToggled(pool, active);
    }

    function getActiveChains() external view returns (Chain[] memory) {
        uint256 count;
        for (uint256 i; i < chains.length; i++) if (chains[i].active) count++;
        Chain[] memory active = new Chain[](count);
        uint256 j;
        for (uint256 i; i < chains.length; i++) if (chains[i].active) active[j++] = chains[i];
        return active;
    }

    function getActivePools() external view returns (Pool[] memory) {
        uint256 count;
        for (uint256 i; i < pools.length; i++) if (pools[i].active) count++;
        Pool[] memory active = new Pool[](count);
        uint256 j;
        for (uint256 i; i < pools.length; i++) if (pools[i].active) active[j++] = pools[i];
        return active;
    }

    function chainCount() external view returns (uint256) { return chains.length; }
    function poolCount()  external view returns (uint256) { return pools.length; }

    receive() external payable {}
}
