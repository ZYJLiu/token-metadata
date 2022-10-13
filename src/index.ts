import { initializeKeypair } from "./initializeKeypair"
import {
  Connection,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  SystemProgram,
} from "@solana/web3.js"
import {
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  Account,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  getAccount,
  createMintToInstruction,
} from "@solana/spl-token"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
  findMetadataPda,
} from "@metaplex-foundation/js"
import {
  DataV2,
  createCreateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata"
import { awsStorage } from "@metaplex-foundation/js-plugin-aws"
import { S3Client } from "@aws-sdk/client-s3"
import * as fs from "fs"
import dotenv from "dotenv"
dotenv.config()

const tokenName = "Token Name"
const description = "Description"
const symbol = "SYMBOL"
const decimals = 0
const amount = 1

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"))
  const user = await initializeKeypair(connection)

  console.log("PublicKey:", user.publicKey.toBase58())

  // rent for token mint
  const lamports = await getMinimumBalanceForRentExemptMint(connection)

  // keypair for new token mint
  const mintKeypair = Keypair.generate()

  // get metadata PDA for token mint
  const metadataPDA = await findMetadataPda(mintKeypair.publicKey)

  // get associated token account address for use
  const tokenATA = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    user.publicKey
  )

  const awsClient = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.ACCESS_KEY_ID!,
      secretAccessKey: process.env.SECRET_ACCESS_KEY!,
    },
  })

  // metaplex setup
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(user))
    .use(awsStorage(awsClient, "metaplex-test-upload"))

  // file to buffer
  const buffer = fs.readFileSync("src/update.gif")

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, "update.gif")

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri)

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: tokenName,
      description: description,
      image: imageUri,
    })
    .run()

  console.log("metadata uri:", uri)

  const collectionNft = await metaplex
    .nfts()
    .create({
      uri: uri,
      name: "Collection",
      sellerFeeBasisPoints: 0,
      isCollection: true,
    })
    .run()

  console.log(collectionNft)

  const originalNft = await metaplex
    .nfts()
    .create({
      uri: uri,
      name: "NFT",
      sellerFeeBasisPoints: 0,
      symbol: symbol,
      collection: collectionNft.mintAddress,
    })
    .run()

  console.log(originalNft)

  const verify = await metaplex
    .nfts()
    .verifyCollection({
      mintAddress: originalNft.mintAddress,
      collectionMintAddress: collectionNft.mintAddress,
      isSizedCollection: true,
    })
    .run()

  console.log(verify)

  const update = await metaplex
    .nfts()
    .update({
      nftOrSft: originalNft.nft,
      name: "Updated Name",
    })
    .run()

  console.log(update)

  // const originalNft2 = await metaplex
  //   .nfts()
  //   .create({
  //     uri: uri,
  //     name: "NFT",
  //     sellerFeeBasisPoints: 0,
  //     symbol: symbol,
  //     collection: collectionNft.mintAddress,
  //   })
  //   .run()

  // console.log(originalNft2)

  // const verify2 = await metaplex
  //   .nfts()
  //   .verifyCollection({
  //     mintAddress: originalNft2.mintAddress,
  //     collectionMintAddress: collectionNft.mintAddress,
  //     isSizedCollection: true,
  //   })
  //   .run()

  // console.log(verify2)
  // console.log(
  //   `Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  // )
}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
