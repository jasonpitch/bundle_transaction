import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { EnvironmentManager, SPL_ERROR, TX_RET } from "./global";
import { TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import {
  Liquidity,
  LiquidityPoolKeys,
  Token,
  TokenAmount,
  TxVersion,
  buildSimpleTransaction,
} from "@raydium-io/raydium-sdk";
import { getWalletAccounts } from "./utility";

export const buyToken = async (
  connection: Connection,
  buyer: Keypair,
  token_address: string,
  base_amount: number,
  quote_amount: number,
  pool_key: LiquidityPoolKeys
): Promise<TX_RET> => {
  if (token_address.length <= 0 || base_amount <= 0) {
    console.error("Error: [Buy Token] invalid argument iput!!!");
    return { result: SPL_ERROR.E_INVALID_ARGUE, value: undefined };
  }

  try {
    const token_mint = new PublicKey(token_address);
    const token_info = await getMint(connection, token_mint);
    const base_token = new Token(
      TOKEN_PROGRAM_ID,
      token_address,
      token_info.decimals
    );
    const quote_info = EnvironmentManager.getQuoteTokenInfo();
    const quote_token = new Token(
      TOKEN_PROGRAM_ID,
      quote_info.address,
      quote_info.decimal,
      quote_info.symbol,
      quote_info.name
    );
    const base_token_amount = new TokenAmount(
      base_token,
      base_amount * 0.95,
      false
    );
    const quote_token_amount = new TokenAmount(
      quote_token,
      quote_amount,
      false
    );

    const wallet_token_accounts = await getWalletAccounts(
      connection,
      buyer.publicKey
    );

    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
      connection: connection,
      poolKeys: pool_key,
      userKeys: {
        tokenAccounts: wallet_token_accounts,
        owner: buyer.publicKey,
      },
      amountIn: quote_token_amount,
      amountOut: base_token_amount,
      fixedSide: "in",
      makeTxVersion: TxVersion.V0,
    });

    const transactions = await buildSimpleTransaction({
      connection: connection,
      makeTxVersion: TxVersion.V0,
      payer: buyer.publicKey,
      innerTransactions: innerTransactions,
      addLookupTableInfo: EnvironmentManager.getCacheLTA(),
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    });

    return { result: SPL_ERROR.E_OK, value: transactions };
  } catch (error) {
    console.error("Error: [buy Tokens] error code: ", error);
    return { result: SPL_ERROR.E_FAIL, value: undefined };
  }
};
