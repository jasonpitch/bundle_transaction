import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import dotenv from "dotenv";
import { Market, MARKET_STATE_LAYOUT_V3 } from "@project-serum/serum";
import { getKeypairFromEnvironment } from "@solana-developers/node-helpers";
import { BN } from "bn.js";
import { createInitializeAccountInstruction, getMint } from "@solana/spl-token";
import {
  CurrencyAmount,
  Liquidity,
  LiquidityPoolInfo,
  Percent,
  TOKEN_PROGRAM_ID,
  Token,
  findProgramAddress,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import {
  BUNDLE_TRANSACTION,
  EnvironmentManager,
  NETWORK_MODE,
  PoolManager,
  SPL_ERROR,
  buyToken,
  createAndSendBundleTransaction,
  createOpenBookMarket,
  createPool,
  createToken,
  getAvailablePoolKeyAndPoolInfo,
  getConnection,
  sellToken,
  sendAndConfirmTransactionWithCheck,
  sendAndConfirmTransactionsWithCheck,
  signTransactions,
  sleep,
} from "./jito-kit";
const log = require('loglevel');

log.warn = () => {};

dotenv.config();

let connection: Connection;

const initializeVariables = () => {
  const dev_net =
    process.env.DEVNET === "true"
      ? NETWORK_MODE.NETWORK_DEV
      : NETWORK_MODE.NETWORK_MAIN;
  EnvironmentManager.setNetworkMode(dev_net);
  EnvironmentManager.setNetUrls(
    process.env.MAIN_NET_URL!,
    clusterApiUrl("devnet"),
    clusterApiUrl("testnet")
  );
  EnvironmentManager.setQuoteTokenInfo({
    address: "So11111111111111111111111111111111111111112",
    decimal: 9,
    name: "WSOL",
    symbol: "WSOL",
  });
  EnvironmentManager.setJitoKeypair(getKeypairFromEnvironment("JITO_AUTH_KEY"));

  connection = getConnection("confirmed");
};

const doCreateToken = async () => {
  const token_name = process.env.TOKEN_NAME!;
  const token_symbol = process.env.TOKEN_SYMBOL!;
  const token_decimal = Number(process.env.TOKEN_DECIMAL);
  const token_supply = Number(process.env.TOKEN_TOTAL_MINT);
  const token_description = process.env.TOKEN_DESCRIPTION;
  const token_logo_path = process.env.TOKEN_LOGO!;
  const token_owner = getKeypairFromEnvironment("OWNER_PRIVATE");

  const create_result = await createToken(
    connection,
    token_owner,
    token_name,
    token_symbol,
    token_decimal,
    token_supply,
    token_logo_path,
    token_description
  );

  if (create_result.result !== SPL_ERROR.E_OK) {
    throw "Error: create token failed with some reason";
  }

  //   process.env.MINT_ADDRESS = create_result.value;
};

const doCreateOpenMarket = async () => {
  const token_owner = getKeypairFromEnvironment("OWNER_PRIVATE");

  const create_result = await createOpenBookMarket(
    connection,
    token_owner,
    process.env.MINT_ADDRESS!
  );

  if (create_result != SPL_ERROR.E_OK) {
    throw "Error: create open book market failed because of some reason";
  }
};

const doCreatePool = async (sell_option: boolean) => {
  const token_owner = getKeypairFromEnvironment("OWNER_PRIVATE");
  const token_address = process.env.MINT_ADDRESS!;
  const lp_token_amount = Number(process.env.LP_TOKEN_AMOUNT);
  const lp_sol_amount = Number(process.env.LP_SOL_AMOUNT);
  const quote_info = EnvironmentManager.getQuoteTokenInfo();
  const first_token_amount = Number(process.env.BUYAMOUNT1);
  const second_token_amount = Number(process.env.BUYAMOUNT2);
  const token_decimal = Number(process.env.MINT_DECIMAL);
  const bundle_transaction: BUNDLE_TRANSACTION[] = [];

  const create_result = await createPool(
    connection,
    token_owner,
    token_address,
    lp_token_amount,
    lp_sol_amount
  );

  if (create_result.result !== SPL_ERROR.E_OK) {
    throw "Error: making create pool transaction failed with some reason";
  }

  if (
    typeof create_result.value !== "string" &&
    Array.isArray(create_result.value)
  ) {
    // signTransactions(token_owner, create_result.value);
    // bundle_transaction.push(create_result.value[0] as VersionedTransaction);
    bundle_transaction.push({
      txn: create_result.value[0] as VersionedTransaction,
      signer: token_owner,
    });
  }

  const accounts = await Market.findAccountsByMints(
    connection,
    new PublicKey(token_address),
    new PublicKey(quote_info.address),
    EnvironmentManager.getProgramID().OPENBOOK_MARKET
  );

  if (accounts.length <= 0) {
    throw "Error: can not find the market";
  }

  const market_id = accounts[0].publicKey;
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(
    accounts[0].accountInfo.data
  );

  const poolKeys: any = Liquidity.getAssociatedPoolKeys({
    version: 4,
    marketVersion: 3,
    baseMint: new PublicKey(token_address),
    quoteMint: new PublicKey(quote_info.address),
    baseDecimals: token_decimal,
    quoteDecimals: quote_info.decimal,
    marketId: market_id,
    programId: EnvironmentManager.getProgramID().AmmV4,
    marketProgramId: EnvironmentManager.getProgramID().OPENBOOK_MARKET,
  });
  poolKeys.marketBaseVault = marketInfo.baseVault;
  poolKeys.marketQuoteVault = marketInfo.quoteVault;
  poolKeys.marketBids = marketInfo.bids;
  poolKeys.marketAsks = marketInfo.asks;
  poolKeys.marketEventQueue = marketInfo.eventQueue;

  const pool_mng = new PoolManager(
    {
      address: token_address,
      decimal: Number(process.env.MINT_DECIMAL),
      name: "",
      symbol: "",
    },
    quote_info,
    lp_token_amount,
    lp_sol_amount,
    market_id
  );

  for (let i = 1; i <= 1; i++) {
    const buyer_keypair_str = process.env[`BUYORSELLER${i}`]!;
    const buy_token_amount_str = process.env[`BUYAMOUNT${i}`]!;
    if (buy_token_amount_str.length <= 0 || buyer_keypair_str.length <= 0) {
      break;
    }
    const buy_token_amount =
      buy_token_amount_str.length > 0
        ? Number(process.env[`BUYAMOUNT${i}`])
        : 0;
    const buyer_keypair = getKeypairFromEnvironment(`BUYORSELLER${i}`);
    if (
      buyer_keypair.publicKey.toBase58().length <= 0 ||
      buy_token_amount <= 0
    ) {
      break;
    }

    const buy_sol_amount = pool_mng.computeSolAmount(buy_token_amount, true);
    console.log(
      "Simulated Price: ",
      pool_mng.computeCurrentPrice().toFixed(10),
      "Simulated Sol Amount: ",
      buy_sol_amount.toSignificant()
    );

    const buy_result = await buyToken(
      connection,
      buyer_keypair,
      token_address,
      buy_token_amount,
      Number(buy_sol_amount.toSignificant()),
      poolKeys
    );

    if (buy_result.result !== SPL_ERROR.E_OK) {
      throw `Error: failed to create ${i} buy token transaction`;
    }

    if (
      typeof buy_result.value !== "string" &&
      Array.isArray(buy_result.value)
    ) {
      // signTransactions(buyer_keypair, buy_result.value);
      // bundle_transaction.push(buy_result.value[0] as VersionedTransaction);
      bundle_transaction.push({
        txn: buy_result.value[0] as VersionedTransaction,
        signer: buyer_keypair,
      });
    }

    pool_mng.buyToken(buy_token_amount);
  }

  console.log("=========== create bundle transaction");
  const bundle_result = await createAndSendBundleTransaction(
    connection,
    Number(process.env.JITO_BUNDLE_TIP),
    bundle_transaction,
    token_owner
  );

  if (bundle_result !== true) {
    throw "Error: there's error in bundle transaction";
  }

  if (sell_option) {
    await doSellFunction(poolKeys);
  }

  console.log("All done perfectly");
};

const doBundleTest = async () => {
  const token_address = process.env.MINT_ADDRESS!;
  const token_mint = new PublicKey(token_address);
  const mint_info = await getMint(connection, token_mint);
  const quote_info = EnvironmentManager.getQuoteTokenInfo();
  const first_buyer = getKeypairFromEnvironment("BUYORSELLER1");
  const second_buyer = getKeypairFromEnvironment("BUYORSELLER2");
  const first_amount = 0.0001;
  const second_amount = 0.0001;
  const accounts = await Market.findAccountsByMints(
    connection,
    token_mint,
    new PublicKey(EnvironmentManager.getQuoteTokenInfo().address),
    EnvironmentManager.getProgramID().OPENBOOK_MARKET
  );

  if (accounts.length <= 0) {
    throw "Error: Market not found";
  }

  const { poolKeys: pool_keys, poolInfo: pool_info } =
    await getAvailablePoolKeyAndPoolInfo(
      connection,
      new Token(TOKEN_PROGRAM_ID, token_address, mint_info.decimals),
      new Token(
        TOKEN_PROGRAM_ID,
        quote_info.address,
        quote_info.decimal,
        quote_info.symbol,
        quote_info.name
      ),
      accounts
    );

  const buy_token1 = await buyToken(
    connection,
    first_buyer,
    token_address,
    1,
    first_amount,
    pool_keys
  );
  if (buy_token1.result !== SPL_ERROR.E_OK) {
    throw "Error: first buy token transaction made failed";
  }
  const buy_token2 = await buyToken(
    connection,
    second_buyer,
    token_address,
    1,
    second_amount,
    pool_keys
  );
  if (buy_token2.result !== SPL_ERROR.E_OK) {
    throw "Error: second buy token transaction made failed";
  }
  const bundle_transaction: BUNDLE_TRANSACTION[] = [];
  if (typeof buy_token1.value !== "string" && Array.isArray(buy_token1.value)) {
    // signTransactions(first_buyer, buy_token1.value);
    bundle_transaction.push({
      txn: buy_token1.value[0] as VersionedTransaction,
      signer: first_buyer,
    });
  }
  if (typeof buy_token2.value !== "string" && Array.isArray(buy_token2.value)) {
    signTransactions(second_buyer, buy_token2.value);
    bundle_transaction.push({
      txn: buy_token2.value[0] as VersionedTransaction,
      signer: second_buyer,
    });
  }

  const bundle_result = await createAndSendBundleTransaction(
    connection,
    Number(process.env.JITO_BUNDLE_TIP),
    bundle_transaction,
    first_buyer
  );

  if (bundle_result !== true) {
    throw "Error: Failed to send bundle";
  }
};

function getATAAddress(
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

function percentAmount(amount: string, percent: number): string {
  const inputNum = BigInt(amount); // Convert string to BigInt
  const result = inputNum * BigInt(percent * 100); // Multiply by percent
  return (result / BigInt(100)).toString(); // Round down to the nearest integer
}

const doSellFunction = async (pool_key: any) => {
  const sell_time = process.env.SELL_TIME ? Number(process.env.SELL_TIME) : 0;
  const token_address = process.env.MINT_ADDRESS!;
  const token_decimal = Number(process.env.MINT_DECIMAL!);
  const token_mint = new PublicKey(token_address);
  const mint_info = await getMint(connection, token_mint);
  const fee_payer = process.env.SELLER_WALLET1
    ? getKeypairFromEnvironment(`SELLER_WALLET1`)
    : undefined;

  if (fee_payer === undefined) {
    throw "Please input fee payer";
  }

  if (sell_time) {
    console.log("SELL_OPTION_SLEEPING: ", sell_time + "ms");
    sleep(sell_time);
  }

  const bundle_transaction: BUNDLE_TRANSACTION[] = [];
  for (let i = 1; i < 2; i++) {
    const seller_wallet = process.env[`SELLER_WALLET${i}`]
      ? getKeypairFromEnvironment(`SELLER_WALLET${i}`)
      : undefined;
    const sell_amount_percentage = process.env[`SELL_AMOUNT${i}`]
      ? Number(process.env[`SELL_AMOUNT${i}`])
      : 0;

    if (seller_wallet === undefined || sell_amount_percentage === 0) {
      break;
    }

    const sell_token_account = getATAAddress(
      TOKEN_PROGRAM_ID,
      seller_wallet?.publicKey!,
      token_mint
    );

    const total_token_amount = await connection.getTokenAccountBalance(
      sell_token_account.publicKey
    );

    const actual_sell_amount = new TokenAmount(
      new Token(TOKEN_PROGRAM_ID, token_address, token_decimal),
      percentAmount(total_token_amount.value.amount, sell_amount_percentage)
    );

    console.log("Sell Amount: ", actual_sell_amount.toSignificant());

    const sell_res = await sellToken(
      connection,
      seller_wallet!,
      token_address,
      Number(actual_sell_amount.toSignificant()),
      0,
      pool_key
    );

    if (sell_res.result !== SPL_ERROR.E_OK) {
      throw "Error: Sell token transaction make failed";
    }

    if (typeof sell_res.value !== "string" && Array.isArray(sell_res.value)) {
      bundle_transaction.push({
        signer: seller_wallet!,
        txn: sell_res.value[0] as VersionedTransaction,
      });
    }
  }

  if (bundle_transaction.length >= 1) {
    const bundle_result = await createAndSendBundleTransaction(
      connection,
      Number(process.env.JITO_BUNDLE_TIP),
      bundle_transaction,
      fee_payer!
    );
    if (bundle_result !== true) {
      throw "Sell bundle failed";
    }
  } else {
    console.log(
      "SellToken: there's no parameter for selling check the parameter"
    );
  }
};

(async () => {
  initializeVariables();
  try {
    const execute_creatToken = process.env.CREATE_TOKEN === "true";
    const execute_creatOpenMarket =
      process.env.CREATE_OPEN_BOOK_MARKET === "true";
    const execute_createPool = process.env.CREATE_POOL === "true";
    const execute_time_sell = process.env.SET_SELL_TIME === "true";

    console.log(
      "Execution Condition: ",
      execute_creatToken,
      execute_creatOpenMarket,
      execute_createPool
    );

    if (execute_creatToken) {
      await doCreateToken();
    }

    if (execute_creatOpenMarket) {
      await doCreateOpenMarket();
    }

    if (execute_createPool) {
      await doCreatePool(execute_time_sell);
    }

    // await doBundleTest();
    console.log("Finished");
  } catch (error) {
    console.error(error);
    console.log("Finished");
  }
})();
