import {
  CurrencyAmount,
  Liquidity,
  LiquidityPoolInfo,
  Percent,
  TOKEN_PROGRAM_ID,
  Token,
  TokenAmount
} from "@raydium-io/raydium-sdk";
import { EnvironmentManager, TOKEN_INFO } from "./global";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { BN } from "bn.js";
import { Market } from "@project-serum/serum";
import { xWeiAmount } from "./utility";

interface PairToken {
  base_token: Token;
  quote_token: Token;
}

export class PoolManager {
  private base_token_info: TOKEN_INFO;
  private quote_token_info: TOKEN_INFO;
  private base_amount: number;
  private quote_amount: number;
  private market_id: PublicKey;
  private pool_info: LiquidityPoolInfo;
  private pool_keys: any;

  constructor(
    base_token_info: TOKEN_INFO,
    quote_token_info: TOKEN_INFO,
    base_amount: number,
    quote_amount: number,
    market_id: PublicKey
  ) {
    this.base_token_info = base_token_info;
    this.quote_token_info = quote_token_info;
    this.base_amount = base_amount;
    this.quote_amount = quote_amount;
    this.market_id = market_id;

    const { base_token, quote_token } = this.getPairToken();

    this.pool_keys = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint: base_token.mint,
      quoteMint: quote_token.mint,
      baseDecimals: base_token.decimals,
      quoteDecimals: quote_token.decimals,
      marketId: this.market_id,
      programId: EnvironmentManager.getProgramID().AmmV4,
      marketProgramId: EnvironmentManager.getProgramID().OPENBOOK_MARKET
    });

    this.pool_info = {
      status: new BN(0),
      baseDecimals: this.base_token_info.decimal,
      lpDecimals: this.quote_token_info.decimal,
      quoteDecimals: this.quote_token_info.decimal,
      baseReserve: xWeiAmount(this.base_amount, this.base_token_info.decimal),
      quoteReserve: xWeiAmount(
        this.quote_amount,
        this.quote_token_info.decimal
      ),
      lpSupply: new BN(base_amount),
      startTime: new BN(0)
    };
  }

  initializePoolInfo(market_id: PublicKey) {
    this.market_id = market_id;
    const { base_token, quote_token } = this.getPairToken();
    this.pool_keys = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint: base_token.mint,
      quoteMint: quote_token.mint,
      baseDecimals: base_token.decimals,
      quoteDecimals: quote_token.decimals,
      marketId: this.market_id,
      programId: EnvironmentManager.getProgramID().AmmV4,
      marketProgramId: EnvironmentManager.getProgramID().OPENBOOK_MARKET
    });

    this.pool_info = {
      status: new BN(0),
      baseDecimals: this.base_token_info.decimal,
      lpDecimals: this.quote_token_info.decimal,
      quoteDecimals: this.quote_token_info.decimal,
      baseReserve: xWeiAmount(this.base_amount, this.base_token_info.decimal),
      quoteReserve: xWeiAmount(
        this.quote_amount,
        this.quote_token_info.decimal
      ),
      lpSupply: new BN(this.base_amount),
      startTime: new BN(0)
    };

    console.log(
      "Simulated Pool baseReserve: ",
      this.pool_info.baseReserve.toString()
    );
    console.log(
      "Simulated Pool quoteReserve: ",
      this.pool_info.quoteReserve.toString()
    );
  }

  computeSolAmount(base_amount: number, in_out: boolean): CurrencyAmount {
    const { base_token, quote_token } = this.getPairToken();
    // console.log("Simulated PoolInfo: ", this.pool_info);
    if (in_out) {
      const { maxAmountIn } = Liquidity.computeAmountIn({
        poolKeys: this.pool_keys,
        poolInfo: this.pool_info,
        amountOut: new TokenAmount(base_token, base_amount, false),
        currencyIn: quote_token,
        slippage: new Percent(1, 100)
      });
      return maxAmountIn;
    } else {
      const { minAmountOut } = Liquidity.computeAmountOut({
        poolKeys: this.pool_keys,
        poolInfo: this.pool_info,
        amountIn: new TokenAmount(base_token, base_amount, false),
        currencyOut: quote_token,
        slippage: new Percent(1, 100)
      });
      return minAmountOut;
    }
  }
  computeCurrentPrice(): number {
    return this.quote_amount / this.base_amount;
  }
  buyToken(base_amount: number) {
    const sol_input = this.computeSolAmount(base_amount, true);
    const { base_token, quote_token } = this.getPairToken();
    const { amountOut } = Liquidity.computeAmountOut({
      poolKeys: this.pool_keys,
      poolInfo: this.pool_info,
      amountIn: sol_input,
      currencyOut: base_token,
      slippage: new Percent(1, 100)
    });
    this.quote_amount += sol_input.raw
      .div(new BN(10 ** this.quote_token_info.decimal))
      .toNumber();
    this.base_amount -= base_amount;
    this.pool_info = {
      ...this.pool_info,
      baseReserve: this.pool_info.baseReserve.sub(amountOut.raw),
      quoteReserve: this.pool_info.quoteReserve.add(sol_input.raw)
    };

    console.log(
      "Simulated Pool baseReserve: ",
      this.pool_info.baseReserve.toString()
    );
    console.log(
      "Simulated Pool quoteReserve: ",
      this.pool_info.quoteReserve.toString()
    );

    // this.initializePoolInfo(this.market_id);
  }
  sellToken(base_amount: number) {
    const sol_input = this.computeSolAmount(base_amount, false);
    this.quote_amount -= sol_input.raw
      .div(new BN(10 ** this.quote_token_info.decimal))
      .toNumber();
    this.base_amount += base_amount;
    this.initializePoolInfo(this.market_id);
  }
  getPairToken(): PairToken {
    const base_mint = new PublicKey(this.base_token_info.address);
    const base = new Token(
      TOKEN_PROGRAM_ID,
      base_mint,
      this.base_token_info.decimal,
      this.base_token_info.symbol,
      this.base_token_info.name
    );

    const quote = new Token(
      TOKEN_PROGRAM_ID,
      new PublicKey(this.quote_token_info.address),
      this.quote_token_info.decimal,
      this.quote_token_info.symbol,
      this.quote_token_info.name
    );

    return { base_token: base, quote_token: quote };
  }
}
