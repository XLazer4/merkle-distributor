/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

import '@acala-network/types'
import '@acala-network/types/interfaces/types-lookup'

import { BN } from 'bn.js'
import runner from './lib/runner'
import * as fs from 'fs'

export const getTaiKsmRawBalance = async (block: number) => {
  const accountFile = __dirname + `/data/accounts/karura_${block}.txt`;
  const rawBalanceFile = __dirname + `/data/balances/taiksm_${block}_raw.csv`;
  if (fs.existsSync(rawBalanceFile)) {
    console.log(`${rawBalanceFile} exists. Skip querying raw balances.`);
    return;
  }

  await runner()
    .requiredNetwork(['karura'])
    .withApiPromise()
    .atBlock(block)
    .run(async ({ apiAt }) => {
      const accs = fs.readFileSync(accountFile, {encoding:'utf8', flag:'r'}).split("\n");
      console.log(`Account number: ${accs.length}`);
      const fd = await fs.promises.open(rawBalanceFile, "w");
      await fs.promises.writeFile(fd, "AccountId,Pool Balance,DEX Balance,Incentive Share\n");

      let promises: Promise<void>[] = [];
      let count = 0;
      const start = new Date();
      console.log(`Start querying taiKSM balance at ${start.toTimeString()}`);
      for (const accountId of accs) {
        if (accountId) {
          promises.push((async () => {
            // taiKSM balance
            const balance = await apiAt.query.tokens.accounts(accountId, {'StableAssetPoolToken': 0}) as any;
            // takKSM in loan position
            const incentives = await apiAt.query.rewards.sharesAndWithdrawnRewards({'Loans': {'StableAssetPoolToken': 0}}, accountId) as any;
            // taiKSM in TAI-taiKSM
            const dex = await apiAt.query.tokens.accounts(accountId, {'DexShare': [{'Token': 'TAI'}, {'StableAssetPoolToken': 0}]}) as any;

            if (balance.free.gt(new BN(0)) || dex.free.gt(new BN(0)) || incentives[0].gt(new BN(0))) {
              await fs.promises.writeFile(fd, accountId + "," + balance.free + "," + dex.free + "," + incentives[0] + "\n");
              count++;
            }
          })());
          if (promises.length > 500) {
            await Promise.all(promises);
            promises = [];
            console.log(`${count} accounts processed.`);
          }
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      await fd.close();
      const end = new Date();
      console.log(`End querying taiKSM balance at ${end.toTimeString()}`);
      console.log(`taiKSM account number: ${count}, duration: ${(end.getTime() - start.getTime()) / 1000}s`);
    });
}

export const getTaiKsmBalance = async (block: number) => {
  const rawBalanceFile = __dirname + `/data/balances/taiksm_${block}_raw.csv`;
  const balanceFile = __dirname + `/data/balances/taiksm_${block}.csv`;
  if (fs.existsSync(balanceFile)) {
    console.log(`${balanceFile} exists. Skip querying raw balances.`);
    return;
  }

  const excluded = ['5EYCAe5fiQJsnqbdsqzNnWhEAGZkyK8uqahrmhwVvcuNRhpd', '5EYCAe5fiQJso5shMc1vDwj12vXpXhuYHDwVES1rKRJwcWVj'];
  // const accountData: {[address: string]: {balance: BN, dex: typeof BN, incentive: typeof BN}} = {}
  const accountData: {[address: string]: any} = {};
  let dexTotal = new BN(0);
  let incentiveTotal = new BN(0);

  const rawBalances = fs.readFileSync(rawBalanceFile, {encoding:'utf8', flag:'r'}).split("\n");
  for (const rawBalance of rawBalances) {
    if (rawBalance.includes("AccountId")) continue;

    const [address, balance, dex, incentive] = rawBalance.split(",");
    if (!address) continue;
    dexTotal = dexTotal.add(new BN(dex));
    incentiveTotal = incentiveTotal.add(new BN(incentive));

    if (!accountData[address]) {
      accountData[address] = {
        balance: new BN(0),
        dex: new BN(0),
        incentive: new BN(0)
      }
    }
    accountData[address].balance = accountData[address].balance.add(new BN(balance.toString()));
    accountData[address].dex = accountData[address].dex.add(new BN(dex.toString()));
    accountData[address].incentive = accountData[address].incentive.add(new BN(incentive.toString()));
  }

  const dexBalance = accountData['5EYCAe5fiQJsnqbdsqzNnWhEAGZkyK8uqahrmhwVvcuNRhpd'].balance;
  const incentiveBalance = accountData['5EYCAe5fiQJso5shMc1vDwj12vXpXhuYHDwVES1rKRJwcWVj'].balance;
  console.log(`DEX balance: ${dexBalance.toString()}`);
  console.log(`Incentive balance: ${incentiveBalance.toString()}`);
  console.log(`Dex total: ${dexTotal.toString()}`)
  console.log(`Incentive total: ${incentiveTotal.toString()}`);

  const fd = await fs.promises.open(balanceFile, "w");
  for (const address in accountData) {
    if (excluded.includes(address)) continue;
    const userBalance = accountData[address].balance;

    const userDex = accountData[address].dex.mul(dexBalance).div(dexTotal);
    const userIncentive = accountData[address].incentive.mul(incentiveBalance).div(incentiveTotal);

    const total = userBalance.add(userDex).add(userIncentive);
    await fs.promises.writeFile(fd, address + "," + total.toString() + "\n");
  }
  await fd.close();
}