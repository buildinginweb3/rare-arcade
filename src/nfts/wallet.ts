/**
 * Minimal EIP-1193 wallet connection (read-only usage).
 * No transactions, no signatures — the address is only used for NFT
 * ownership discovery + on-chain ownerOf comparison.
 * No new dependencies: talks to window.ethereum directly.
 */

import { normalizeAddress } from './collections.ts';

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum?.request;
}

/** Prompt connection and return the normalized address. Read-only. */
export async function connectWallet(): Promise<string> {
  if (!hasInjectedWallet()) {
    throw new Error(
      'No wallet detected. Install a Robinhood-Chain-compatible wallet, then retry.'
    );
  }
  const accounts = (await window.ethereum!.request({
    method: 'eth_requestAccounts',
  })) as string[] | null;
  const first = Array.isArray(accounts) ? accounts[0] : '';
  const normalized = normalizeAddress(first);
  if (!normalized) throw new Error('Wallet returned no usable address.');
  return normalized;
}

/** Subscribe to account changes. Returns an unsubscribe function. */
export function onAccountsChanged(
  listener: (address: string | null) => void
): () => void {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
  if (!eth?.on) return () => undefined;
  const wrapped = (accounts: unknown) => {
    const list = accounts as string[] | null;
    listener(list && list[0] ? normalizeAddress(list[0]) || null : null);
  };
  eth.on('accountsChanged', wrapped as (...args: unknown[]) => void);
  return () => {
    eth.removeListener?.('accountsChanged', wrapped as (...args: unknown[]) => void);
  };
}
