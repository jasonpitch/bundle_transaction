import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { BUNDLE_TRANSACTION, EnvironmentManager, SPL_ERROR } from "./global";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import * as utils from "./utility";
import { signTransaction } from "./transaction-helper/transaction";
import base58 from "bs58";

export const createAndSendBundleTransaction = async (
  connection: Connection,
  fee: number,
  bundleTransactions: any,
  payer: Keypair
) => {
  const seacher = searcherClient(
    EnvironmentManager.getJitoBlockEngine(),
    EnvironmentManager.getJitoKeypair()
  );
  const _tipAccount = (await seacher.getTipAccounts())[0];
  const tipAccount = new PublicKey(_tipAccount);

  let transactionsConfirmResult: boolean = false;
  let breakCheckTransactionStatus: boolean = false;
  try {
    const recentBlockhash = (await connection.getLatestBlockhash("finalized"))
      .blockhash;

    const bundleTransaction: VersionedTransaction[] = [];

    for (let i = 0; i < bundleTransactions.length; i++) {
      bundleTransactions[i].txn.message.recentBlockhash = recentBlockhash;
      signTransaction(bundleTransactions[i].signer, bundleTransactions[i].txn);
      bundleTransaction.push(bundleTransactions[i].txn);
    }

    let bundleTx = new Bundle(bundleTransaction, 5);
    bundleTx.addTipTx(payer, fee, tipAccount, recentBlockhash);

    seacher.onBundleResult(
      async (bundleResult: any) => {
        console.log(bundleResult);
        if (bundleResult.rejected) {
          try {
            if (
              bundleResult.rejected.simulationFailure.msg.includes(
                "custom program error"
              ) ||
              bundleResult.rejected.simulationFailure.msg.includes(
                "Error processing Instruction"
              )
            ) {
              breakCheckTransactionStatus = true;
            } else if (
              bundleResult.rejected.simulationFailure.msg.includes(
                "This transaction has already been processed"
              ) ||
              bundleResult.rejected.droppedBundle.msg.includes(
                "Bundle partially processed"
              )
            ) {
              transactionsConfirmResult = true;
              breakCheckTransactionStatus = true;
            }
          } catch (error) {}
        }
      },
      (error) => {
        console.log("Bundle error:", error);
        breakCheckTransactionStatus = true;
      }
    );
    await seacher.sendBundle(bundleTx);
    setTimeout(() => {
      breakCheckTransactionStatus = true;
    }, 20000);
    const trxHash = base58.encode(
      bundleTransaction[bundleTransaction.length - 1].signatures[0]
    );
    while (!breakCheckTransactionStatus) {
      await utils.sleep(2000);
      try {
        const result = await connection.getSignatureStatus(trxHash, {
          searchTransactionHistory: true,
        });
        if (result && result.value && result.value.confirmationStatus) {
          transactionsConfirmResult = true;
          breakCheckTransactionStatus = true;
        }
      } catch (error) {
        transactionsConfirmResult = false;
        breakCheckTransactionStatus = true;
      }
    }
    return transactionsConfirmResult;
  } catch (error) {
    console.error("Creating and sending bundle failed...", error);
    await utils.sleep(10000);
    return false;
  }
};
