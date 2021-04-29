// SPDX-License-Identifier: MIT LICENSE
// @unsupported: ovm
pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ExtendedOVM_L1ERC20Gateway} from "./ExtendedOVM_L1ERC20Gateway.sol";
import {L1WERC20} from "./L1WERC20.sol";
import {IL1Bank} from "./IL1Bank.sol";

contract L1Bank is IL1Bank, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint;

    mapping(address => address) l1GatewayMap;

    struct WithdrawalData {
        address tokenAddress;
        uint amount;
        uint requestedAt;
        uint processedAt;
    }

    mapping(address => mapping(uint => WithdrawalData)) public withdrawals;

    event ProcessedManually(
        address indexed userAddress,
        address indexedl1TokenAddress,
        uint indexed amount,
        uint userNonce,
        uint timestamp
    );

    constructor(
        address[] memory _l1Gateways,
        address[] memory _l1Tokens
    ) {
        for (uint i; i < _l1Gateways.length; i++) {
            l1GatewayMap[_l1Gateways[i]] = _l1Tokens[i];
        }
    }

    function processL1Withdrawal(
        address userAddress,
        uint amount,
        uint userNonce,
        uint requestedAt
    )
    override
    external
    {
        require(l1GatewayMap[msg.sender] != address(0), "ONLY_GATEWAY_IS_ALLOWED_TO_CALL_THIS_FUNCTION");
        address l1WrappedTokenAddress = address(ExtendedOVM_L1ERC20Gateway(msg.sender).l1ERC20());
        address l1TokenAddress = L1WERC20(l1WrappedTokenAddress).erc20Address();
        WithdrawalData storage withdrawalData = withdrawals[userAddress][userNonce];

        if (withdrawalData.tokenAddress != l1TokenAddress) {
            processNotProcessedWithdrawalPenalty(userAddress);

            withdrawToken(
                userAddress,
                l1WrappedTokenAddress,
                amount
            );

            withdrawals[userAddress][userNonce] = WithdrawalData({
            tokenAddress : l1TokenAddress,
            amount : amount,
            requestedAt : requestedAt,
            processedAt : block.timestamp
            });

            return;
        }

        if (withdrawalData.amount < amount) {
            processWrongAmountSentPenalty(userAddress);

            uint difference = amount.sub(withdrawalData.amount);

            withdrawals[userAddress][userNonce] = WithdrawalData({
            tokenAddress : l1TokenAddress,
            amount : amount,
            requestedAt : requestedAt,
            processedAt : block.timestamp
            });

            withdrawToken(
                userAddress,
                l1WrappedTokenAddress,
                difference
            );

            return;
        }

        processTimestampPenalty(
            userAddress,
            requestedAt,
            withdrawalData.processedAt,
            amount
        );

        withdrawals[userAddress][userNonce].requestedAt = requestedAt;
    }

    function withdrawToken(
        address userAddress,
        address l1WrappedTokenAddress,
        uint amount
    ) internal {
        address l1TokenAddress = L1WERC20(l1WrappedTokenAddress).erc20Address();
        uint tokensOnWrappedContract = IERC20(l1TokenAddress).balanceOf(l1WrappedTokenAddress);

        if (tokensOnWrappedContract >= amount) {
            L1WERC20(l1WrappedTokenAddress).unwrap(amount);
            IERC20(l1TokenAddress).safeTransfer(userAddress, amount);
        } else {
            L1WERC20(l1WrappedTokenAddress).unwrap(tokensOnWrappedContract);
            IERC20(l1WrappedTokenAddress).safeTransfer(userAddress, amount.sub(tokensOnWrappedContract));
            IERC20(l1TokenAddress).safeTransfer(userAddress, tokensOnWrappedContract);
        }
    }

    function processL1WithdrawalManually(
        address userAddress,
        address l1WrappedTokenAddress,
        uint amount,
        uint userNonce
    ) external onlyOwner {
        require(withdrawals[userAddress][userNonce].processedAt == 0, "WITHDRAWAL_ALREADY_PROCESSED");
        address l1TokenAddress = L1WERC20(l1WrappedTokenAddress).erc20Address();

        withdrawals[userAddress][userNonce] = WithdrawalData({
        tokenAddress : l1TokenAddress,
        amount : amount,
        processedAt : block.timestamp,
        requestedAt : 0
        });

        IERC20(l1TokenAddress).safeTransfer(msg.sender, getAmountWithOurFee(amount));
        emit ProcessedManually(
            userAddress,
            l1TokenAddress,
            amount,
            userNonce,
            block.timestamp
        );
    }

    /////////////////////////////

    function getAmountWithOurFee(uint amount) internal returns (uint) {
        return amount.mul(990).div(1000);
    }

    function processTimestampPenalty(
        address userAddress,
        uint requestedAt,
        uint processedAt,
        uint amount
    ) internal {
        uint timestampPenalty = getTimestampPenalty(
            requestedAt,
            processedAt
        );

        uint calculatedByTimestampPenalty = calculateTimestampPenalty(amount, timestampPenalty);
        if (calculatedByTimestampPenalty > 0) {
            sendUserCompensation(userAddress, calculatedByTimestampPenalty);
        }
    }

    function sendUserCompensation(
        address userAddress,
        uint amount
    ) internal {
        //todo
    }

    function calculateTimestampPenalty(
        uint amount,
        uint timestampPenalty
    ) internal returns (uint) {
        return amount.mul(timestampPenalty).div(100);
    }

    function getTimestampPenalty(
        uint requestedAt,
        uint processedAt
    ) internal returns (uint) {
        if (requestedAt + 2 days < processedAt) {
            return 10;
        }

        if (requestedAt + 1 days < processedAt) {
            return 5;
        }

        return 0;
    }

    function processWrongAmountSentPenalty(address userAddress) internal {
        sendUserCompensation(userAddress, 0);
    }

    function processNotProcessedWithdrawalPenalty(address userAddress) internal {
        sendUserCompensation(userAddress, 0);
    }
}
