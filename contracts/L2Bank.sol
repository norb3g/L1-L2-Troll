// SPDX-License-Identifier: MIT LICENSE
pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {ExtendedL2DepositedERC20} from "./ExtendedL2DepositedERC20.sol";
import {IL1Bank} from "./IL1Bank.sol";

contract L2Bank is Ownable {
//    using SafeERC20 for IERC20;

    address public l1BankAddress;
    bool public initilized;
    mapping(address => uint) public userRequestMap;
    mapping(address => address) public l2TokenMap;

    event SwapInitiated(
        address indexed userAddress,
        address indexed wrappedTokenAddress,
        uint amount,
        uint timestamp,
        uint userNonce
    );

    modifier onlyInitialized() {
        require(initilized, "NOT_INITIALIZED");
        _;
    }

    constructor(
        address[] memory _l2TokenAddresses,
        address[] memory _l2WrappedTokenAddresses
    ) public {
        require(_l2TokenAddresses.length == _l2WrappedTokenAddresses.length, "WRONG_CONSTRUCTOR_INPUT");

        for (uint i = 0; i < _l2TokenAddresses.length; i++) {
            l2TokenMap[_l2TokenAddresses[i]] = _l2WrappedTokenAddresses[i];
        }
    }

    function init(
        address _l1BankAddress
    ) public onlyOwner {
        require(!initilized, "CONTRACT_ALREADY_INITIALIZED");
        l1BankAddress = _l1BankAddress;
        initilized = true;
    }

    function swap(address l2TokenAddress, uint amount) public onlyInitialized() {
        address l2WrappedTokenAddress = l2TokenMap[l2TokenAddress];
        require(l2WrappedTokenAddress != address(0), "UNSUPPORTED_TOKEN");

        uint l2WrappedTokenBalance = IERC20(l2WrappedTokenAddress).balanceOf(address(this));
        require(l2WrappedTokenBalance >= amount, "INSUFFICIENT_BANK_BALANCE");
        IERC20(l2TokenAddress).transferFrom(msg.sender, address(this), amount);

        bytes memory data = abi.encodeWithSelector(
            IL1Bank.processL1Withdrawal.selector,
            msg.sender,
            amount,
            userRequestMap[msg.sender],
            block.timestamp
        );

        ExtendedL2DepositedERC20(l2WrappedTokenAddress).withdrawAndCall(
            amount,
            l1BankAddress,
            data
        );

        userRequestMap[msg.sender]++;
        emit SwapInitiated(
            msg.sender,
            l2WrappedTokenAddress,
            amount,
            block.timestamp,
            userRequestMap[msg.sender]
        );
    }
}
