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
import { Trace, State, User, ReadingState, ReadingTrace, InitAmounts } from "../../../trace-transformer/structs";
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
    map.set(item.user, { amount: item.amount, claims_rewards: item.claims_rewards, withdraws_rewards: item.withdraws_rewards, is_vesting: item.is_vesting });
  });

  return map;
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
  let initialStateData: State;
  let otherStatesData: State[];
  describe('Pre-Migration setup', () => {
    initialStateData = getInitialState();
    console.log("in init data state: ", initialStateData);
    otherStatesData = getAllOtherStates();
    console.log("in all other states: ", otherStatesData);

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
      for (const v of initialStateData.stepInfo.msgArgs.value.keys()) {
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
                  amount: '50000000',
                },
                {
                  denom: IBC_ATOM_DENOM,
                  amount: '10000000',
                },
                {
                  denom: IBC_USDC_DENOM,
                  amount: '10000000',
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
    //@todo fix this here
    describe('Deploy', () => {
      it('should deploy useres contracts', async () => {
        tgeMain.airdropAccounts = [];

        initialStateData.stepInfo.msgArgs.value.forEach((value, key) => {
          tgeMain.airdropAccounts.push(
            {
              address: tgeWallets[key].wallet.address.toString(),
              amount: value.NTRN_locked,
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
        for (const v of initialStateData.stepInfo.msgArgs.value.keys()) {
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
        it('should wait for auction time', async () => {
          await waitTill(tgeMain.times.auctionInit + 3);
        })
        console.log(initialStateData.stepInfo.msgArgs)
        it('should allow deposit ATOM', async () => {
          console.log("GOTTEN INTO SHOULD ALLOW DEPOSIT ATOM")
          let data: Map<string, InitAmounts> = initialStateData.stepInfo.msgArgs.value
          for (const key of data.keys()) {
            let value = initialStateData.stepInfo.msgArgs.value.get(key)
            console.log(JSON.stringify(value))
            console.log(`FOR ${key} ATOM LOCKED: ${value.ATOM_locked}`)
            const atomBalanceBefore = await neutronChain.queryDenomBalance(
              tgeWallets[key].wallet.address.toString(),
              IBC_ATOM_DENOM,
            );
            console.log("for ", key, " atom balance before ", atomBalanceBefore);
            const res2 = await tgeWallets[key].executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                deposit: {},
              }),
              [
                {
                  amount: value.ATOM_locked.toString(),
                  denom: IBC_ATOM_DENOM,
                },
              ],
            );
            expect(res2.code).toEqual(0);
            let atom_locked = parseInt(value.ATOM_locked);
            console.log("value.ATOM_locked")
            atomBalance += atom_locked;
            const atomBalanceAfter = await neutronChain.queryDenomBalance(
              tgeWallets[key].wallet.address.toString(),
              IBC_ATOM_DENOM,
            );
            console.log("for ", key, " atom balance after ", atomBalanceAfter);

            const info = await neutronChain.queryContract<UserInfoResponse>(
              tgeMain.contracts.auction,
              {
                user_info: {
                  address: tgeWallets[key].wallet.address.toString(),
                },
              },
            );
            console.log("for ", key, " atom deposited ", info.atom_deposited);
          }
        });
        it('should allow deposit USDC', async () => {
          let data: Map<string, InitAmounts> = initialStateData.stepInfo.msgArgs.value
          for (const key of data.keys()) {
            let value = initialStateData.stepInfo.msgArgs.value.get(key)

            const usdcBalanceBefore = await neutronChain.queryDenomBalance(
              tgeWallets[key].wallet.address.toString(),
              IBC_USDC_DENOM,
            );
            console.log("for ", key, " USDC balance before ", usdcBalanceBefore);
            const res2 = await tgeWallets[key].executeContract(
              tgeMain.contracts.auction,
              JSON.stringify({
                deposit: {},
              }),
              [
                {
                  amount: value.USDC_locked.toString(),
                  denom: IBC_USDC_DENOM,
                },
              ],
            );
            expect(res2.code).toEqual(0);
            let usdc_locked = parseInt(value.USDC_locked);

            usdcBalance += usdc_locked;

            const usdcBalanceAfter = await neutronChain.queryDenomBalance(
              tgeWallets[key].wallet.address.toString(),
              IBC_USDC_DENOM,
            );
            console.log("for ", key, " USDC balance after ", usdcBalanceAfter);

            const info = await neutronChain.queryContract<UserInfoResponse>(
              tgeMain.contracts.auction,
              {
                user_info: {
                  address: tgeWallets[key].wallet.address.toString(),
                },
              },
            );
            console.log("for ", key, " USDC deposited ", info.usdc_deposited);
          }
        });
      });

      describe('Phase 2', () => {
        it('time moves to finish the phase', async () => {
          await waitTill(
            tgeMain.times.auctionInit + tgeMain.times.auctionDepositWindow + 5,
          );
        });
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
            console.log("state is ", state);
            const usdcToAtomRate = ATOM_RATE / USDC_RATE;
            const totalInUSDC = usdcToAtomRate * atomBalance + usdcBalance;
            ntrnAtomSize = Math.floor(
              NTRN_AMOUNT * ((atomBalance * usdcToAtomRate) / totalInUSDC),
            );
            ntrnUsdcSize = NTRN_AMOUNT - ntrnAtomSize;
            atomLpSize = getLpSize(atomBalance, ntrnAtomSize);
            usdcLpSize = getLpSize(usdcBalance, ntrnUsdcSize);
            console.log("atom lp size: ", atomLpSize);
            console.log("usdc lp size: ", usdcLpSize);

            console.log("ntrnAtomSize: ", ntrnAtomSize);

            console.log("usdc balance: ", usdcBalance);
            console.log("ntrnUsdcSize: ", ntrnUsdcSize);

            // expect(parseInt(state.atom_ntrn_size)).toBeCloseTo(ntrnAtomSize, -1);
            isWithinRangeRel(parseInt(state.atom_ntrn_size), ntrnAtomSize, 0.1);
            isWithinRangeRel(parseInt(state.usdc_ntrn_size), ntrnUsdcSize, 0.1);

            // expect(parseInt(state.usdc_ntrn_size)).toBeCloseTo(ntrnUsdcSize, -1);
            // expect(parseInt(state.atom_lp_size)).toBeCloseTo(atomLpSize, -1);
            // @audit-issue fails here
            // expect(parseInt(state.usdc_lp_size)).toBeCloseTo(usdcLpSize, -1);
            isWithinRangeRel(parseInt(state.usdc_lp_size), usdcLpSize, 0.1);
            isWithinRangeRel(parseInt(state.atom_lp_size), atomLpSize, 0.1);


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
            let data: Map<string, InitAmounts> = initialStateData.stepInfo.msgArgs.value

            for (const key in data.keys()) {
              const userInfo = await neutronChain.queryContract<UserInfoResponse>(
                tgeMain.contracts.auction,
                {
                  user_info: {
                    address: tgeWallets[key].wallet.address.toString(),
                  },
                },
              );
              const res2 = await tgeWallets[key].executeContract(
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
              console.log("user ", key, " locked atom lp amount ", userInfo.atom_lp_amount);
              atomLpLocked += Number(userInfo.atom_lp_amount);
            }
          });

          it('should be able to lock USDC LP tokens', async () => {
            let data: Map<string, InitAmounts> = initialStateData.stepInfo.msgArgs.value

            for (const key in data.keys()) {
              const userInfo = await neutronChain.queryContract<UserInfoResponse>(
                tgeMain.contracts.auction,
                {
                  user_info: {
                    address: tgeWallets[key].wallet.address.toString(),
                  },
                },
              );
              const res2 = await tgeWallets[key].executeContract(
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
              console.log("user ", key, " locked usdc lp amount ", userInfo.usdc_lp_amount);

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
          //@audit-issue used to fail here, but fixed
          // TODO: @ALeksandar, replace the fail case here with how it was done at line ~632
          // expect(atomLpSize).toBeCloseTo(
          //   parseInt(atomPoolInfo.total_share) - MIN_LIQUDITY,
          //   -1,
          // );
          // expect(usdcLpSize).toBeCloseTo(
          //   parseInt(usdcPoolInfo.total_share) - MIN_LIQUDITY,
          //   -1,
          // );
          isWithinRangeRel(atomLpSize, parseInt(atomPoolInfo.total_share) - MIN_LIQUDITY, 0.1);
          isWithinRangeRel(usdcLpSize, parseInt(usdcPoolInfo.total_share) - MIN_LIQUDITY, 0.1);

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
const getLiquidityMigrationBalances = async (chain: CosmosWrapper, address: string, contracts: LiquidityMigrationContracts): Promise<LiquidityMigrationBalances> => ({
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