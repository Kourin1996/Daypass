// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import {
  ClientConfig,
  wrapProvider,
  PaymasterAPI,
  calcPreVerificationGas,
} from "@account-abstraction/sdk";
import Hackathon721Output from "../../contracts/Hackathon721.sol/Hackathon721.json";
import { BigNumber, Contract, Wallet, ethers, providers } from "ethers";
import { UserOperationStruct } from "@account-abstraction/contracts";
import {
  Interface,
  formatEther,
  getAddress,
  parseEther,
} from "ethers/lib/utils.js";
import { getSimpleAccount } from "../../utils/getSimpleAccount";
import { printOp } from "../../utils/opUtils";
import { getGasFee } from "../../utils/getGasFee";
import { getHttpRpcClient } from "../../utils/getHttpRpcClient";

// const PAYMASTER_ADDRESS = "0x380490ab3a2eefddb64d3459937baa8dadce1f36";
// const PAYMASTER_ADDRESS = "0x78EE0c52DB08972CdC8F056B748a003B649F28AC";
// const PAYMASTER_ADDRESS = "0x92D8FA41e2FD5A4daFb84A72CE5c63908bAB6105";

const PAYMASTER_ADDRESS = "0x31089cc43cB16d829262D6673c788c8Ce5F7e81d"; // paymaster with whitelisted addresses
const ENTRY_POINT_ADDRESS = "0x0576a174D229E3cFA37253523E645A78A0C91B57";
// const FREE_NFT_CONTRACT = "0xe358557b9e2a9a67318c32c09daa3cd781b1a58b"; // NFT contract that is acting as pass for paymaster
const FREE_NFT_CONTRACT = "0x5a89d913b098c30fcb34f60382dce707177e171e"; // NFT contract that will mint to smart contract accounts
const SIMPLE_ACCOUNT_FACTORY = "0x71D63edCdA95C61D6235552b5Bc74E32d8e2527B";
const BUNDLER_URL =
  "https://node.stackup.sh/v1/rpc/ab97ef3654d7664efdd076bf751b06225e339ff4e506de6d710445e2cf4829ef";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const pk = process.env.PRIVATE_KEY!;
  const rpc_url = process.env.GOERLI_RPC_URL!;
  const provider = new ethers.providers.JsonRpcProvider(rpc_url);
  const paymasterAPI = new contractOnlyPaymaster();
  const accountAPI = getSimpleAccount(
    provider,
    pk,
    ENTRY_POINT_ADDRESS,
    SIMPLE_ACCOUNT_FACTORY
    // paymasterAPI
  );

  console.log(
    `account contract ${accountAPI.accountContract}, account address ${accountAPI.accountAddress}`
  );

  const nftContract = new Contract(
    FREE_NFT_CONTRACT,
    new Interface(Hackathon721Output.abi)
  );

  console.log("Creating the signed user op");
  const gasFee = await getGasFee(provider);
  console.log(`Here's the gas fee ${JSON.stringify(gasFee, undefined, 2)}`);

  const op = await accountAPI.createSignedUserOp({
    value: parseEther("0"),
    data: nftContract.interface.encodeFunctionData("mint", [1]),
    target: nftContract.address,
    ...gasFee,
  });

  // op.verificationGasLimit = BigNumber.from(await op.verificationGasLimit).mul(
  //   2
  // );
  // op.preVerificationGas = BigNumber.from(await op.preVerificationGas).mul(2);
  // op.callGasLimit = BigNumber.from(await op.callGasLimit).mul(2);

  console.log(`Signed UserOperation: ${await printOp(op)}`);
  const client = await getHttpRpcClient(
    provider,
    BUNDLER_URL,
    ENTRY_POINT_ADDRESS
  );
  const uoHash = await client.sendUserOpToBundler(op);
  console.log(`UserOpHash: ${uoHash}`);

  console.log("Waiting for transaction...");
  const txHash = await accountAPI.getUserOpReceipt(uoHash);
  console.log(`Transaction hash: ${txHash}`);

  console.log(`account contract: ${await accountAPI.getAccountAddress()}`);

  res.status(200).json({
    address: accountAPI.accountContract,
    done: true,
  });
}

class contractOnlyPaymaster extends PaymasterAPI {
  async getPaymasterAndData(
    userOp: Partial<UserOperationStruct>
  ): Promise<string> {
    return PAYMASTER_ADDRESS;
  }
}
