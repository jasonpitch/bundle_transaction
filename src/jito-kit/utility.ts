import BN from "bn.js";
import * as fs from "fs";
import BigNumber from "bignumber.js";
import { Commitment, Connection, PublicKey } from "@solana/web3.js";
import { EnvironmentManager } from "./global";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Liquidity,
  LiquidityPoolInfo,
  LiquidityPoolKeys,
  SPL_ACCOUNT_LAYOUT,
  Token,
  findProgramAddress
} from "@raydium-io/raydium-sdk";
import { MARKET_STATE_LAYOUT_V3 } from "@project-serum/serum";

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true; // File exists
  } catch (error) {
    return false; // File doesn't exist
  }
}

export const xWeiAmount = (amount: number, decimals: number) => {
  return new BN(
    new BigNumber(amount.toString() + "e" + decimals.toString()).toFixed(0)
  );
};

export const getConnection = (commitment: Commitment): Connection => {
  return new Connection(EnvironmentManager.getRpcNetUrl(), commitment);
};

export const getWalletAccounts = async (
  connection: Connection,
  wallet: PublicKey
) => {
  const wallet_token_account = await connection.getTokenAccountsByOwner(
    wallet,
    {
      programId: TOKEN_PROGRAM_ID
    }
  );

  return wallet_token_account.value.map((i) => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data)
  }));
};

export const getAvailablePoolKeyAndPoolInfo = async (
  connection: Connection,
  baseToken: Token,
  quoteToken: Token,
  marketAccounts: any
): Promise<{
  poolKeys: any;
  poolInfo: any;
}> => {
  let bFound = false;
  let count = 0;
  let poolKeys: any;
  let poolInfo: any;

  while (bFound === false && count < marketAccounts.length) {
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(
      marketAccounts[count].accountInfo.data
    );

    poolKeys = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint: baseToken.mint,
      quoteMint: quoteToken.mint,
      baseDecimals: baseToken.decimals,
      quoteDecimals: quoteToken.decimals,
      marketId: marketAccounts[count].publicKey,
      programId: EnvironmentManager.getProgramID().AmmV4,
      marketProgramId: EnvironmentManager.getProgramID().OPENBOOK_MARKET
    });

    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;

    try {
      poolInfo = await Liquidity.fetchInfo({
        connection: connection,
        poolKeys: poolKeys
      });

      bFound = true;
      console.log("Success to get pool infos...");
    } catch (error) {
      bFound = false;
      poolInfo = undefined;
      poolKeys = undefined;
      console.log("Failed to get pool infos...");
    }

    count++;
  }

  return {
    poolKeys: poolKeys,
    poolInfo: poolInfo
  };
};

export function getATAAddress(
  programId: PublicKey,
  owner: PublicKey,
  mint: PublicKey
) {
  const { publicKey, nonce } = findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return { publicKey, nonce };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
