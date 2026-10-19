/**
 * RARE ARCADE — smart contract registry & runtime mode switch.
 *
 * SETTLEMENT IS SINGLE-CHAIN (Robinhood, 4663). Prize NFTs are only fundable on
 * that chain (enforced in `domain/settlement.ts`), so `PrizePool.fundNftPrize`
 * and `MachineRegistry` take one chain and there is no per-chain escrow branch.
 *
 * ============================================================================
 *  >>> CONTRACT ADDRESSES ARE NOT SET YET. EVERY `TODO_ADDRESS` MUST BE FILLED
 *  >>> IN BEFORE FLIPPING `RARE_ARCADE_MODE` TO 'live'.
 * ============================================================================
 *
 * Everything in `src/domain/**` is pure, deterministic math. That math is the
 * SPECIFICATION the on-chain contracts must reproduce exactly — it does not
 * change when you go live, only who executes it and where funds sit.
 *
 *   DEMO (today) : pulls settle in localStorage. No signatures, no custody.
 *   LIVE         : pulls settle in USDG on Robinhood Chain via the contracts
 *                  below. Balances become `balanceOf` reads; pulls become
 *                  transactions; the fee split is enforced by the router.
 *
 * The fee economics in `domain/fees.ts` is the single source of truth for the
 * 5% / 75% / 25% split. The contracts MUST match it, and `assertFeeConfig`
 * below is a cheap guard against the two drifting apart at config time.
 */

import {
  PLATFORM_FEE_BPS,
  FEE_PRIMARY_SHARE_BPS,
  FEE_BUYBACK_SHARE_BPS,
  PLATFORM_PRIMARY_WALLET,
  RF_BURN_SINK,
} from '../domain/fees.ts';
import { SETTLEMENT_CHAIN_ID, SETTLEMENT_CHAIN_SLUG } from '../nfts/chains.ts';

export type RuntimeMode = 'demo' | 'live';

/**
 * Runtime mode. Flip to 'live' only after every contract address below is set
 * AND the deployed contracts have been verified against domain/fees.ts.
 */
export const RARE_ARCADE_MODE: RuntimeMode = 'demo';

export function isLiveMode(): boolean {
  return RARE_ARCADE_MODE === 'live';
}

/** Chain the platform settles on. Re-exported for the contract surface. */
export { SETTLEMENT_CHAIN_ID, SETTLEMENT_CHAIN_SLUG };
export const SETTLEMENT_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
export const USDG_OPENSEA_URL =
  'https://opensea.io/token/usdg?toChain=robinhood&toAddress=0x5fc5360d0400a0fd4f2af552add042d716f1d168';

/** Sentinel for an address that has not been configured yet. */
export const TODO_ADDRESS = '0xTODO';

export type ContractRole =
  | 'usdg'
  | 'arcadeVault'
  | 'machineRegistry'
  | 'prizePool'
  | 'feeRouter'
  | 'rfCashback'
  | 'rfPriceOracle'
  | 'vrfCoordinator';

export interface ContractDescriptor {
  role: ContractRole;
  /** Human label shown in the UI and in diagnostics. */
  label: string;
  address: string;
  /** False until a real address is pasted in. Gates live mode. */
  configured: boolean;
  /** Functions this app expects the contract to expose (live mode only). */
  requiredFunctions: readonly string[];
  notes: string;
}

/**
 * The contract surface Rare Arcade needs. Addresses are intentionally left as
 * TODO_ADDRESS so live mode cannot be enabled against a half-configured deploy.
 */
export const CONTRACTS: Record<ContractRole, ContractDescriptor> = {
  usdg: {
    role: 'usdg',
    label: 'USDG (Global Dollar)',
    // Already deployed and verified — not a TODO. Global Dollar, Paxos-issued,
    // redeemable 1:1 for USD. 6 decimals, confirmed via eth_call decimals().
    address: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
    configured: true,
    requiredFunctions: ['decimals()', 'balanceOf(address)', 'approve(address,uint256)', 'transfer(address,uint256)'],
    notes:
      'The play currency. Standard ERC-20. 6 decimals. Pegged 1:1 to USD, which is why NFT top bids convert to prize value with no price feed.',
  },
  arcadeVault: {
    role: 'arcadeVault',
    label: 'Arcade Vault (escrow)',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: [
      'deposit(uint256)',
      'withdraw(uint256)',
      'balanceOf(address)',
      'lockedPrizeBalance(address,uint256)',
    ],
    notes:
      'Holds player USDG between pulls and creator USDG cashback prize inventory while it is escrowed into a live machine. Must enforce: a pull can only spend escrow the player has actually funded.',
  },
  machineRegistry: {
    role: 'machineRegistry',
    label: 'Machine Registry',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: [
      'createMachine(bytes)',
      'lockRules(uint256)',
      'pull(uint256)',
      'machineState(uint256)',
    ],
    notes:
      'One entry per machine. Stores pull price, locked rules, ticket deck seed or fixed-odds table, and the fee/prize config. Rules lock on the first pull and can never change afterwards.',
  },
  prizePool: {
    role: 'prizePool',
    label: 'Prize Pool',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: [
      'fundUsdgPrize(uint256,uint256)',
      'fundRfPrize(uint256,uint256,uint256)',
      'fundNftPrize(uint256,address,uint256)',
      'claim(uint256,uint256)',
    ],
    notes:
      'Escrows the prize side of a machine: USDG cashback, $RAREFRIENDS cashback (funded by the RF token below), and NFTs verified by on-chain ownerOf. Pays out exactly what a winning roll selects. Robinhood-only: every NFT prize is (4663, contract, tokenId) — no per-chain branching.',
  },
  feeRouter: {
    role: 'feeRouter',
    label: 'Platform Fee Router',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: [
      'PLATFORM_FEE_BPS()',
      'primaryRecipient()',
      'burnSink()',
      'splitFee(uint256)',
      'pendingBuyback()',
      'executeBuyback(address)',
    ],
    notes:
      `Enforces the 5% platform fee per pull: 75% to ${PLATFORM_PRIMARY_WALLET}, and 25% accrued as USDG into a buyback pot. The pot is batched — swapped USDG->RF on an RHC AMM and the RF sent to ${RF_BURN_SINK}. It must NEVER forward the 25% share to a treasury wallet.`,
  },
  rfCashback: {
    role: 'rfCashback',
    label: '$RAREFRIENDS Token',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: ['decimals()', 'balanceOf(address)', 'approve(address,uint256)', 'transfer(address,uint256)'],
    notes:
      'ERC-20 for $RAREFRIENDS. Only needed if RF cashback prizes stay enabled. RF is never spendable on a pull — it is prize-only.',
  },
  rfPriceOracle: {
    role: 'rfPriceOracle',
    label: 'RF → USDG Price Oracle',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: ['latestAnswer()', 'decimals()'],
    notes:
      'Supplies the RF/USDG rate used ONCE at seed time to lock an RF cashback prize\'s USDG value. A published machine must never be revalued by a later oracle answer, so this is read at funding time and stored immutably.',
  },
  vrfCoordinator: {
    role: 'vrfCoordinator',
    label: 'VRF Coordinator',
    address: TODO_ADDRESS,
    configured: false,
    requiredFunctions: ['requestRandomWords(...)'],
    notes:
      'Source of provably-fair randomness for pulls. Replaces the in-browser RNG so a player cannot predict or replay outcomes. Strongly recommended before mainnet.',
  },
};

export function contractByRole(role: ContractRole): ContractDescriptor {
  return CONTRACTS[role];
}

/** True when every contract required for a live pull is configured. */
export function isLiveReady(): boolean {
  return Object.values(CONTRACTS)
    .filter((c) => c.role !== 'rfCashback' && c.role !== 'rfPriceOracle')
    .every((c) => c.configured && c.address !== TODO_ADDRESS);
}

/** Roles still missing an address — surfaced in the UI's diagnostics panel. */
export function unconfiguredRoles(): ContractRole[] {
  return Object.values(CONTRACTS)
    .filter((c) => !c.configured || c.address === TODO_ADDRESS)
    .map((c) => c.role);
}

/**
 * Guard against the in-app fee config and the intended on-chain fee config
 * drifting apart. Runs in both modes so the demo numbers stay trustworthy as
 * the contract spec.
 */
export function assertFeeConfig(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const router = CONTRACTS.feeRouter;

  if (Number(PLATFORM_FEE_BPS) + 9500 !== 10000) {
    problems.push('Platform fee must leave exactly 95% for creator receipts.');
  }
  if (Number(FEE_PRIMARY_SHARE_BPS) + Number(FEE_BUYBACK_SHARE_BPS) !== 10000) {
    problems.push('Fee shares must sum to 100% of the platform fee.');
  }
  if (router.configured && router.address !== TODO_ADDRESS) {
    problems.push(
      'Fee router address is set — verify on-chain PLATFORM_FEE_BPS() === 500, primaryRecipient() === ' +
        PLATFORM_PRIMARY_WALLET +
        ', burnSink() === ' +
        RF_BURN_SINK +
        ', and that the 25% share is swapped to RF and burned — never forwarded to a treasury — before enabling live mode.'
    );
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Human-readable readiness report for the operator. Rendered in the app so the
 * remaining work to go live is never hidden behind a flag.
 */
export interface LiveReadinessReport {
  mode: RuntimeMode;
  liveReady: boolean;
  missing: ContractRole[];
  feeConfigOk: boolean;
  feeProblems: string[];
  blocking: string[];
}

export function liveReadinessReport(): LiveReadinessReport {
  const fee = assertFeeConfig();
  const missing = unconfiguredRoles();
  const blocking: string[] = [];

  if (!isLiveReady()) {
    blocking.push(
      `${missing.length} contract address(es) still TODO — the app cannot settle real USDG yet.`
    );
  }
  if (!fee.ok) {
    blocking.push(...fee.problems);
  }
  if (RARE_ARCADE_MODE === 'live' && !isLiveReady()) {
    blocking.push(
      'RARE_ARCADE_MODE is "live" but the contract registry is incomplete. Refusing to pretend funds are live.'
    );
  }

  return {
    mode: RARE_ARCADE_MODE,
    liveReady: isLiveReady(),
    missing,
    feeConfigOk: fee.ok,
    feeProblems: fee.problems,
    blocking,
  };
}