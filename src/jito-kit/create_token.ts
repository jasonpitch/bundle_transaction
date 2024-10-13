import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { EnvironmentManager, SPL_ERROR, TX_RET } from "./global";
import {
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo
} from "@solana/spl-token";
import {
  Metaplex,
  irysStorage,
  keypairIdentity,
  toMetaplexFile
} from "@metaplex-foundation/js";
import { readFileSync } from "fs";
import { checkFileExists, xWeiAmount } from "./utility";
import {
  PROGRAM_ID,
  createCreateMetadataAccountV3Instruction
} from "@metaplex-foundation/mpl-token-metadata";

import * as transaction from "./transaction-helper/transaction";

const totalSupplyMint = async (
  connection: Connection,
  token_owner: Keypair,
  token_addr: string,
  total_supply: number
) => {
  const token_mint = new PublicKey(token_addr);
  const mint_info = await getMint(connection, token_mint);
  try {
    const owner_token_account = await getOrCreateAssociatedTokenAccount(
      connection,
      token_owner,
      token_mint,
      token_owner.publicKey
    );

    if (owner_token_account.address.toBase58().length <= 0) {
      console.log(
        "Error: [Total Supply Mint] failed to create associated token account"
      );
      return SPL_ERROR.E_TOTAL_MINT_FAIL;
    }

    const token_amount = xWeiAmount(total_supply, mint_info.decimals);

    const mint_result = await mintTo(
      connection,
      token_owner,
      token_mint,
      owner_token_account.address,
      token_owner,
      BigInt(token_amount.toString())
    );

    if (mint_result.length <= 0) {
      console.log("Error: [Total Supply Mint] failed to mint to owner wallet");
      return SPL_ERROR.E_TOTAL_MINT_FAIL;
    }
  } catch (error) {
    console.log("Error: [Total Supply Mint] failed to mint to owner wallet");
    return SPL_ERROR.E_TOTAL_MINT_FAIL;
  }

  return SPL_ERROR.E_OK;
};

const createTokenMetaData = async (
  connection: Connection,
  token_owner: Keypair,
  token_addr: string,
  name: string,
  symbol: string,
  token_logo: string,
  rpc_url: string,
  description?: string
): Promise<SPL_ERROR> => {
  try {
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(token_owner))
      .use(
        irysStorage({
          address: EnvironmentManager.getBundlrUrl(),
          providerUrl: rpc_url,
          timeout: 60000
        })
      );
    const buffer = readFileSync(token_logo);
    const file = toMetaplexFile(buffer, "token-logo.png");
    const logo_url = await metaplex.storage().upload(file);

    if (logo_url.length <= 0) {
      console.log(
        "Error: [Create Token Meta Data] failed to load metapelx data!!!"
      );
      return SPL_ERROR.E_FAIL;
    }

    const metaplex_data = {
      name: name,
      symbol: symbol,
      image: logo_url,
      description
    };

    const { uri } = await metaplex.nfts().uploadMetadata(metaplex_data);

    if (uri.length <= 0) {
      console.log(
        "Error: [Create Token Meta Data] failed to upload metaplex data!!!"
      );
      return SPL_ERROR.E_FAIL;
    }

    const token_mint = new PublicKey(token_addr);
    const [metadata_PDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), PROGRAM_ID.toBuffer(), token_mint.toBuffer()],
      PROGRAM_ID
    );

    const token_meta_data = {
      name: name,
      symbol: symbol,
      uri: uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null
    };

    const txn = new Transaction().add(
      createCreateMetadataAccountV3Instruction(
        {
          metadata: metadata_PDA,
          mint: token_mint,
          mintAuthority: token_owner.publicKey,
          payer: token_owner.publicKey,
          updateAuthority: token_owner.publicKey
        },
        {
          createMetadataAccountArgsV3: {
            data: token_meta_data,
            isMutable: true,
            collectionDetails: null
          }
        }
      )
    );

    if (
      (await transaction.sendAndConfirmTransactionWithCheck(
        connection,
        token_owner,
        txn
      )) !== SPL_ERROR.E_OK
    ) {
      return SPL_ERROR.E_FAIL;
    }
  } catch (error) {
    console.log(
      "Error: [Create Token Meta Data] failed to create meta data -",
      error
    );
    return SPL_ERROR.E_FAIL;
  }

  return SPL_ERROR.E_OK;
};

export const createToken = async (
  connection: Connection,
  token_owner: Keypair,
  name: string,
  symbol: string,
  decimal: number,
  total_supply: number,
  token_logo: string,
  description?: string
): Promise<TX_RET> => {
  if (
    name.length <= 0 ||
    symbol.length <= 0 ||
    token_logo.length <= 0 ||
    token_owner.publicKey.toBase58().length <= 0 ||
    EnvironmentManager.getRpcNetUrl().length <= 0 ||
    decimal <= 0 ||
    total_supply <= 0
  ) {
    console.log("Error: [Create Token] invalid argument to create token!!!");
    return { result: SPL_ERROR.E_INVALID_ARGUE, value: undefined };
  }

  if ((await checkFileExists(token_logo)) === false) {
    console.log(
      "Error: [Create Token] invalid argument to create token - token logo path invalid!!!"
    );
    return { result: SPL_ERROR.E_INVALID_ARGUE, value: undefined };
  }

  console.log("<-----------------[Create Token]---------------------");
  console.log(
    "Name: ",
    name,
    "Symbol: ",
    symbol,
    "Decimal: ",
    decimal,
    "Total Supply: ",
    total_supply,
    "Token Logo: ",
    token_logo,
    "Token Description: ",
    description
  );
  console.log("<-----------------[Create Token]---------------------");

  const token_mint = await createMint(
    connection,
    token_owner,
    token_owner.publicKey,
    token_owner.publicKey,
    decimal
  );

  if (token_mint.toBase58().length <= 0) {
    console.log("Error: [Create Token] failed to create mint!!!");
    return { result: SPL_ERROR.E_FAIL, value: undefined };
  }

  console.log(
    "<-----------------[Create Token Meta Data]---------------------"
  );

  const meta_result = await createTokenMetaData(
    connection,
    token_owner,
    token_mint.toBase58(),
    name,
    symbol,
    token_logo,
    EnvironmentManager.getRpcNetUrl(),
    description
  );

  if (meta_result !== SPL_ERROR.E_OK) {
    console.log("Error: [Create Token] failed to create meta data!!!");
    return { result: SPL_ERROR.E_CREATE_META_FAILED, value: undefined };
  }

  console.log("<-----------------[Token mint]---------------------");

  if (
    (await totalSupplyMint(
      connection,
      token_owner,
      token_mint.toBase58(),
      total_supply
    )) !== SPL_ERROR.E_OK
  ) {
    console.log("Error: [Create Token] failed to mint total supply!!!");
    return { result: SPL_ERROR.E_TOTAL_MINT_FAIL, value: undefined };
  }
  console.log("Success: [Create Token] Mint Address: ", token_mint.toBase58());
  return { result: SPL_ERROR.E_OK, value: token_mint.toBase58() };
};
