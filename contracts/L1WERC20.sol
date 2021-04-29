// SPDX-License-Identifier: MIT LICENSE
// @unsupported: ovm

pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract L1WERC20 is ERC20 {
    using SafeERC20 for IERC20;
    address public erc20Address;

    constructor(
        address _erc20Address,
        string memory _name,
        string memory _symbol
    ) public ERC20(_name, _symbol) {
        erc20Address = _erc20Address;
        _setupDecimals(ERC20(_erc20Address).decimals());
    }

    function wrap(uint amount) external {
        IERC20(erc20Address).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
    }

    function unwrap(uint amount) external {
        _burn(msg.sender, amount);
        IERC20(erc20Address).safeTransfer(msg.sender, amount);
    }
}
