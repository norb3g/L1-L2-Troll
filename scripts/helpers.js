const { Provider } = require('@ethersproject/providers')
const { Wallet, ContractFactory, Contract } = require('ethers')
const { getContractFactory, getContractDefinition } = require('@eth-optimism/contracts')

const MyERC20 = require('../artifacts/contracts/MyERC20.sol/MyERC20.json')
const Def__MyL2DepositedERC20 = require('../artifacts/contracts/MyL2DepositedERC20.sol/MyL2DepositedERC20.ovm.json')


// export type ConfiguredGateway = {
//     L1_ERC20: Contract
//     OVM_L1ERC20Gateway: Contract
//     OVM_L2DepositedERC20: Contract
// }

// export type ERC20Config = {
//     name: string
//     ticker: string
//     decimals: number
//     initialSupply: number
// }

// export const defaultERC20Config: ERC20Config = {
//     name: 'REEERC20',
//     ticker: 'REE',
//     decimals: 18,
//     initialSupply: 1000
// }

export const getDeployedERC20Config = async (
    provider,
    erc20
) => {
    // TODO: actually grab from the contract's fields
    return defaultERC20Config
}

export const deployNewGateway = async (
    l1Wallet,
    l2Wallet,
    l1ERC20,
    l1MessengerAddress,
    l2MessengerAddress,
) => {
    let OVM_L1ERC20Gateway
    let OVM_L2DepositedERC20

    const ERC20Config = await getDeployedERC20Config(l1Wallet.provider, l1ERC20)
    // Deploy L2 ERC20 Gateway
    const Factory__OVM_L2DepositedERC20 = new ContractFactory(
        Def__MyL2DepositedERC20.abi,
        Def__MyL2DepositedERC20.bytecode,
        l2Wallet
    )

    OVM_L2DepositedERC20 = await Factory__OVM_L2DepositedERC20.deploy(
        l2MessengerAddress,
        ERC20Config.decimals,
        'OVM_' + ERC20Config.name,
        'ovm' + ERC20Config.ticker
    )
    await OVM_L2DepositedERC20.deployTransaction.wait()
    console.log('OVM_L2DepositedERC20 deployed to:', OVM_L2DepositedERC20.address)

    // Deploy L1 ERC20 Gateway
    const Factory__OVM_L1ERC20Gateway = getContractFactory('OVM_L1ERC20Gateway')
    OVM_L1ERC20Gateway = await Factory__OVM_L1ERC20Gateway.connect(l1Wallet).deploy(
        l1ERC20.address,
        OVM_L2DepositedERC20.address,
        l1MessengerAddress
    )
    await OVM_L1ERC20Gateway.deployTransaction.wait()
    console.log('OVM_L1ERC20Gateway deployed to:', OVM_L1ERC20Gateway.address)

    // Init L2 ERC20 Gateway
    console.log('Connecting L2 WETH with L1 Deposit contract...')
    const initTx = await OVM_L2DepositedERC20.init(OVM_L1ERC20Gateway.address)
    await initTx.wait()

    return {
        OVM_L1ERC20Gateway,
        OVM_L2DepositedERC20
    }
}

export const setupOrRetrieveGateway = async (
    l1Wallet,
    l2Wallet,
    l1ERC20Address,
    l1ERC20GatewayAddress,
    l1MessengerAddress,
    l2MessengerAddress,
    ERC20Config
) => {
    // Deploy or retrieve L1 ERC20
    let L1_ERC2
    if (
        !l1ERC20Address
    ) {
        console.log('No L1 ERC20 specified--deploying a new test ERC20 on L1.')
        const L1ERC20Factory = new ContractFactory(MyERC20.abi, MyERC20.bytecode, l1Wallet)
        L1_ERC20 = await L1ERC20Factory.deploy(ERC20Config.decimals, ERC20Config.name, ERC20Config.ticker, ERC20Config.initialSupply)
        console.log('New L1_ERC20 deployed to:', L1_ERC20.address)
        l1ERC20Address = L1_ERC20.address
    } else {
        console.log('Connecting to existing L1 ERC20 at:', l1ERC20Address)
        L1_ERC20 = new Contract(l1ERC20Address, MyERC20.abi, l1Wallet)
    }

    let OVM_L1ERC20Gateway
    let OVM_L2DepositedERC20
    if (!l1ERC20GatewayAddress) {
        console.log('No gateway contract specified, deploying a new one...')
        const newGateway = await deployNewGateway(l1Wallet, l2Wallet, L1_ERC20, l1MessengerAddress, l2MessengerAddress)
        OVM_L1ERC20Gateway = newGateway.OVM_L1ERC20Gateway
        OVM_L2DepositedERC20 = newGateway.OVM_L2DepositedERC20
    } else {
        const OVM_L1ERC20Gateway_Def = getContractDefinition('OVM_L1ERC20Gateway', false);
        OVM_L1ERC20Gateway = new Contract(l1ERC20GatewayAddress, OVM_L1ERC20Gateway_Def.abi, l1Wallet)
        const l2ERC20GatewayAddress = await OVM_L1ERC20Gateway.l2DepositedToken()
        OVM_L2DepositedERC20 = new Contract(l2ERC20GatewayAddress, Def__MyL2DepositedERC20.abi, l2Wallet)
    }

    console.log('Completed getting full ERC20 gateway.')
    return {
        L1_ERC20,
        OVM_L1ERC20Gateway,
        OVM_L2DepositedERC20
    }
}