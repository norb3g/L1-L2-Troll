// SPDX-License-Identifier: MIT
// @unsupported: ovm
pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

import {iOVM_L1TokenGateway} from "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";
import {iOVM_L2DepositedToken} from "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L2DepositedToken.sol";
import {Abs_L1TokenGateway} from "@eth-optimism/contracts/OVM/bridge/tokens/Abs_L1TokenGateway.sol";

interface ExtendediOVM_L2DepositedToken is iOVM_L2DepositedToken {
    function finalizeDepositAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    external;
}

abstract contract ExtendedAbs_L1TokenGateway is Abs_L1TokenGateway {
    event DepositAndCallInitiated(
        address indexed _from,
        address _to,
        uint256 _amount,
        address _contractAddress,
        bytes _data
    );

    event WithdrawalAndCallFinalized(
        address indexed _to,
        uint256 _amount,
        address _contractAddress,
        bytes _data
    );

    constructor(
        address _l2DepositedToken,
        address _l1messenger
    )
    Abs_L1TokenGateway(_l2DepositedToken, _l1messenger)
    {}

    function _handleFinalizeWithdrawalAndCall(
        address, // _to,
        uint256, // _amount
        address,
        bytes memory
    )
    internal
    virtual
    {
        revert("Implement me in child contracts");
    }

    function finalizeWithdrawalAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    external
        //todo comment for tests
    onlyFromCrossDomainAccount(l2DepositedToken)
    {
        // Call our withdrawal accounting handler implemented by child contracts.
        _handleFinalizeWithdrawalAndCall(
            _to,
            _amount,
            _contractAddress,
            _data
        );

        emit WithdrawalAndCallFinalized(_to, _amount, _contractAddress, _data);
    }

    /**
     * @dev deposit an amount of the ERC20 to the caller's balance on L2
     * @param _amount Amount of the ERC20 to deposit
     */
    function depositAndCall(
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    public
    {
        _initiateDepositAndCall(msg.sender, msg.sender, _amount, _contractAddress, _data);
    }

    /**
     * @dev deposit an amount of ERC20 to a recipients's balance on L2
     * @param _to L2 address to credit the withdrawal to
     * @param _amount Amount of the ERC20 to deposit
     */
    function depositToAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    public
    {
        _initiateDepositAndCall(msg.sender, _to, _amount, _contractAddress, _data);
    }

    /**
     * @dev Performs the logic for deposits by informing the L2 Deposited Token
     * contract of the deposit and calling a handler to lock the L1 funds. (e.g. transferFrom)
     *
     * @param _from Account to pull the deposit from on L1
     * @param _to Account to give the deposit to on L2
     * @param _amount Amount of the ERC20 to deposit.
     */
    function _initiateDepositAndCall(
        address _from,
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    internal
    {
        // Call our deposit accounting handler implemented by child contracts.
        _handleInitiateDeposit(
            _from,
            _to,
            _amount
        );

        // Construct calldata for l2DepositedToken.finalizeDepositAndCall(_to, _amount, _contractAddress, _data)
        bytes memory data = abi.encodeWithSelector(
            ExtendediOVM_L2DepositedToken.finalizeDepositAndCall.selector,
            _to,
            _amount,
            _contractAddress,
            _data
        );

        // Send calldata into L2
        sendCrossDomainMessage(
            l2DepositedToken,
            data,
            getFinalizeDepositL2Gas()
        );

        emit DepositAndCallInitiated(_from, _to, _amount, _contractAddress, _data);
    }
}
