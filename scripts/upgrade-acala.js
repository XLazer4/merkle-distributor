const { upgrades, ethers } = require("hardhat");
const { providerOverrides } = require('../utils/overrideProvider');
require('dotenv').config();

const DISTRIBUTOR = "0x219FA396aE50f789b0cE5e27D6EcbE6b36ef49d9";

async function main() {
    const overrides = await providerOverrides(process.env.ACALA_ENDPOINT_URL);
    const deployer = overrides.signer;

    console.log('Deployer addresss: ' + deployer.address + ", balance: " + (await deployer.getBalance()).toString());

    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor", deployer);
    const distributor = await upgrades.upgradeProxy(DISTRIBUTOR, MerkleDistributor);

    console.log('Merkle distributor: ' + distributor.address);
    console.log('Current cycle: ' + (await distributor.currentCycle()));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
    });