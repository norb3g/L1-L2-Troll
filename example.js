const ethers = require('ethers')
const { Watcher } = require('@eth-optimism/watcher')
const { getContractFactory } = require('@eth-optimism/contracts')

const factory__L1_ERC20Gateway = getContractFactory('OVM_L1ERC20Gateway')
const factory__L1_ERC20 = require('../artifacts/contracts/MyERC20.sol/MyERC20.json')
const factory__L2_ERC20 = require('../artifacts/contracts/MyL2DepositedERC20.sol/MyL2DepositedERC20.json')

async function main() {
  // Set up our RPC provider connections.
  const l1RpcProvider = new ethers.providers.JsonRpcProvider('http://localhost:9545')
  const l2RpcProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545')

  // Set up our wallets (using a default private key with 10k ETH allocated to it).
  // Need two wallets objects, one for interacting with L1 and one for interacting with L2.
  // Both will use the same private key.
  const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  const l1Wallet = new ethers.Wallet(key, l1RpcProvider)
  const l2Wallet = new ethers.Wallet(key, l2RpcProvider)

  // TODO (this is the last one I think)
  const {
    l1MessengerAddress,
    l2MessengerAddress
  } = {}

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

  // Deploy an ERC20 token on L1.
  const L1_ERC20 = await factory__L1_ERC20.connect(l1Wallet).deploy(
    18, //decimals
    'My ERC20', //name
    'myERC20', //ticker
    1234, //initialSupply
  )
  await L1_ERC20.deployTransaction.wait()

  // Deploy the paired ERC20 token to L2.
  const L2_ERC20 = await factory__L2_ERC20.connect(l2Wallet).deploy(
    l2MessengerAddress,
    18, //decimals
    'My L2 ERC20', //name
    'myL2ERC20', //ticker
  )
  await L2_ERC20.deployTransaction.wait()

  // Create a gateway that connects the two contracts.
  const L1_ERC20Gateway = await factory__L1_ERC20Gateway.connect(l1Wallet).deploy(
    L1_ERC20.address,
    L2_ERC20.address,
    l1MessengerAddress
  )
  await L1_ERC20Gateway.deployTransaction.wait()

  // Allow the gateway to lock up some of our tokens.
  const tx1 = await L1_ERC20.approve(L1_ERC20Gateway.address, 1234)
  await tx1.wait()

  // Lock the tokens up inside the gateway and ask the L2 contract to mint new ones.
  const tx2 = await L1_ERC20Gateway.deposit(1234)
  await tx2.wait()

  // Wait for the message to be relayed to L2.
  const [ msgHash1 ] = await watcher.getMessageHashesFromL1Tx(tx2.hash)
  await watcher.getL2TransactionReceipt(msgHash1)

  // Log some balances to see that it worked!
  console.log(await L1_ERC20.balanceOf(l1Wallet.address)) // 0
  console.log(await L2_ERC20.balanceOf(l1Wallet.address)) // 1234

  // Burn the tokens on L2 and ask the L1 contract to unlock on our behalf.
  const tx3 = await L2_ERC20.withdraw(1234)
  await tx3.wait()

  // Wait for the message to be relayed to L1.
  const [ msgHash2 ] = await watcher.getMessageHashesFromL2Tx(tx3.hash)
  await watcher.getL1TransactionReceipt(msgHash2)

  // Log balances again!
  console.log(await L1_ERC20.balanceOf(l1Wallet.address)) // 1234
  console.log(await L2_ERC20.balanceOf(l1Wallet.address)) // 0
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
