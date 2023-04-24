import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@ericxstone/hardhat-blockscout-verify";
dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
 const config: HardhatUserConfig = {
  solidity: "0.8.4",
  networks: {
    local: {
      url: 'http://127.0.0.1:8545',
      accounts: {
        mnemonic: 'fox sight canyon orphan hotel grow hedgehog build bless august weather swarm',
        path: "m/44'/60'/0'/0",
      },
      chainId: 595,
    },
    mandalaDev: {
      url: 'http://ec2-52-221-191-252.ap-southeast-1.compute.amazonaws.com:8545',
      accounts: {
        mnemonic: 'fox sight canyon orphan hotel grow hedgehog build bless august weather swarm',
        path: "m/44'/60'/0'/0",
      },
      chainId: 595,
      timeout: 60000,
    },
    mandala: {
      url: 'https://tc7-eth.aca-dev.network',
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
      chainId: 595,
      timeout: 60000,
    },
    karura: {
      url: 'https://eth-rpc-karura.aca-api.network/',
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
      chainId: 686,
      timeout: 60000,
    },
    acala: {
      url: 'https://eth-rpc-acala.aca-api.network/',
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
      chainId: 787,
      timeout: 60000,
    },
  }
};

export default config;