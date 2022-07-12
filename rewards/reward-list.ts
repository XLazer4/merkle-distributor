import { ethers, BigNumber } from "ethers";
import { MerkleTree } from "./merkle-tree";
import { keyring as Keyring } from '@polkadot/ui-keyring';
import * as fs from 'fs';
import * as _ from 'lodash';

export interface TokenAmounts {
    [token: string]: BigNumber;
};

export interface Distribution {
    merkleRoot: string,
    cycle: number,
    startBlock: string,
    endBlock: string,
    tokenTotals: {[token: string]: string},
    claims: {[user: string]: any}
}

export class RewardList {
    public claims: {[user: string]: TokenAmounts};
    public reserves: {[user: string]: TokenAmounts};
    public totals: TokenAmounts;
    public cycle: number;
    public startBlock: number;
    public endBlock: number;

    constructor(cycle: number, startBlock: number, endBlock: number) {
        this.cycle = cycle;
        this.startBlock = startBlock;
        this.endBlock = endBlock;
        this.claims = {};
        this.reserves = {};
        this.totals = {};
    }

    public updateUserReserve(user: string, token: string, toUpdate: string) {
        if (!this.reserves[user]) this.reserves[user] = {};
        this.reserves[user][token] = BigNumber.from(toUpdate);
    }

    public increaseUserRewards(user: string, token: string, toAdd: string) {        
        if (!this.claims[user]) this.claims[user] = {};
        if (!this.claims[user][token]) {
            this.claims[user][token] = BigNumber.from(toAdd);
        } else {
            this.claims[user][token] = this.claims[user][token].add(BigNumber.from(toAdd));
        }
        
        if (!this.totals[token]) {
            this.totals[token] = BigNumber.from(toAdd);
        } else {
            this.totals[token] = this.totals[token].add(BigNumber.from(toAdd));
        }
    }

    public static encodeUser(user: string, tokenAmounts: TokenAmounts = {}, reserveAmounts: TokenAmounts = {}, cycle: number, index: number) {
        const tokens = _.union(_.keys(tokenAmounts), _.keys(reserveAmounts));
        const node = {
            user,
            tokens,
            cumulativeAmounts: tokens.map(token => tokenAmounts[token] || BigNumber.from(0)),
            reserveAmounts: tokens.map(token => reserveAmounts[token] || BigNumber.from(0)),
            cycle,
            index
        };

        const coder = new ethers.utils.AbiCoder();
        const encoded = coder.encode(
            ["uint", "bytes32", "uint", "address[]", "uint[]"],
            [
                index,
                Keyring.decodeAddress(user),
                cycle,
                Object.keys(tokenAmounts),
                Object.values(tokenAmounts).map(amount => amount.toString())
            ]
        );
        // const hash = ethers.utils.keccak256(encoded);
        return {node, encoded};
    }

    public encodeList() {
        const nodes = [];
        const encodedNodes = [];
        const entries = [];

        const test = [];

        // Index is based on the input list ordering
        const users = Object.keys(this.claims);
        
        for (let i = 0; i < users.length; i++) {
            const { node, encoded } = RewardList.encodeUser(users[i], this.claims[users[i]], this.reserves[users[i]], this.cycle, i);
            nodes.push(node);
            encodedNodes.push(encoded);
            entries.push({node, encoded});

            const userAddress = Keyring.encodeAddress(Keyring.decodeAddress(users[i]), 42);

            test.push(`${userAddress},${i},${encoded}`);
        }

        fs.writeFileSync('user_target.txt', test.join("\n"));

        return {nodes, encodedNodes, entries};
    }

    public toMerkleTree(): Distribution {
        const {nodes, encodedNodes, entries} = this.encodeList();
        const tree = new MerkleTree(encodedNodes);
        const distribution: Distribution = {
            merkleRoot: ethers.utils.hexlify(tree.getRoot()),
            cycle: this.cycle,
            startBlock: this.startBlock + "",
            endBlock: this.endBlock + "",
            tokenTotals: {},
            claims: {}
        };

        for (const token in this.totals) {
            distribution["tokenTotals"][token] = this.totals[token].toString();
        }

        for (const entry of entries) {
            distribution["claims"][entry.node.user] = {
                index: ethers.utils.hexlify(entry.node.index),
                user: entry.node.user,
                cycle: this.cycle,
                tokens: entry.node.tokens,
                cumulativeAmounts: entry.node.cumulativeAmounts.map(amount => amount.toString()),
                reserveAmounts: entry.node.reserveAmounts.map(amount => amount.toString()),
                proof: tree.getProof(entry.encoded),
                node: entry.encoded
            };
        }

        return distribution;
    }
}