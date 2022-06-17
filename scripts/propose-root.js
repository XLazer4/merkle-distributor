const { calcEthereumTransactionParams } = require("@acala-network/eth-providers");
const { ethers } = require("hardhat");

const DISTRIBUTOR = '0xff066331be693BE721994CF19905b2DC7475C5c9';
const NEW_ROOT = '0x89fea14f3b5e5e298fb4b42e04e50fac471ea5c0a0ca2a39bb64a4869c0cd7df';
const NEW_CYCLE = 1;
const NEW_START_BLOCK = 0;
const NEW_END_BLOCK = 1;

async function main() {
    const blockNumber = await ethers.provider.getBlockNumber();
    
    const ethParams = calcEthereumTransactionParams({
        gasLimit: '21000010',
        validUntil: (blockNumber + 100).toString(),
        storageLimit: '640010',
        txFeePerGas: '199999946752',
        storageByteDeposit: '100000000000000'
    });
    const [deployer] = await ethers.getSigners();

    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    const distributor = MerkleDistributor.attach(DISTRIBUTOR);
    console.log('Cycle before: ' + await distributor.currentCycle());

    // const role = await distributor.ROOT_PROPOSER_ROLE();
    // console.log('Role: ' + role)
    // console.log('Has role: ' + await distributor.hasRole(role, '0xb1a0E8F86546f33605Fba526AB539aa0E42725eb'));
    // const tx = await distributor.grantRole(role, '0xb1a0E8F86546f33605Fba526AB539aa0E42725eb');
    // await tx.wait();
    // console.log('Has role: ' + await distributor.hasRole(role, '0xb1a0E8F86546f33605Fba526AB539aa0E42725eb'));

    const tx1 = await distributor.proposeRoot(NEW_ROOT, ethers.utils.formatBytes32String(''), NEW_CYCLE, NEW_START_BLOCK, NEW_END_BLOCK, {
        gasPrice: ethParams.txGasPrice,
        gasLimit: ethParams.txGasLimit,
    });
    await tx1.wait();

    console.log('Cycle after: ' + await distributor.currentCycle());
    console.log('Pending cycle: ' + await distributor.pendingCycle());
    console.log('Pending Merkle root: ' + await distributor.pendingMerkleRoot());
    console.log('Pending Merkle content hash: ' + await distributor.pendingMerkleContentHash());
    console.log('Last proposed start block: ' + await distributor.lastProposeStartBlock());
    console.log('Last proposed end block: ' + await distributor.lastProposeEndBlock());
    console.log('Last proposed timestamp: ' + await distributor.lastProposeTimestamp());
    console.log('Last proposed block number: ' + await distributor.lastProposeBlockNumber());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
    });