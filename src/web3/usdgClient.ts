/**
 * ERC-20 + raw JSON-RPC helpers for USDG reads on Robinhood Chain.
 *
 * Read-only and dependency-free: raw eth_call against the public RPC through
 * the injected EIP-1193 provider (or the RPC URL directly). Write methods are
 * declared in contracts.types.ts and intentionally NOT implemented here — they
 * belong behind a real signing path, not in a demo-to-live flag flip.
 */

import { CONTRACTS, SETTLEMENT_RPC_URL } from './contracts.ts';
import type { Eip1193Provider, UsdgToken } from './contracts.types.ts';

const USDG_ADDRESS = CONTRACTS.usdg.address;

/** 4-byte selectors for the ERC-20 reads we need. */
const SELECTORS = {
  decimals: '0x313ce567',
  balanceOf: '0x70a08231',
  allowance: '0xdd62ed3e',
} as const;

function padAddress(address: string): string {
  const clean = address.replace(/^0x/, '').toLowerCase();
  if (clean.length !== 40) {
    throw new Error(`Invalid EVM address: "${address}"`);
  }
  return clean.padStart(64, '0');
}

function padUint(value: bigint): string {
  if (value < 0n) throw new RangeError(`uint cannot be negative: ${value}`);
  return value.toString(16).padStart(64, '0');
}

async function ethCall(
  provider: Eip1193Provider | null,
  to: string,
  data: string
): Promise<string> {
  const params = { to, data };
  if (provider) {
    const raw = (await provider.request({
      method: 'eth_call',
      params: [params, 'latest'],
    })) as string;
    return raw;
  }
  const res = await fetch(SETTLEMENT_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [params, 'latest'] }),
  });
  if (!res.ok) throw new Error(`USDG read failed: RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error?.message) throw new Error(`USDG read failed: ${json.error.message}`);
  if (!json.result) throw new Error('USDG read failed: empty RPC result');
  return json.result;
}

/** Decode a 32-byte hex word to bigint. */
function decodeUint(hex: string): bigint {
  const clean = hex.replace(/^0x/, '');
  if (clean.length === 0) return 0n;
  return BigInt(clean);
}

/**
 * Build a read-only USDG client.
 *
 * `provider` should be the wallet's injected provider so reads reflect the
 * connected account. Passing `null` falls back to the public RPC, which is fine
 * for any address.
 */
export function createUsdgReader(provider: Eip1193Provider | null = null): UsdgToken {
  const address = USDG_ADDRESS;

  return {
    decimals: 6,
    scale: 1_000_000n,
    address,

    async balanceOf(account: string): Promise<bigint> {
      const raw = await ethCall(provider, address, SELECTORS.balanceOf + padAddress(account));
      return decodeUint(raw);
    },

    async allowance(owner: string, spender: string): Promise<bigint> {
      const raw = await ethCall(
        provider,
        address,
        SELECTORS.allowance + padAddress(owner) + padAddress(spender)
      );
      return decodeUint(raw);
    },

    // Write methods intentionally omitted — see module header.
    async approve(): Promise<never> {
      throw new Error(
        'USDG approvals are not implemented in this build. Live settlement requires a deployed Arcade Vault to approve.'
      );
    },

    async transfer(): Promise<never> {
      throw new Error(
        'Direct USDG transfers are not implemented in this build. Use the Arcade Vault so escrow is auditable.'
      );
    },
  };
}

/** Confirm the connected wallet is on the settlement chain before any live action. */
export async function assertSettlementChain(provider: Eip1193Provider): Promise<void> {
  const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
  const chainId = Number.parseInt(chainHex, 16);
  if (chainId !== 4663) {
    throw new Error(
      `Wrong network: expected Robinhood Chain (4663), wallet is on ${chainId}. Switch networks to play.`
    );
  }
}

export { padAddress, padUint, decodeUint };