// SPDX-License-Identifier: MIT LICENSE
pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

/* Library Imports */
import {Abs_L2DepositedToken} from "@eth-optimism/contracts/OVM/bridge/tokens/Abs_L2DepositedToken.sol";
import {iOVM_L1TokenGateway} from "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";

interface ExtendediOVM_L1TokenGateway is iOVM_L1TokenGateway {

    function finalizeWithdrawalAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    external;
}

abstract contract ExtendedAbs_L2DepositedToken is Abs_L2DepositedToken {

    event DepositAndCallFinalized(
        address indexed _to,
        uint256 _amount,
        address _contractAddress,
        bytes _data
    );

    event WithdrawalAndCallInitiated(
        address indexed _from,
        address _to,
        uint256 _amount,
        address _contractAddress,
        bytes _data
    );

    constructor(
        address _l2CrossDomainMessenger
    )
    Abs_L2DepositedToken(_l2CrossDomainMessenger)
    {}

    /**
     * @dev Performs the logic for deposits by storing the token and informing the L2 token Gateway of the deposit.
     *
     * @param _to Account to give the withdrawal to on L1
     * @param _amount Amount of the token to withdraw
     */
    function _initiateWithdrawalAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    internal
    {
        // Call our withdrawal accounting handler implemented by child contracts (usually a _burn)
        _handleInitiateWithdrawal(_to, _amount);

        // Construct calldata for l1TokenGateway.finalizeWithdrawalAndCall(_to, _amount, _contractAddress, _data)
        bytes memory data = abi.encodeWithSelector(
            ExtendediOVM_L1TokenGateway.finalizeWithdrawalAndCall.selector,
            _to,
            _amount,
            _contractAddress,
            _data
        );

        // Send message up to L1 gateway
        sendCrossDomainMessage(
            address(l1TokenGateway),
            data,
            getFinalizeWithdrawalL1Gas()
        );

        emit WithdrawalAndCallInitiated(msg.sender, _to, _amount, _contractAddress, _data);
    }

    /**
     * @dev initiate a withdraw of some tokens to the caller's account on L1
     * @param _amount Amount of the token to withdraw
     */
    function withdrawAndCall(
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    external
    onlyInitialized()
    {
        _initiateWithdrawalAndCall(msg.sender, _amount, _contractAddress, _data);
    }

    /**
     * @dev initiate a withdraw of some tokens to the caller's account on L1
     * @param _amount Amount of the token to withdraw
     */
    function withdrawToAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    external
    onlyInitialized()
    {
        _initiateWithdrawalAndCall(_to, _amount, _contractAddress, _data);
    }

    function finalizeDepositAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    external
    onlyInitialized()
    onlyFromCrossDomainAccount(address(l1TokenGateway))
    {
        _handleFinalizeDeposit(_to, _amount);
        _contractAddress.call(_data);
        emit DepositAndCallFinalized(_to, _amount, _contractAddress, _data);
    }
}
