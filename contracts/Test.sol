// SPDX-License-Identifier: MIT
pragma solidity >0.6.0 <0.8.0;

contract Test {
    uint public i = 0;

    fallback() external {
        i++;
    }
}
