const ethers = require('ethers')
const {Watcher} = require('@eth-optimism/watcher')
const {getContractFactory} = require('@eth-optimism/contracts')

// Set up some contract factories. You can ignore this stuff.
const factory = (name, ovm = false) => {
    const artifact = require(`./artifacts${ovm ? '-ovm' : ''}/contracts/${name}.sol/${name}.json`)
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode)
}
const factory__L1_ERC20 = factory('ERC20')
const factory__L2_ERC20 = factory('ExtendedL2DepositedERC20', true)
// const factory__L1_ERC20Gateway = getContractFactory('OVM_L1ERC20Gateway')
const factory__L1_ERC20Gateway = factory('ExtendedOVM_L1ERC20Gateway', false)
const factory__Test = factory('Test', true)

// const factory__L1_ERC20Gateway = getContractFactory('ExtendedOVM_L1ERC20Gateway')

async function main() {
    // Set up our RPC provider connections.
    const l1RpcProvider = new ethers.providers.JsonRpcProvider('https://kovan.infura.io/v3/e131c7a0c10f45a4b68b470a4a109543')
    const l2RpcProvider = new ethers.providers.JsonRpcProvider('https://kovan.optimism.io')

    // Set up our wallets (using a default private key with 10k ETH allocated to it).
    // Need two wallets objects, one for interacting with L1 and one for interacting with L2.
    // Both will use the same private key.
    const key = '0xd08b5a0794ea26c523a96c3c9a9a5a9eaad43056a5ef593a24eb14c58fc8c049'
    const l1Wallet = new ethers.Wallet(key, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(key, l2RpcProvider)

    // L1 messenger address depends on the deployment, this is default for our local deployment.
    // Proxy__OVM_L1CrossDomainMessenger
    const l1MessengerAddress = '0x48062eD9b6488EC41c4CfbF2f568D7773819d8C9'
    // L2 messenger address is always the same.
    const l2MessengerAddress = '0x4200000000000000000000000000000000000007'

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

    // Deploy Test contract on L1
    console.log('Deploying L2 TEST...')
    const L2_TEST = await factory__Test.connect(l2Wallet).deploy();
    await L2_TEST.deployTransaction.wait();

    // Deploy an ERC20 token on L1.
    console.log('Deploying L1 ERC20...')
    const L1_ERC20 = await factory__L1_ERC20.connect(l1Wallet).deploy(
        1234, //initialSupply
        'L1 ERC20', //name
    )
    await L1_ERC20.deployTransaction.wait()

    // Deploy the paired ERC20 token to L2.
    console.log('Deploying L2 ERC20...')
    const L2_ERC20 = await factory__L2_ERC20.connect(l2Wallet).deploy(
        l2MessengerAddress,
        'L2 ERC20', //name
        {
            gasPrice: 0
        }
    )
    await L2_ERC20.deployTransaction.wait()

    // Create a gateway that connects the two contracts.
    console.log('Deploying L1 ERC20 Gateway...')
    const L1_ERC20Gateway = await factory__L1_ERC20Gateway.connect(l1Wallet).deploy(
        L1_ERC20.address,
        L2_ERC20.address,
        l1MessengerAddress
    )
    await L1_ERC20Gateway.deployTransaction.wait()

    // Make the L2 ERC20 aware of the gateway contract.
    console.log('Initializing L2 ERC20...')
    const tx0 = await L2_ERC20.init(
        L1_ERC20Gateway.address,
        {
            gasPrice: 0
        }
    )
    await tx0.wait()

    // Initial balances.
    console.log(`Balance on L1: ${await L1_ERC20.balanceOf(l1Wallet.address)}`) // 1234
    console.log(`Balance on L2: ${await L2_ERC20.balanceOf(l1Wallet.address)}`) // 0

    // Allow the gateway to lock up some of our tokens.
    console.log('Approving tokens for ERC20 gateway...')
    const tx1 = await L1_ERC20.approve(L1_ERC20Gateway.address, 1234)
    await tx1.wait()

    // Lock the tokens up inside the gateway and ask the L2 contract to mint new ones.
    console.log('Depositing tokens into L2 ERC20...')
    const tx2 = await L1_ERC20Gateway.depositAndCall(1234, L2_TEST.address, "0x")
    await tx2.wait()

    // Wait for the message to be relayed to L2.
    console.log('Waiting for deposit to be relayed to L2...')
    const [msgHash1] = await watcher.getMessageHashesFromL1Tx(tx2.hash)
    await watcher.getL2TransactionReceipt(msgHash1)

    // Log some balances to see that it worked!
    console.log(`Balance on L1: ${await L1_ERC20.balanceOf(l1Wallet.address)}`) // 0
    console.log(`Balance on L2: ${await L2_ERC20.balanceOf(l1Wallet.address)}`) // 1234
    console.log(`i= ${await L2_TEST.i()}`)

    if (true) {
        return;
    }

    // Burn the tokens on L2 and ask the L1 contract to unlock on our behalf.
    console.log(`Withdrawing tokens back to L1 ERC20 And Calling contract...`)
    // const tx3 = await L2_ERC20.withdraw(
    //   1234,
    //   {
    //     gasPrice: 0
    //   }
    // )
    // await tx3.wait()

    const tx3 = await L2_ERC20.withdraw(
        1234,
        {
            gasPrice: 0
        }
    )
    await tx3.wait()

    // Wait for the message to be relayed to L1.
    console.log(`Waiting for withdrawal to be relayed to L1...`)
    const [msgHash2] = await watcher.getMessageHashesFromL2Tx(tx3.hash)
    await watcher.getL1TransactionReceipt(msgHash2)

    // Log balances again!
    console.log(`i= ${await L2_TEST.i()}`)
    console.log(`Balance on L1: ${await L1_ERC20.balanceOf(l1Wallet.address)}`) // 1234
    console.log(`Balance on L2: ${await L2_ERC20.balanceOf(l1Wallet.address)}`) // 0
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
