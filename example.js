const ethers = require('ethers')
const { Watcher } = require('@eth-optimism/watcher')

async function main() {
  const l1RpcProvider = new ethers.providers.JsonRpcProvider('http://localhost:9545')
  const l2RpcProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545')
  
  // TODO
  const {
    l1MessengerAddress,
    l2MessengerAddress
  } = {}

  // Tool that helps watches and waits for messages to be relayed between L1 and L2.
  const watcher = new Watcher({
    l1: {
      provider: l1Provider,
      messengerAddress: l1MessengerAddress
    },
    l2: {
      provider: l2Provider,
      messengerAddress: l2MessengerAddress
    }
  })

  // TODO: deploy L1 erc20
  // TODO: deploy L1 erc20 gateway
  // TODO: deploy L2 erc20

  // Allow the gateway to lock up some of our tokens.
  const tx1 = await L1_ERC20.approve(1234)
  await tx1.wait()

  // Lock the tokens up inside the gateway and ask the L2 contract to mint new ones.
  const tx2 = await L1_ERC20Gateway.deposit(1234)
  await tx2.wait()

  // Wait for the message to be relayed to L2.
  const [ msgHash1 ] = await watcher.getMessageHashesFromL1Tx(tx2.hash)
  await watcher.getL2TransactionReceipt(msgHash1)

  // Log some balances to see that it worked!
  console.log(await L1_ERC20.balanceOf(wallet.address)) // 0
  console.log(await L2_ERC20.balanceOf(wallet.address)) // 1234

  // Burn the tokens on L2 and ask the L1 contract to unlock on our behalf.
  const tx3 = await L2_ERC20.withdraw(1234)
  await tx3.wait()

  // Wait for the message to be relayed to L1.
  const [ msgHash2 ] = await watcher.getMessageHashesFromL2Tx(tx3.hash)
  await watcher.getL1TransactionReceipt(msgHash2)

  // Log balances again!
  console.log(await L1_ERC20.balanceOf(wallet.address)) // 1234
  console.log(await L2_ERC20.balanceOf(wallet.address)) // 0
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
