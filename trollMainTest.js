///////////////////////////

let PREDEPLOYED_ADDRESSES;
let PREDEPLOYED_ADDRESSES_FILEPATH = "PREDEPLOYED_ADDRESSES.json";

///////////////////////////

const l1RpcProviderUrl = 'https://kovan.infura.io/v3/e131c7a0c10f45a4b68b470a4a109543';
const l2RpcProviderUrl = 'https://kovan.optimism.io';
const ownerKey = '0xd08b5a0794ea26c523a96c3c9a9a5a9eaad43056a5ef593a24eb14c58fc8c049'
const l1MessengerAddress = '0x48062eD9b6488EC41c4CfbF2f568D7773819d8C9'// Proxy__OVM_L1CrossDomainMessenger
const l2MessengerAddress = '0x4200000000000000000000000000000000000007'

const fs = require('fs');
const ethers = require('ethers')
const {Watcher} = require('@eth-optimism/watcher')
const {getContractFactory} = require('@eth-optimism/contracts')

// Set up some contract factories. You can ignore this stuff.
const factory = (name, ovm = false) => {
    const artifact = require(`./artifacts${ovm ? '-ovm' : ''}/contracts/${name}.sol/${name}.json`)
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode)
}
const factory__L1_ERC20 = factory('ERC20')
const factory__L2_ERC20 = factory('L2DepositedERC20', true)
const factory__L1_ERC20Gateway = getContractFactory('OVM_L1ERC20Gateway')

const factory__L2_ExtendedERC20 = factory('ExtendedL2DepositedERC20', true)
const factory__L1_ExtendedERC20Gateway = factory('ExtendedOVM_L1ERC20Gateway', false)
const factory__L1_WERC20 = factory('L1WERC20')
const factory__L1_BANK = factory('L1Bank')
const factory__L2_BANK = factory('L2Bank', true)

async function main() {
    PREDEPLOYED_ADDRESSES = loadPredeployedAddresses(PREDEPLOYED_ADDRESSES_FILEPATH);

    const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1RpcProviderUrl)
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2RpcProviderUrl)

    const l1OwnerWallet = new ethers.Wallet(ownerKey, l1RpcProvider)
    const l2OwnerWallet = new ethers.Wallet(ownerKey, l2RpcProvider)

    // Tool that helps watches and waits for messages to be relayed between L1 and L2.
    const watcher = new Watcher({
        l1: {
            provider: l1RpcProvider,
            messengerAddress: l1MessengerAddress
        },
        l2: {
            provider: l2RpcProvider,
            messengerAddress: l2MessengerAddress
        }
    })

    //1. deploy default ERC20 to L1 (USDT)
    const L1_ERC20 = await getOrDeployContract(
        factory__L1_ERC20,
        "L1_ERC20",
        l1OwnerWallet,
        ['10000000000000', 'L1_USDT']
    );

    //2. deploy default mirror ERC20 to L2 (USDT)
    const L2_ERC20 = await getOrDeployContract(
        factory__L2_ERC20,
        "L2_ERC20",
        l2OwnerWallet,
        [l2MessengerAddress, 'L2_USDT', {gasPrice: 0}]
    );

    //2.1. deploy default ERC20 gateway to L1
    // Create a gateway that connects the two contracts.
    const L1_ERC20Gateway = await getOrDeployContract(
        factory__L1_ERC20Gateway,
        "L1_ERC20Gateway",
        l1OwnerWallet,
        [L1_ERC20.address, L2_ERC20.address, l1MessengerAddress]
    );

    //3. deploy wrapped ERC20 to L1 (trollUSDT)
    const L1_WERC20 = await getOrDeployContract(
        factory__L1_WERC20,
        "L1_WERC20",
        l1OwnerWallet,
        [L1_ERC20.address, 'L1_trollUSDT', 'L1_trollUSDT']
    );

    //7. deploy wrapped mirror ERC20 to L2 (trollUSDT)
    const L2_ExtendedERC20 = await getOrDeployContract(
        factory__L2_ExtendedERC20,
        "L2_ExtendedERC20",
        l2OwnerWallet,
        [l2MessengerAddress, 'L2_trollUSDT', {gasPrice: 0}]
    );

    const L1_ExtendedERC20Gateway = await getOrDeployContract(
        factory__L1_ExtendedERC20Gateway,
        "L1_ExtendedERC20Gateway",
        l1OwnerWallet,
        [L1_WERC20.address, L2_ExtendedERC20.address, l1MessengerAddress]
    );

    //4. deploy L1 Bank to L1
    const L1_BANK = await getOrDeployContract(
        factory__L1_BANK,
        "L1_BANK",
        l1OwnerWallet,
        [[L1_ExtendedERC20Gateway.address], [L1_WERC20.address]]
    );

    //6. initialize L2 ERC20 with L1 gateway
    const l1TokenGatewayAddressFromContract = await L2_ERC20.l1TokenGateway();
    if (l1TokenGatewayAddressFromContract === "0x0000000000000000000000000000000000000000") {
        const tx0 = await L2_ERC20.init(L1_ERC20Gateway.address, {gasPrice: 0})
        await tx0.wait()
        console.log('Initialized L2 ERC20')
    } else {
        console.log('L2 ERC20 already initialized')
    }

    //7. initialize L2 ERC20 with L1 gateway
    const l1WTokenGatewayAddressFromContract = await L2_ExtendedERC20.l1TokenGateway();
    if (l1WTokenGatewayAddressFromContract === "0x0000000000000000000000000000000000000000") {
        const tx0 = await L2_ExtendedERC20.init(L1_ExtendedERC20Gateway.address, {gasPrice: 0})
        await tx0.wait()
        console.log('Initialized L2_ExtendedERC20')
    } else {
        console.log('L2_ExtendedERC20 already initialized')
    }

    //8. deploy L2 Bank to L2
    const L2_BANK = await getOrDeployContract(
        factory__L2_BANK,
        "L2_BANK",
        l2OwnerWallet,
        [[L2_ERC20.address], [L2_ExtendedERC20.address], {gasPrice: 0}]
    );

    //9. configure L2 Bank with L1 Bank
    const isL2BankInitialized = await L2_BANK.initilized();
    if (!isL2BankInitialized) {
        const tx1 = await L2_BANK.init(L1_BANK.address, {gasPrice: 0})
        await tx1.wait()
        console.log('configured L2 bank to work with L1 Bank')
    } else {
        console.log('L2 bank already configured to work with L1 Bank')
    }

    ///////// AT THIS POINT EVERYTHING IS PREDEPLOYED, SAVE THEM TO FILE
    savePredeployedAddresses(PREDEPLOYED_ADDRESSES_FILEPATH, PREDEPLOYED_ADDRESSES);

    // set up user balance on L2
    //11. approve L1 ERC20 to L1 Token Gateway
    const tx3 = await L1_ERC20.approve(L1_ERC20Gateway.address, '5000');
    await tx3.wait()
    console.log('approved L1 ERC20 to L1 Token Gateway')

    //12. deposit USDT to gateway
    const tx4 = await L1_ERC20Gateway.deposit('5000');
    await tx4.wait()
    console.log('deposited USDT to gateway')

    //13. wait for USDT to arrive on L2
    const [msgHash1] = await watcher.getMessageHashesFromL1Tx(tx4.hash)
    await watcher.getL2TransactionReceipt(msgHash1)
    console.log('USDT arrived on L2')

    // wrap USDT, send in to L2, deposit it to the L2 Bank
    //14. approved USDT for trollUSDT on L1
    const tx5 = await L1_ERC20.approve(L1_WERC20.address, '5000');
    await tx5.wait();
    console.log('approved USDT for trollUSDT on L1')

    //15. wrap USDT on L1
    const tx6 = await L1_WERC20.wrap(5000);
    await tx6.wait();
    console.log('wrapped USDT on L1')

    //15. approve trollUSDT to L1 troll token gateway
    const tx7 = await L1_WERC20.approve(L1_ExtendedERC20Gateway.address, 5000);
    await tx7.wait();
    console.log('approved trollUSDT to L1 troll token gateway')

    //16. deposit troll token to gateway
    const tx8 = await L1_ExtendedERC20Gateway.deposit(3000);
    await tx8.wait();
    console.log('deposited troll token to gateway')

    //17. wait for trollUSDT to arrive on L2
    const [msgHash2] = await watcher.getMessageHashesFromL1Tx(tx8.hash)
    await watcher.getL2TransactionReceipt(msgHash2)
    console.log('trollUSDT arrived on L2')

    //18. send trollUSDT to L2 Bank
    const tx9 = await L2_ExtendedERC20.transfer(L2_BANK.address, 3000, {gasPrice: 0});
    await tx9.wait();
    console.log('sent trollUSDT to L2 Bank')

    console.log("GOING THROUGH MAIN CASE");

    // main case
    //send usdt to L1Bank for manuallyWithdrawal
    const sendUsdtToL1BankTx = await L1_ERC20.transfer(L1_BANK.address, 1000);
    await sendUsdtToL1BankTx.wait();
    console.log("sent usdt to L1Bank for manuallyWithdrawals");

    //19. print user balance on L1
    const l1UsdtBalance = await L1_ERC20.balanceOf(l1OwnerWallet.address);
    console.log("l1UsdtBalance: " + l1UsdtBalance.toString());

    //20. print user balance on L2
    const l2UsdtBalance = await L2_ERC20.balanceOf(l2OwnerWallet.address);
    console.log("l2UsdtBalance: " + l2UsdtBalance.toString());

    //21. initiate instant withdrawal (L2Bank.swap, from owner)
    //21.1. approve l2 usdt to bank
    const l2UsdtApproveToBankTx = await L2_ERC20.approve(L2_BANK.address, 100);
    await l2UsdtApproveToBankTx.wait();
    console.log("approved L2_ERC20 to L2Bank");

    //21.2. swap
    const swapTx = await L2_BANK.swap(L2_ERC20.address, 100);
    await swapTx.wait();
    console.log("L2 troll swap called");

    //22. listen to the L2Bank.SwapInitiated event (wait for tx and parse event from it)
    //we are not listening because we assuming that event is ok

    const l1WrappedTokenBalance = await L1_WERC20.balanceOf(L1_BANK.address);
    console.log("l1WrappedTokenBalance: " + l1WrappedTokenBalance.toString());

    const l1TokenBalance = await L1_ERC20.balanceOf(L1_BANK.address);
    console.log("l1TokenBalance: " + l1TokenBalance.toString());

    //23. call L1Bank.processL1WithdrawalManually with event data (and l1WrappedTokenAddress from local const)
    const l1WithdrawalManuallyTx = await L1_BANK.processL1WithdrawalManually(
        l1OwnerWallet.address,
        L1_WERC20.address,
        100,
        0
    );
    await l1WithdrawalManuallyTx.wait();
    console.log("L1_BANK.processL1WithdrawalManually done");

    const l1TrollTokenGatewayMessageFromL2Tx = await L1_ExtendedERC20Gateway.finalizeWithdrawalAndCall(
        L1_BANK.address,
        100,
        L1_BANK.address,
        "0x50a4f7f5000000000000000000000000b7c1044a6dbd372105fb7b12738e0dd1971ebd0d0000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000608c4ce8"
    );
    await l1TrollTokenGatewayMessageFromL2Tx.wait();
    console.log("l1TrollTokenGatewayMessageFromL2Tx done");

    const newl1WrappedTokenBalance = await L1_WERC20.balanceOf(L1_BANK.address);
    console.log("newl1WrappedTokenBalance: " + newl1WrappedTokenBalance.toString());

    const newl1TokenBalance = await L1_ERC20.balanceOf(L1_BANK.address);
    console.log("newl1TokenBalance: " + newl1TokenBalance.toString());

    //19. print user balance on L1
    const newL1UsdtBalance = await L1_ERC20.balanceOf(l1OwnerWallet.address);
    console.log("newL1UsdtBalance: " + newL1UsdtBalance.toString());

    //20. print user balance on L2
    const newL2UsdtBalance = await L2_ERC20.balanceOf(l2OwnerWallet.address);
    console.log("newL2UsdtBalance: " + newL2UsdtBalance.toString());
}

async function getOrDeployContract(factory, addressKey, ownerWallet, deploymentParams) {
    const address = PREDEPLOYED_ADDRESSES[addressKey];
    if (!address) {
        const contract = await factory.connect(ownerWallet).deploy(...deploymentParams);
        await contract.deployTransaction.wait();
        PREDEPLOYED_ADDRESSES[addressKey] = contract.address;
        console.log(`Deployed ${addressKey}: ${contract.address}`);
        return contract;
    }

    console.log(`Attached ${addressKey}: ${address}`);
    return factory.connect(ownerWallet).attach(address);
}

function savePredeployedAddresses(path, object) {
    const content = JSON.stringify(object);
    fs.writeFileSync(path, content);
    console.log("PredeployedAddresses is saved.");
}

function loadPredeployedAddresses(path) {
    if (!fs.existsSync(path)) {
        return {
            L1_ERC20: null,
            L2_ERC20: null,
            L1_ERC20Gateway: null,
            L1_WERC20: null,
            L2_ExtendedERC20: null,
            L1_ExtendedERC20Gateway: null,
            L1_BANK: null,
            L2_BANK: null,
        };
    }

    return JSON.parse(fs.readFileSync(path));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
