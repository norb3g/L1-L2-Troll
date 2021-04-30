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

    mapping(address => address) public l1WrappedGatewayMap;

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

    event WithdrawalUpdated(
        address userAddress,
        address l1TokenAddress,
        uint amount,
        uint userNonce,
        uint requestedAt,
        uint processedAt
    );

    event TokensWithdrawn(
        address userAddress,
        address l1TokenAddress,
        uint l1TokenAmount,
        address l1WrappedTokenAddress,
        uint l1WrappedTokenAmount
    );

    event UserCompensationSent(
        address userAddress,
        uint amount
    );

    event ProcessedTimestampPenalty();
    event ProcessedWrongAmountSentPenalty();
    event ProcessedNotProcessedWithdrawalPenalty();

    constructor(
        address[] memory _l1WrappedGateways,
        address[] memory _l1WrappedTokens
    ) {
        for (uint i; i < _l1WrappedGateways.length; i++) {
            l1WrappedGatewayMap[_l1WrappedGateways[i]] = _l1WrappedTokens[i];
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
        require(l1WrappedGatewayMap[msg.sender] != address(0), "ONLY_GATEWAY_IS_ALLOWED_TO_CALL_THIS_FUNCTION");
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

            emit WithdrawalUpdated(
                userAddress,
                l1TokenAddress,
                amount,
                userNonce,
                requestedAt,
                block.timestamp
            );
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

            emit WithdrawalUpdated(
                userAddress,
                l1TokenAddress,
                amount,
                userNonce,
                requestedAt,
                block.timestamp
            );
            return;
        }

        processTimestampPenalty(
            userAddress,
            amount,
            requestedAt,
            withdrawalData.processedAt
        );

        withdrawals[userAddress][userNonce].requestedAt = requestedAt;
        emit WithdrawalUpdated(
            userAddress,
            l1TokenAddress,
            amount,
            userNonce,
            requestedAt,
            block.timestamp
        );
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
            emit TokensWithdrawn(
                userAddress,
                l1TokenAddress,
                amount,
                l1WrappedTokenAddress,
                0
            );
        } else {
            L1WERC20(l1WrappedTokenAddress).unwrap(tokensOnWrappedContract);
            IERC20(l1WrappedTokenAddress).safeTransfer(userAddress, amount.sub(tokensOnWrappedContract));
            IERC20(l1TokenAddress).safeTransfer(userAddress, tokensOnWrappedContract);
            emit TokensWithdrawn(
                userAddress,
                l1TokenAddress,
                tokensOnWrappedContract,
                l1WrappedTokenAddress,
                amount.sub(tokensOnWrappedContract)
            );
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
        uint amount,
        uint requestedAt,
        uint processedAt
    ) internal {
        uint timestampPenalty = getTimestampPenalty(
            requestedAt,
            processedAt
        );

        uint calculatedByTimestampPenalty = calculateTimestampPenalty(amount, timestampPenalty);
        sendUserCompensation(userAddress, calculatedByTimestampPenalty);
        emit ProcessedTimestampPenalty();
    }

    function sendUserCompensation(
        address userAddress,
        uint amount
    ) internal {
        if (amount == 0) {
            return;
        }

        //todo

        emit UserCompensationSent(
            userAddress,
            amount
        );
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
        emit ProcessedWrongAmountSentPenalty();
    }

    function processNotProcessedWithdrawalPenalty(address userAddress) internal {
        sendUserCompensation(userAddress, 0);
        emit ProcessedNotProcessedWithdrawalPenalty();
    }
}
