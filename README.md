# L1/L2 ERC20 Deposit + Withdrawal Example

Sorry, I haven't had time to fill out this readme fully!
This brief readme will have to do for now.

## Prerequisite Software

- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Node.js](https://nodejs.org/en/download/)
- [Yarn](https://classic.yarnpkg.com/en/docs/install#mac-stable)
- [Docker](https://docs.docker.com/engine/install/)

## Running the Example

Run the following commands to get started:

```sh
yarn install
yarn compile
```

Make sure you have the local L1/L2 system running (open a second terminal for this):

```sh
git clone git@github.com:ethereum-optimism/optimism.git
cd optimism
yarn
yarn build
cd ops
docker-compose build
docker-compose up
```

Now run the example file:

```sh
node ./example.js
```

If everything goes well, you should see the following:

```text
Deploying L1 ERC20...
Deploying L2 ERC20...
Deploying L1 ERC20 Gateway...
Initializing L2 ERC20...
Balance on L1: 1234
Balance on L2: 0
Approving tokens for ERC20 gateway...
Depositing tokens into L2 ERC20...
Waiting for deposit to be relayed to L2...
Balance on L1: 0
Balance on L2: 1234
Withdrawing tokens back to L1 ERC20...
Waiting for withdrawal to be relayed to L1...
Balance on L1: 1234
Balance on L2: 0
```
