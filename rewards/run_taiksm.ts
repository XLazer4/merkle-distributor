import { ethers } from "hardhat";

import { distributeTaiKsm } from "./distribute-taiksm";
import { generateMerkle } from "./generate_merkle";
import { getAccounts } from "./query-accounts";
import { getTaiKsmRawBalance, getTaiKsmBalance } from "./query-balance-taiksm";
import { submitMerkle } from "./submit-merkle";

const main = async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log('Current block number: ' + blockNumber)
    // Round down to nearest 200 blocks
    const block = Math.floor(blockNumber / 200) * 200;
    console.log(`taiKSM pipeline runs at block ${block}`);

    // Common
    await getAccounts('karura', block);

    // Asset-specific
    await getTaiKsmRawBalance(block);
    await getTaiKsmBalance(block);
    await distributeTaiKsm(block);

    // Common
    await generateMerkle("taiksm", block);
    await submitMerkle("taiksm");
}

main().then(() => {
    process.exit(0);
}).catch(error => {
    console.error(error);
    process.exit(1);
})