/**
 * Settlement chain registry — RARE ARCADE is Robinhood Chain only.
 *
 * Rare Arcade was originally cross-chain: it scanned a wallet across up to
 * six EVM chains and verified non-Robinhood ownership through OpenSea. That is
 * gone, deliberately:
 *
 *   1. One settlement chain means one escrow contract, one fee router, one
 *      VRF subscription, and one source of on-chain truth. Multi-chain support
 *      would multiply the contract surface and the failure modes.
 *   2. Ownership now resolves through a single on-chain `ownerOf` read against
 *      the Robinhood RPC for EVERY prize NFT, not just Rare Friends. Nothing
 *      depends on trusting an indexer's ownership response.
 *   3. Prize escrowing needs no per-chain branching — an NFT prize is always
 *      `chainId 4663 / contract / tokenId`.
 *
 * `NftAsset.chain` / `chainId` fields are retained on stored records so old rows
 * stay readable and the reservation keys stay stable, but every new asset is
 * Robinhood by construction.
 */

export interface ChainInfo {
  slug: string;
  name: string;
  chainId: number;
  nativeSymbol?: string;
}

/** The one chain Rare Arcade settles on. */
export const SETTLEMENT_CHAIN: ChainInfo = {
  slug: 'robinhood',
  name: 'Robinhood',
  chainId: 4663,
};

export const SETTLEMENT_CHAIN_SLUG = SETTLEMENT_CHAIN.slug;
export const SETTLEMENT_CHAIN_ID = SETTLEMENT_CHAIN.chainId;
export const SETTLEMENT_CHAIN_NAME = SETTLEMENT_CHAIN.name;

/**
 * The only chains whose NFTs can be funded into a machine. Single-entry by
 * design — see the module header.
 */
export const FUNDABLE_CHAIN_SLUGS: readonly string[] = [SETTLEMENT_CHAIN_SLUG];

/** Legacy alias. Kept so older imports keep compiling. */
export const ROBINHOOD_CHAIN_SLUG = SETTLEMENT_CHAIN_SLUG;
/** Legacy alias. */
export const ROBINHOOD_CHAIN_ID = SETTLEMENT_CHAIN_ID;

/** True when a chain slug may be funded into a machine. */
export function isFundableChain(slug: string | null | undefined): boolean {
  return FUNDABLE_CHAIN_SLUGS.includes((slug ?? '').trim().toLowerCase());
}

/** The chain scan used for wallet inventory discovery. */
export function defaultScanChains(): string[] {
  return [SETTLEMENT_CHAIN_SLUG];
}

/** Legacy ordering helper. Every fundable slug is the settlement chain. */
export function orderChainsForScan(slugs: string[]): string[] {
  return slugs.filter(isFundableChain);
}