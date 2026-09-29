/**
 * Frontend client for Rare Friends NFT discovery + ownership verification.
 *
 * DIRECT CLIENT MODE (user-supplied burner key): the browser calls the
 * OpenSea API v2 and the public Robinhood RPC directly — no server proxy.
 *
 * WARNING: OPENSEA_API_KEY below ships inside the built JS bundle and is
 * visible to anyone who opens devtools. This is a throwaway burner key.
 * If pulls start failing with 401/429, rotate it at
 * https://opensea.io/settings/developer and replace the constant.
 *
 * Mock mode (tests / offline demo): set VITE_MOCK_NFTS=1 to serve
 * deterministic fixtures instead of hitting live endpoints.
 */

import { normalizeAddress, matchAllowedCollection } from './collections.ts';
import { normalizeInventoryPage, normalizeTokenId } from './normalize.ts';
import { MOCK_ASSETS } from './mockAssets.ts';
import { BUNDLED_DEMO_KEY } from './apiKey.ts';
import type { RareFriendAsset } from './types.ts';

const OPENSEA_API_KEY = BUNDLED_DEMO_KEY;
const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const OPENSEA_CHAIN = 'robinhood';
const ROBINHOOD_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const OWNER_OF_SELECTOR = '0x6352211e';
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

function mockMode(): boolean {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_MOCK_NFTS === '1';
  } catch {
    return false;
  }
}

export interface InventoryResponse {
  assets: RareFriendAsset[];
  next: string | null;
  truncated: boolean;
  cached?: boolean;
}

export interface VerifyResponse {
  owner: string;
  verifiedAt: number;
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  if (res.status === 401 || res.status === 403) {
    return new Error('NFT API key rejected (401/403). Rotate the burner key and rebuild.');
  }
  if (res.status === 429) {
    return new Error('OpenSea rate limit reached. Wait a minute and retry.');
  }
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return new Error(data.error || data.detail || `${fallback} (HTTP ${res.status})`);
  } catch {
    return new Error(`${fallback} (HTTP ${res.status})`);
  }
}

/** Fetch wallet-owned eligible NFTs straight from OpenSea (or mocks). */
export async function fetchOwnedRareFriends(address: string): Promise<InventoryResponse> {
  const wallet = normalizeAddress(address);
  if (!wallet) throw new Error('Invalid wallet address.');
  if (mockMode()) {
    return {
      assets: MOCK_ASSETS.map((a) => ({ ...a, reportedOwner: wallet })),
      next: null,
      truncated: false,
      cached: false,
    };
  }
  const seen = new Set<string>();
  const assets: RareFriendAsset[] = [];
  let cursor: string | null = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) params.set('next', cursor);
    const res = await fetch(
      `${OPENSEA_BASE}/chain/${OPENSEA_CHAIN}/account/${wallet}/nfts?${params}`,
      { headers: { 'X-API-KEY': OPENSEA_API_KEY, Accept: 'application/json' } }
    );
    if (!res.ok) throw await parseError(res, 'RARE FRIENDS COULDN’T BE LOADED');
    const data = (await res.json()) as { nfts?: unknown[]; next?: string | null };
    for (const asset of normalizeInventoryPage(data.nfts, wallet)) {
      const key = `${asset.chainId}:${asset.contract.toLowerCase()}:${asset.tokenId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      assets.push(asset);
    }
    cursor = typeof data.next === 'string' && data.next ? data.next : null;
    if (!cursor) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { assets, next: cursor, truncated, cached: false };
}

function tokenIdToPaddedHex(tokenId: string): string | null {
  try {
    const v = BigInt(tokenId);
    if (v < 0n) return null;
    return v.toString(16).padStart(64, '0');
  } catch {
    return null;
  }
}

/** Fresh on-chain ownerOf read straight from the public Robinhood RPC (or mock echo). */
export async function verifyNftOwnerRemote(
  contract: string,
  tokenId: string
): Promise<VerifyResponse> {  if (mockMode()) {
    // In mock mode the "chain" echoes the reported owner: tests override via
    // page.route interception for mismatch cases.
    const asset = MOCK_ASSETS.find(
      (a) => a.contract.toLowerCase() === contract.toLowerCase() && a.tokenId === tokenId
    );
    return { owner: asset?.reportedOwner ?? '', verifiedAt: Date.now() };
  }
  if (!matchAllowedCollection(contract)) {
    throw new Error('Contract is not an eligible Rare Friends collection.');
  }
  const canonicalId = normalizeTokenId(tokenId);
  const padded = canonicalId ? tokenIdToPaddedHex(canonicalId) : null;
  if (!canonicalId || !padded) throw new Error('Invalid token ID.');
  let res: Response;
  try {
    res = await fetch(ROBINHOOD_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: contract.trim(), data: OWNER_OF_SELECTOR + padded }, 'latest'],
      }),
    });
  } catch {
    throw new Error('OWNERSHIP COULD NOT BE VERIFIED — RPC unreachable. Retry shortly.');
  }
  if (!res.ok) throw new Error(`OWNERSHIP COULD NOT BE VERIFIED — RPC HTTP ${res.status}.`);
  const data = (await res.json()) as { result?: string; error?: { message?: string } };
  if (data.error || typeof data.result !== 'string' || data.result.length < 66) {
    throw new Error('OWNERSHIP COULD NOT BE VERIFIED — on-chain read returned no owner.');
  }
  const owner = `0x${data.result.slice(-40)}`.toLowerCase();
  if (!normalizeAddress(owner)) {
    throw new Error('OWNERSHIP COULD NOT BE VERIFIED — malformed owner.');
  }
  return { owner, verifiedAt: Date.now() };
}

export type VerificationSource = 'onchain' | 'opensea' | 'mock';

export interface GenericVerifyResult extends VerifyResponse {
  source: VerificationSource;
}

/**
 * Generic ownership re-verification at publish time.
 * - Rare Friends on Robinhood: fresh on-chain ownerOf (source 'onchain').
 * - All other chains/contracts: fresh OpenSea ownership query via
 *   GET /chain/{chain}/contract/{address}/nfts/{id} owners[] (source 'opensea').
 * Never fakes ONCHAIN VERIFIED when the source was OpenSea.
 */
export async function verifyNftOwnerGeneric(opts: {
  chain: string;
  contract: string;
  tokenId: string;
  wallet: string;
  tokenStandard?: string;
}): Promise<GenericVerifyResult> {
  const walletNorm = normalizeAddress(opts.wallet);
  if (!walletNorm) throw new Error('Connect a wallet first.');
  if (mockMode()) {
    return { owner: walletNorm, verifiedAt: Date.now(), source: 'mock' };
  }
  const isRare = !!matchAllowedCollection(opts.contract);
  if (isRare && opts.chain.toLowerCase() === 'robinhood') {
    const { owner, verifiedAt } = await verifyNftOwnerRemote(opts.contract, opts.tokenId);
    return { owner, verifiedAt, source: 'onchain' };
  }
  // OpenSea ownership re-query (read-only, no signatures).
  const res = await fetch(
    `${OPENSEA_BASE}/chain/${opts.chain}/contract/${opts.contract}/nfts/${opts.tokenId}`,
    { headers: { 'X-API-KEY': OPENSEA_API_KEY, Accept: 'application/json' } }
  );
  if (!res.ok) throw await parseError(res, 'OWNERSHIP COULD NOT BE VERIFIED');
  const data = (await res.json()) as {
    nft?: { owners?: { address?: string; quantity?: number }[]; token_standard?: string };
  };
  const owners = Array.isArray(data.nft?.owners) ? data.nft!.owners! : [];
  const match = owners.find(
    (o) =>
      typeof o.address === 'string' &&
      o.address.toLowerCase() === walletNorm &&
      (o.quantity ?? 1) > 0
  );
  if (!match) {
    throw new Error('OWNERSHIP CHANGED — you no longer hold this NFT.');
  }
  return { owner: walletNorm, verifiedAt: Date.now(), source: 'opensea' };
}
