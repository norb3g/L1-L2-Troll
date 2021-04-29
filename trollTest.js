const l1RpcProviderUrl = 'https://kovan.infura.io/v3/e131c7a0c10f45a4b68b470a4a109543';
const l2RpcProviderUrl = 'https://kovan.optimism.io';
const ownerKey = '0xd08b5a0794ea26c523a96c3c9a9a5a9eaad43056a5ef593a24eb14c58fc8c049'
const userKey = '0xd08b5a0794ea26c523a96c3c9a9a5a9eaad43056a5ef593a24eb14c58fc8c050'
const l1MessengerAddress = '0x48062eD9b6488EC41c4CfbF2f568D7773819d8C9'// Proxy__OVM_L1CrossDomainMessenger
const l2MessengerAddress = '0x4200000000000000000000000000000000000007'

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
    const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1RpcProviderUrl)
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2RpcProviderUrl)

    const l1OwnerWallet = new ethers.Wallet(ownerKey, l1RpcProvider)
    const l2OwnerWallet = new ethers.Wallet(ownerKey, l2RpcProvider)
    const l1UserWallet = new ethers.Wallet(ownerKey, l1RpcProvider)
    const l2UserWallet = new ethers.Wallet(ownerKey, l2RpcProvider)

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

    // deploy L1 contracts
    //1. deploy default ERC20 to L1 (USDT)
    console.log('Deploying L1 ERC20...')
    const L1_ERC20 = await factory__L1_ERC20.connect(l1OwnerWallet).deploy(
        10000, //initialSupply
        'L1_USDT', //name
    )
    await L1_ERC20.deployTransaction.wait()

    //2. deploy default mirror ERC20 to L2 (USDT)
    console.log('Deploying L2 ERC20...')
    const L2_ERC20 = await factory__L2_ERC20.connect(l2OwnerWallet).deploy(
        l2MessengerAddress,
        'L2_USDT', //name
        {
            gasPrice: 0
        }
    )
    await L2_ERC20.deployTransaction.wait()

    //2.1. deploy default ERC20 gateway to L1
    // Create a gateway that connects the two contracts.
    console.log('Deploying L1 ERC20 Gateway...')
    const L1_ERC20Gateway = await factory__L1_ERC20Gateway.connect(l1OwnerWallet).deploy(
        L1_ERC20.address,
        L2_ERC20.address,
        l1MessengerAddress
    )
    await L1_ERC20Gateway.deployTransaction.wait()

    //3. deploy wrapped ERC20 to L1 (trollUSDT)
    console.log('Deploying L1 WERC20...')
    const L1_WERC20 = await factory__L1_WERC20.connect(l1OwnerWallet).deploy(
        L1_ERC20.address, //initialSupply
        'L1_trollUSDT', //name
        'L1_trollUSDT', //symbol
    )
    await L1_WERC20.deployTransaction.wait()

    //7. deploy wrapped mirror ERC20 to L2 (trollUSDT)
    console.log('Deploying L2 ExtendedERC20...')
    const L2_ExtendedERC20 = await factory__L2_ExtendedERC20.connect(l2OwnerWallet).deploy(
        l2MessengerAddress,
        'L2_trollUSDT', //name
        {
            gasPrice: 0
        }
    )
    await L2_ExtendedERC20.deployTransaction.wait()

    console.log('Deploying L1 WERC20 Gateway...')
    const L1_ExtendedERC20Gateway = await factory__L1_ExtendedERC20Gateway.connect(l1OwnerWallet).deploy(
        L1_ERC20.address,
        L2_ExtendedERC20.address,
        l1MessengerAddress
    )
    await L1_ExtendedERC20Gateway.deployTransaction.wait()

    //4. deploy L1 Bank to L1
    console.log('Deploying L1 BANK...')
    const L1_BANK = await factory__L1_BANK.connect(l1OwnerWallet).deploy(
        [L1_ERC20Gateway.address],
        [L1_ERC20.address]
    )
    await L1_BANK.deployTransaction.wait()

    // deploy l2 contracts
    //6. initialize L2 ERC20 with L1 gateway
    console.log('Initializing L2 ERC20...')
    const tx0 = await L2_ERC20.init(
        L1_ERC20Gateway.address,
        {
            gasPrice: 0
        }
    )
    await tx0.wait()

    //8. deploy L2 Bank to L2
    console.log('Deploying L2 BANK...')
    const L2_BANK = await factory__L2_BANK.connect(l2OwnerWallet).deploy(
        [L2_ERC20.address],
        [L2_ExtendedERC20.address]
    )
    await L2_BANK.deployTransaction.wait()

    //9. configure L2 Bank with L1 Bank
    console.log('configuring L2 bank to work with L1 Bank...')
    const tx1 = await L2_BANK.init(L1_BANK.address)
    await tx1.wait()

    // set up user balance on L2
    //10. transfer USDT from owner to user on L1
    //11. approve L1 ERC20 to L1 Token Gateway (from user)
    //12. deposit USDT to gateway (from user)
    //13. wait for USDT to arrive on L2

    // wrap USDT, send in to L2, deposit it to the L2 Bank
    //14. wrap USDT on L1 (owner)
    //15. approve trollUSDT to L1 troll token gateway
    //16. deposit troll token to gateway (from owner)
    //17. wait for trollUSDT to arrive on L2
    //18. send trollUSDT to L2 Bank

    // main case
    //19. initiate instant withdrawal (L2Bank.swap, from user)
    //20. listen to the L2Bank.SwapInitiated event
    //21. call L1Bank.processL1WithdrawalManually with event data (and l1WrappedTokenAddress from local const)
    //22. sout user balance




}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
