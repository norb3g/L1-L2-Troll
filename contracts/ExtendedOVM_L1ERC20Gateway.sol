// SPDX-License-Identifier: MIT
// @unsupported: ovm
pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

import {iOVM_ERC20} from "@eth-optimism/contracts/iOVM/predeploys/iOVM_ERC20.sol";
import "./ExtendedAbs_L1TokenGateway.sol";

contract ExtendedOVM_L1ERC20Gateway is ExtendedAbs_L1TokenGateway {

    /********************************
     * External Contract References *
     ********************************/

    iOVM_ERC20 public l1ERC20;

    /***************
     * Constructor *
     ***************/

    /**
     * @param _l1ERC20 L1 ERC20 address this contract stores deposits for
     * @param _l2DepositedERC20 L2 Gateway address on the chain being deposited into
     */
    constructor(
        iOVM_ERC20 _l1ERC20,
        address _l2DepositedERC20,
        address _l1messenger
    )
    ExtendedAbs_L1TokenGateway(
        _l2DepositedERC20,
        _l1messenger
    )
    {
        l1ERC20 = _l1ERC20;
    }


    /**************
     * Accounting *
     **************/

    /**
     * @dev When a deposit is initiated on L1, the L1 Gateway
     * transfers the funds to itself for future withdrawals
     *
     * @param _from L1 address ETH is being deposited from
     * param _to L2 address that the ETH is being deposited to
     * @param _amount Amount of ERC20 to send
     */
    function _handleInitiateDeposit(
        address _from,
        address, // _to,
        uint256 _amount
    )
    internal
    override
    {
        // Hold on to the newly deposited funds
        l1ERC20.transferFrom(
            _from,
            address(this),
            _amount
        );
    }

    /**
     * @dev When a withdrawal is finalized on L1, the L1 Gateway
     * transfers the funds to the withdrawer
     *
     * @param _to L1 address that the ERC20 is being withdrawn to
     * @param _amount Amount of ERC20 to send
     */
    function _handleFinalizeWithdrawal(
        address _to,
        uint _amount
    )
    internal
    override
    {
        // Transfer withdrawn funds out to withdrawer
        l1ERC20.transfer(_to, _amount);
    }

    function _handleFinalizeWithdrawalAndCall(
        address _to,
        uint _amount,
        address _contractAddress,
        bytes memory _data
    )
    internal
    override
    {
        // Transfer withdrawn funds out to withdrawer
        l1ERC20.transfer(_to, _amount);
        (bool res, bytes memory _) = _contractAddress.call(_data);
        require(res, "CALL_FAILED");
    }
}
