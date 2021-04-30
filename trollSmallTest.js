///////////////////////////

let PREDEPLOYED_ADDRESSES;
let PREDEPLOYED_ADDRESSES_FILEPATH = "PREDEPLOYED_ADDRESSES.json";

///////////////////////////

const l1RpcProviderUrl = 'https://kovan.infura.io/v3/e131c7a0c10f45a4b68b470a4a109543';
const l2RpcProviderUrl = 'https://kovan.optimism.io';
const ownerKey = '0xd08b5a0794ea26c523a96c3c9a9a5a9eaad43056a5ef593a24eb14c58fc8c049'
const userKey = '0xd08b5a0794ea26c523a96c3c9a9a5a9eaad43056a5ef593a24eb14c58fc8c050'
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

    const L1_ExtendedERC20Gateway = factory__L1_ExtendedERC20Gateway.connect(l1OwnerWallet).attach(PREDEPLOYED_ADDRESSES.L1_ExtendedERC20Gateway);

    const tx8 = await L1_ExtendedERC20Gateway.deposit(10);
    await tx8.wait();
    console.log('deposited troll token to gateway')

    //17. wait for trollUSDT to arrive on L2
    const [msgHash2] = await watcher.getMessageHashesFromL1Tx(tx8.hash)
    await watcher.getL2TransactionReceipt(msgHash2)
    console.log('trollUSDT arrived on L2')
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
