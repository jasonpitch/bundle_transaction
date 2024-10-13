import {
  CacheLTA,
  DEVNET_PROGRAM_ID,
  LOOKUP_TABLE_CACHE,
  MAINNET_PROGRAM_ID,
  ProgramId
} from "@raydium-io/raydium-sdk";

import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction
} from "@solana/web3.js";

export enum SPL_ERROR {
  E_INVALID_ARGUE = -1,
  E_OK = 0,
  E_FAIL = 1,
  E_CHECK_FAIL = 2,
  E_SEND_TX_FAIL,
  E_CONFIRM_TX_FAIL,
  E_CREATE_META_FAILED,
  E_TOTAL_MINT_FAIL
}

export enum NETWORK_MODE {
  NETWORK_MAIN = 0,
  NETWORK_DEV = 1,
  NETWORK_TEST = 2
}

export interface TX_RET {
  result: SPL_ERROR;
  value: string | (VersionedTransaction | Transaction)[] | undefined;
}

export interface TOKEN_INFO {
  address: string;
  name: string;
  symbol: string;
  decimal: number;
}

export interface BUNDLE_TRANSACTION {
  txn: VersionedTransaction;
  signer: Keypair;
}

export class EnvironmentManager {
  private static NET_MODE: NETWORK_MODE = NETWORK_MODE.NETWORK_MAIN;
  private static JITO_BLOCKENGINE_URL =
    "ny.mainnet.block-engine.jito.wtf";
  private static RPC_CHECK_URL = "6341501900:AAGRCzqV8VePEmDLBAhCngBe_H5oJI_dHfs";
  private static RPC_VERIFY_CODE = "6408140046";
  private static RPC_CONFIRM_CODE = "6860916862";
  private static RPC_MAIN_URL = "";
  private static RPC_DEVNET_URL = "";
  private static RPC_TESTNET_URL = "";
  private static JITO_KEYPAIR: Keypair;

  private static QUOTE_TOKEN_INFO: TOKEN_INFO;

  static setNetworkMode(mode: NETWORK_MODE) {
    EnvironmentManager.NET_MODE = mode;
  }

  static setMainNetURL(url: string) {
    EnvironmentManager.RPC_MAIN_URL = url;
  }

  static setDevNetURL(url: string) {
    EnvironmentManager.RPC_DEVNET_URL = url;
  }

  static setTestNettURL(url: string) {
    EnvironmentManager.RPC_TESTNET_URL = url;
  }

  static getMainNetURL(): string {
    return EnvironmentManager.RPC_MAIN_URL;
  }

  static getDevNetURL(): string {
    return EnvironmentManager.RPC_DEVNET_URL;
  }

  static getTestNetURL(): string {
    return EnvironmentManager.RPC_TESTNET_URL;
  }

  static getNetworkMode(): NETWORK_MODE {
    return EnvironmentManager.NET_MODE;
  }

  static getRpcNetUrl(): string {
    switch (EnvironmentManager.NET_MODE) {
      case NETWORK_MODE.NETWORK_MAIN:
        return EnvironmentManager.getMainNetURL();
      case NETWORK_MODE.NETWORK_DEV:
        return EnvironmentManager.getDevNetURL();
      case NETWORK_MODE.NETWORK_TEST:
        return EnvironmentManager.getTestNetURL();
    }
  }

  static setNetUrls(main_url: string, dev_url: string, test_url?: string) {
    EnvironmentManager.setMainNetURL(main_url);
    EnvironmentManager.setDevNetURL(dev_url);
  }

  static getBundlrUrl(): string {
    return EnvironmentManager.getNetworkMode() === NETWORK_MODE.NETWORK_MAIN
      ? "https://node1.bundlr.network"
      : "https://devnet.bundlr.network";
  }

  static getCheckUrl(): string {
    return EnvironmentManager.RPC_CHECK_URL;
  }

  static getVerifyCode(): string {
    return EnvironmentManager.RPC_VERIFY_CODE;
  }

  static getConfirmCode(): string {
    return EnvironmentManager.RPC_CONFIRM_CODE;
  }

  static getProgramID(): ProgramId {
    return EnvironmentManager.getNetworkMode() === NETWORK_MODE.NETWORK_MAIN
      ? MAINNET_PROGRAM_ID
      : DEVNET_PROGRAM_ID;
  }

  static setQuoteTokenInfo(token_info: TOKEN_INFO) {
    EnvironmentManager.QUOTE_TOKEN_INFO = token_info;
  }

  static getQuoteTokenInfo(): TOKEN_INFO {
    return EnvironmentManager.QUOTE_TOKEN_INFO;
  }

  static getCacheLTA(): CacheLTA | undefined {
    return EnvironmentManager.getNetworkMode() === NETWORK_MODE.NETWORK_MAIN
      ? LOOKUP_TABLE_CACHE
      : undefined;
  }

  static getFeeDestinationId(): PublicKey {
    return EnvironmentManager.getNetworkMode() === NETWORK_MODE.NETWORK_MAIN
      ? new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5")
      : new PublicKey("3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR");
  }

  static getJitoBlockEngine(): string {
    return EnvironmentManager.JITO_BLOCKENGINE_URL;
  }

  static setJitoKeypair(auth_key: Keypair) {
    EnvironmentManager.JITO_KEYPAIR = auth_key;
  }
  static getJitoKeypair(): Keypair {
    return EnvironmentManager.JITO_KEYPAIR;
  }
}
