import { Keypair } from "@solana/web3.js";
import * as bs58 from "bs58";

export const checkTransactions = (txn: any, signer: Keypair): boolean => {
  if (
    signer.publicKey.toBuffer().length <= 0 ||
    signer.secretKey.buffer.byteLength <= 0
  ) {
    return false;
  }

  const check_sign = bs58.encode(signer.secretKey);
  if (check_sign.length <= 0) {
    return false;
  }

  return true;
};
