/* eslint-disable @typescript-eslint/no-non-null-assertion */
import '@neutron-org/neutronjsplus';
import Long from 'long';
import {
  WalletWrapper,
  CosmosWrapper,
  NEUTRON_DENOM,
  IBC_USDC_DENOM,
  IBC_ATOM_DENOM,
  getEventAttribute,
} from '@neutron-org/neutronjsplus/dist/cosmos';
import { TestStateLocalCosmosTestNet, tge } from '@neutron-org/neutronjsplus';
import { BroadcastTx200ResponseTxResponse } from '@cosmos-client/core/cjs/openapi/api';
import {
  executeAuctionSetTokenInfo,
  executeCreditsVaultUpdateConfig,
  executeLockdropSetTokenInfo,
  executeLockdropVaultUpdateConfig,
  executeVestingLpSetVestingToken,
  executeVestingLpVaultUpdateConfig,
  getTimestamp,
  LockdropLockUpInfoResponse,
  queryCreditsVaultConfig,
  queryLockdropVaultConfig,
  queryVestingLpVaultConfig,
  Tge,
  VestingAccountResponse,
  XykLockdropConfig,
  queryXykLockdropConfig,
  queryXykLockdropPool,
  LockdropXykPool,
  LockdropUserInfoResponse,
  LockdropPclUserInfoResponse,
} from '@neutron-org/neutronjsplus/dist/tge';
import {
  Dao,
  DaoMember,
  getDaoContracts,
} from '@neutron-org/neutronjsplus/dist/dao';
import {
  Asset,
  TotalPowerAtHeightResponse,
  NeutronContract,
  NativeToken,
  nativeTokenInfo,
  nativeToken,
  PoolStatus,
  VotingPowerAtHeightResponse,
  vestingAccount,
  vestingSchedule,
  vestingSchedulePoint,
} from '@neutron-org/neutronjsplus/dist/types';
import {
  msgMintDenom,
  msgCreateDenom,
} from '@neutron-org/neutronjsplus/dist/tokenfactory';

import { getHeight } from '@neutron-org/neutronjsplus/dist/env';
// import * as fs from 'fs/promises';
import * as fs from 'fs';
import { Trace, State, User, ReadingState, ReadingTrace } from "../../../trace-transformer/structs";
import { getAllOtherStates, getInitialState } from '../../../trace-transformer/trace_parser';



const trace_file = '../../../trace-transformer/trace.json';
const config = require('../../config.json');

const MIN_LIQUDITY = 1000;
const ATOM_DEPOSIT_AMOUNT = 10000;
const USDC_DEPOSIT_AMOUNT = 90000;
const NTRN_AMOUNT = 200000;
const ATOM_RATE = 10000000;
const USDC_RATE = 1000000;
const NTRN_INCENTIVIZE_AMOUNT = 10000;
// fixed fee for every transaction
const FEE_SIZE = 10_000;
// airdrop amount to check we do pay more than airdrop amount during lockdrop reward claiming
const TINY_AIRDROP_AMOUNT = 100;

const EXT_REWARD_SUBDENOM = 'urwrd';
const EXT_REWARD_AMOUNT = '1000000000';

const NEUTRON_DAO_ADDR =
  'neutron1suhgf5svhu4usrurvxzlgn54ksxmn8gljarjtxqnapv8kjnp4nrstdxvff';

const getLpSize = (token1: number, token2: number) =>
  (Math.sqrt(token1 * token2) - MIN_LIQUDITY) | 0;

type TwapAtHeight = [Asset, string][];

type UserInfoResponse = {
  usdc_deposited: string;
  atom_deposited: string;
  withdrawn: boolean;
  atom_lp_amount: string;
  usdc_lp_amount: string;
  atom_lp_locked: string;
  usdc_lp_locked: string;
};

type LockDropInfoResponse = {
  claimable_generator_ntrn_debt: string;
  lockup_infos: {
    astroport_lp_token: string;
    astroport_lp_transferred: boolean | null;
    astroport_lp_units: string;
    claimable_generator_astro_debt: string;
    claimable_generator_proxy_debt: unknown[];
    duration: number;
    generator_ntrn_debt: string;
    generator_proxy_debt: unknown[];
    lp_units_locked: string;
    ntrn_rewards: string;
    pool_type: string;
    unlock_timestamp: number;
    withdrawal_flag: boolean;
  }[];
  lockup_positions_index: number;
  ntrn_transferred: boolean;
  total_ntrn_rewards: string;
};

type PoolInfoResponse = {
  assets: { amount: string; info: { native_token: { denom: string } } }[];
  total_share: string;
};

type AuctionStateResponse = {
  /// Total USDC deposited to the contract
  total_usdc_deposited: string;
  /// Total ATOM deposited to the contract
  total_atom_deposited: string;
  is_rest_lp_vested: boolean;
  /// Total LP shares minted post liquidity addition to the NTRN-USDC Pool
  lp_usdc_shares_minted?: string;
  /// Total LP shares minted post liquidity addition to the NTRN-ATOM Pool
  lp_atom_shares_minted?: string;
  /// Timestamp at which liquidity was added to the NTRN-ATOM and NTRN-USDC LP Pool
  pool_init_timestamp: number;
  /// USDC NTRN amount
  usdc_ntrn_size: string;
  /// ATOM NTRN amount
  atom_ntrn_size: string;
  /// LP count for USDC amount
  usdc_lp_size: string;
  /// LP count for ATOM amount
  atom_lp_size: string;
  /// locked USDC LP shares
  usdc_lp_locked: string;
  /// locked ATOM LP shares
  atom_lp_locked: string;
};

type BalanceResponse = {
  balance: string;
};

type TotalSupplyResponse = {
  total_supply: string;
};

interface UsersAmount {
  user: string;
  amount: string;
  claims_rewards: boolean;
  withdraws_rewards: boolean;
  is_vesting: boolean;
}
interface AirdropAmountAndClaimsRewards {
  amount: string;
  claims_rewards: boolean;
  withdraws_rewards: boolean;
  is_vesting: boolean;
}
function filterMapByPropertyFunctional<TValue>(
  map: Map<string, TValue>,
  propertyName: string,
  filterValue: any
): Map<string, TValue> {
  return new Map(
    Array.from(map.entries()).filter(([key, value]) => value[propertyName] === filterValue)
  );
}
function filterMapByPropertiesFunctional<TValue>(
  map: Map<string, TValue>,
  property1: string,
  property2: string,
  filterValue1: any,
  filterValue2: any,

): Map<string, TValue> {
  return new Map(
    Array.from(map.entries()).filter(([key, value]) => 
      value[property1] === filterValue1 
      && value[property2] === filterValue2)
  );
}

function parseData(data: string): Map<string, AirdropAmountAndClaimsRewards> {
  const parsedData: UsersAmount[] = JSON.parse(data); // Parse with type assertion  
  const map: Map<string, AirdropAmountAndClaimsRewards> = new Map<string, AirdropAmountAndClaimsRewards>();

  parsedData.forEach((item) => {
    map.set(item.user, { amount : item.amount, claims_rewards: item.claims_rewards, withdraws_rewards: item.withdraws_rewards, is_vesting: item.is_vesting});
  });

  return map;
}

async function loadAndParseData(filePath: string): Promise<Map<string, AirdropAmountAndClaimsRewards>> {
  try {
    // Read the file content synchronously (not recommended)
    const data: string = await fs.promises.readFile(filePath, 'utf-8');
    return parseData(data);
  } catch (error) {
    console.error("Error loading data:", error);
    throw error; // Re-throw the error for handling
  }
}

function loadAndParseDataSync(filePath: string): Map<string, AirdropAmountAndClaimsRewards> {
  try {
    // Read the file content synchronously (not recommended)
    const data: string = fs.readFileSync(filePath, 'utf-8');
    return parseData(data);
  } catch (error) {
    console.error("Error loading data:", error);
    throw error; // Re-throw the error for handling
  }
}

const waitTill = (timestamp: number): Promise<void> => {
  if (typeof timestamp !== 'number' || isNaN(timestamp)) {
    throw new Error('timestamp is not a number');
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timestamp * 1000 - Date.now());
  });
};
const initState = () => getInitialState();
const allStates = () => getAllOtherStates();
describe('TGE / Migration / PCL contracts', () => {
  let testState: TestStateLocalCosmosTestNet;
  let tgeMain: Tge;
  let neutronChain: CosmosWrapper;
  let cmInstantiator: WalletWrapper;
  let cmTokenManager: WalletWrapper;
  let cmStranger: WalletWrapper;
  const tgeWallets: Record<string, WalletWrapper> = {};
  let atomBalance = 0;
  let usdcBalance = 0;
  let ntrnAtomSize = 0;
  let ntrnUsdcSize = 0;
  let atomLpSize = 0;
  let usdcLpSize = 0;
  let atomLpLocked = 0;
  let usdcLpLocked = 0;
  let tgeEndHeight = 0;
  let daoMember1: DaoMember;
  let daoMain: Dao;
  let reserveContract: string;
  let ntrnAtomPclPool: string;
  let ntrnAtomPclToken: string;
  let ntrnUsdcPclPool: string;
  let ntrnUsdcPclToken: string;
  let atomVestingLpAddr: string;
  let usdcVestingLpAddr: string;
  let lockdropPclAddr: string;
  let initData: Map<string, AirdropAmountAndClaimsRewards> = new Map<string, AirdropAmountAndClaimsRewards>();

  describe('Pre-Migration setup', () => {

    initData = loadAndParseDataSync("./init_data.json");
    console.log("in init data: ", initData);


    beforeAll(async () => {
      testState = new TestStateLocalCosmosTestNet(config);
      await testState.init();

      neutronChain = new CosmosWrapper(
        testState.sdk1,
        testState.blockWaiter1,
        NEUTRON_DENOM,
      );
      cmInstantiator = new WalletWrapper(
        neutronChain,
        testState.wallets.qaNeutron.genQaWal1,
      );
      cmTokenManager = new WalletWrapper(
        neutronChain,
        testState.wallets.qaNeutronFour.genQaWal1,
      );
      cmStranger = new WalletWrapper(
        neutronChain,

        testState.wallets.qaNeutronFive.genQaWal1,
      );
      const daoCoreAddress = (await neutronChain.getChainAdmins())[0];
      const daoContracts = await getDaoContracts(neutronChain, daoCoreAddress);
      daoMain = new Dao(neutronChain, daoContracts);
      daoMember1 = new DaoMember(cmInstantiator, daoMain);
      await daoMember1.bondFunds('10000');

      const reserveCodeID = await cmInstantiator.storeWasm(
        NeutronContract.RESERVE_CURRENT,
      );
      const res = await cmInstantiator.instantiateContract(
        reserveCodeID,
        JSON.stringify({
          main_dao_address: NEUTRON_DAO_ADDR,
          denom: NEUTRON_DENOM,
          distribution_rate: '0.23',
          min_period: 1000,
          distribution_contract: cmInstantiator.wallet.address.toString(),
          treasury_contract: cmInstantiator.wallet.address.toString(),
          security_dao_address: cmInstantiator.wallet.address.toString(),
          vesting_denominator: '100000000000',
        }),
        'reserve',
      );
      reserveContract = res[0]._contract_address;

      tgeMain = new Tge(
        neutronChain,
        cmInstantiator,
        cmTokenManager,
        reserveContract,
        IBC_ATOM_DENOM,
        IBC_USDC_DENOM,
        NEUTRON_DENOM,
      );

      // initData = await loadAndParseData("./init_data.json");



      console.log("in init data: ", initData);
      for (const v of initData.keys()) {
        tgeWallets[v] = new WalletWrapper(
          neutronChain,
          (
            await testState.createQaWallet(
              'neutron',
              testState.sdk1,
              testState.blockWaiter1,
              testState.wallets.neutron.demo1,
              // @audit-info The amount of Neutron, IBC, and ATOM are defined here.
              // (good place to add Quint-generated amount)
              NEUTRON_DENOM,
              [
                {
                  denom: NEUTRON_DENOM,
                  amount: '5000000',
                },
                {
                  denom: IBC_ATOM_DENOM,
                  amount: '1000000',
                },
                {
                  denom: IBC_USDC_DENOM,
                  amount: '1000000',
                },
              ],
            )
          ).genQaWal1,
        );
      }

    });

    afterAll(async () => {
      console.log(`TGE participant wallets: ${JSON.stringify(tgeWallets)}`);
      console.log('TGE contracts:', tgeMain.contracts);
    });

    describe('Deploy', () => {
      it('should deploy useres contracts', async () => {
        tgeMain.airdropAccounts = [];

        initData.forEach((value, key) => {
            tgeMain.airdropAccounts.push(
              {
                address: tgeWallets[key].wallet.address.toString(),
                amount: value.amount,
              });
        });

        console.log("Airdrop accounts: ", tgeMain.airdropAccounts);
        tgeMain.times.airdropStart = getTimestamp(0);
        tgeMain.times.airdropVestingStart = getTimestamp(300);
        await tgeMain.deployPreAuction();
      });

      it('should deploy auction', async () => {
        tgeMain.times.auctionInit = getTimestamp(80);
        await tgeMain.deployAuction();
      });

      it('should deploy lockdrop and lockdrop vault', async () => {
        tgeMain.times.lockdropInit =
          tgeMain.times.auctionInit +
          tgeMain.times.auctionDepositWindow +
          tgeMain.times.auctionWithdrawalWindow +
          5;
        await tgeMain.deployLockdrop();
        await tgeMain.deployLockdropVault();
      });

    });

    describe('Airdrop', () => {
      it('should claim airdrop', async () => {
        for (const v of initData.keys()) {
          const address = tgeWallets[v].wallet.address.toString();
          const amount =
            tgeMain.airdropAccounts.find(
              ({ address }) => address == tgeWallets[v].wallet.address.toString(),
            )?.amount || '0';
          const proofs = tgeMain.airdrop.getMerkleProof({
            address: address,
            amount: amount,
          });
          const payload = {
            claim: {
              address: address,
              amount: amount,
              proof: proofs,
            },
          };
          const res = await tgeWallets[v].executeContract(
            tgeMain.contracts.airdrop,
            JSON.stringify(payload),
          );
          expect(res.code).toEqual(0);
        }
      });
    });


    describe('Auction', () => {
      describe('Phase 1', () => {

        it('should allow deposit ATOM', async () => {
          await waitTill(tgeMain.times.auctionInit + 3);
          const atomBalanceBefore = await neutronChain.queryDenomBalance(
            cmInstantiator.wallet.address.toString(),
            IBC_ATOM_DENOM,
          );
          console.log("for cmInstantiator, atom balance before ", atomBalanceBefore);
          const res = await cmInstantiator.executeContract(
            tgeMain.contracts.auction,
            JSON.stringify({
              deposit: {},
            }),
            [
              {
                amount: ATOM_DEPOSIT_AMOUNT.toString(),
                denom: IBC_ATOM_DENOM,
              },
            ],
          );
          expect(res.code).toEqual(0);
          const info = await neutronChain.queryContract<UserInfoResponse>(
            tgeMain.contracts.auction,
            {
              user_info: {
                address: cmInstantiator.wallet.address.toString(),
              },
            },
          );
          const atomBalanceAfter = await neutronChain.queryDenomBalance(
            cmInstantiator.wallet.address.toString(),
            IBC_ATOM_DENOM,
          );
          console.log("for cmInstantiator, atom balance after ", atomBalanceAfter);
          console.log("for cminstantiator, atom deposited ", info.atom_deposited);
          expect(info.atom_deposited).toEqual(ATOM_DEPOSIT_AMOUNT.toString());
          expect(atomBalanceAfter).toEqual(
            atomBalanceBefore - ATOM_DEPOSIT_AMOUNT,
          );
          atomBalance += ATOM_DEPOSIT_AMOUNT;

          for (const v of initData.keys()) {
            const atomBalanceBefore = await neutronChain.queryDenomBalance(
              tgeWallets[v].wallet.address.toString(),
              IBC_ATOM_DENOM,
            );
            console.log("for ", v, " atom balance before ", atomBalanceBefore);
            const res2 = await tgeWallets[v].executeContract(

              tgeMain.contracts.auction,
              JSON.stringify({
                deposit: {},
              }),
              [
                {
                  // @audit-info : all accounts are depositing the same amount. May be a good place
                  // to change the amount.
                  amount: ATOM_DEPOSIT_AMOUNT.toString(),
                  denom: IBC_ATOM_DENOM,
                },
              ],
            );
            expect(res2.code).toEqual(0);


            const atomBalanceAfter = await neutronChain.queryDenomBalance(
              tgeWallets[v].wallet.address.toString(),
              IBC_ATOM_DENOM,
            );
            console.log("for ", v, " atom balance after ", atomBalanceAfter);

            const info = await neutronChain.queryContract<UserInfoResponse>(
              tgeMain.contracts.auction,
              {
                user_info: {
                  address: tgeWallets[v].wallet.address.toString(),
                },
              },
            );
            console.log("for ", v, " atom deposited ", info.atom_deposited);

            atomBalance += ATOM_DEPOSIT_AMOUNT;
          }
        });
        it('should allow deposit USDC', async () => {
          const usdcBalanceBefore = await neutronChain.queryDenomBalance(
            cmInstantiator.wallet.address.toString(),
            IBC_USDC_DENOM,
          );
          const res = await cmInstantiator.executeContract(
            tgeMain.contracts.auction,
            JSON.stringify({
              deposit: {},
            }),
            [
              {
                amount: USDC_DEPOSIT_AMOUNT.toString(),
                denom: IBC_USDC_DENOM,
              },
            ],
          );
          expect(res.code).toEqual(0);
          const info = await neutronChain.queryContract<UserInfoResponse>(
            tgeMain.contracts.auction,
            {
              user_info: {
                address: cmInstantiator.wallet.address.toString(),
              },
            },
          );
          const usdcBalanceAfter = await neutronChain.queryDenomBalance(
            cmInstantiator.wallet.address.toString(),
            IBC_USDC_DENOM,
          );
          expect(info.usdc_deposited).toEqual(USDC_DEPOSIT_AMOUNT.toString());
          expect(usdcBalanceAfter).toEqual(
            usdcBalanceBefore - USDC_DEPOSIT_AMOUNT,
          );
          usdcBalance += USDC_DEPOSIT_AMOUNT;

          for (const v of initData.keys()) {
            const usdcBalanceBefore = await neutronChain.queryDenomBalance(
              tgeWallets[v].wallet.address.toString(),
              IBC_USDC_DENOM,
            );
            console.log("for ", v, " USDC balance before ", usdcBalanceBefore);
            const res2 = await tgeWallets[v].executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                deposit: {},
              }),
              [
                {
                  // @audit-info : again here, all accounts are depositing the same amount. 
                  // A good place to use Quint-generated amount
                  amount: USDC_DEPOSIT_AMOUNT.toString(),
                  denom: IBC_USDC_DENOM,
                },
              ],
            );
            expect(res2.code).toEqual(0);
            usdcBalance += USDC_DEPOSIT_AMOUNT;

            const usdcBalanceAfter = await neutronChain.queryDenomBalance(
              tgeWallets[v].wallet.address.toString(),
              IBC_USDC_DENOM,
            );
            console.log("for ", v, " USDC balance after ", usdcBalanceAfter);

            const info = await neutronChain.queryContract<UserInfoResponse>(
              tgeMain.contracts.auction,
              {
                user_info: {
                  address: tgeWallets[v].wallet.address.toString(),
                },
              },
            );
            console.log("for ", v, " USDC deposited ", info.usdc_deposited);


          }
        });
        //       // @audit-issue : removing the test that is withdrawing. May influence future balances - pay attention to it

        //       // it('should be able to witdraw', async () => {
        //       //   const atomBalanceBefore = await neutronChain.queryDenomBalance(
        //       //     cmInstantiator.wallet.address.toString(),
        //       //     IBC_ATOM_DENOM,
        //       //   );
        //       //   const usdcBalanceBefore = await neutronChain.queryDenomBalance(
        //       //     cmInstantiator.wallet.address.toString(),
        //       //     IBC_USDC_DENOM,
        //       //   );
        //       //   const res = await cmInstantiator.executeContract(
        //       //     tgeMain.contracts.auction,
        //       //     JSON.stringify({
        //       //       withdraw: {
        //       //         amount_usdc: '5000',
        //       //         amount_atom: '5000',
        //       //       },
        //       //     }),
        //       //   );
        //       //   expect(res.code).toEqual(0);
        //       //   const info = await neutronChain.queryContract<UserInfoResponse>(
        //       //     tgeMain.contracts.auction,
        //       //     {
        //       //       user_info: {
        //       //         address: cmInstantiator.wallet.address.toString(),
        //       //       },
        //       //     },
        //       //   );
        //       //   const atomBalanceAfter = await neutronChain.queryDenomBalance(
        //       //     cmInstantiator.wallet.address.toString(),
        //       //     IBC_ATOM_DENOM,
        //       //   );
        //       //   const usdcBalanceAfter = await neutronChain.queryDenomBalance(
        //       //     cmInstantiator.wallet.address.toString(),
        //       //     IBC_USDC_DENOM,
        //       //   );
        //       //   atomBalance -= 5000;
        //       //   usdcBalance -= 5000;
        //       //   expect(info.atom_deposited).toEqual('5000');
        //       //   expect(info.usdc_deposited).toEqual('85000');
        //       //   expect(atomBalanceAfter).toEqual(atomBalanceBefore + 5000);
        //       //   expect(usdcBalanceAfter).toEqual(usdcBalanceBefore + 5000);

        //       //   for (const v of [
        //       //     'airdropAuctionVesting',
        //       //     'airdropAuctionLockdrop',
        //       //     'airdropAuctionLockdropVesting',
        //       //     'auctionVesting',
        //       //     'auctionLockdrop',
        //       //     'auctionLockdropVesting',
        //       //     'airdropAuctionLockdropVestingMigration',
        //       //   ]) {
        //       //     const res2 = await tgeWallets[v].executeContract(
        //       //       tgeMain.contracts.auction,
        //       //       JSON.stringify({
        //       //         withdraw: {
        //       //           amount_usdc: (USDC_DEPOSIT_AMOUNT / 2).toString(),
        //       //           amount_atom: (ATOM_DEPOSIT_AMOUNT / 2).toString(),
        //       //         },
        //       //       }),
        //       //     );
        //       //     expect(res2.code).toEqual(0);
        //       //     atomBalance -= ATOM_DEPOSIT_AMOUNT / 2;
        //       //     usdcBalance -= USDC_DEPOSIT_AMOUNT / 2;
        //       //   }
        //       // });
      });

      describe('Phase 2', () => {
        it('time moves to finish the phase', async () => {
          await waitTill(
            tgeMain.times.auctionInit + tgeMain.times.auctionDepositWindow + 5,
          );
        });
        // @audit here is missing withdrawal, will paste it commented. it relies on the previously commented out code for withdrawall.
        // it('should not be able to withdraw mode than 50% of current deposit', async () => {
        //   await expect(
        //     cmInstantiator.executeContract(
        //       tgeMain.contracts.auction,
        //       JSON.stringify({
        //         withdraw: {
        //           amount_usdc: '5000',
        //           amount_atom: '5000',
        //         },
        //       }),
        //     ),
        //   ).rejects.toThrow(
        //     /Amount exceeds maximum allowed withdrawal limit of 0.5/,
        //   );
        // });
        // it('should be able to withdraw', async () => {
        //   const atomBalanceBefore = await neutronChain.queryDenomBalance(
        //     cmInstantiator.wallet.address.toString(),
        //     IBC_ATOM_DENOM,
        //   );
        //   const usdcBalanceBefore = await neutronChain.queryDenomBalance(
        //     cmInstantiator.wallet.address.toString(),
        //     IBC_USDC_DENOM,
        //   );
        //   const res = await cmInstantiator.executeContract(
        //     tgeMain.contracts.auction,
        //     JSON.stringify({
        //       withdraw: {
        //         amount_usdc: '1000',
        //         amount_atom: '1000',
        //       },
        //     }),
        //   );
        //   expect(res.code).toEqual(0);
        //   atomBalance -= 1000;
        //   usdcBalance -= 1000;
        //   const info = await neutronChain.queryContract<UserInfoResponse>(
        //     tgeMain.contracts.auction,
        //     {
        //       user_info: {
        //         address: cmInstantiator.wallet.address.toString(),
        //       },
        //     },
        //   );
        //   const atomBalanceAfter = await neutronChain.queryDenomBalance(
        //     cmInstantiator.wallet.address.toString(),
        //     IBC_ATOM_DENOM,
        //   );
        //   const usdcBalanceAfter = await neutronChain.queryDenomBalance(
        //     cmInstantiator.wallet.address.toString(),
        //     IBC_USDC_DENOM,
        //   );
        //   expect(info.atom_deposited).toEqual('4000');
        //   expect(info.usdc_deposited).toEqual('84000');
        //   expect(info.withdrawn).toEqual(true);
        //   expect(atomBalanceAfter).toEqual(atomBalanceBefore + 1000);
        //   expect(usdcBalanceAfter).toEqual(usdcBalanceBefore + 1000);
        // });
        // it('should not allow to withdraw more than once', async () => {
        //   await expect(
        //     cmInstantiator.executeContract(
        //       tgeMain.contracts.auction,
        //       JSON.stringify({
        //         withdraw: {
        //           amount_usdc: '1000',
        //           amount_atom: '1000',
        //         },
        //       }),
        //     ),
        //   ).rejects.toThrow(/Max 1 withdrawal allowed/);
        // });
      });
      describe('Phase 3', () => {
        describe('intentivizing lockdrop', () => {
          it('should incentivize lockdrop', async () => {
            const res = await cmInstantiator.executeContract(
              tgeMain.contracts.lockdrop,
              JSON.stringify({
                increase_ntrn_incentives: {},
              }),
              [
                {
                  amount: String(NTRN_INCENTIVIZE_AMOUNT),
                  denom: NEUTRON_DENOM,
                },
              ],
            );
            expect(res.code).toEqual(0);
          });
        });
        describe('set_pool_size', () => {
          it('transfer some ATOM directly to auction contract to try affect pool', async () => {
            await cmInstantiator.msgSend(tgeMain.contracts.auction, {
              amount: '100000000',
              denom: IBC_ATOM_DENOM,
            });
          });

          it('wait for the window time to pass', async () => {
            await waitTill(
              tgeMain.times.auctionInit +
              tgeMain.times.auctionDepositWindow +
              tgeMain.times.auctionWithdrawalWindow +
              5,
            );
          });

          it('send NTRNs to the pool', async () => {
            await cmInstantiator.msgSend(tgeMain.contracts.auction, {
              amount: NTRN_AMOUNT.toString(),
            });
          });

          it('should be able to set pool size', async () => {
            const time = (Date.now() / 1000) | 0;
            const r1 = await cmTokenManager.executeContract(
              tgeMain.contracts.priceFeed,
              JSON.stringify({
                set_rate: {
                  symbol: 'ATOM',
                  rate: {
                    rate: ATOM_RATE.toString(),
                    resolve_time: time.toString(),
                    request_id: '1',
                  },
                },
              }),
            );
            expect(r1.code).toEqual(0);
            const r2 = await cmTokenManager.executeContract(
              tgeMain.contracts.priceFeed,
              JSON.stringify({
                set_rate: {
                  symbol: 'USDC',
                  rate: {
                    rate: USDC_RATE.toString(),
                    resolve_time: time.toString(),
                    request_id: '1',
                  },
                },
              }),
            );
            expect(r2.code).toEqual(0);

            const res = await cmTokenManager.executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                set_pool_size: {},
              }),
            );
            expect(res.code).toEqual(0);
            const state = await neutronChain.queryContract<AuctionStateResponse>(
              tgeMain.contracts.auction,
              {
                state: {},
              },
            );

          const usdcToAtomRate = ATOM_RATE / USDC_RATE;
          const totalInUSDC = usdcToAtomRate * atomBalance + usdcBalance;
          ntrnAtomSize = Math.floor(
            NTRN_AMOUNT * ((atomBalance * usdcToAtomRate) / totalInUSDC),
          );
          ntrnUsdcSize = NTRN_AMOUNT - ntrnAtomSize;
          atomLpSize = getLpSize(atomBalance, ntrnAtomSize);
          usdcLpSize = getLpSize(usdcBalance, ntrnUsdcSize);

          expect(parseInt(state.atom_ntrn_size)).toBeCloseTo(ntrnAtomSize, -1);
          expect(parseInt(state.usdc_ntrn_size)).toBeCloseTo(ntrnUsdcSize, -1);
          expect(parseInt(state.atom_lp_size)).toBeCloseTo(atomLpSize, -1);
          expect(parseInt(state.usdc_lp_size)).toBeCloseTo(usdcLpSize, -1);


            expect(state).toMatchObject({
              atom_lp_locked: '0',
              is_rest_lp_vested: false,
              lp_atom_shares_minted: null,
              lp_usdc_shares_minted: null,
              pool_init_timestamp: 0,
              total_atom_deposited: atomBalance.toString(),
              total_usdc_deposited: usdcBalance.toString(),
              usdc_lp_locked: '0',
            });
          });

        });
        describe('lock_lp', () => {
          it('should be able to lock ATOM LP tokens', async () => {
            const res = await cmInstantiator.executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                lock_lp: {
                  amount: '77',
                  asset: 'ATOM',
                  duration: 1,
                },
              }),
            );
            const userInfo = await neutronChain.queryContract<UserInfoResponse>(
              tgeMain.contracts.auction,
              {
                user_info: {
                  address: cmInstantiator.wallet.address.toString(),
                },
              },
            );
            expect(res.code).toEqual(0);
            expect(parseInt(userInfo.atom_lp_locked)).toEqual(77);
            atomLpLocked += 77;
            const info = await neutronChain.queryContract<LockDropInfoResponse>(
              tgeMain.contracts.lockdrop,
              {
                user_info: {
                  address: cmInstantiator.wallet.address.toString(),
                },
              },
            );
            expect(info.lockup_infos).toHaveLength(1);
            expect(info.lockup_infos[0]).toMatchObject({
              lp_units_locked: atomLpLocked.toString(),
              pool_type: 'ATOM',
            });

            for (const v of initData.keys()) {
              const userInfo = await neutronChain.queryContract<UserInfoResponse>(
                tgeMain.contracts.auction,
                {
                  user_info: {
                    address: tgeWallets[v].wallet.address.toString(),
                  },
                },
              );
              const res2 = await tgeWallets[v].executeContract(
                tgeMain.contracts.auction,
                JSON.stringify({
                  lock_lp: {
                    amount: userInfo.atom_lp_amount,
                    asset: 'ATOM',
                    duration: 1,
                  },
                }),
              );
              expect(res2.code).toEqual(0);
              console.log("user ", v, " locked atom lp amount ", userInfo.atom_lp_amount);
              atomLpLocked += Number(userInfo.atom_lp_amount);
            }
          });
          it('should be able to lock USDC LP tokens', async () => {
            const res = await cmInstantiator.executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                lock_lp: {
                  amount: '50',
                  asset: 'USDC',
                  duration: 1,
                },
              }),
            );
            const res2 = await cmInstantiator.executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                lock_lp: {
                  amount: '50',
                  asset: 'USDC',
                  duration: 2,
                },
              }),
            );
            const userInfo = await neutronChain.queryContract<UserInfoResponse>(
              tgeMain.contracts.auction,
              {
                user_info: {
                  address: cmInstantiator.wallet.address.toString(),
                },
              },
            );
            expect(res.code).toEqual(0);
            expect(res2.code).toEqual(0);
            usdcLpLocked += 100;
            expect(parseInt(userInfo.usdc_lp_locked)).toEqual(100);
            const info = await neutronChain.queryContract<LockDropInfoResponse>(
              tgeMain.contracts.lockdrop,
              {
                user_info: {
                  address: cmInstantiator.wallet.address.toString(),
                },
              },
            );
            expect(info.lockup_infos).toHaveLength(3);
            expect(info.lockup_infos[1]).toMatchObject({
              lp_units_locked: String(usdcLpLocked / 2),
              pool_type: 'USDC',
            });
            expect(info.lockup_infos[2]).toMatchObject({
              lp_units_locked: String(usdcLpLocked / 2),
              pool_type: 'USDC',
            });

            for (const v of initData.keys()) {
              const userInfo = await neutronChain.queryContract<UserInfoResponse>(
                tgeMain.contracts.auction,
                {
                  user_info: {
                    address: tgeWallets[v].wallet.address.toString(),
                  },
                },
              );
              const res2 = await tgeWallets[v].executeContract(
                tgeMain.contracts.auction,
                JSON.stringify({
                  lock_lp: {
                    amount: userInfo.usdc_lp_amount,
                    asset: 'USDC',
                    duration: 1,
                  },
                }),
              );
              expect(res2.code).toEqual(0);
              console.log("user ", v, " locked usdc lp amount ", userInfo.usdc_lp_amount);

              usdcLpLocked += Number(userInfo.usdc_lp_amount);
            }
          });
        });

        it('wait for lock time to pass', async () => {
          await waitTill(
            tgeMain.times.lockdropInit +
              tgeMain.times.lockdropDepositDuration +
              5,
          );
        });
        it('should set generator to lockdrop', async () => {
          const res = await cmInstantiator.executeContract(
            tgeMain.contracts.lockdrop,
            JSON.stringify({
              update_config: {
                new_config: {
                  generator_address: tgeMain.contracts.astroGenerator,
                },
              },
            }),
          );
          expect(res.code).toEqual(0);
        });
      });
      describe('Init pool', () => {
        it('should init pool', async () => {
          await waitTill(
            tgeMain.times.lockdropInit +
            tgeMain.times.lockdropDepositDuration +
            tgeMain.times.lockdropWithdrawalDuration +
            5,
          );
          const res = await cmInstantiator.executeContract(
            tgeMain.contracts.auction,
            JSON.stringify({
              init_pool: {},
            }),
          );
          expect(res.code).toEqual(0);
          const [
            auctionState,
            atomPoolInfo,
            usdcPoolInfo,
            reserveLPBalanceAtomNtrn,
            reserveLPBalanceUsdcNtrn,
            auctionLPBalanceAtomNtrn,
            auctionLPBalanceUsdcNtrn,
            lockdropLPBalanceAtomNtrn,
            lockdropLPBalanceUsdcNtrn,
            generatorLPBalanceAtomNtrn,
            generatorLPBalanceUsdcNtrn,
          ] = await Promise.all([
            neutronChain.queryContract<AuctionStateResponse>(
              tgeMain.contracts.auction,
              {
                state: {},
              },
            ),
            neutronChain.queryContract<PoolInfoResponse>(
              tgeMain.pairs.atom_ntrn.contract,
              {
                pool: {},
              },
            ),
            neutronChain.queryContract<PoolInfoResponse>(
              tgeMain.pairs.usdc_ntrn.contract,
              {
                pool: {},
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.atom_ntrn.liquidity,
              {
                balance: {
                  address: reserveContract,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.usdc_ntrn.liquidity,
              {
                balance: {
                  address: reserveContract,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.atom_ntrn.liquidity,
              {
                balance: {
                  address: tgeMain.contracts.auction,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.usdc_ntrn.liquidity,
              {
                balance: {
                  address: tgeMain.contracts.auction,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.atom_ntrn.liquidity,
              {
                balance: {
                  address: tgeMain.contracts.lockdrop,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.usdc_ntrn.liquidity,
              {
                balance: {
                  address: tgeMain.contracts.lockdrop,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.atom_ntrn.liquidity,
              {
                balance: {
                  address: tgeMain.contracts.astroGenerator,
                },
              },
            ),
            neutronChain.queryContract<BalanceResponse>(
              tgeMain.pairs.usdc_ntrn.liquidity,
              {
                balance: {
                  address: tgeMain.contracts.astroGenerator,
                },
              },
            ),
          ]);
          console.log("at init pool");
          console.log("auction state: ", auctionState);
          console.log("atom pool info: ", atomPoolInfo);
          console.log("usdc pool info: ", usdcPoolInfo);
          console.log("auctionLPBalanceAtomNtrn: ", auctionLPBalanceAtomNtrn);
          console.log("auctionLPBalanceUsdcNtrn: ", auctionLPBalanceUsdcNtrn);
          console.log("lockdropLPBalanceAtomNtrn: ", lockdropLPBalanceAtomNtrn);
          console.log("lockdropLPBalanceUsdcNtrn: ", lockdropLPBalanceUsdcNtrn);
          console.log("generatorLPBalanceAtomNtrn: ", generatorLPBalanceAtomNtrn);
          console.log("generatorLPBalanceUsdcNtrn: ", generatorLPBalanceUsdcNtrn);
          expect(auctionState.pool_init_timestamp).toBeGreaterThan(0);
          expect(
            Math.abs(
              parseInt(reserveLPBalanceAtomNtrn.balance) -
              parseInt(auctionState.atom_lp_size) / 2,
            ),
          ).toBeLessThan(1);
          expect(
            Math.abs(
              parseInt(reserveLPBalanceUsdcNtrn.balance) -
              parseInt(auctionState.usdc_lp_size) / 2,
            ),
          ).toBeLessThan(1);

          expect(generatorLPBalanceAtomNtrn).toEqual({
            balance: auctionState.atom_lp_locked,
          });
          expect(generatorLPBalanceUsdcNtrn).toEqual({
            balance: auctionState.usdc_lp_locked,
          });
          expect(lockdropLPBalanceAtomNtrn).toEqual({
            balance: '0',
          });
          expect(lockdropLPBalanceUsdcNtrn).toEqual({
            balance: '0',
          });

          expect(
            Math.abs(
              parseInt(auctionLPBalanceAtomNtrn.balance) -
              (parseInt(auctionState.atom_lp_size) / 2 -
                parseInt(auctionState.atom_lp_locked)),
            ),
          ).toBeLessThan(1);
          expect(
            Math.abs(
              parseInt(auctionLPBalanceUsdcNtrn.balance) -
              (parseInt(auctionState.usdc_lp_size) / 2 -
                parseInt(auctionState.usdc_lp_locked)),
            ),
          ).toBeLessThan(1);

          expect(atomPoolInfo.assets[0].amount).toEqual(atomBalance.toString());
          expect(parseInt(atomPoolInfo.assets[1].amount)).toBeCloseTo(
            ntrnAtomSize,
            -1,
          );
          expect(parseInt(atomPoolInfo.total_share)).toEqual(
            parseInt(auctionState.atom_lp_size) + MIN_LIQUDITY,
          );

          expect(usdcPoolInfo.assets[0].amount).toEqual(usdcBalance.toString());
          expect(parseInt(usdcPoolInfo.assets[1].amount)).toBeCloseTo(
            ntrnUsdcSize,
            -1,
          );
          expect(parseInt(usdcPoolInfo.total_share)).toEqual(
            parseInt(auctionState.usdc_lp_size) + MIN_LIQUDITY,
          );
          expect(atomLpSize).toBeCloseTo(
            parseInt(atomPoolInfo.total_share) - MIN_LIQUDITY,
            -1,
          );
          expect(usdcLpSize).toBeCloseTo(
            parseInt(usdcPoolInfo.total_share) - MIN_LIQUDITY,
            -1,
          );
          expect(auctionState.atom_lp_size).toEqual(
            auctionState.lp_atom_shares_minted,
          );
          expect(auctionState.usdc_lp_size).toEqual(
            auctionState.lp_usdc_shares_minted,
          );
        });
        it('update oracles', async () => {
          tgeEndHeight = await getHeight(neutronChain.sdk);
          let res = await cmInstantiator.executeContract(
            tgeMain.contracts.oracleAtom,
            JSON.stringify({
              update: {},
            }),
          );
          expect(res.code).toEqual(0);
  
          res = await cmInstantiator.executeContract(
            tgeMain.contracts.oracleUsdc,
            JSON.stringify({
              update: {},
            }),
          );
          expect(res.code).toEqual(0);
  
          testState.blockWaiter1.waitBlocks(3);
          res = await cmInstantiator.executeContract(
            tgeMain.contracts.oracleAtom,
            JSON.stringify({
              update: {},
            }),
          );
          expect(res.code).toEqual(0);
          res = await cmInstantiator.executeContract(
            tgeMain.contracts.oracleUsdc,
            JSON.stringify({
              update: {},
            }),
          );
          expect(res.code).toEqual(0);
        });
        // it('should not be able to init pool twice', async () => {
        //   await expect(
        //     cmInstantiator.executeContract(
        //       tgeMain.contracts.auction,
        //       JSON.stringify({
        //         init_pool: {},
        //       }),
        //     ),
        //   ).rejects.toThrow(/Liquidity already added/);
        // });
      });
    });
    
    // @audit-info vaults part removed
  });
  describe('Vest LP', () => {
    let claimAtomLP: number;
    let claimUsdcLP: number;
    it('should vest LP (permissionless)', async () => {
      let res = await cmStranger.executeContract(
        tgeMain.contracts.auction,
        JSON.stringify({
          migrate_to_vesting: {},
        }),
      );
      expect(res.code).toEqual(0);

      // @audit-info what is the significance of airdropOnly executing this?
      // probably not more than this contract losing a bit of its funds on gas
      // Aleksandar: yes, there is no checking for who is executing that endpoint. there is no particular meaning except for gas (probably)
      res = await tgeWallets.airdropOnly.executeContract(
        tgeMain.contracts.auction,
        JSON.stringify({
          migrate_to_vesting: {},
        }),
      );
      expect(res.code).toEqual(0);
      tgeMain.times.vestTimestamp = Date.now();
    });

    it('should validate numbers', async () => {
      const [
        vestingInfoAtom,
        vestingInfoUsdc,
        lpAuctionBalanceAtom,
        lpAuctionBalanceUsdc,
      ] = await Promise.all([
        neutronChain.queryContract<VestingAccountResponse>(
          tgeMain.contracts.vestingAtomLp,
          {
            vesting_account: {
              address: cmInstantiator.wallet.address.toString(),
            },
          },
        ),
        neutronChain.queryContract<VestingAccountResponse>(
          tgeMain.contracts.vestingUsdcLp,
          {
            vesting_account: {
              address: cmInstantiator.wallet.address.toString(),
            },
          },
        ),
        neutronChain.queryContract<BalanceResponse>(
          tgeMain.pairs.atom_ntrn.liquidity,
          {
            balance: {
              address: tgeMain.contracts.auction,
            },
          },
        ),
        neutronChain.queryContract<BalanceResponse>(
          tgeMain.pairs.usdc_ntrn.liquidity,
          {
            balance: {
              address: tgeMain.contracts.auction,
            },
          },
        ),
      ]);
      // round?
      expect(parseInt(lpAuctionBalanceUsdc.balance)).toBeLessThanOrEqual(7);
      expect(parseInt(lpAuctionBalanceAtom.balance)).toBeLessThanOrEqual(7);
      expect(vestingInfoAtom.address).toEqual(
        cmInstantiator.wallet.address.toString(),
      );
      expect(vestingInfoUsdc.address).toEqual(
        cmInstantiator.wallet.address.toString(),
      );
      expect(vestingInfoAtom.info.released_amount).toEqual('0');
      expect(vestingInfoUsdc.info.released_amount).toEqual('0');
      // // NOTE: magic number - 3065
      // expect(
      //   parseInt(vestingInfoAtom.info.schedules[0].end_point.amount),
      // ).toBeCloseTo(3065, -1);
      claimAtomLP = parseInt(
        vestingInfoAtom.info.schedules[0].end_point.amount,
      );
      // NOTE: magic number - 20950
      // expect(
      //   parseInt(vestingInfoUsdc.info.schedules[0].end_point.amount),
      // ).toBeCloseTo(20950, -1);
      claimUsdcLP = parseInt(
        vestingInfoUsdc.info.schedules[0].end_point.amount,
      );
    });
    it('should be able to claim lpATOM_NTRN vesting after vesting period', async () => {
      await waitTill(
        tgeMain.times.vestTimestamp / 1000 +
        tgeMain.times.auctionVestingLpDuration +
        10,
      );
      const [avaliableAtomLp, avaliableUsdcLp] = await Promise.all([
        neutronChain.queryContract<string>(tgeMain.contracts.vestingAtomLp, {
          available_amount: {
            address: cmInstantiator.wallet.address.toString(),
          },
        }),
        neutronChain.queryContract<string>(tgeMain.contracts.vestingUsdcLp, {
          available_amount: {
            address: cmInstantiator.wallet.address.toString(),
          },
        }),
      ]);
      expect(avaliableAtomLp).toEqual(claimAtomLP.toString());
      expect(avaliableUsdcLp).toEqual(claimUsdcLP.toString());
      const resAtom = await cmInstantiator.executeContract(
        tgeMain.contracts.vestingAtomLp,
        JSON.stringify({
          claim: {},
        }),
      );
      expect(resAtom.code).toEqual(0);
      const resUsdc = await cmInstantiator.executeContract(
        tgeMain.contracts.vestingUsdcLp,
        JSON.stringify({
          claim: {},
        }),
      );
      expect(resUsdc.code).toEqual(0);

      const [lpBalanceAtom, lpBalanceUsdc] = await Promise.all([
        neutronChain.queryContract<BalanceResponse>(
          tgeMain.pairs.atom_ntrn.liquidity,
          {
            balance: {
              address: cmInstantiator.wallet.address.toString(),
            },
          },
        ),
        neutronChain.queryContract<BalanceResponse>(
          tgeMain.pairs.usdc_ntrn.liquidity,
          {
            balance: {
              address: cmInstantiator.wallet.address.toString(),
            },
          },
        ),
      ]);
      expect(parseInt(lpBalanceAtom.balance)).toBeCloseTo(claimAtomLP, -1);
      expect(parseInt(lpBalanceUsdc.balance)).toBeCloseTo(claimUsdcLP, -1);
    });
  });

  describe('lockdrop', () => {
    describe('lockdrop rewards', () => {
      beforeAll(async () => {
        await waitTill(
          tgeMain.times.lockdropInit +
          tgeMain.times.lockdropDepositDuration +
          tgeMain.times.lockdropWithdrawalDuration +
          1,
        );
      });

      it('for cmInstantiator without withdraw', async () => {
        const rewardsStateBeforeClaim = await tgeMain.generatorRewardsState(
          cmInstantiator.wallet.address.toString(),
        );

        const res = await cmInstantiator.executeContract(
          tgeMain.contracts.lockdrop,
          JSON.stringify({
            claim_rewards_and_optionally_unlock: {
              pool_type: 'USDC',
              duration: 2,
              withdraw_lp_stake: false,
            },
          }),
        );
        expect(res.code).toEqual(0);

        const rewardsStateAfterClaim = await tgeMain.generatorRewardsState(
          cmInstantiator.wallet.address.toString(),
        );
    
        // expect(
        //   rewardsStateAfterClaim.balanceNtrn +
        //   FEE_SIZE -
        //   rewardsStateBeforeClaim.balanceNtrn,
        // ).toEqual(40); // lockdrop rewards share for the user

        const rewardStateBeforeClaimUsdc: LockdropLockUpInfoResponse =
          rewardsStateBeforeClaim.userInfo.lockup_infos.find(
            (i) => i.pool_type == 'USDC' && i.duration == 2,
          ) as LockdropLockUpInfoResponse;
        expect(rewardStateBeforeClaimUsdc).not.toBeNull();
        const expectedGeneratorRewards =
          +rewardStateBeforeClaimUsdc.claimable_generator_astro_debt;
        expect(expectedGeneratorRewards).toBeGreaterThan(0);

        // we expect the astro balance to increase by somewhere between user rewards amount and user
        // rewards amount plus rewards per block amount because rewards drip each block.
        const astroBalanceDiff =
          rewardsStateAfterClaim.balanceAstro -
          rewardsStateBeforeClaim.balanceAstro;
        console.log("astro balance diff ", astroBalanceDiff);
        expect(astroBalanceDiff).toBeGreaterThanOrEqual(
          expectedGeneratorRewards,
        );
        expect(astroBalanceDiff).toBeLessThan(
          expectedGeneratorRewards + tgeMain.generatorRewardsPerBlock,
        );

        // withdraw_lp_stake is false => no lp tokens returned
        expect(rewardsStateBeforeClaim.atomNtrnLpTokenBalance).toEqual(
          rewardsStateAfterClaim.atomNtrnLpTokenBalance,
        );
        expect(rewardsStateBeforeClaim.usdcNtrnLpTokenBalance).toEqual(
          rewardsStateAfterClaim.usdcNtrnLpTokenBalance,
        );
      });
      it('wait for blocks', async () => {
        await neutronChain.blockWaiter.waitBlocks(3);
      });

      describe('check generator state', () => {
        it('check generator stake presence', async () => {
          const stakedAtomLp = await neutronChain.queryContract<string>(
            tgeMain.contracts.astroGenerator,
            {
              deposit: {
                lp_token: tgeMain.pairs.atom_ntrn.liquidity,
                user: tgeMain.contracts.lockdrop,
              },
            },
          );
          // @audit-issue this was supposed to pass, failing for some reason
          // Aleksandar: fixed
          expect(+stakedAtomLp).toBeGreaterThan(0);

          const stakedUsdcLp = await neutronChain.queryContract<string>(
            tgeMain.contracts.astroGenerator,
            {
              deposit: {
                lp_token: tgeMain.pairs.usdc_ntrn.liquidity,
                user: tgeMain.contracts.lockdrop,
              },
            },
          );
          expect(+stakedUsdcLp).toBeGreaterThan(0);
        });

        it('check generator rewards presence', async () => {
          const pendingAtomRewards = await neutronChain.queryContract<any>(
            tgeMain.contracts.astroGenerator,
            {
              pending_token: {
                lp_token: tgeMain.pairs.atom_ntrn.liquidity,
                user: tgeMain.contracts.lockdrop,
              },
            },
          );
          console.log("pending atom rewards ", pendingAtomRewards);
          // @audit-issue this was supposed to pass, failing for some reason
          // Aleksandar: fixed
          expect(+pendingAtomRewards.pending).toBeGreaterThan(0);

          const pendingUsdcRewards = await neutronChain.queryContract<any>(
            tgeMain.contracts.astroGenerator,
            {
              pending_token: {
                lp_token: tgeMain.pairs.usdc_ntrn.liquidity,
                user: tgeMain.contracts.lockdrop,
              },
            },
          );
          // @audit-issue this was supposed to pass, failing for some reason
          console.log('pending usdc rewards: ', pendingUsdcRewards.pending, '; ', pendingUsdcRewards.pending_on_proxy)
          expect(+pendingUsdcRewards.pending).toBeGreaterThan(0);
        });
        describe('claiming rewards', () => {
          // test.each(initData.keys())(
          // explanation for problems: https://stackoverflow.com/questions/57516047/why-dont-for-of-loops-over-iterables-work-when-run-within-jest
          console.log("initData.keys() before the test", initData.keys());
          console.log("initData object: ",initData)
          console.log("some users claim without withdraw")
          // @audit fix
          for (const v of filterMapByPropertyFunctional(initData,"claims_rewards", true).keys()) {
              console.log("in for loop for ", v);
              it('for ' + v + ' without withdraw', async () => {
                const rewardsStateBeforeClaim = await tgeMain.generatorRewardsState(
                  tgeWallets[v].wallet.address.toString(),
                );
                console.log("inside test for ", v);

                const res = await tgeWallets[v].executeContract(
                  tgeMain.contracts.lockdrop,
                  JSON.stringify({
                    claim_rewards_and_optionally_unlock: {
                      pool_type: 'USDC',
                      duration: 1,
                      withdraw_lp_stake: false,
                    },
                  }),
                );
                expect(res.code).toEqual(0);

                const rewardsStateAfterClaim = await tgeMain.generatorRewardsState(
                  tgeWallets[v].wallet.address.toString(),
                );

                // a more precise check is done later in 'should get extra untrn from unclaimed airdrop'
                // testcase, here we simply check that the balance has increased
                expect(
                  rewardsStateAfterClaim.balanceNtrn + FEE_SIZE,
                ).toBeGreaterThan(rewardsStateBeforeClaim.balanceNtrn);

                const rewardsBeforeClaimUsdc =
                  rewardsStateBeforeClaim.userInfo.lockup_infos.find(
                    (i) => i.pool_type == 'USDC' && i.duration == 1,
                  ) as LockdropLockUpInfoResponse;
                expect(rewardsBeforeClaimUsdc).not.toBeNull();
                const expectedGeneratorRewards =
                  +rewardsBeforeClaimUsdc.claimable_generator_astro_debt;
                expect(expectedGeneratorRewards).toBeGreaterThan(0);

                // we expect the astro balance to increase by somewhere between user rewards amount and user
                // rewards amount plus rewards per block amount because rewards amount increases each block.
                const astroBalanceDiff =
                  rewardsStateAfterClaim.balanceAstro -
                  rewardsStateBeforeClaim.balanceAstro;
                expect(astroBalanceDiff).toBeGreaterThanOrEqual(
                  expectedGeneratorRewards,
                );
                expect(astroBalanceDiff).toBeLessThan(
                  expectedGeneratorRewards + tgeMain.generatorRewardsPerBlock,
                );

                console.log("for user ", v);
                console.log("NTRN rewards state before claim ", rewardsStateBeforeClaim.balanceNtrn);
                console.log("NTRN rewards state after claim ", rewardsStateAfterClaim.balanceNtrn);

                console.log("ASTRO rewards state before claim ", rewardsStateBeforeClaim.balanceAstro);
                console.log("ASTRO rewards state after claim ", rewardsStateAfterClaim.balanceAstro);

                // withdraw_lp_stake is false => no lp tokens returned
                expect(rewardsStateBeforeClaim.atomNtrnLpTokenBalance).toEqual(
                  rewardsStateAfterClaim.atomNtrnLpTokenBalance,
                );
                expect(rewardsStateBeforeClaim.usdcNtrnLpTokenBalance).toEqual(
                  rewardsStateAfterClaim.usdcNtrnLpTokenBalance,
                );
              });
          }

          console.log("some users withdraw")
          for (const v of filterMapByPropertyFunctional(initData, "withdraws_rewards", true).keys()) {
              it('for ' + v + ' with withdraw USDC', async () => {
                const rewardsStateBeforeClaim = await tgeMain.generatorRewardsState(
                  tgeWallets[v].wallet.address.toString(),
                );

                let res = await tgeWallets[v].executeContract(
                  tgeMain.contracts.lockdrop,
                  JSON.stringify({
                    claim_rewards_and_optionally_unlock: {
                      pool_type: 'USDC',
                      duration: 1,
                      withdraw_lp_stake: true,
                    },
                  }),
                );
                expect(res.code).toEqual(0);
                res = await tgeWallets[v].executeContract(
                  tgeMain.contracts.lockdrop,
                  JSON.stringify({
                    claim_rewards_and_optionally_unlock: {
                      pool_type: 'ATOM',
                      duration: 1,
                      withdraw_lp_stake: true,
                    },
                  }),
                );
                expect(res.code).toEqual(0);

                const rewardsStateAfterClaim = await tgeMain.generatorRewardsState(
                  tgeWallets[v].wallet.address.toString(),
                );

                expect(rewardsStateAfterClaim.balanceNtrn + 2 * FEE_SIZE).toEqual(
                  rewardsStateBeforeClaim.balanceNtrn,
                ); // ntrn rewards were sent at the previous claim, so no ntrn income is expected

                // withdraw_lp_stake is true => expect lp tokens to be unlocked and returned to the user
                const rewardsUscBeforeClaim =
                  rewardsStateBeforeClaim.userInfo.lockup_infos.find(
                    (i) => i.pool_type == 'USDC' && i.duration == 1,
                  ) as LockdropLockUpInfoResponse;
                expect(rewardsUscBeforeClaim).not.toBeNull();
                const usdcNtrnLockedLp = +rewardsUscBeforeClaim.lp_units_locked;
                expect(usdcNtrnLockedLp).toBeGreaterThan(0);
                expect(rewardsStateAfterClaim.usdcNtrnLpTokenBalance).toEqual(
                  rewardsStateBeforeClaim.usdcNtrnLpTokenBalance + usdcNtrnLockedLp,
                );
                const rewardsAtomBeforeClaim =
                  rewardsStateBeforeClaim.userInfo.lockup_infos.find(
                    (i) => i.pool_type == 'ATOM' && i.duration == 1,
                  ) as LockdropLockUpInfoResponse;
                expect(rewardsAtomBeforeClaim).not.toBeNull();
                const atomNtrnLockedLp = +rewardsAtomBeforeClaim.lp_units_locked;
                expect(atomNtrnLockedLp).toBeGreaterThan(0);
                expect(rewardsStateAfterClaim.atomNtrnLpTokenBalance).toEqual(
                  rewardsStateBeforeClaim.atomNtrnLpTokenBalance + atomNtrnLockedLp,
                );

                // claimed from both pools above, so expected rewards amount is a sum of both
                const rewardsBeforeClaimUsdc =
                  rewardsStateBeforeClaim.userInfo.lockup_infos.find(
                    (i) => i.pool_type == 'USDC' && i.duration == 1,
                  ) as LockdropLockUpInfoResponse;
                expect(rewardsBeforeClaimUsdc).not.toBeNull();
                const rewardsBeforeClaimAtom =
                  rewardsStateBeforeClaim.userInfo.lockup_infos.find(
                    (i) => i.pool_type == 'ATOM' && i.duration == 1,
                  ) as LockdropLockUpInfoResponse;
                expect(rewardsBeforeClaimAtom).not.toBeNull();

                const expectedGeneratorRewards =
                  +rewardsBeforeClaimUsdc.claimable_generator_astro_debt +
                  +rewardsBeforeClaimAtom.claimable_generator_astro_debt;
                expect(expectedGeneratorRewards).toBeGreaterThan(0);

                // we expect the astro balance to increase by somewhere between user rewards amount and user
                // rewards amount plus 2*rewards per block amount because rewards amount increases each block.
                const astroBalanceDiff =
                  rewardsStateAfterClaim.balanceAstro -
                  rewardsStateBeforeClaim.balanceAstro;
                expect(astroBalanceDiff).toBeGreaterThanOrEqual(
                  expectedGeneratorRewards,
                );
                expect(astroBalanceDiff).toBeLessThan(
                  expectedGeneratorRewards + 2 * tgeMain.generatorRewardsPerBlock,
                );
              });
          }
        });
      });
    });
  });
  let liqMigContracts: LiquidityMigrationContracts;
  let claimAtomLP;
  let claimUsdcLP;
  let claimAtomLPMap : Map<string, any> = new Map<string, any>();
  let claimUsdcLPMap : Map<string, any> = new Map<string, any>();
  const votingPowerBeforeOverall: Record<string, number> = {};
  const votingPowerBeforeLockdrop: Record<string, number> = {};
  const votingPowerBeforeLp: Record<string, number> = {};
  let newVestingLpCodeID: number;
  let vestingLpVaultForClAddr: string;
  let lockdropVaultForClAddr: string;
  describe('migrate TGE liquidity to PCL', () => {
    // @audit-info removed voting power saving.
    describe('replace XYK with PCL pools', () => {
      test('deregister XYK pairs', async () => {
        await deregisterPair(cmInstantiator, tgeMain.contracts.astroFactory, [
          nativeTokenInfo(NEUTRON_DENOM),
          nativeTokenInfo(IBC_ATOM_DENOM),
        ]);
        await deregisterPair(cmInstantiator, tgeMain.contracts.astroFactory, [
          nativeTokenInfo(NEUTRON_DENOM),
          nativeTokenInfo(IBC_USDC_DENOM),
        ]);
      });

      test('create and fill NTRN/ibcATOM PCL pair', async () => {
        const poolStatus = await neutronChain.queryContract<PoolStatus>(
          tgeMain.pairs.atom_ntrn.contract,
          { pool: {} },
        );
        const ntrnInPool = poolStatus.assets.filter(
          (a) => (a.info as NativeToken).native_token.denom == NEUTRON_DENOM,
        )[0].amount;
        const ibcAtomInPool = poolStatus.assets.filter(
          (a) => (a.info as NativeToken).native_token.denom == IBC_ATOM_DENOM,
        )[0].amount;
        const priceScale = +ibcAtomInPool / +ntrnInPool;

        const ntrnAtomClPairInfo = await createPclPair(
          neutronChain,
          cmInstantiator,
          tgeMain.contracts.astroFactory,
          [nativeTokenInfo(IBC_ATOM_DENOM), nativeTokenInfo(NEUTRON_DENOM)],
          priceScale,
        );
        ntrnAtomPclPool = ntrnAtomClPairInfo.contract_addr;
        ntrnAtomPclToken = ntrnAtomClPairInfo.liquidity_token;

        const atomToProvide = Math.floor(NTRN_AMOUNT * priceScale);
        const ntrnToProvide = NTRN_AMOUNT;
        await cmInstantiator.executeContract(
          ntrnAtomPclPool,
          JSON.stringify({
            provide_liquidity: {
              assets: [
                nativeToken(IBC_ATOM_DENOM, atomToProvide.toString()),
                nativeToken(NEUTRON_DENOM, ntrnToProvide.toString()),
              ],
              slippage_tolerance: '0.01',
            },
          }),
          [
            {
              denom: IBC_ATOM_DENOM,
              amount: atomToProvide.toString(),
            },
            {
              denom: NEUTRON_DENOM,
              amount: ntrnToProvide.toString(),
            },
          ],
        );
      });

      test('create and fill NTRN/ibcUSDC PCL pair', async () => {
        const poolStatus = await neutronChain.queryContract<PoolStatus>(
          tgeMain.pairs.usdc_ntrn.contract,
          { pool: {} },
        );
        const ntrnInPool = poolStatus.assets.filter(
          (a) => (a.info as NativeToken).native_token.denom == NEUTRON_DENOM,
        )[0].amount;
        const ibcUsdcInPool = poolStatus.assets.filter(
          (a) => (a.info as NativeToken).native_token.denom == IBC_USDC_DENOM,
        )[0].amount;
        const priceScale = +ibcUsdcInPool / +ntrnInPool;

        const ntrnUsdcClPairInfo = await createPclPair(
          neutronChain,
          cmInstantiator,
          tgeMain.contracts.astroFactory,
          [nativeTokenInfo(IBC_USDC_DENOM), nativeTokenInfo(NEUTRON_DENOM)],
          priceScale,
        );
        ntrnUsdcPclPool = ntrnUsdcClPairInfo.contract_addr;
        ntrnUsdcPclToken = ntrnUsdcClPairInfo.liquidity_token;

        const usdcToProvide = Math.floor(NTRN_AMOUNT * priceScale);
        const ntrnToProvide = NTRN_AMOUNT;
        await cmInstantiator.executeContract(
          ntrnUsdcPclPool,
          JSON.stringify({
            provide_liquidity: {
              assets: [
                nativeToken(IBC_USDC_DENOM, usdcToProvide.toString()),
                nativeToken(NEUTRON_DENOM, ntrnToProvide.toString()),
              ],
              slippage_tolerance: '0.01',
            },
          }),
          [
            {
              denom: IBC_USDC_DENOM,
              amount: usdcToProvide.toString(),
            },
            {
              denom: NEUTRON_DENOM,
              amount: ntrnToProvide.toString(),
            },
          ],
        );
      });

      describe('reschedule staking rewards', () => {
        test('deactivate generator rewards', async () => {
          await cmInstantiator.executeContract(
            tgeMain.contracts.astroGenerator,
            JSON.stringify({
              set_tokens_per_block: {
                amount: '0',
              },
            }),
          );

          await cmInstantiator.executeContract(
            tgeMain.contracts.astroGenerator,
            JSON.stringify({
              setup_pools: {
                pools: [
                  [ntrnAtomPclToken, '0'],
                  [ntrnUsdcPclToken, '0'],
                ],
              },
            }),
          );
        });

        test('activate incentives contract rewards', async () => {
          await cmInstantiator.executeContract(
            tgeMain.contracts.astroFactory,
            JSON.stringify({
              update_config: {
                generator_address: tgeMain.contracts.astroIncentives,
              },
            }),
          );
          await cmInstantiator.executeContract(
            tgeMain.contracts.astroVesting,
            JSON.stringify({
              register_vesting_accounts: {
                vesting_accounts: [
                  vestingAccount(tgeMain.contracts.astroIncentives, [
                    vestingSchedule(
                      vestingSchedulePoint(
                        0,
                        tgeMain.generatorRewardsTotal.toString(),
                      ),
                    ),
                  ]),
                ],
              },
            }),
            [
              {
                denom: tgeMain.astroDenom,
                amount: tgeMain.generatorRewardsTotal.toString(),
              },
            ],
          );
          await cmInstantiator.executeContract(
            tgeMain.contracts.astroIncentives,
            JSON.stringify({
              set_tokens_per_second: {
                amount: tgeMain.generatorRewardsPerBlock.toString(),
              },
            }),
          );
        });

        describe('add external rewards for incentives contract', () => {
          let extRewardDenom: string;
          test('create external rewards token', async () => {
            const resp = await msgCreateDenom(
              cmInstantiator,
              cmInstantiator.wallet.address.toString(),
              EXT_REWARD_SUBDENOM,
            );
            extRewardDenom = getEventAttribute(
              (resp as any).events,
              'create_denom',
              'new_token_denom',
            );
            await msgMintDenom(
              cmInstantiator,
              cmInstantiator.wallet.address.toString(),
              {
                denom: extRewardDenom,
                amount: EXT_REWARD_AMOUNT,
              },
            );
          });

          // incentivize only NTRN/ATOM pair
          test('add external rewards for incentives contract', async () => {
            await cmInstantiator.executeContract(
              tgeMain.contracts.astroIncentives,
              JSON.stringify({
                incentivize: {
                  lp_token: ntrnAtomPclToken,
                  schedule: {
                    reward: nativeToken(extRewardDenom, EXT_REWARD_AMOUNT),
                    duration_periods: 1, // for one epoch
                  },
                },
              }),
              [{ denom: extRewardDenom, amount: EXT_REWARD_AMOUNT }],
            );
          });
        });
      });
    });
    test('setup PCL pools', async () => {
      await cmInstantiator.executeContract(
        tgeMain.contracts.astroIncentives,
        JSON.stringify({
          setup_pools: {
            pools: [
              [ntrnAtomPclToken, '1'],
              [ntrnUsdcPclToken, '1'],
            ],
          },
        }),
      );
    });

    describe('instantiate PCL contracts', () => {
      let xykLockdropConfig: XykLockdropConfig;
      let xykLockdropUsdcPool: LockdropXykPool;
      let xykLockdropAtomPool: LockdropXykPool;
      it('retrieve XYK lockdrop contract state', async () => {
        xykLockdropConfig = await queryXykLockdropConfig(
          neutronChain,
          tgeMain.contracts.lockdrop,
        );
        xykLockdropUsdcPool = await queryXykLockdropPool(
          neutronChain,
          tgeMain.contracts.lockdrop,
          'USDC',
        );
        xykLockdropAtomPool = await queryXykLockdropPool(
          neutronChain,
          tgeMain.contracts.lockdrop,
          'ATOM',
        );
      });
      it('instantiate PCL lockdrop contract', async () => {
        const codeId = await cmInstantiator.storeWasm(
          NeutronContract.TGE_LOCKDROP_PCL,
        );
        const res = await cmInstantiator.instantiateContract(
          codeId,
          JSON.stringify({
            owner: xykLockdropConfig.owner,
            xyk_lockdrop_contract: tgeMain.contracts.lockdrop,
            credits_contract: xykLockdropConfig.credits_contract,
            auction_contract: xykLockdropConfig.auction_contract,
            incentives: tgeMain.contracts.astroIncentives,
            lockup_rewards_info: xykLockdropConfig.lockup_rewards_info,
            usdc_token: ntrnUsdcPclToken,
            atom_token: ntrnAtomPclToken,
            lockdrop_incentives: xykLockdropConfig.lockdrop_incentives,
            usdc_incentives_share: xykLockdropUsdcPool.incentives_share,
            usdc_weighted_amount: xykLockdropUsdcPool.weighted_amount,
            atom_incentives_share: xykLockdropAtomPool.incentives_share,
            atom_weighted_amount: xykLockdropAtomPool.weighted_amount,
          }),
          'lockdrop_pcl',
        );
        lockdropPclAddr = res[0]._contract_address;
      });

      it('instantiate PCL vesting lp contracts', async () => {
        const codeId = await cmInstantiator.storeWasm(
          NeutronContract.VESTING_LP_PCL,
        );
        const res = await cmInstantiator.instantiateContract(
          codeId,
          JSON.stringify({
            owner: cmInstantiator.wallet.address.toString(),
            token_info_manager: cmInstantiator.wallet.address.toString(),
            vesting_managers: [],
            vesting_token: {
              token: {
                contract_addr: ntrnAtomPclToken,
              },
            },
            xyk_vesting_lp_contract: tgeMain.contracts.vestingAtomLp,
          }),
          'atom_vesting_lp_pcl',
        );
        const res1 = await cmInstantiator.instantiateContract(
          codeId,
          JSON.stringify({
            owner: cmInstantiator.wallet.address.toString(),
            token_info_manager: cmInstantiator.wallet.address.toString(),
            vesting_managers: [],
            vesting_token: {
              token: {
                contract_addr: ntrnUsdcPclToken,
              },
            },
            xyk_vesting_lp_contract: tgeMain.contracts.vestingUsdcLp,
          }),
          'usdc_vesting_lp_pcl',
        );
        atomVestingLpAddr = res[0]._contract_address;
        usdcVestingLpAddr = res1[0]._contract_address;
      });
    });

    describe('migrate TGE contracts to liquidity migration versions', () => {
      let newLockdropCodeID: number;
      it('store new lockdrop contract version', async () => {
        newLockdropCodeID = await cmInstantiator.storeWasm(
          NeutronContract.TGE_LOCKDROP,
        );
      });
      it('migrate lockdrop', async () => {
        await cmInstantiator.migrateContract(
          tgeMain.contracts.lockdrop,
          newLockdropCodeID,
          JSON.stringify({
            pcl_lockdrop_contract: lockdropPclAddr,
          }),
        );
      });

      let newReserveCodeID: number;
      it('store new reserve contract version', async () => {
        newReserveCodeID = await cmInstantiator.storeWasm(
          NeutronContract.RESERVE,
        );
      });
      it('migrate reserve', async () => {
        await cmInstantiator.migrateContract(
          reserveContract,
          newReserveCodeID,
          JSON.stringify({
            max_slippage: '0.05', // 5%
            ntrn_denom: NEUTRON_DENOM,
            atom_denom: IBC_ATOM_DENOM,
            ntrn_atom_xyk_pair: tgeMain.pairs.atom_ntrn.contract,
            ntrn_atom_cl_pair: ntrnAtomPclPool,
            usdc_denom: IBC_USDC_DENOM,
            ntrn_usdc_xyk_pair: tgeMain.pairs.usdc_ntrn.contract,
            ntrn_usdc_cl_pair: ntrnUsdcPclPool,
          }),
        );
      });
    });

    // @audit-info commented out: deploy new LP and Lockdrop vaults; add them to dao, if needed: uncomment and adapt
    /**
     *     describe('deploy new LP and Lockdrop vaults; add them to dao', () => {
      it('deploy vesting lp voting vault for CL', async () => {
        const codeId = await cmInstantiator.storeWasm(
          NeutronContract.VESTING_LP_VAULT_CL,
        );
        expect(codeId).toBeGreaterThan(0);

        const res = await cmInstantiator.instantiateContract(
          codeId,
          JSON.stringify({
            name: 'Vesting LP CL voting vault',
            description: 'Vesting LP voting vault for CL pairs',
            atom_vesting_lp_contract: atomVestingLpAddr,
            atom_cl_pool_contract: ntrnAtomPclPool,
            usdc_vesting_lp_contract: usdcVestingLpAddr,
            usdc_cl_pool_contract: ntrnUsdcPclPool,
            owner: daoMain.contracts.core.address,
          }),
          'neutron.voting.vaults.vesting_cl',
        );
        vestingLpVaultForClAddr = res[0]._contract_address;
      });

      it('deploy lockdrop voting vault for CL', async () => {
        const codeId = await cmInstantiator.storeWasm(
          NeutronContract.LOCKDROP_VAULT_CL,
        );
        expect(codeId).toBeGreaterThan(0);

        const res = await cmInstantiator.instantiateContract(
          codeId,
          JSON.stringify({
            name: 'Lockdrop CL voting vault',
            description: 'Lockdrop vault for CL pairs',
            lockdrop_contract: lockdropPclAddr,
            usdc_cl_pool_contract: ntrnUsdcPclPool,
            atom_cl_pool_contract: ntrnAtomPclPool,
            owner: daoMain.contracts.core.address,
          }),
          'neutron.voting.vaults.lockdrop_cl',
        );
        lockdropVaultForClAddr = res[0]._contract_address;
      });

      it('add CL vaults to the registry', async () => {
        const propID = await daoMember1.submitSingleChoiceProposal(
          'Proposal #4',
          'add CL_VESTING_LP_VAULT & CL_LOCKDROP_VAUULT',
          [
            {
              wasm: {
                execute: {
                  contract_addr: daoMain.contracts.voting.address,
                  msg: Buffer.from(
                    `{"add_voting_vault": {"new_voting_vault_contract":"${vestingLpVaultForClAddr}"}}`,
                  ).toString('base64'),
                  funds: [],
                },
              },
            },
            {
              wasm: {
                execute: {
                  contract_addr: daoMain.contracts.voting.address,
                  msg: Buffer.from(
                    `{"add_voting_vault": {"new_voting_vault_contract":"${lockdropVaultForClAddr}"}}`,
                  ).toString('base64'),
                  funds: [],
                },
              },
            },
          ],
          '1000',
        );
        await daoMember1.voteYes(propID);
        const prop = await daoMain.queryProposal(propID);
        // lockdrop and vesting participants should vote
        expect(prop.proposal).toMatchObject({ status: 'open' });
        let vp: number;
        for (const v of [
          'airdropAuctionVesting',
          'airdropAuctionLockdrop',
          'airdropAuctionLockdropVesting',
          'auctionLockdrop',
          'auctionLockdropVesting',
          'auctionVesting',
          'airdropAuctionLockdropVestingMigration',
        ]) {
          const member = new DaoMember(tgeWallets[v], daoMain);
          vp = (await member.queryVotingPower()).power | 0;
          if (
            (await daoMain.queryProposal(propID)).proposal.status == 'open' &&
            vp > 0
          ) {
            await member.voteYes(propID);
          }
        }
        await daoMember1.executeProposal(propID);
        const status = (await daoMain.queryProposal(propID)).proposal.status;
        console.log('status: ' + status);
      });
    });
    */

    describe('execute migration handlers: reserve', () => {
      let sharesBefore: tgePoolShares; // reserve shares in XYK pools
      it('check reserve shares before migration', async () => {
        sharesBefore = await queryTgePoolShares(
          neutronChain,
          reserveContract,
          tgeMain.pairs.atom_ntrn.contract,
          tgeMain.pairs.usdc_ntrn.contract,
        );
        expect(sharesBefore.atomNtrn.atomShares).toBeGreaterThan(0);
        expect(sharesBefore.atomNtrn.ntrnShares).toBeGreaterThan(0);
        expect(sharesBefore.usdcNtrn.usdcShares).toBeGreaterThan(0);
        expect(sharesBefore.usdcNtrn.ntrnShares).toBeGreaterThan(0);
      });
      it('check Neutron DAO shares before migration', async () => {
        const shares = await queryTgePoolShares(
          neutronChain,
          NEUTRON_DAO_ADDR,
          ntrnAtomPclPool,
          ntrnUsdcPclPool,
        );
        expect(shares.atomNtrn.atomShares).toEqual(0);
        expect(shares.atomNtrn.ntrnShares).toEqual(0);
        expect(shares.usdcNtrn.usdcShares).toEqual(0);
        expect(shares.usdcNtrn.ntrnShares).toEqual(0);
      });

      it('migrate reserve contract liquidity', async () => {
        await cmInstantiator.executeContract(
          reserveContract,
          JSON.stringify({
            migrate_from_xyk_to_cl: {
              slippage_tolerance: '0.05', // 5%
            },
          }),
        );
      });

      it('check reserve shares after migration', async () => {
        const shares = await queryTgePoolShares(
          neutronChain,
          reserveContract,
          tgeMain.pairs.atom_ntrn.contract,
          tgeMain.pairs.usdc_ntrn.contract,
        );
        expect(shares.atomNtrn.atomShares).toEqual(0);
        expect(shares.atomNtrn.ntrnShares).toEqual(0);
        expect(shares.usdcNtrn.usdcShares).toEqual(0);
        expect(shares.usdcNtrn.ntrnShares).toEqual(0);
      });
      it('check Neutron DAO shares after migration', async () => {
        const sharesAfter = await queryTgePoolShares(
          // Neutron DAO shares in PCL pools
          neutronChain,
          NEUTRON_DAO_ADDR,
          ntrnAtomPclPool,
          ntrnUsdcPclPool,
        );

        // according to 5% slippage tolerance
        isWithinRangeRel(
          sharesAfter.atomNtrn.atomShares,
          sharesBefore.atomNtrn.atomShares,
          0.05,
        );
        isWithinRangeRel(
          sharesAfter.atomNtrn.ntrnShares,
          sharesBefore.atomNtrn.ntrnShares,
          0.05,
        );
        isWithinRangeRel(
          sharesAfter.usdcNtrn.usdcShares,
          sharesBefore.usdcNtrn.usdcShares,
          0.05,
        );
        isWithinRangeRel(
          sharesAfter.usdcNtrn.ntrnShares,
          sharesBefore.usdcNtrn.ntrnShares,
          0.05,
        );
      });
    });


    describe('execute migration handlers: lockdrop', () => {
      it('fill liquidity migration contracts', () => {
        liqMigContracts = {
          xykLockdrop: tgeMain.contracts.lockdrop,
          pclLockdrop: lockdropPclAddr,
          atomXykPair: tgeMain.pairs.atom_ntrn.contract,
          atomXykLp: tgeMain.pairs.atom_ntrn.liquidity,
          usdcXykPair: tgeMain.pairs.usdc_ntrn.contract,
          usdcXykLp: tgeMain.pairs.usdc_ntrn.liquidity,
          atomPclPair: ntrnAtomPclPool,
          atomPclLp: ntrnAtomPclToken,
          usdcPclPair: ntrnUsdcPclPool,
          usdcPclLp: ntrnUsdcPclToken,
          generator: tgeMain.contracts.astroGenerator,
          incentives: tgeMain.contracts.astroIncentives,
        };
      });
      // These participants have two lockup positions: ATOM for 1 and USDC for 1. The user never claimed
      // any rewards nor withdrawn either of the lockups. Expected behaviour: XYK lockups are marked
      // as transferred, all pending rewards (generator, lockdrop, airdrop) are paid to the user
      // during migration, liquidity is migrated from XYK to PCL pools and staked to the generator,
      // PCL lockup entries are created in the PCL lockdrop contract.
      describe('migrate participants who didnt claim nor withdraw rewards', () => {
        filterMapByPropertiesFunctional(initData, "claims_rewards", "withdraws_rewards", false, false).forEach((value,key) => {
          if(!value.is_vesting){
            describe(`migrate ${key} participant`, () => {
              let stateBefore: LiquidityMigrationState;
              it('gather state before migration for: ' + key, async () => {
                stateBefore = await gatherLiquidityMigrationState(
                  neutronChain,
                  tgeWallets[key].wallet.address.toString(),
                  liqMigContracts,
                );
                console.log(key,` migration state before:\n${JSON.stringify(stateBefore)}`);
              });
              
              // @audit might be a good idea to get this from quint
              const ntrnToPayGas = 750000;
              const gas_limit = Long.fromNumber(15000000);
    
              it('migrate the user: ' + key, async () => {
                const res = await cmInstantiator.executeContract(
                  tgeMain.contracts.lockdrop,
                  JSON.stringify({
                    migrate_liquidity_to_pcl_pools: {
                      user_address_raw:
                        tgeWallets[key].wallet.address.toString(),
                    },
                  }),
                  undefined,
                  {
                    gas_limit: gas_limit,
                    amount: [{ denom: NEUTRON_DENOM, amount: ntrnToPayGas.toString() }],
                  },
                );
                expect(res.code).toEqual(0);
              });
    
              let stateAfter: LiquidityMigrationState;
              it('gather state after migration', async () => {
                stateAfter = await gatherLiquidityMigrationState(
                  neutronChain,
                  tgeWallets[key].wallet.address.toString(),
                  liqMigContracts,
                );
                console.log(key, ` migration state after:\n${JSON.stringify(stateAfter)}`);
              });
              
              describe('check user liquidity migration', () => {
                const atomLockupKey = 'ATOM1';
                const usdcLockupKey = 'USDC1';
                describe('XYK user lockups', () => {
                  describe('generator rewards', () => {
                    let userAstroRewards: number;
                    test('claimable generator ntrn debt', async () => {
                      userAstroRewards =
                        +stateBefore.xykUserLockups.claimable_generator_ntrn_debt;
                      expect(userAstroRewards).toBeGreaterThan(0);
      
                      // total rewards amount equals to sum of all lockup rewards
                      expect(userAstroRewards).toEqual(
                        +stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                          .claimable_generator_astro_debt +
                          +stateBefore.xykUserLockups.mapped_lockup_infos[
                            usdcLockupKey
                          ].claimable_generator_astro_debt,
                      );
      
                      // rewards are claimed during migration => no rewards after it
                      expect(
                        +stateAfter.xykUserLockups.claimable_generator_ntrn_debt,
                      ).toEqual(0);
                    });
      
                    test('generator rewards are transferred to the user', async () => {
                      expect(stateAfter.balances.user.astro).toBeGreaterThan(
                        stateBefore.balances.user.astro,
                      );
                      // claimed rewards are transferred directly to the user
                      // assume fluctuation because rewards amount increases every block
                      isWithinRangeRel(
                        stateAfter.balances.user.astro -
                          stateBefore.balances.user.astro,
                        userAstroRewards,
                        0.5,
                      );
                    });
                  });
      
                  describe('astroport lp', () => {
                    test('lp tokens marked as transferred', async () => {
                      // lp tokens weren't transferred before migration
                      expect(
                        stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                          .astroport_lp_transferred,
                      ).toBe(null);
                      expect(
                        stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .astroport_lp_transferred,
                      ).toBe(null);
      
                      // sanity check that there were some lp tokens in lockups
                      expect(
                        +stateAfter.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                          .astroport_lp_transferred!,
                      ).toBeGreaterThan(0);
                      expect(
                        +stateAfter.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .astroport_lp_transferred!,
                      ).toBeGreaterThan(0);
      
                      // all lp tokens are transferred dirung migration to PCL contract
                      expect(
                        stateAfter.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                          .astroport_lp_transferred,
                      ).toEqual(
                        stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                          .lp_units_locked,
                      );
                      expect(
                        stateAfter.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .astroport_lp_transferred,
                      ).toEqual(
                        stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .lp_units_locked,
                      );
                    });
      
                    test('staked lp amount decreases', async () => {
                      // all lp from lockups is unstaked from generator
                      expect(stateAfter.xykAtomStakedInGen).toEqual(
                        stateBefore.xykAtomStakedInGen -
                          +stateBefore.xykUserLockups.mapped_lockup_infos[
                            atomLockupKey
                          ].lp_units_locked,
                      );
                      expect(stateAfter.xykUsdcStakedInGen).toEqual(
                        stateBefore.xykUsdcStakedInGen -
                          +stateBefore.xykUserLockups.mapped_lockup_infos[
                            usdcLockupKey
                          ].lp_units_locked,
                      );
                    });
                  });
      
                  test('XYK lockup lp token addresses', async () => {
                    // lp token addresses shouldn't change
                    expect(
                      stateAfter.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                        .astroport_lp_token,
                    ).toEqual(
                      stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                        .astroport_lp_token,
                    );
                    expect(
                      stateAfter.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                        .astroport_lp_token,
                    ).toEqual(
                      stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                        .astroport_lp_token,
                    );
                  });
                });
      
                describe('lockdrop participation rewards', () => {
                  test('ntrn reward marked as transferred', async () => {
                    // no claims whatsoever happened before migration => ntrn aren't transferred
                    expect(stateBefore.xykUserLockups.ntrn_transferred).toBe(false);
      
                    // ntrn rewards transfer is processed during migration and is reflected in both contracts
                    expect(stateAfter.xykUserLockups.ntrn_transferred).toBe(true);
                    expect(stateAfter.pclUserLockups.ntrn_transferred).toBe(true);
                  });
      
                  describe('ntrn transfer from lockdrop to user', () => {
                    let expectedRewards: number;
                    test('ntrn rewards received by the user', async () => {
                      // expectedRewards = one time NTRN rewards +
                      // airdrop rewards (same as NTRN rewards since airdrop multiplier = 1) +
                      // a bit of unvested tokens (say 10 more percent — *1.1)
                      expectedRewards =
                        +stateBefore.xykUserLockups.total_ntrn_rewards * 2 * 1.1;
                      const balanceChange =
                        stateAfter.balances.user.ntrn -
                        stateBefore.balances.user.ntrn;
                      // assume fluctuation because of uncertain unvested tokens amount
                      isWithinRangeRel(balanceChange, expectedRewards, 0.1);
                    });
      
                    test('ntrn rewards sent by XYK lockdrop contract', async () => {
                      const balanceChange =
                        stateBefore.balances.xykLockdrop.ntrn -
                        stateAfter.balances.xykLockdrop.ntrn;
                      expect(balanceChange).toEqual(
                        +stateBefore.xykUserLockups.total_ntrn_rewards,
                      );
                    });
                  });
      
                  test('no balance change for PCL lockdrop contract', async () => {
                    // no funds directly transferred to and kept on the PCL lockdrop contract
                    expect(stateAfter.balances.pclLockdrop.atom).toEqual(
                      stateBefore.balances.pclLockdrop.atom,
                    );
                    expect(stateAfter.balances.pclLockdrop.ntrn).toEqual(
                      stateBefore.balances.pclLockdrop.ntrn,
                    );
                    expect(stateAfter.balances.pclLockdrop.usdc).toEqual(
                      stateBefore.balances.pclLockdrop.usdc,
                    );
                    expect(stateAfter.balances.pclLockdrop.atomPclPairLp).toEqual(
                      stateBefore.balances.pclLockdrop.atomPclPairLp,
                    );
                    expect(stateAfter.balances.pclLockdrop.atomXykPairLp).toEqual(
                      stateBefore.balances.pclLockdrop.atomXykPairLp,
                    );
                    expect(stateAfter.balances.pclLockdrop.usdcPclPairLp).toEqual(
                      stateBefore.balances.pclLockdrop.usdcPclPairLp,
                    );
                    expect(stateAfter.balances.pclLockdrop.usdcXykPairLp).toEqual(
                      stateBefore.balances.pclLockdrop.usdcXykPairLp,
                    );
                  });
      
                  test('no paired assets and lp received by user', async () => {
                    // during migration a user can only receive ntrn and astro rewards
                    expect(stateAfter.balances.user.atom).toEqual(
                      stateBefore.balances.user.atom,
                    );
                    expect(stateAfter.balances.user.usdc).toEqual(
                      stateBefore.balances.user.usdc,
                    );
                    expect(stateAfter.balances.user.atomXykPairLp).toEqual(
                      stateBefore.balances.user.atomXykPairLp,
                    );
                    expect(stateAfter.balances.user.usdcXykPairLp).toEqual(
                      stateBefore.balances.user.usdcXykPairLp,
                    );
                    expect(stateAfter.balances.user.atomPclPairLp).toEqual(
                      stateBefore.balances.user.atomPclPairLp,
                    );
                    expect(stateAfter.balances.user.usdcPclPairLp).toEqual(
                      stateBefore.balances.user.usdcPclPairLp,
                    );
                  });
                });
      
                describe('PCL user lockups', () => {
                  test('no user lockup info before migration', async () => {
                    expect(stateBefore.pclUserLockups).toMatchObject({
                      claimable_incentives_debt: '0',
                      mapped_lockup_infos: {},
                      lockup_positions_index: 0,
                      ntrn_transferred: false,
                      total_ntrn_rewards: '0',
                    });
                  });
      
                  describe('astroport lp', () => {
                    test('lp tokens are locked', async () => {
                      expect(
                        +stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                          .lp_units_locked,
                      ).toBeGreaterThan(0);
                      expect(
                        +stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .lp_units_locked,
                      ).toBeGreaterThan(0);
                    });
      
                    test('lockup shares are roughly equal', async () => {
                      // sanity check
                      expect(
                        stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                          .expected_ntrn_share,
                      ).toBeGreaterThan(0);
                      expect(
                        stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .expected_ntrn_share,
                      ).toBeGreaterThan(0);
      
                      // equivalent of locked assets should be roughly equal before and after migration
                      isWithinRangeRel(
                        stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                          .expected_ntrn_share,
                        stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                          .expected_ntrn_share,
                        0.05,
                      );
                      isWithinRangeRel(
                        stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .expected_ntrn_share,
                        stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .expected_ntrn_share,
                        0.05,
                      );
                    });
      
                    test('lp tokens not marked as transferred', async () => {
                      // on XYK lockdrop contract's side we mark tokens as transferred meaning the contract
                      // doesn't have them anymore. but on PCL contract's side the tokens are still locked
                      expect(
                        stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                          .astroport_lp_transferred,
                      ).toBe(null);
                      expect(
                        stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                          .astroport_lp_transferred,
                      ).toBe(null);
                    });
      
                    test('staked lp amount increases', async () => {
                      // all lp from lockups are staked to generator
                      expect(stateAfter.pclAtomStakedInGen).toEqual(
                        stateBefore.pclAtomStakedInGen +
                          +stateAfter.pclUserLockups.mapped_lockup_infos[
                            atomLockupKey
                          ].lp_units_locked,
                      );
                      expect(stateAfter.pclUsdcStakedInGen).toEqual(
                        stateBefore.pclUsdcStakedInGen +
                          +stateAfter.pclUserLockups.mapped_lockup_infos[
                            usdcLockupKey
                          ].lp_units_locked,
                      );
                    });
                  });
      
                  test('PCL lockup lp token addresses', async () => {
                    // lp token addresses should correspond to the ones from PCL pairs
                    expect(
                      stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                        .astroport_lp_token,
                    ).toEqual(ntrnAtomPclToken);
                    expect(
                      stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                        .astroport_lp_token,
                    ).toEqual(ntrnUsdcPclToken);
                  });
      
                  test('lockup positions consistency', async () => {
                    // all positions should be migrated for the user with no previous claims and unlocks
                    expect(stateBefore.xykUserLockups.lockup_positions_index).toEqual(
                      stateAfter.pclUserLockups.lockup_positions_index,
                    );
      
                    // unlock timestamps should remain the same
                    expect(
                      stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                        .unlock_timestamp,
                    ).toEqual(
                      stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                        .unlock_timestamp,
                    );
                    expect(
                      stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                        .unlock_timestamp,
                    ).toEqual(
                      stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                        .unlock_timestamp,
                    );
                  });
                });
              });
            });
          }
        });

            
            
      });
      
      // This participant has three lockup positions: ATOM for 1, USDC for 1 and USDC for 2. User
      // claimed rewards without liquidity withdrawal previously, also we call claim rewards with
      // liquidity unlock for USDC 2 lockup in as first step of the test scenario to cover such a
      // case. Expected behaviour: the withdrawn lockup is ignored and untouched, other XYK lockups
      // are marked as transferred, lockdrop and airdrop rewards aren't transferred and marked as
      // transferred on both sides (XYK and PCL lockdrop contracts), generator rewards are paid to
      // the user for remaining lockups, remaining liquidity is migrated from XYK to PCL pools and
      // staked to the generator, PCL lockup entries are created in the PCL lockdrop contract for
      // remaining lockups.
      describe('migrate cmInstantiator participant', () => {
        it('withdraw one out of three lockups', async () => {
          // to cover migration with a withdrawn lockup case
          await cmInstantiator.executeContract(
            tgeMain.contracts.lockdrop,
            JSON.stringify({
              claim_rewards_and_optionally_unlock: {
                pool_type: 'USDC',
                duration: 1,
                withdraw_lp_stake: true,
              },
            }),
          );

          // wait for several blocks to collect some generator rewards
          await neutronChain.blockWaiter.waitBlocks(5);
        });

        let stateBefore: LiquidityMigrationState;
        it('gather state before migration', async () => {
          stateBefore = await gatherLiquidityMigrationState(
            neutronChain,
            cmInstantiator.wallet.address.toString(),
            liqMigContracts,
          );
          console.log(
            `cmInstantiator migration state before:\n${JSON.stringify(
              stateBefore,
            )}`,
          );
        });
        // @audit maybe a good idea to get this from quint
        const gas_limit = Long.fromNumber(15000000)
        const ntrnToPayGas = 750000;

        let migrateRes: BroadcastTx200ResponseTxResponse;
        it('migrate the user', async () => {
          migrateRes = await cmInstantiator.executeContract(
            tgeMain.contracts.lockdrop,
            JSON.stringify({
              migrate_liquidity_to_pcl_pools: {}, // no user address passed means the caller address
            }),
            undefined,
            {
              gas_limit: gas_limit,
              amount: [
                { denom: NEUTRON_DENOM, amount: ntrnToPayGas.toString() },
              ],
            },
          );
        });

        let stateAfter: LiquidityMigrationState;
        it('gather state after migration', async () => {
          stateAfter = await gatherLiquidityMigrationState(
            neutronChain,
            cmInstantiator.wallet.address.toString(),
            liqMigContracts,
          );
          console.log(
            `cmInstantiator migration state after:\n${JSON.stringify(
              stateAfter,
            )}`,
          );
        });

        describe('check user liquidity migration', () => {
          const atomLockupKey = 'ATOM1';
          const usdcWithdrawnLockupKey = 'USDC1';
          const usdcLockupKey = 'USDC2';
          describe('withdrawn lockup consistency', () => {
            test('user XYK lockup info consistency', async () => {
              expect(
                stateBefore.xykUserLockups.mapped_lockup_infos[
                  usdcWithdrawnLockupKey
                ],
              ).toMatchObject(
                stateAfter.xykUserLockups.mapped_lockup_infos[
                  usdcWithdrawnLockupKey
                ],
              );
            });

            test('no user lockup info in PCL lockdrop', async () => {
              expect(
                stateAfter.pclUserLockups.mapped_lockup_infos[
                  usdcWithdrawnLockupKey
                ],
              ).toBeUndefined();
            });

            describe('already claimed events emission', () => {
              test('emitted for withdrawn lockup', async () => {
                expect(migrateRes.raw_log).toContain(
                  '{"key":"USDC_for_1","value":"already_been_withdrawn"}',
                );
              });

              test('no emission for remaining lockups', async () => {
                expect(migrateRes.raw_log).not.toContain(
                  '{"key":"ATOM_for_1","value":"already_been_withdrawn"}',
                );
                expect(migrateRes.raw_log).not.toContain(
                  '{"key":"USDC_for_2","value":"already_been_withdrawn"}',
                );
              });
            });
          });

          describe('XYK user lockups', () => {
            describe('generator rewards', () => {
              let userAstroRewards: number;
              test('claimable generator ntrn debt', async () => {
                userAstroRewards =
                  +stateBefore.xykUserLockups.claimable_generator_ntrn_debt;
                // sanity check
                expect(userAstroRewards).toBeGreaterThan(0);

                // total rewards amount equals to sum of all lockup rewards
                expect(userAstroRewards).toEqual(
                  +stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                    .claimable_generator_astro_debt +
                    +stateBefore.xykUserLockups.mapped_lockup_infos[
                      usdcLockupKey
                    ].claimable_generator_astro_debt,
                );

                // rewards are claimed during migration => no rewards after it
                expect(
                  +stateAfter.xykUserLockups.claimable_generator_ntrn_debt,
                ).toEqual(0);
              });

              test('generator rewards are transferred to the user', async () => {
                expect(stateAfter.balances.user.astro).toBeGreaterThan(
                  stateBefore.balances.user.astro,
                );
                // claimed rewards are transferred directly to the user
                // assume fluctuation because rewards amount increases every block
                isWithinRangeRel(
                  stateAfter.balances.user.astro -
                    stateBefore.balances.user.astro,
                  userAstroRewards,
                  0.5,
                );
              });

              test('generator rewards are transferred to PCL contract for deposit', async () => {
                // as a side effect generator sends pending rewards to the depositor which is PCL contract
                expect(stateAfter.balances.pclLockdrop.astro).toBeGreaterThan(
                  stateBefore.balances.pclLockdrop.astro,
                );
              });
            });

            describe('astroport lp', () => {
              test('lp tokens marked as transferred', async () => {
                // lp tokens weren't transferred before migration
                expect(
                  stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                    .astroport_lp_transferred,
                ).toBe(null);
                expect(
                  stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .astroport_lp_transferred,
                ).toBe(null);

                // sanity check that there were some lp tokens in lockups
                expect(
                  +stateAfter.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                    .astroport_lp_transferred!,
                ).toBeGreaterThan(0);
                expect(
                  +stateAfter.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .astroport_lp_transferred!,
                ).toBeGreaterThan(0);

                // all lp tokens are transferred dirung migration to PCL contract
                expect(
                  stateAfter.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                    .astroport_lp_transferred,
                ).toEqual(
                  stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                    .lp_units_locked,
                );
                expect(
                  stateAfter.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .astroport_lp_transferred,
                ).toEqual(
                  stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .lp_units_locked,
                );
              });

              test('staked lp amount decreases', async () => {
                // all lp from lockups is unstaked from generator
                expect(stateAfter.xykAtomStakedInGen).toEqual(
                  stateBefore.xykAtomStakedInGen -
                    +stateBefore.xykUserLockups.mapped_lockup_infos[
                      atomLockupKey
                    ].lp_units_locked,
                );
                expect(stateAfter.xykUsdcStakedInGen).toEqual(
                  stateBefore.xykUsdcStakedInGen -
                    +stateBefore.xykUserLockups.mapped_lockup_infos[
                      usdcLockupKey
                    ].lp_units_locked,
                );
              });
            });

            test('XYK lockup lp token addresses', async () => {
              // lp token addresses shouldn't change
              expect(
                stateAfter.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                  .astroport_lp_token,
              ).toEqual(
                stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                  .astroport_lp_token,
              );
              expect(
                stateAfter.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .astroport_lp_token,
              ).toEqual(
                stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .astroport_lp_token,
              );
            });
          });

          describe('lockdrop participation rewards', () => {
            test('ntrn reward marked as transferred', async () => {
              // this user claimed rewards => ntrn are transferred
              expect(stateBefore.xykUserLockups.ntrn_transferred).toBe(true);

              // ntrn rewards are marked as transferred in both contracts after migration
              expect(stateAfter.xykUserLockups.ntrn_transferred).toBe(true);
              expect(stateAfter.pclUserLockups.ntrn_transferred).toBe(true);
            });

            describe('no ntrn transfer from lockdrop to user', () => {
              test('no ntrn rewards received by the user', async () => {
                // since the user called his own migration, we take the paid fee into account here
                expect(stateAfter.balances.user.ntrn).toEqual(
                  stateBefore.balances.user.ntrn - ntrnToPayGas,
                );
              });

              test('no ntrn rewards sent by XYK lockdrop contract', async () => {
                expect(stateBefore.balances.xykLockdrop.ntrn).toEqual(
                  stateAfter.balances.xykLockdrop.ntrn,
                );
              });
            });

            test('no balance change for PCL lockdrop contract', async () => {
              // no funds (but astro rewards checked above) directly transferred to and kept on
              // the PCL lockdrop contract
              expect(stateAfter.balances.pclLockdrop.atom).toEqual(
                stateBefore.balances.pclLockdrop.atom,
              );
              expect(stateAfter.balances.pclLockdrop.ntrn).toEqual(
                stateBefore.balances.pclLockdrop.ntrn,
              );
              expect(stateAfter.balances.pclLockdrop.usdc).toEqual(
                stateBefore.balances.pclLockdrop.usdc,
              );
              expect(stateAfter.balances.pclLockdrop.atomPclPairLp).toEqual(
                stateBefore.balances.pclLockdrop.atomPclPairLp,
              );
              expect(stateAfter.balances.pclLockdrop.atomXykPairLp).toEqual(
                stateBefore.balances.pclLockdrop.atomXykPairLp,
              );
              expect(stateAfter.balances.pclLockdrop.usdcPclPairLp).toEqual(
                stateBefore.balances.pclLockdrop.usdcPclPairLp,
              );
              expect(stateAfter.balances.pclLockdrop.usdcXykPairLp).toEqual(
                stateBefore.balances.pclLockdrop.usdcXykPairLp,
              );
            });

            test('no paired assets and lp received by user', async () => {
              // during migration the user can only receive astro rewards
              expect(stateAfter.balances.user.atom).toEqual(
                stateBefore.balances.user.atom,
              );
              expect(stateAfter.balances.user.usdc).toEqual(
                stateBefore.balances.user.usdc,
              );
              expect(stateAfter.balances.user.atomXykPairLp).toEqual(
                stateBefore.balances.user.atomXykPairLp,
              );
              expect(stateAfter.balances.user.usdcXykPairLp).toEqual(
                stateBefore.balances.user.usdcXykPairLp,
              );
              expect(stateAfter.balances.user.atomPclPairLp).toEqual(
                stateBefore.balances.user.atomPclPairLp,
              );
              expect(stateAfter.balances.user.usdcPclPairLp).toEqual(
                stateBefore.balances.user.usdcPclPairLp,
              );
            });
          });

          describe('PCL user lockups', () => {
            test('no user lockup info before migration', async () => {
              expect(stateBefore.pclUserLockups).toMatchObject({
                claimable_incentives_debt: '0',
                mapped_lockup_infos: {},
                lockup_positions_index: 0,
                ntrn_transferred: false,
                total_ntrn_rewards: '0',
              });
            });

            describe('astroport lp', () => {
              test('lp tokens are locked', async () => {
                expect(
                  +stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                    .lp_units_locked,
                ).toBeGreaterThan(0);
                expect(
                  +stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .lp_units_locked,
                ).toBeGreaterThan(0);
              });

              test('lockup shares are roughly equal', async () => {
                // sanity check
                expect(
                  stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                    .expected_ntrn_share,
                ).toBeGreaterThan(0);
                console.log(`[STATE BEFORE] Expected ntrn share for atomLockupKey ${stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                  .expected_ntrn_share}`)
                  console.log(`[STATE AFTER] Expected ntrn share for atomLockupKey ${stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                    .expected_ntrn_share}`)
                expect(
                  stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .expected_ntrn_share,
                ).toBeGreaterThan(0);
                console.log(`[STATE BEFORE] Expected ntrn share for usdcLockupKey ${stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .expected_ntrn_share}`)
                console.log(`[STATE AFTER] Expected ntrn share for usdcLockupKey ${stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .expected_ntrn_share}`)

                // equivalent of locked assets should be roughly equal before and after migration
                isWithinRangeRel(
                  stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                    .expected_ntrn_share,
                  stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                    .expected_ntrn_share,
                  0.05,
                );

                isWithinRangeRel(
                  stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .expected_ntrn_share,
                  stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .expected_ntrn_share,
                  0.05,
                );
              });

              test('lp tokens not marked as transferred', async () => {
                // on XYK lockdrop contract's side we mark tokens as transferred meaning the contract
                // doesn't have them anymore. but on PCL contract's side the tokens are still locked
                expect(
                  stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                    .astroport_lp_transferred,
                ).toBe(null);
                expect(
                  stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                    .astroport_lp_transferred,
                ).toBe(null);
              });

              test('staked lp amount increases', async () => {
                // all lp from lockups are staked to generator
                expect(stateAfter.pclAtomStakedInGen).toEqual(
                  stateBefore.pclAtomStakedInGen +
                    +stateAfter.pclUserLockups.mapped_lockup_infos[
                      atomLockupKey
                    ].lp_units_locked,
                );
                expect(stateAfter.pclUsdcStakedInGen).toEqual(
                  stateBefore.pclUsdcStakedInGen +
                    +stateAfter.pclUserLockups.mapped_lockup_infos[
                      usdcLockupKey
                    ].lp_units_locked,
                );
              });
            });

            test('PCL lockup lp token addresses', async () => {
              // lp token addresses should correspond to the ones from PCL pairs
              expect(
                stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                  .astroport_lp_token,
              ).toEqual(ntrnAtomPclToken);
              expect(
                stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .astroport_lp_token,
              ).toEqual(ntrnUsdcPclToken);
            });

            test('lockup positions consistency', async () => {
              // all positions should be migrated for the user with no previous claims and unlocks
              expect(stateBefore.xykUserLockups.lockup_positions_index).toEqual(
                stateAfter.pclUserLockups.lockup_positions_index,
              );

              // unlock timestamps should remain the same
              expect(
                stateBefore.xykUserLockups.mapped_lockup_infos[atomLockupKey]
                  .unlock_timestamp,
              ).toEqual(
                stateAfter.pclUserLockups.mapped_lockup_infos[atomLockupKey]
                  .unlock_timestamp,
              );
              expect(
                stateBefore.xykUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .unlock_timestamp,
              ).toEqual(
                stateAfter.pclUserLockups.mapped_lockup_infos[usdcLockupKey]
                  .unlock_timestamp,
              );
            });
          });
        });
      });

      // These accounts are the only remaining lockdrop participants. Each of them has two lockup
      // positions: ATOM for 1 and USDC for 1. They claimed rewards with liquidity unlock for both
      // lockups before. Expected behaviour: both withdrawn lockups are ignored and untouched, no
      // rewards paid, no balance changes whatsoever, no state changes made to both lockdrop
      // contracts, migration transaction emits events informing about the already withdrawn positions.
      describe('migrate the lockdrop participants who claimed and withdrew rewards', () => {
        filterMapByPropertiesFunctional(initData, "claims_rewards", "withdraws_rewards",  true, true).forEach((value, key) => {
          if(!value.is_vesting){
            describe(`migrate ${key} participant`, () => {
              let stateBefore: LiquidityMigrationState;
              it('gather state before migration', async () => {
                stateBefore = await gatherLiquidityMigrationState(
                  neutronChain,
                  tgeWallets[key].wallet.address.toString(),
                  liqMigContracts,
                );
                console.log(
                  `${key} migration state before:\n${JSON.stringify(stateBefore)}`,
                );
              });
              // @audit maybe a good idea to get this from quint
              const gas_limit = Long.fromNumber(15000000)
              const ntrnToPayGas = 750000;
              let migrateRes: BroadcastTx200ResponseTxResponse;
              it('migrate the user', async () => {
                migrateRes = await cmInstantiator.executeContract(
                  tgeMain.contracts.lockdrop,
                  JSON.stringify({
                    migrate_liquidity_to_pcl_pools: {
                      user_address_raw: tgeWallets[key].wallet.address.toString(),
                    },
                  }),
                  undefined,
                  {
                    gas_limit: gas_limit,
                    amount: [{ denom: NEUTRON_DENOM, amount: ntrnToPayGas.toString() }],
                  },
                );
              });
  
              let stateAfter: LiquidityMigrationState;
              it('gather state after migration', async () => {
                stateAfter = await gatherLiquidityMigrationState(
                  neutronChain,
                  tgeWallets[key].wallet.address.toString(),
                  liqMigContracts,
                );
                console.log(
                  `${key} migration state after:\n${JSON.stringify(stateAfter)}`,
                );
              });
  
              describe('check user liquidity migration', () => {
                test('user XYK lockup info consistency', async () => {
                  expect(stateBefore.xykUserLockups).toMatchObject(
                    stateAfter.xykUserLockups,
                  );
                });
  
                test('no user lockup info in PCL lockdrop', async () => {
                  expect(stateAfter.pclUserLockups).toMatchObject({
                    claimable_incentives_debt: '0',
                    mapped_lockup_infos: {},
                    lockup_positions_index: 0,
                    ntrn_transferred: false,
                    total_ntrn_rewards: '0',
                  });
                });
                
                //@audit here checks balances for rest of migrations
                test('no balance changes', async () => {
                  console.log(`${key} balances before: `, JSON.stringify(stateBefore.balances))
                  console.log(`${key} balances after: `, JSON.stringify(stateAfter.balances))
                  expect(stateBefore.balances).toMatchObject(stateAfter.balances);
                });
  
                test('already claimed events emission', async () => {
                  expect(migrateRes.raw_log).toContain(
                    '{"key":"ATOM_for_1","value":"already_been_withdrawn"}',
                  );
                  expect(migrateRes.raw_log).toContain(
                    '{"key":"USDC_for_1","value":"already_been_withdrawn"}',
                  );
                });
              });
            });
          }
        });
      });



      describe('execute migration handlers: vesting lp', () => {

        
        for (const v in filterMapByPropertyFunctional(initData, "is_vesting", true)){
          it('should validate numbers & save claim amount before migration for user: ' + v, async () => {
            const [
              vestingInfoAtom,
              vestingInfoUsdc,
              lpAuctionBalanceAtom,
              lpAuctionBalanceUsdc,
            ] = await Promise.all([
              neutronChain.queryContract<VestingAccountResponse>(
                tgeMain.contracts.vestingAtomLp,
                {
                  vesting_account: {
                    address: tgeWallets[v].wallet.address.toString(),
                  },
                },
              ),
              neutronChain.queryContract<VestingAccountResponse>(
                tgeMain.contracts.vestingUsdcLp,
                {
                  vesting_account: {
                    address: tgeWallets[v].wallet.address.toString(),
                  },
                },
              ),
              neutronChain.queryContract<BalanceResponse>(
                tgeMain.pairs.atom_ntrn.liquidity,
                {
                  balance: {
                    address: tgeMain.contracts.auction,
                  },
                },
              ),
              neutronChain.queryContract<BalanceResponse>(
                tgeMain.pairs.usdc_ntrn.liquidity,
                {
                  balance: {
                    address: tgeMain.contracts.auction,
                  },
                },
              ),
            ]);
    
            expect(parseInt(lpAuctionBalanceUsdc.balance)).toBeLessThanOrEqual(7);
            expect(parseInt(lpAuctionBalanceAtom.balance)).toBeLessThanOrEqual(7);
            expect(vestingInfoAtom.address).toEqual(
              tgeWallets[v].wallet.address.toString(),
            );
            expect(vestingInfoUsdc.address).toEqual(
              tgeWallets[v].wallet.address.toString(),
            );
            expect(vestingInfoAtom.info.released_amount).toEqual('0');
            expect(vestingInfoUsdc.info.released_amount).toEqual('0');
    
            expect(
              parseInt(vestingInfoAtom.info.schedules[0].end_point.amount),
            ).toBeGreaterThan(0);
            let claimedAtomLp = parseInt(
              vestingInfoAtom.info.schedules[0].end_point.amount,
            );
            claimAtomLPMap.set(v, claimedAtomLp)
            expect(
              parseInt(vestingInfoUsdc.info.schedules[0].end_point.amount),
            ).toBeGreaterThan(0);
            let claimedUsdcLP = parseInt(
              vestingInfoUsdc.info.schedules[0].end_point.amount,
            );
            claimUsdcLPMap.set(v, claimedUsdcLP)

          });
        }

  
        it('store new vesting lp contract version', async () => {
          newVestingLpCodeID = await cmInstantiator.storeWasm(
            NeutronContract.VESTING_LP,
          );
        });
  
        it('should migrate ATOM LP vesting to V2', async () => {
          const res = await cmInstantiator.migrateContract(
            tgeMain.contracts.vestingAtomLp,
            newVestingLpCodeID,
            {
              max_slippage: '0.01',
              ntrn_denom: NEUTRON_DENOM,
              paired_denom: IBC_ATOM_DENOM,
              xyk_pair: tgeMain.pairs.atom_ntrn.contract.toString(),
              cl_pair: ntrnAtomPclPool,
              new_lp_token: ntrnAtomPclToken,
              pcl_vesting: atomVestingLpAddr,
              dust_threshold: '0',
            },
          );
          expect(res.code).toEqual(0);
        });
  
        it('should migrate USDC LP vesing to V2', async () => {
          const res = await cmInstantiator.migrateContract(
            tgeMain.contracts.vestingUsdcLp,
            newVestingLpCodeID,
            {
              max_slippage: '0.01',
              ntrn_denom: NEUTRON_DENOM,
              paired_denom: IBC_USDC_DENOM,
              xyk_pair: tgeMain.pairs.usdc_ntrn.contract,
              cl_pair: ntrnUsdcPclPool,
              new_lp_token: ntrnUsdcPclToken,
              pcl_vesting: usdcVestingLpAddr,
              dust_threshold: '0',
            },
          );
          expect(res.code).toEqual(0);
        });
        for(const v in filterMapByPropertyFunctional(initData, "is_vesting", true)){
          it('should  migrate atom for user: ' + v, async () => {
              const resAtom = await cmInstantiator.executeContract(
                tgeMain.contracts.vestingAtomLp,
                JSON.stringify({
                  migrate_liquidity_to_pcl_pool: {
                    user: tgeWallets[v].wallet.address.toString(),
                  },
                }),
              );
              expect(resAtom.code).toEqual(0);
            
          });
        }
        for(const v in filterMapByPropertyFunctional(initData, "is_vesting", true)){
          it('should  migrate usdc for user: '+v, async () => {
              const res = await cmInstantiator.executeContract(
                tgeMain.contracts.vestingUsdcLp,
                JSON.stringify({
                  migrate_liquidity_to_pcl_pool: {
                    user: tgeWallets[v].wallet.address.toString(),
                  },
                }),
              );
              expect(res.code).toEqual(0);
            
          });
        }
        // @audit-info removed: should compare voting power after migrtaion: vesting lp
        // @audit-info removed: should compare voting power after migrtaion: lockdrop
        // @audit-info removed: should compare voting power after migrtaion: overall

        for(const v in filterMapByPropertyFunctional(initData, "is_vesting", true)){
          it('should claim for user: '+v, async () => {
              const vs = await neutronChain.queryContract<{
                total_granted: string;
                total_released: string;
              }>(usdcVestingLpAddr, {
                vesting_state: {},
              });
              expect(vs.total_granted).not.toEqual('0');
              const resAtom = await tgeWallets[v].executeContract(
                atomVestingLpAddr,
                JSON.stringify({
                  claim: {},
                }),
              );
              expect(resAtom.code).toEqual(0);
              const resUsdc = await tgeWallets[v].executeContract(
                usdcVestingLpAddr,
                JSON.stringify({
                  claim: {},
                }),
              );
              expect(resUsdc.code).toEqual(0);
            
              const [lpBalanceAtom, lpBalanceUsdc] = await Promise.all([
                neutronChain.queryContract<BalanceResponse>(ntrnAtomPclToken, {
                  balance: {
                    address: tgeWallets[v].wallet.address.toString(),
                  },
                }),
                neutronChain.queryContract<BalanceResponse>(ntrnUsdcPclToken, {
                  balance: {
                    address: tgeWallets[v].wallet.address.toString(),
                  },
                }),
              ]);
            // diff is big, near 40%
            isWithinRangeRel(parseInt(lpBalanceAtom.balance), claimAtomLPMap.get(v), 0.05);
            isWithinRangeRel(parseInt(lpBalanceUsdc.balance), claimUsdcLPMap.get(v), 0.05);
            
          });
        }
      });
    });


  });
}); // end Neutron/TGE/Auction
const gatherLiquidityMigrationState = async (
  chain: CosmosWrapper,
  migratingUser: string,
  contracts: LiquidityMigrationContracts,
): Promise<LiquidityMigrationState> => {
  const xykLockdropUserInfo: LockdropUserInfoResponse =
    await chain.queryContract(contracts.xykLockdrop, {
      user_info: {
        address: migratingUser,
      },
    });
  const pclLockdropUserInfo: LockdropPclUserInfoResponse =
    await chain.queryContract(contracts.pclLockdrop, {
      user_info: {
        address: migratingUser,
      },
    });
  return {
    xykUserLockups: await transformUserInfo(chain, xykLockdropUserInfo),
    pclUserLockups: await transformPclUserInfo(chain, pclLockdropUserInfo),
    balances: {
      xykLockdrop: await getLiquidityMigrationBalances(
        chain,
        contracts.xykLockdrop,
        contracts,
      ),
      pclLockdrop: await getLiquidityMigrationBalances(
        chain,
        contracts.pclLockdrop,
        contracts,
      ),
      user: await getLiquidityMigrationBalances(
        chain,
        migratingUser,
        contracts,
      ),
    },
    xykUsdcStakedInGen: +(await chain.queryContract<string>(
      contracts.generator,
      {
        deposit: {
          lp_token: contracts.usdcXykLp,
          user: contracts.xykLockdrop,
        },
      },
    )),
    xykAtomStakedInGen: +(await chain.queryContract<string>(
      contracts.generator,
      {
        deposit: {
          lp_token: contracts.atomXykLp,
          user: contracts.xykLockdrop,
        },
      },
    )),
    pclUsdcStakedInGen: +(await chain.queryContract<string>(
      contracts.incentives,
      {
        deposit: {
          lp_token: contracts.usdcPclLp,
          user: contracts.pclLockdrop,
        },
      },
    )),
    pclAtomStakedInGen: +(await chain.queryContract<string>(
      contracts.incentives,
      {
        deposit: {
          lp_token: contracts.atomPclLp,
          user: contracts.pclLockdrop,
        },
      },
    )),
  };
};
type LiquidityMigrationContracts = {
  xykLockdrop: string;
  pclLockdrop: string;
  atomXykPair: string;
  atomXykLp: string;
  usdcXykPair: string;
  usdcXykLp: string;
  atomPclPair: string;
  atomPclLp: string;
  usdcPclPair: string;
  usdcPclLp: string;
  generator: string;
  incentives: string;
};

// Contains states of different contracts and balances related to TGE liquidity migration.
type LiquidityMigrationState = {
  // user's lockups stored in the XYK lockdrop contract's state
  xykUserLockups: ExpandedLockdropUserInfoResponse;
  // user's lockups stored in the PCL lockdrop contract's state
  pclUserLockups: ExpandedLockdropPclUserInfoResponse;
  balances: {
    xykLockdrop: LiquidityMigrationBalances;
    pclLockdrop: LiquidityMigrationBalances;
    user: LiquidityMigrationBalances;
  };
  // amount of NTRN/USDC XYK pair LP tokens staked in the generator
  xykUsdcStakedInGen: number;
  // amount of NTRN/ATOM XYK pair LP tokens staked in the generator
  xykAtomStakedInGen: number;
  // amount of NTRN/USDC PCL pair LP tokens staked in the generator
  pclUsdcStakedInGen: number;
  // amount of NTRN/ATOM PCL pair LP tokens staked in the generator
  pclAtomStakedInGen: number;
};

// Contains balances in all assets involved in TGE liquidity migration process.
type LiquidityMigrationBalances = {
  ntrn: number;
  usdc: number;
  atom: number;
  usdcXykPairLp: number; // NTRN/USDC XYK pair LP tokens
  atomXykPairLp: number; // NTRN/ATOM XYK pair LP tokens
  usdcPclPairLp: number; // NTRN/USDC PCL pair LP tokens
  atomPclPairLp: number; // NTRN/ATOM PCL pair LP tokens
  astro: number; // balance in astro reward token
  external_rewards: number; // balance in external reward token
};

// Makes a number of queries for balances in all assets involved in TGE liquidity migration process.
const getLiquidityMigrationBalances = async (chain: CosmosWrapper, address: string,contracts: LiquidityMigrationContracts): Promise<LiquidityMigrationBalances> => ({
  ntrn: await chain.queryDenomBalance(address, NEUTRON_DENOM),
  usdc: await chain.queryDenomBalance(address, IBC_USDC_DENOM),
  atom: await chain.queryDenomBalance(address, IBC_ATOM_DENOM),
  usdcXykPairLp: +(
    await chain.queryContract<BalanceResponse>(contracts.usdcXykLp, {
      balance: {
        address: address,
      },
    })
  ).balance,
  atomXykPairLp: +(
    await chain.queryContract<BalanceResponse>(contracts.atomXykLp, {
      balance: {
        address: address,
      },
    })
  ).balance,
  usdcPclPairLp: +(
    await chain.queryContract<BalanceResponse>(contracts.usdcPclLp, {
      balance: {
        address: address,
      },
    })
  ).balance,
  atomPclPairLp: +(
    await chain.queryContract<BalanceResponse>(contracts.atomPclLp, {
      balance: {
        address: address,
      },
    })
  ).balance,
  astro: await chain.queryDenomBalance(
    address,
    (
      await chain.queryContract<any>(contracts.generator, {
        config: {},
      })
    ).astro_token.native_token.denom,
  ),
  external_rewards: +(
    (await chain.queryBalances(address)).balances.find((b) =>
      b.denom?.includes(EXT_REWARD_SUBDENOM),
    )?.amount || '0'
  ),
});

const queryTgePoolShares = async (
  chain: CosmosWrapper,
  address: string,
  atomPair: string,
  usdcPair: string,
): Promise<tgePoolShares> => {
  const atomPairInfo = await chain.queryContract<PairInfo>(atomPair, {
    pair: {},
  });
  const atomPairLp = await chain.queryContract<BalanceResponse>(
    atomPairInfo.liquidity_token,
    {
      balance: {
        address: address,
      },
    },
  );
  const atomPairShares = await chain.queryContract<Asset[]>(atomPair, {
    share: {
      amount: atomPairLp.balance,
    },
  });
  const usdcPairInfo = await chain.queryContract<PairInfo>(usdcPair, {
    pair: {},
  });
  const usdcPairLp = await chain.queryContract<BalanceResponse>(
    usdcPairInfo.liquidity_token,
    {
      balance: {
        address: address,
      },
    },
  );
  const usdcPairShares = await chain.queryContract<Asset[]>(usdcPair, {
    share: {
      amount: usdcPairLp.balance,
    },
  });
  return {
    atomNtrn: {
      atomShares: +atomPairShares.filter(
        (a) => (a.info as NativeToken).native_token.denom == IBC_ATOM_DENOM,
      )[0].amount,
      ntrnShares: +atomPairShares.filter(
        (a) => (a.info as NativeToken).native_token.denom == NEUTRON_DENOM,
      )[0].amount,
    },
    usdcNtrn: {
      usdcShares: +usdcPairShares.filter(
        (a) => (a.info as NativeToken).native_token.denom == IBC_USDC_DENOM,
      )[0].amount,
      ntrnShares: +usdcPairShares.filter(
        (a) => (a.info as NativeToken).native_token.denom == NEUTRON_DENOM,
      )[0].amount,
    },
  };
};

type tgePoolShares = {
  atomNtrn: {
    atomShares: number;
    ntrnShares: number;
  };
  usdcNtrn: {
    usdcShares: number;
    ntrnShares: number;
  };
};

// Transforms a bit a user info response from a lockdrop contract to ease test assertions.
const transformUserInfo = async (
  chain: CosmosWrapper,
  userInfo: LockdropUserInfoResponse,
): Promise<ExpandedLockdropUserInfoResponse> => {
  const mappedLockupInfos: Record<string, ExpandedLockdropLockUpInfoResponse> =
    {};
  userInfo.lockup_infos.forEach(async (v) => {
    const poolAddress = (
      await chain.queryContract<MinterResponse>(v.astroport_lp_token, {
        minter: {},
      })
    ).minter;
    const share = await chain.queryContract<Asset[]>(poolAddress, {
      share: { amount: v.lp_units_locked },
    });
    return (mappedLockupInfos[v.pool_type + v.duration.toString()] = {
      astroport_lp_token: v.astroport_lp_token,
      astroport_lp_transferred: v.astroport_lp_transferred,
      astroport_lp_units: v.astroport_lp_units,
      claimable_generator_astro_debt: v.claimable_generator_astro_debt,
      claimable_generator_proxy_debt: v.claimable_generator_proxy_debt,
      duration: v.duration,
      generator_ntrn_debt: v.generator_ntrn_debt,
      generator_proxy_debt: v.generator_proxy_debt,
      lp_units_locked: v.lp_units_locked,
      ntrn_rewards: v.ntrn_rewards,
      pool_type: v.pool_type,
      unlock_timestamp: v.unlock_timestamp,
      withdrawal_flag: v.withdrawal_flag,
      expected_ntrn_share: +share.filter(
        (a) => (a.info as NativeToken).native_token.denom == NEUTRON_DENOM,
      )[0].amount,
      expected_paired_asset_share: +share.filter(
        (a) => (a.info as NativeToken).native_token.denom != NEUTRON_DENOM,
      )[0].amount,
    });
  });
  return {
    claimable_generator_ntrn_debt: userInfo.claimable_generator_ntrn_debt,
    mapped_lockup_infos: mappedLockupInfos,
    lockup_positions_index: userInfo.lockup_positions_index,
    ntrn_transferred: userInfo.ntrn_transferred,
    total_ntrn_rewards: userInfo.total_ntrn_rewards,
  };
};

// Transforms a bit a user info response from a lockdrop contract to ease test assertions.
const transformPclUserInfo = async (
  chain: CosmosWrapper,
  userInfo: LockdropPclUserInfoResponse,
): Promise<ExpandedLockdropPclUserInfoResponse> => {
  const mappedLockupInfos: Record<
    string,
    ExpandedLockdropPclLockUpInfoResponse
  > = {};
  userInfo.lockup_infos.forEach(async (v) => {
    const poolAddress = (
      await chain.queryContract<MinterResponse>(v.astroport_lp_token, {
        minter: {},
      })
    ).minter;
    const share = await chain.queryContract<Asset[]>(poolAddress, {
      share: { amount: v.lp_units_locked },
    });
    return (mappedLockupInfos[v.pool_type + v.duration.toString()] = {
      astroport_lp_token: v.astroport_lp_token,
      astroport_lp_transferred: v.astroport_lp_transferred,
      astroport_lp_units: v.astroport_lp_units,
      incentives_debt:
        v.incentives_debt.find((v) =>
          (v[0] as NativeToken).native_token.denom.includes('/uastro'),
        )?.[1] || '0',
      claimable_incentives_debt:
        v.claimable_incentives_debt.find((v) =>
          (v[0] as NativeToken).native_token.denom.includes('/uastro'),
        )?.[1] || '0',
      external_incentives_rewards_debt:
        v.incentives_debt.find((v) =>
          (v[0] as NativeToken).native_token.denom.includes(
            EXT_REWARD_SUBDENOM,
          ),
        )?.[1] || '0',
      claimable_external_incentives_rewards_debt:
        v.claimable_incentives_debt.find((v) =>
          (v[0] as NativeToken).native_token.denom.includes(
            EXT_REWARD_SUBDENOM,
          ),
        )?.[1] || '0',
      duration: v.duration,
      lp_units_locked: v.lp_units_locked,
      ntrn_rewards: v.ntrn_rewards,
      pool_type: v.pool_type,
      unlock_timestamp: v.unlock_timestamp,
      withdrawal_flag: v.withdrawal_flag,
      expected_ntrn_share: +share.filter(
        (a) => (a.info as NativeToken).native_token.denom == NEUTRON_DENOM,
      )[0].amount,
      expected_paired_asset_share: +share.filter(
        (a) => (a.info as NativeToken).native_token.denom != NEUTRON_DENOM,
      )[0].amount,
    });
  });
  return {
    claimable_incentives_debt:
      userInfo.claimable_incentives_debt.find((v) =>
        (v[0] as NativeToken).native_token.denom.includes('/uastro'),
      )?.[1] || '0',
    claimable_incentives_external_debt:
      userInfo.claimable_incentives_debt.find((v) =>
        (v[0] as NativeToken).native_token.denom.includes(EXT_REWARD_SUBDENOM),
      )?.[1] || '0',
    mapped_lockup_infos: mappedLockupInfos,
    lockup_positions_index: userInfo.lockup_positions_index,
    ntrn_transferred: userInfo.ntrn_transferred,
    total_ntrn_rewards: userInfo.total_ntrn_rewards,
  };
};

type MinterResponse = {
  minter: string;
  cap: string | undefined; // Option<Uint128>
};

// Just the same LockdropUserInfoResponse but with some additional info added.
type ExpandedLockdropUserInfoResponse = {
  claimable_generator_ntrn_debt: string;
  mapped_lockup_infos: Record<string, ExpandedLockdropLockUpInfoResponse>; // pool_type + duration as a key
  lockup_positions_index: number;
  ntrn_transferred: boolean;
  total_ntrn_rewards: string;
};

// Just the same LockdropPclUserInfoResponse but with some additional info added.
type ExpandedLockdropPclUserInfoResponse = {
  claimable_incentives_debt: string;
  claimable_incentives_external_debt: string;
  mapped_lockup_infos: Record<string, ExpandedLockdropPclLockUpInfoResponse>; // pool_type + duration as a key
  lockup_positions_index: number;
  ntrn_transferred: boolean;
  total_ntrn_rewards: string;
};

// Just the same LockdropLockUpInfoResponse but with LP share fields added.
type ExpandedLockdropLockUpInfoResponse = {
  astroport_lp_token: string;
  astroport_lp_transferred: string | null;
  astroport_lp_units: string | null;
  claimable_generator_astro_debt: string;
  claimable_generator_proxy_debt: unknown[];
  duration: number;
  generator_ntrn_debt: string;
  generator_proxy_debt: unknown[];
  lp_units_locked: string;
  ntrn_rewards: string;
  pool_type: string;
  unlock_timestamp: number;
  withdrawal_flag: boolean;
  expected_ntrn_share: number; // expected amount of ntrn received on liquidity withdrawal
  expected_paired_asset_share: number; // expected amount of paired asset received on liquidity withdrawal
};

// Just the same LockdropPclLockUpInfoResponse but with LP share fields and astro rewards added.
type ExpandedLockdropPclLockUpInfoResponse = {
  pool_type: string;
  lp_units_locked: string; // Uint128
  withdrawal_flag: boolean;
  ntrn_rewards: string; // Uint128
  duration: number;
  incentives_debt: string; // Uint128
  claimable_incentives_debt: string; // Uint128
  external_incentives_rewards_debt: string; // Uint128
  claimable_external_incentives_rewards_debt: string; // Uint128
  unlock_timestamp: number;
  astroport_lp_units: string | null;
  astroport_lp_token: string;
  astroport_lp_transferred: string | null;
  expected_ntrn_share: number; // expected amount of ntrn received on liquidity withdrawal
  expected_paired_asset_share: number; // expected amount of paired asset received on liquidity withdrawal
};

const deregisterPair = async (
  instantiator: WalletWrapper,
  factoryAddr: string,
  assetInfos: NativeToken[],
) => {
  const deregisterMsg = {
    deregister: {
      asset_infos: assetInfos,
    },
  };

  const execRes = await instantiator.executeContract(
    factoryAddr,
    JSON.stringify(deregisterMsg),
  );
  expect(execRes.code).toBe(0);
};

const createPclPair = async (
  chain: CosmosWrapper,
  instantiator: WalletWrapper,
  factoryAddr: string,
  assetInfos: NativeToken[],
  initPriceScale: number,
): Promise<PairInfo> => {
  const poolInitParams: ConcentratedPoolParams = {
    amp: '40',
    gamma: '0.000145',
    mid_fee: '0.0026',
    out_fee: '0.0045',
    fee_gamma: '0.00023',
    repeg_profit_threshold: '0.000002',
    min_price_scale_delta: '0.000146',
    price_scale: initPriceScale.toString(),
    ma_half_time: 600,
    track_asset_balances: true,
  };

  const createMsg = {
    create_pair: {
      pair_type: { custom: 'concentrated' },
      asset_infos: assetInfos,
      init_params: Buffer.from(JSON.stringify(poolInitParams)).toString(
        'base64',
      ),
    },
  };

  const execRes = await instantiator.executeContract(
    factoryAddr,
    JSON.stringify(createMsg),
  );
  expect(execRes.code).toBe(0);

  const pairInfo = await chain.queryContract<PairInfo>(factoryAddr, {
    pair: {
      asset_infos: assetInfos,
    },
  });
  return pairInfo;
};

type PairInfo = {
  asset_infos: NativeToken[];
  contract_addr: string;
  liquidity_token: string;
  pair_type: Record<string, object>;
};

type ConcentratedPoolParams = {
  amp: string;
  gamma: string;
  mid_fee: string;
  out_fee: string;
  fee_gamma: string;
  repeg_profit_threshold: string;
  min_price_scale_delta: string;
  price_scale: string;
  ma_half_time: number;
  track_asset_balances: boolean;
};

// checks whether the value is in +/- range (inclusive) from the target value with tolerance in %.
// e.g. 10% is tolerance = 0.1
const isWithinRangeRel = (value: number, target: number, tolerance: number) => {
  expect(value).toBeGreaterThanOrEqual(target - target * tolerance);
  expect(value).toBeLessThanOrEqual(target + target * tolerance);
};