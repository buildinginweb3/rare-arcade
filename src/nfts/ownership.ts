/**
 * Ownership + demo-reservation helpers (pure, unit-tested).
 * OpenSea = discovery/media. Fresh on-chain ownerOf = final truth.
 * Funding stays SIMULATED — verification never moves assets.
 */

import { normalizeAddress, nftReservationKey } from './collections.ts';
import type { NftAsset } from './types.ts';
import type { Machine } from '../domain/types.ts';

/** Canonical reservation key for an asset (numeric legacy + slug-aware). */
export function assetReservationKey(asset: {
  chainId?: number;
  chain?: string;
  contract: string;
  tokenId: string;
}): string {
  if (typeof asset.chainId === 'number') {
    return nftReservationKey(asset.chainId, asset.contract, asset.tokenId);
  }
  const chain = (asset.chain ?? 'unknown').toLowerCase();
  return `${chain}:${asset.contract.trim().toLowerCase()}:${String(asset.tokenId)}`;
}

/** Slug-aware reservation key for generic assets. */
export function nftAssetReservationKey(asset: Pick<NftAsset, 'chain' | 'contract' | 'tokenId'>): string {
  return `${asset.chain.toLowerCase()}:${asset.contract.trim().toLowerCase()}:${String(asset.tokenId)}`;
}

/**
 * Collect reservation keys of NFTs funded into LIVE/READY (non-sold-out,
 * non-cancelled) local machines. Drafts reserve too when includeDrafts.
 */
export function collectReservedNftKeys(
  machines: readonly Machine[],
  opts: { includeDrafts?: boolean } = {}
): Set<string> {
  const reserved = new Set<string>();
  for (const m of machines) {
    if (m.status === 'CANCELLED' || m.status === 'SOLD_OUT') continue;
    if (m.status === 'DRAFT' && !opts.includeDrafts) continue;
    const entries = [...m.initialPrizes, ...m.remainingPrizes];
    for (const e of entries) {
      if (e.type !== 'FRIEND_PRIZE') continue;
      if (!e.chainId || !e.contractAddress) continue;
      // Only genuinely funded real NFTs reserve. System-demo fixtures are
      // display-only public references (no escrow claim) and never block.
      if (e.origin !== 'real-nft') continue;
      reserved.add(
        nftReservationKey(e.chainId, e.contractAddress, e.tokenId.toString())
      );
    }
  }
  return reserved;
}

/** True when the asset is already funded into another active local machine. */
export function isAssetReserved(
  asset: { chainId?: number; chain?: string; contract: string; tokenId: string },
  reserved: Set<string>
): boolean {
  if (reserved.has(assetReservationKey(asset))) return true;
  // Also match the slug-aware form for generic chains.
  if (asset.chain) {
    const slugKey = `${asset.chain.toLowerCase()}:${asset.contract.trim().toLowerCase()}:${String(asset.tokenId)}`;
    if (reserved.has(slugKey)) return true;
  }
  return false;
}

/**
 * Wallet-change guard: a selected asset is only still selectable when its
 * reported owner matches the currently connected wallet.
 */
export function isSelectionValidForWallet(
  asset: NftAsset | null | undefined,
  connectedWallet: string | null | undefined
): boolean {
  if (!asset) return false;
  const wallet = normalizeAddress(connectedWallet);
  if (!wallet) return false;
  return normalizeAddress(asset.reportedOwner) === wallet;
}

/**
 * Decide whether funding may proceed. Pure gate used by UI + tests:
 * - asset must exist and have a valid token id
 * - onChainOwner must be freshly read and match BOTH the connected wallet
 *   and the asset's reported owner (trust chain over OpenSea on mismatch)
 */
export function canFundAsset(opts: {
  asset: NftAsset | null | undefined;
  connectedWallet: string | null | undefined;
  onChainOwner: string | null | undefined;
  rpcFailed: boolean;
  reserved: Set<string>;
}): { ok: boolean; reason: string } {
  const { asset, connectedWallet, onChainOwner, rpcFailed, reserved } = opts;
  if (!asset) return { ok: false, reason: 'No NFT selected.' };
  const wallet = normalizeAddress(connectedWallet);
  if (!wallet) return { ok: false, reason: 'Connect a wallet first.' };
  if (normalizeAddress(asset.reportedOwner) !== wallet) {
    return {
      ok: false,
      reason: 'REVERIFY OWNER — this NFT was discovered under a different wallet.',
    };
  }
  if (rpcFailed || !onChainOwner) {
    return {
      ok: false,
      reason: 'OWNERSHIP COULD NOT BE VERIFIED — on-chain read failed. Refresh and retry.',
    };
  }
  if (normalizeAddress(onChainOwner) !== wallet) {
    return {
      ok: false,
      reason: 'OWNERSHIP CHANGED — you no longer hold this Rare Friend on-chain.',
    };
  }
  if (isAssetReserved(asset, reserved)) {
    return {
      ok: false,
      reason: 'Already funded into another LIVE local machine (demo reservation).',
    };
  }
  return { ok: true, reason: '' };
}

/* ==========================================================================
   Operator identity matching (dashboard sync, cancel rights, receipt credit)
   ========================================================================== */

/**
 * Lenient identity normalization for operator matching. Unlike the strict
 * hex validator, this keeps demo ids like '0xDemoCreator4663' usable —
 * comparison is what matters, not chain validity.
 */
export function normalizeIdentity(address: string | null | undefined): string {
  return (address ?? '').trim().toLowerCase();
}

/** Build the deduped operator identity set: demo id + connected wallet. */
export function buildOperatorAddresses(
  ...addresses: (string | null | undefined)[]
): string[] {
  return Array.from(
    new Set(addresses.map(normalizeIdentity).filter((a) => a.length > 0))
  );
}

/** True when a machine's creator is one of the operator's identities. */
export function isOperatorMachine(
  machineCreatorAddress: string,
  operatorAddresses: readonly string[]
): boolean {
  return operatorAddresses.includes(normalizeIdentity(machineCreatorAddress));
}

/** Filter to the machines created by this operator (dashboard sync). */
export function selectOperatorMachines<T extends { creatorAddress: string }>(
  machines: readonly T[],
  operatorAddresses: readonly string[]
): T[] {
  return machines.filter((m) => isOperatorMachine(m.creatorAddress, operatorAddresses));
}
