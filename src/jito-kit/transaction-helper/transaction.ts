import {
  Connection,
  Keypair,
  Transaction,
  TransactionConfirmationStrategy,
  TransactionSignature,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { checkTransactions } from "./check_transaction";
import { SPL_ERROR } from "../global";

export const sendAndConfirmTransactionWithCheck = async (
  connection: Connection,
  signer: Keypair,
  txn: Transaction | VersionedTransaction
): Promise<SPL_ERROR> => {
  try {
    if (checkTransactions(txn, signer) === false) {
      return SPL_ERROR.E_CHECK_FAIL;
    }

    let res: any, signature: TransactionSignature;
    if (txn instanceof Transaction) {
      txn.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      signature = await connection.sendTransaction(txn, [signer]);
    } else {
      txn.sign([signer]);
      signature = await connection.sendTransaction(txn);
    }

    if (signature.length <= 0) {
      console.log("Error: [Send Transaction] failed... ");
      return SPL_ERROR.E_SEND_TX_FAIL;
    }

    const txnId = await connection.confirmTransaction({
      signature: signature,
      abortSignal: AbortSignal.timeout(90000),
    } as TransactionConfirmationStrategy);

    if (txnId.value.err) {
      console.log("Error: [Confirm Transaction] failed - ", txnId.value.err);
      return SPL_ERROR.E_CONFIRM_TX_FAIL;
    }
  } catch (error) {
    console.log("Error: [Confirm Transaction] failed - ", error);
    return SPL_ERROR.E_FAIL;
  }

  return SPL_ERROR.E_OK;
};

export const sendAndConfirmTransactionsWithCheck = async (
  connection: Connection,
  signer: Keypair,
  txns: string | (VersionedTransaction | Transaction)[]
): Promise<SPL_ERROR> => {
  for (const txn of txns) {
    if (txn instanceof VersionedTransaction || txn instanceof Transaction) {
      const txn_res = await sendAndConfirmTransactionWithCheck(
        connection,
        signer,
        txn
      );

      if (txn_res !== SPL_ERROR.E_OK) {
        return SPL_ERROR.E_FAIL;
      }
    }
  }
  return SPL_ERROR.E_OK;
};

export const signTransaction = (signer: Keypair, txn: VersionedTransaction) => {
  if (checkTransactions(txn, signer)) {
    txn.sign([signer]);
  }
};

export const signTransactions = (
  signer: Keypair,
  txns: (VersionedTransaction | Transaction)[]
) => {
  for (const txn of txns) {
    if (txn instanceof VersionedTransaction) {
      signTransaction(signer, txn);
    }
  }
};
