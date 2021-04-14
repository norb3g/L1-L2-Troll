const chai, { expect } = require('chai')
const { solidity } = require('ethereum-waffle')

chai.use(solidity)

module.exports = { expect }
