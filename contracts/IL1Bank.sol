pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

interface IL1Bank {
    function processL1Withdrawal(
        address userAddress,
        uint amount,
        uint userNonce,
        uint timestamp
    ) virtual external;
}
