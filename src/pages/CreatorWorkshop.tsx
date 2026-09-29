import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MachineShellId,
  MachineType,
  PrizeEntry,
  RareFriendMetadata,
  Machine,
  LedgerEvent,
  NftValuationSnapshot,
} from '../domain/types.ts';
import {
  parseRF,
  formatBps,
  formatRFGrouped,
} from '../domain/rf.ts';
import {
  calculateTotalPrizeValue,
  solveRecommendedPulls,
  calculateScenarios,
  DEFAULT_TARGET_RTP_BPS,
} from '../domain/economics.ts';
import {
  RTP_PRESET_BPS,
  parseRtpPercentToBps,
  classifyRtp,
} from '../domain/rtp.ts';
import {
  parseOddsPercentToPpm,
  formatOddsPpm,
  validateFixedOddsPrizes,
  calculateConfiguredRtpBps,
  calculateCreatorEdgeBps,
  suggestFixedOddsPpm,
  simulateFixedOddsLifetime,
  createFixedOddsMachine,
  MAX_TOTAL_ODDS_PPM,
} from '../domain/fixedOdds.ts';
import { RARE_ARCADE_DEMO_ECONOMY } from '../domain/demoEconomy.ts';
import { createMachine } from '../domain/machine.ts';
import { pullFxForShell } from '../components/machine/pullFx.ts';
import { PixelPullAnimation, type AnimatedShell } from '../components/machine/PixelPullAnimation.tsx';
import { useReducedMotion } from '../components/machine/pullStateMachine.ts';
import { RfTokenIcon } from '../components/ui/RfTokenIcon.tsx';
import { FixedOddsRiskModel } from '../components/machine/FixedOddsRiskModel.tsx';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { RareFriendImage } from '../nfts/RareFriendImage.tsx';
import { nftCardKey } from '../nfts/NftInventoryGrid.tsx';
import { NftPicker, nftPickerKey } from '../nfts/NftPicker.tsx';
import { usePricedInventory } from '../nfts/useOwnedNfts.ts';
import { verifyNftOwnerGeneric } from '../nfts/apiClient.ts';
import { connectWallet } from '../nfts/wallet.ts';
import { normalizeAddress, nftReservationKey } from '../nfts/collections.ts';
import { detectGenerationTrait, bidBadgeLabel } from '../nfts/normalize.ts';
import { buildNftPrizeEntry } from '../nfts/prizeEntry.ts';
import { getCollectionTopBid, getGenerationTopBid, getRareFriendsUsdPrice } from '../nfts/marketData.ts';
import { GENERATIONS_CONTRACT } from '../nfts/collections.ts';
import {
  convertUsdToRfUnits,
  formatUsdAdaptive,
  formatRfReferenceCompact,
  isFreshEnoughForPublish,
} from '../nfts/valuation.ts';
import type { NftAsset } from '../nfts/types.ts';
import { soundFx } from '../utils/audio.ts';

interface CreatorWorkshopProps {
  creatorAddress: string;
  creatorRfBalanceUnits: bigint;
  /** Connected wallet used for NFT ownership (null = not connected). */
  walletAddress: string | null;
  onConnectWallet: (address: string) => void;
  onDisconnectWallet: () => void;
  /** Reservation keys (chainId:contract:tokenId) funded into LIVE local machines. */
  reservedNftKeys: Set<string>;
  onPublishMachine: (
    machine: Machine,
    rfEscrow: bigint,
    friendsSeeded: RareFriendMetadata[],
    events: LedgerEvent[]
  ) => void;
  onCancel: () => void;
}

const SHELL_OPTIONS: { id: MachineShellId; label: string; desc: string }[] = [
  { id: 'CLASSIC', label: 'CLASSIC', desc: 'Standard retro arcade marquee with a wide prize hatch' },
  { id: 'CAPSULE', label: 'CAPSULE', desc: 'Rounded capsule machine with a clear prize chamber and mechanical hatch' },
  { id: 'TALLBOY', label: 'TALLBOY', desc: 'High-rise claw cabinet with a tall prize chamber and mechanical grabber' },
  { id: 'MINI', label: 'MINI', desc: 'Compact tabletop virtual-pet machine with tiny mechanical reels' },
];

function shellToAnimatedPreview(shellId: MachineShellId): AnimatedShell {
  switch (shellId) {
    case 'CAPSULE':
      return 'capsule';
    case 'TALLBOY':
      return 'tallboy';
    case 'MINI':
      return 'mini';
    case 'CLASSIC':
    default:
      return 'classic';
  }
}

/** Odds quick picks for Fixed Odds prize lines (suggestions, plus custom). */
const ODDS_QUICK_PICKS = ['0.10', '0.25', '0.50', '1', '2.5', '5', '10'];

const MACHINE_TYPE_OPTIONS: {
  id: MachineType;
  label: string;
  icon: 'deck' | 'dial';
  desc: string;
  bestFor: string[];
}[] = [
  {
    id: 'finite_deck',
    label: 'FINITE DECK',
    icon: 'deck',
    desc: 'Every pull removes a ticket. Odds evolve as inventory changes. Machine has a known maximum number of pulls.',
    bestFor: ['known supply', 'changing odds', 'finite campaign', 'guaranteed maximum pulls'],
  },
  {
    id: 'fixed_odds',
    label: 'FIXED ODDS',
    icon: 'dial',
    desc: 'Every pull uses the same configured odds. No play limit. Machine runs until all prizes are won.',
    bestFor: ['stable prize probabilities', 'open-ended machine', 'operator-style economics', 'run until prizes are won'],
  },
];

export const CreatorWorkshop: React.FC<CreatorWorkshopProps> = ({
  creatorAddress,
  creatorRfBalanceUnits,
  walletAddress,
  onConnectWallet,
  onDisconnectWallet,
  reservedNftKeys,
  onPublishMachine,
  onCancel,
}) => {
  // Step navigation: 1: Info/Shell, 2: Prizes, 3: Economics & Scenarios
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form state
  const [name, setName] = useState('FRIEND FRENZY');
  const [shellId, setShellId] = useState<MachineShellId>('CLASSIC');
  const [machineType, setMachineType] = useState<MachineType>('finite_deck');
  const [pullPriceStr, setPullPriceStr] = useState<string>(
    RARE_ARCADE_DEMO_ECONOMY.defaultPullPriceStr
  );

  // RTP: presets are suggestions; CUSTOM allows any positive finite %.
  const [rtpMode, setRtpMode] = useState<'preset' | 'custom'>('preset');
  const [targetRtpBps, setTargetRtpBps] = useState(DEFAULT_TARGET_RTP_BPS);
  const [customRtpStr, setCustomRtpStr] = useState('90');
  const [customPulls, setCustomPulls] = useState<number | null>(null);

  // Prize pool state
  const [prizes, setPrizes] = useState<PrizeEntry[]>([]);
  const [rfPrizeAmountStr, setRfPrizeAmountStr] = useState<string>(
    RARE_ARCADE_DEMO_ECONOMY.defaultRfPrizeStr
  );
  const [rfPrizeQty, setRfPrizeQty] = useState<number>(RARE_ARCADE_DEMO_ECONOMY.defaultRfPrizeQty);
  // Fixed-odds chance per pull for the RF add-form (percent string).
  const [rfOddsStr, setRfOddsStr] = useState<string>('1');

  // Fixed Odds step-3 state
  const [oddsMode, setOddsMode] = useState<'manual' | 'target'>('manual');
  const [assistTargetStr, setAssistTargetStr] = useState<string>('80');
  const [assistResult, setAssistResult] = useState<{
    achievedRtpBps: number;
    capped: boolean;
  } | null>(null);

  // Real-NFT drawer state (automatic market valuation — no manual RF input).
  // Multi-select: any number of owned NFTs can be staged, then confirmed in
  // one atomic batch (each becomes its OWN prize entry with the same odds).
  const [showFriendDrawer, setShowFriendDrawer] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<NftAsset[]>([]);
  const [verifiedKeys, setVerifiedKeys] = useState<Set<string>>(new Set());
  const [verifying, setVerifying] = useState(false);
  /** Scroll container of the NFT drawer (floating review button target). */
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);
  // Fixed-odds chance per pull for the NFT confirm panel (percent string).
  const [nftOddsStr, setNftOddsStr] = useState<string>('0.5');

  // Publish state
  const [publishing, setPublishing] = useState(false);

  // Error feedback
  const [errorMsg, setErrorMsg] = useState('');

  // PREVIEW FX: plays the real PixelPullAnimation once — spends nothing,
  // runs no RNG, mutates no state, consumes no inventory, records no ledger.
  const [previewShell, setPreviewShell] = useState<MachineShellId | null>(null);
  const [previewRunId, setPreviewRunId] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const previewReduced = useReducedMotion();

  const { fetchState, priced, reload, refreshPrices, verifyAsset } = usePricedInventory(walletAddress);
  const wallet = normalizeAddress(walletAddress ?? '');

  // Escape closes the NFT drawer.
  useEffect(() => {
    if (!showFriendDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFriendDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFriendDrawer]);

  // Drop the previous wallet's selection whenever the wallet changes.
  const activeWalletKey = wallet || 'none';
  const [seenWallet, setSeenWallet] = useState(activeWalletKey);
  if (seenWallet !== activeWalletKey) {
    setSeenWallet(activeWalletKey);
    setSelectedAssets([]);
    setVerifiedKeys(new Set());
  }

  // Resolve effective target RTP (custom validated only at publish/preview).
  const customBps = useMemo(() => {
    if (rtpMode !== 'custom') return null;
    try {
      return parseRtpPercentToBps(customRtpStr);
    } catch {
      return null;
    }
  }, [rtpMode, customRtpStr]);
  const effectiveTargetBps = rtpMode === 'custom' ? customBps ?? targetRtpBps : targetRtpBps;

  const isFixed = machineType === 'fixed_odds';

  // Switching models keeps the prize list; entering Fixed Odds stamps a
  // 1.00% default on lines missing odds so the form stays workable.
  const handleSelectType = (t: MachineType) => {
    setMachineType(t);
    setAssistResult(null);
    if (t === 'fixed_odds') {
      setPrizes((prev) =>
        prev.map((p) =>
          p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE'
            ? { ...p, oddsPpm: p.oddsPpm ?? 10000 }
            : p
        )
      );
    }
    soundFx.playClick();
  };

  // Lenient live totals for the Fixed Odds editor (strict validation happens
  // at publish via validateFixedOddsPrizes).
  const fixedTotals = useMemo(() => {
    if (!isFixed) return null;
    let totalPpm = 0;
    for (const p of prizes) {
      if (p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE') {
        const ppm = p.oddsPpm ?? 0;
        if (Number.isInteger(ppm) && ppm > 0) totalPpm += ppm;
      }
    }
    return { totalPpm, noPrizePpm: Math.max(0, MAX_TOTAL_ODDS_PPM - totalPpm) };
  }, [isFixed, prizes]);

  const updatePrizeOdds = (id: string, ppm: number) => {
    setPrizes((prev) =>
      prev.map((p) =>
        p.id === id && (p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE')
          ? { ...p, oddsPpm: ppm }
          : p
      )
    );
    setAssistResult(null);
  };

  const updatePrizeQty = (id: string, qty: number) => {
    const safe = Math.max(1, Math.min(10000, Math.floor(qty) || 1));
    setPrizes((prev) =>
      prev.map((p) =>
        p.id === id && p.type === 'RF_PRIZE'
          ? { ...p, initialQuantity: safe, remainingQuantity: safe }
          : p
      )
    );
  };

  // Calculations
  const pullPriceUnits = (() => {
    try {
      const p = parseRF(pullPriceStr || '0');
      return p > 0n ? p : RARE_ARCADE_DEMO_ECONOMY.defaultPullPriceUnits;
    } catch {
      return RARE_ARCADE_DEMO_ECONOMY.defaultPullPriceUnits;
    }
  })();

  const totalPrizeUnits = calculateTotalPrizeValue(prizes, false);
  const totalPrizeCount = prizes.reduce(
    (acc, p) => (p.type === 'NO_PRIZE' ? acc : acc + p.initialQuantity),
    0
  );

  const solved = solveRecommendedPulls(
    totalPrizeUnits,
    pullPriceUnits,
    effectiveTargetBps,
    Math.max(1, totalPrizeCount)
  );

  const totalPulls = customPulls ?? solved.recommendedPulls;
  const actualEvUnits = totalPulls > 0 ? totalPrizeUnits / BigInt(totalPulls) : 0n;
  const actualRtpBps =
    pullPriceUnits > 0n ? Number((actualEvUnits * 10000n) / pullPriceUnits) : 0;
  const operatorMarginBps = 9500 - actualRtpBps;
  const rtpWarning = classifyRtp(actualRtpBps);

  const fixedConfiguredRtpBps = useMemo(() => {
    if (!isFixed) return null;
    try {
      return calculateConfiguredRtpBps(prizes, pullPriceUnits);
    } catch {
      return null;
    }
  }, [isFixed, prizes, pullPriceUnits]);

  // Total RF required for prize escrow
  const rfEscrowRequiredUnits = prizes
    .filter((p) => p.type === 'RF_PRIZE')
    .reduce((acc, p) => acc + ('amountUnits' in p ? p.amountUnits * BigInt(p.initialQuantity) : 0n), 0n);

  const hasEnoughRf = creatorRfBalanceUnits >= rfEscrowRequiredUnits;

  const handleConnect = async () => {
    setErrorMsg('');
    try {
      const addr = await connectWallet();
      onConnectWallet(addr);
      soundFx.playClick();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  // Add RF Prize
  const handleAddRfPrize = () => {
    try {
      const amountUnits = parseRF(rfPrizeAmountStr);
      if (amountUnits <= 0n) {
        setErrorMsg('RF prize amount must be > 0');
        return;
      }
      if (rfPrizeQty <= 0) {
        setErrorMsg('Quantity must be at least 1');
        return;
      }
      let oddsPpm: number | undefined;
      if (isFixed) {
        try {
          oddsPpm = parseOddsPercentToPpm(rfOddsStr);
        } catch (err) {
          setErrorMsg((err as Error).message);
          return;
        }
      }

      const newEntry: PrizeEntry = {
        id: `prize-rf-${Date.now()}-${Math.random()}`,
        type: 'RF_PRIZE',
        amountUnits,
        initialQuantity: rfPrizeQty,
        remainingQuantity: rfPrizeQty,
        ...(oddsPpm !== undefined ? { oddsPpm } : {}),
      };

      setPrizes([...prizes, newEntry]);
      setErrorMsg('');
      soundFx.playClick();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleSelectAsset = (asset: NftAsset) => {
    const key = nftPickerKey(asset);
    if (selectedAssets.some((a) => nftPickerKey(a) === key)) {
      setSelectedAssets((prev) => prev.filter((a) => nftPickerKey(a) !== key));
      setVerifiedKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      setSelectedAssets((prev) =>
        prev.some((a) => nftPickerKey(a) === key) ? prev : [...prev, asset]
      );
    }
    soundFx.playClick();
  };

  const handleVerifySelected = async () => {
    const pending = selectedAssets.filter((a) => !verifiedKeys.has(nftPickerKey(a)));
    if (pending.length === 0) return;
    setVerifying(true);
    setErrorMsg('');
    try {
      const verified = await Promise.all(pending.map((a) => verifyAsset(a)));
      const byKey = new Map(verified.map((v) => [nftPickerKey(v), v]));
      setSelectedAssets((prev) => prev.map((a) => byKey.get(nftPickerKey(a)) ?? a));
      setVerifiedKeys((prev) => {
        const next = new Set(prev);
        for (const v of verified) next.add(nftPickerKey(v));
        return next;
      });
      soundFx.playPrizeWin();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  // Add verified NFT prizes (SIMULATED funding — no transfer).
  // Valuation is AUTOMATIC from OpenSea market data (no manual RF input).
  // Atomic batch: EVERY selected NFT becomes its OWN prize entry carrying the
  // full per-prize odds (3 NFTs at 1% = three 1% lines, never split).
  const handleConfirmAddFriend = async () => {
    if (selectedAssets.length === 0) return;
    setErrorMsg('');
    try {
      let oddsPpm: number | undefined;
      if (isFixed) {
        try {
          oddsPpm = parseOddsPercentToPpm(nftOddsStr);
        } catch (err) {
          setErrorMsg((err as Error).message);
          return;
        }
      }
      // Pre-validate pricing for the whole batch before verifying anything.
      for (const a of selectedAssets) {
        const p = a.pricing;
        if (!p || p.state === 'loading') {
          setErrorMsg(`Market valuation is still loading for "${a.name}". Wait for pricing to resolve, then retry.`);
          return;
        }
        if (p.state === 'unpriced') {
          setErrorMsg(
            `"${a.name}" currently has no OpenSea top bid, so Rare Arcade cannot use it in RTP calculations yet. Deselect it to continue.`
          );
          return;
        }
        if (p.state === 'rf_unavailable') {
          setErrorMsg('$RF PRICE UNAVAILABLE — retry once the $RAREFRIENDS market price resolves.');
          return;
        }
        if (p.referenceRfUnits === undefined || p.referenceRfUnits <= 0n) {
          setErrorMsg(
            `"${a.name}" currently has no OpenSea top bid, so Rare Arcade cannot use it in RTP calculations yet. Deselect it to continue.`
          );
          return;
        }
      }
      // Fresh verification for the whole batch (trust chain over OpenSea).
      // Any failure aborts the batch — nothing is partially added.
      const verifiedList = await Promise.all(selectedAssets.map((a) => verifyAsset(a)));
      for (const verified of verifiedList) {
        const key = nftPickerKey(verified);
        const legacyKey = nftCardKey(verified);
        if (reservedNftKeys.has(key) || reservedNftKeys.has(legacyKey)) {
          setErrorMsg(`"${verified.name}" is already funded into another LIVE local machine (demo reservation).`);
          return;
        }
        if (prizes.some((p) => p.type === 'FRIEND_PRIZE' && p.id.startsWith(`prize-friend-${verified.contract}-${verified.tokenId}-`))) {
          setErrorMsg(`"${verified.name}" is already in this draft machine.`);
          return;
        }
      }
      const newEntries = verifiedList.map((verified) => {
        const pricing = verified.pricing;
        if (!pricing || pricing.state !== 'priced' || pricing.referenceRfUnits === undefined) {
          throw new Error(`Valuation changed for "${verified.name}" — retry.`);
        }
        return buildNftPrizeEntry({
          asset: verified,
          pricing,
          refValUnits: pricing.referenceRfUnits,
          rfUsdFallback: priced.rfUsd,
          oddsPpm,
        });
      });

      setPrizes([...prizes, ...newEntries]);
      setShowFriendDrawer(false);
      setSelectedAssets([]);
      setVerifiedKeys(new Set());
      setErrorMsg('');
      soundFx.playPrizeWin();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleRemovePrize = (id: string) => {
    setPrizes(prizes.filter((p) => p.id !== id));
    soundFx.playClick();
  };

  // Publish machine (re-verify every real NFT immediately before publishing).
  const handlePublish = async () => {
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter a machine name.');
      return;
    }
    if (prizes.length === 0) {
      setErrorMsg('Machine must have at least one prize.');
      return;
    }
    if (!hasEnoughRf) {
      setErrorMsg(
        `Insufficient RF balance for prize escrow. Required: ${formatRFGrouped(rfEscrowRequiredUnits)}, available: ${formatRFGrouped(creatorRfBalanceUnits)}`
      );
      return;
    }
    if (!isFixed && rtpMode === 'custom') {
      try {
        parseRtpPercentToBps(customRtpStr);
      } catch (err) {
        setErrorMsg((err as Error).message);
        return;
      }
    }
    if (isFixed) {
      try {
        validateFixedOddsPrizes(prizes);
      } catch (err) {
        setErrorMsg((err as Error).message);
        return;
      }
    }

    setPublishing(true);
    try {
      // Refresh + re-verify ownership and market data; publish locks snapshots.
      const verified = await verifyDraftNfts();
      if ('error' in verified) {
        setErrorMsg(verified.error);
        setPublishing(false);
        return;
      }
      const finalPrizes = verified.prizes;
      setPrizes(finalPrizes);

      if (isFixed) {
        const { machine, seededRfEscrowUnits, seededFriends, events } = createFixedOddsMachine({
          name,
          shellId,
          creatorAddress: wallet || creatorAddress,
          pullPriceUnits,
          targetRtpBps: oddsMode === 'target' ? parseRtpPercentToBps(assistTargetStr) : 9000,
          prizeEntries: finalPrizes,
        });
        soundFx.playJackpot();
        onPublishMachine(machine, seededRfEscrowUnits, seededFriends, events);
        return;
      }

      const { machine, seededRfEscrowUnits, seededFriends, events } = createMachine({
        name,
        shellId,
        creatorAddress: wallet || creatorAddress,
        pullPriceUnits,
        totalPulls,
        targetRtpBps: effectiveTargetBps,
        prizeEntries: finalPrizes,
      });

      soundFx.playJackpot();
      onPublishMachine(machine, seededRfEscrowUnits, seededFriends, events);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  /** Re-verify ownership + refresh market valuation for every real-NFT prize.
   * Returns { error } or { prizes } with refreshed immutable snapshots.
   * Published economics lock to the refreshed snapshot (live moves after
   * publish never mutate the machine). */
  const verifyDraftNfts = async (): Promise<{ error: string } | { prizes: PrizeEntry[] }> => {
    const connected = normalizeAddress(walletAddress ?? '');
    const hasRealNfts = prizes.some((p) => p.type === 'FRIEND_PRIZE' && p.origin === 'real-nft');
    if (!hasRealNfts) return { prizes };
    if (!connected) return { error: 'Connect a wallet first — NFT funding requires verified ownership.' };
    let rfUsd: string | null = null;
    try {
      const rf = await getRareFriendsUsdPrice();
      rfUsd = rf?.usdPrice ?? null;
    } catch {
      rfUsd = null;
    }
    if (!rfUsd) {
      return { error: '$RF PRICE UNAVAILABLE — cannot convert top bids. Refresh market data and retry.' };
    }
    const refreshed: PrizeEntry[] = [];
    for (const p of prizes) {
      if (p.type !== 'FRIEND_PRIZE' || p.origin !== 'real-nft') {
        refreshed.push(p);
        continue;
      }
      if (!p.contractAddress) {
        return { error: 'OWNERSHIP CHANGED — a prize is missing contract identity.' };
      }
      const chainSlug = (p.chainSlug ?? 'robinhood').toLowerCase();
      const keyNum = p.chainId !== undefined && p.contractAddress
        ? nftReservationKey(p.chainId, p.contractAddress, p.tokenId.toString())
        : null;
      const keySlug = `${chainSlug}:${p.contractAddress.toLowerCase()}:${p.tokenId.toString()}`;
      if ((keyNum && reservedNftKeys.has(keyNum)) || reservedNftKeys.has(keySlug)) {
        return { error: `"${p.name}" is already funded into another LIVE local machine. Remove it to continue.` };
      }
      // 1. Ownership re-verification (generic: onchain for Rare Friends, OpenSea re-query otherwise).
      try {
        const { owner } = await verifyNftOwnerGeneric({
          chain: chainSlug,
          contract: p.contractAddress,
          tokenId: p.tokenId.toString(),
          wallet: connected,
          tokenStandard: p.tokenStandard,
        });
        if (normalizeAddress(owner) !== connected) {
          return { error: 'OWNERSHIP CHANGED — "You no longer hold this NFT. Remove it from the prize pool or reconnect the wallet that owns it."' };
        }
      } catch {
        return { error: `OWNERSHIP COULD NOT BE VERIFIED for "${p.name}". Refresh inventory and retry.` };
      }
      // 2. Market refresh: generation bid → collection top bid → RF conversion.
      // Collection-level bids keep publish fast (no per-item requests).
      const collectionSlug = p.collectionSlug ?? '';
      let bidUsd: string | null = null;
      let bidNative: string | undefined;
      let bidCurrency: string | undefined;
      let method: NftValuationSnapshot['method'] = 'collection_top_bid';
      let traitType: string | undefined;
      let traitValue: string | undefined;
      let fallbackUsed = false;
      const isGenerations =
        p.contractAddress.toLowerCase() === GENERATIONS_CONTRACT.toLowerCase() ||
        p.collectionType === 'GENERATIONS';
      if (isGenerations && collectionSlug) {
        const traits = p.traits ?? [];
        const det = detectGenerationTrait(traits.map((t) => ({ traitType: t.traitType, value: t.value })));
        // Prefer stored snapshot trait context when live traits are absent.
        traitType = det?.traitType ?? p.valuationSnapshot?.traitType ?? 'Generation';
        traitValue = det?.value ?? p.valuationSnapshot?.traitValue ?? undefined;
        if (traitValue !== null && traitValue !== undefined) {
          try {
            const gen = await getGenerationTopBid(collectionSlug, traitType, traitValue);
            if (gen) {
              bidUsd = gen.topBidUsd;
              bidNative = gen.bidNative;
              bidCurrency = gen.bidCurrency;
              method = 'rare_friends_generation_bid';
            }
          } catch {
            // fall through to collection fallback
          }
        }
      }
      if (!bidUsd && collectionSlug) {
        try {
          const coll = await getCollectionTopBid(collectionSlug);
          if (coll) {
            bidUsd = coll.topBidUsd;
            bidNative = coll.bidNative;
            bidCurrency = coll.bidCurrency;
            if (isGenerations) {
              method = 'rare_friends_collection_bid_fallback';
              fallbackUsed = true;
            }
          }
        } catch {
          // fall through to unpriced
        }
      }
      if (!bidUsd) {
        return {
          error: `"${p.name}" currently has no OpenSea top bid, so Rare Arcade cannot use it in RTP calculations yet. Remove it to publish.`,
        };
      }
      const ref = convertUsdToRfUnits(bidUsd, rfUsd);
      if (ref === null || ref <= 0n) {
        return {
          error: `"${p.name}" currently has no OpenSea top bid, so Rare Arcade cannot use it in RTP calculations yet. Remove it to publish.`,
        };
      }
      const valuedAt = Date.now();
      if (!isFreshEnoughForPublish(valuedAt)) {
        return { error: 'Market data is stale. Refresh market data and retry.' };
      }
      refreshed.push({
        ...p,
        referenceValueUnits: ref,
        valuationSnapshot: {
          method,
          source: 'opensea',
          collectionSlug,
          traitType,
          traitValue,
          topBidUsd: bidUsd,
          bidNative,
          bidCurrency,
          rfUsd,
          referenceRf: ref.toString(),
          valuedAt,
          fallbackUsed,
        },
      });
    }
    return { prizes: refreshed };
  };

  /** TARGET RTP ASSIST: fill each line with suggested odds for the assist target. */
  const handleApplyAssist = () => {
    setErrorMsg('');
    setAssistResult(null);
    try {
      const targetBps = parseRtpPercentToBps(assistTargetStr);
      const lines = prizes
        .filter(
          (p): p is Extract<PrizeEntry, { type: 'RF_PRIZE' | 'FRIEND_PRIZE' }> =>
            p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE'
        )
        .map((p) => ({
          prizeEntryId: p.id,
          unitRefUnits: p.type === 'RF_PRIZE' ? p.amountUnits : p.referenceValueUnits,
        }));
      const { suggestions, achievedRtpBps, capped } = suggestFixedOddsPpm(
        targetBps,
        pullPriceUnits,
        lines
      );
      const byId = new Map(suggestions.map((s) => [s.prizeEntryId, s.oddsPpm]));
      setPrizes((prev) =>
        prev.map((p) => {
          const ppm = byId.get(p.id);
          return ppm !== undefined &&
            (p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE')
            ? { ...p, oddsPpm: ppm }
            : p;
        })
      );
      setAssistResult({ achievedRtpBps, capped });
      soundFx.playPrizeWin();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const scenarios = calculateScenarios(pullPriceUnits, totalPulls);
  const selectedKeys = useMemo(
    () => new Set(selectedAssets.map((a) => nftPickerKey(a))),
    [selectedAssets]
  );

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div
        className="pixel-box"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--color-lcd-bg)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="creator" size={18} />
            CREATOR WORKSHOP: BUILD A FRIEND MACHINE
          </h1>
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-lcd)', color: '#444', marginTop: '4px' }}>
            Fund a verified-owned NFT + RF prizes • Simulated funding, real ownership
          </p>
        </div>

        <button type="button" className="pixel-btn pixel-btn-sm" onClick={onCancel}>
          EXIT WORKSHOP
        </button>
      </div>

      {/* Progress Steps Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          className={`pixel-btn pixel-btn-sm ${step === 1 ? 'pixel-btn-primary' : ''}`}
          onClick={() => setStep(1)}
        >
          1. IDENTITY & SHELL
        </button>
        <button
          type="button"
          className={`pixel-btn pixel-btn-sm ${step === 2 ? 'pixel-btn-primary' : ''}`}
          onClick={() => setStep(2)}
        >
          2. SEED PRIZE POOL ({prizes.length})
        </button>
        <button
          type="button"
          className={`pixel-btn pixel-btn-sm ${step === 3 ? 'pixel-btn-primary' : ''}`}
          onClick={() => setStep(3)}
        >
          3. ECONOMICS & LAUNCH
        </button>
      </div>

      {errorMsg && (
        <div
          style={{
            background: 'var(--color-black)',
            color: 'var(--color-white)',
            padding: '10px 14px',
            marginBottom: '16px',
            fontFamily: 'var(--font-lcd)',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <PixelIcon name="warning" size={16} color="#ffffff" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: IDENTITY & CABINET SHELL */}
      {step === 1 && (
        <div className="pixel-panel">
          <div className="pixel-marquee" style={{ margin: '-16px -16px 14px -16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon name="creator" size={16} color="#ffffff" />
              <span style={{ fontSize: '11px' }}>STEP 1: NAME & CABINET SHELL</span>
            </div>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)' }}>
              {shellId} • {pullFxForShell(shellId).pickerLabel}
            </span>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '11px', marginBottom: '6px' }}>
              MACHINE NAME:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              maxLength={24}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid var(--color-black)',
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
                textTransform: 'uppercase',
              }}
              placeholder="E.G. LUCKY SKELETON"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '11px', marginBottom: '8px' }}>
              SELECT CABINET SILHOUETTE:
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              {SHELL_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  className={`pixel-panel-sunken ${shellId === opt.id ? 'friend-card-selected' : ''}`}
                  style={{ padding: '12px', cursor: 'pointer' }}
                  onClick={() => {
                    setShellId(opt.id);
                    soundFx.playClick();
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '12px' }}>
                    <PixelIcon name="machine" size={16} />
                    <span>{opt.label}</span>
                    {shellId === opt.id && (
                      <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '1px 5px', fontFamily: 'var(--font-lcd)' }}>
                        SELECTED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '6px' }}>
                    {opt.desc}
                  </div>
                  <div
                    style={{
                      marginTop: '8px',
                      display: 'inline-block',
                      background: '#000',
                      color: '#fff',
                      fontFamily: 'var(--font-lcd)',
                      fontSize: '8px',
                      padding: '2px 6px',
                    }}
                  >
                    {pullFxForShell(opt.id).pickerLabel}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-sm"
                      style={{ width: '100%' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewShell(opt.id);
                        setPreviewRunId((n) => n + 1);
                        setPreviewActive(true);
                        soundFx.playClick();
                      }}
                    >
                      PREVIEW FX
                    </button>
                  </div>
                  <div style={{ fontSize: '8px', color: '#777', marginTop: '4px', fontFamily: 'var(--font-lcd)' }}>
                    SHELL CHANGES PRESENTATION, NOT ECONOMICS
                  </div>
                </div>
              ))}
            </div>
            {previewShell && (
              <div
                className="pixel-panel-sunken"
                style={{ marginTop: '12px', padding: '12px' }}
                aria-live="polite"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px' }}>
                    PREVIEW FX — {previewShell} • {pullFxForShell(previewShell).pickerLabel}
                  </div>
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-sm"
                    onClick={() => {
                      setPreviewActive(false);
                      setPreviewShell(null);
                    }}
                  >
                    CLOSE
                  </button>
                </div>
                <div style={{ fontSize: '9px', color: '#555', marginBottom: '8px', fontFamily: 'var(--font-lcd)' }}>
                  DEMO ONLY — SPENDS NOTHING, RUNS NO RNG, MUTATES NOTHING
                </div>
                <div style={{ maxWidth: '320px', margin: '0 auto' }}>
                  {previewActive ? (
                    <PixelPullAnimation
                      shell={shellToAnimatedPreview(previewShell)}
                      active={previewActive}
                      runId={previewRunId}
                      reducedMotion={previewReduced}
                      onComplete={() => setPreviewActive(false)}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px' }}>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-sm pixel-btn-primary"
                        onClick={() => {
                          setPreviewRunId((n) => n + 1);
                          setPreviewActive(true);
                        }}
                      >
                        REPLAY PREVIEW FX
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Machine Type: Finite Deck vs Fixed Odds */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '11px', marginBottom: '8px' }}>
              SELECT MACHINE TYPE:
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              {MACHINE_TYPE_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={machineType === opt.id}
                  data-testid={`machine-type-${opt.id}`}
                  className={`pixel-panel-sunken ${machineType === opt.id ? 'friend-card-selected' : ''}`}
                  style={{ padding: '12px', cursor: 'pointer' }}
                  onClick={() => handleSelectType(opt.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleSelectType(opt.id);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '12px' }}>
                    <PixelIcon name={opt.icon} size={16} />
                    <span>{opt.label}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '6px' }}>
                    {opt.desc}
                  </div>
                  <div style={{ fontSize: '9px', color: '#555', marginTop: '6px' }}>
                    Best for:
                    <ul style={{ margin: '2px 0 0 14px', padding: 0 }}>
                      {opt.bestFor.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '6px' }}>
              Neither model is better — they are two legitimate strategies. Switching keeps
              your prizes; Fixed Odds lines get a 1.00% starting chance you can edit.
            </div>
          </div>

          {/* Wallet connection */}
          <div className="workshop-tray" style={{ marginBottom: '20px' }}>
            <div className="workshop-tray-label">
              <PixelIcon name="wallet" size={12} color="#ffffff" />
              CREATOR WALLET (ROBINHOOD CHAIN • 4663)
            </div>
            <div className="workshop-tray-body">
            {wallet ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-lcd)', fontSize: '11px', fontWeight: 'bold' }}>
                  {wallet.slice(0, 10)}…{wallet.slice(-6)}
                </span>
                <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '2px 6px' }}>
                  CONNECTED
                </span>
                <button type="button" className="pixel-btn pixel-btn-sm" onClick={onDisconnectWallet}>
                  DISCONNECT
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '10px', color: '#555', marginBottom: '8px' }}>
                  Connect to load the NFTs you actually own. Rare Friends appear first;
                  any supported collection held by this wallet can fund a machine.
                  Read-only — no transactions or signatures.
                </div>
                <button
                  type="button"
                  className="pixel-btn pixel-btn-sm pixel-btn-primary"
                  onClick={handleConnect}
                >
                  CONNECT WALLET
                </button>
              </div>
            )}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button
              type="button"
              className="pixel-btn pixel-btn-primary"
              onClick={() => {
                soundFx.playClick();
                setStep(2);
              }}
            >
              NEXT: SEED PRIZES &gt;
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: SEED PRIZE POOL */}
      {step === 2 && (
        <div className="pixel-panel">
          <div className="pixel-marquee" style={{ margin: '-16px -16px 14px -16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon name="prize" size={16} color="#ffffff" />
              <span style={{ fontSize: '11px' }}>STEP 2: SEED PRIZE INVENTORY</span>
            </div>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)' }} title={formatRFGrouped(totalPrizeUnits)}>
              TOTAL VALUE: <strong>{formatRFGrouped(totalPrizeUnits)}</strong>
            </span>
          </div>

          {/* Action Row: Add RF / Add Friend */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            {/* Add RF Rewards */}
            <div className="workshop-tray">
              <div className="workshop-tray-label">
                <PixelIcon name="rf" size={12} color="#ffffff" />
                ADD RF REWARDS
              </div>
              <div className="workshop-tray-body">

              <div style={{ fontSize: '9px', color: '#666', marginBottom: '6px', fontFamily: 'var(--font-lcd)' }}>
                QUICK-PICK CARTRIDGE:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {RARE_ARCADE_DEMO_ECONOMY.rfPrizeSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`pixel-btn pixel-btn-sm ${rfPrizeAmountStr === s ? 'pixel-btn-primary' : ''}`}
                    onClick={() => setRfPrizeAmountStr(s)}
                  >
                    {Number(s).toLocaleString('en-US')}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '9px', color: '#666' }}>AMOUNT (RF)</label>
                  <input
                    type="number"
                    min="1"
                    value={rfPrizeAmountStr}
                    onChange={(e) => setRfPrizeAmountStr(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      border: '2px solid var(--color-black)',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: '#666' }}>QTY</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-sm"
                      style={{ padding: '6px 8px' }}
                      onClick={() => setRfPrizeQty((q) => Math.max(1, q - 1))}
                      title="Decrease quantity"
                      aria-label="Decrease prize quantity"
                    >
                      <PixelIcon name="minus" size={10} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={rfPrizeQty}
                      onChange={(e) => setRfPrizeQty(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '2px solid var(--color-black)',
                        fontSize: '12px',
                        textAlign: 'center',
                      }}
                    />
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-sm"
                      style={{ padding: '6px 8px' }}
                      onClick={() => setRfPrizeQty((q) => Math.min(100, q + 1))}
                      title="Increase quantity"
                      aria-label="Increase prize quantity"
                    >
                      <PixelIcon name="plus" size={10} />
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="pixel-btn pixel-btn-sm pixel-btn-primary"
                style={{ width: '100%' }}
                onClick={handleAddRfPrize}
              >
                + ADD RF PRIZE
              </button>
              {isFixed && (
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '9px', color: '#666' }}>
                    CHANCE PER PULL (FIXED ODDS %)
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0' }}>
                    {ODDS_QUICK_PICKS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`pixel-btn pixel-btn-sm ${rfOddsStr === s ? 'pixel-btn-primary' : ''}`}
                        onClick={() => setRfOddsStr(s)}
                      >
                        {s}%
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0' }}>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      value={rfOddsStr}
                      onChange={(e) => setRfOddsStr(e.target.value)}
                      aria-label="Custom odds percent for RF prize"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '2px solid var(--color-black)',
                        borderRight: 'none',
                        fontSize: '12px',
                      }}
                      placeholder="CUSTOM, e.g. 0.125"
                    />
                    <span
                      style={{
                        background: '#000',
                        color: '#fff',
                        fontFamily: 'var(--font-lcd)',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0 10px',
                      }}
                    >
                      %
                    </span>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Add Rare Friend */}
            <div className="workshop-tray">
              <div className="workshop-tray-label">
                <PixelIcon name="friend" size={12} color="#ffffff" />
                ADD NFT PRIZE
              </div>
              <div className="workshop-tray-body">
              <div style={{ fontSize: '10px', color: '#555', marginBottom: '12px' }}>
                Only NFTs your connected wallet genuinely owns can fund the machine.
                Funding is simulated — no transfer, no approval.
              </div>
              <button
                type="button"
                className="pixel-btn pixel-btn-sm pixel-btn-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  if (!wallet) {
                    setErrorMsg('Connect a wallet first — NFT funding requires verified ownership.');
                    return;
                  }
                  setShowFriendDrawer(true);
                  soundFx.playClick();
                }}
              >
                OPEN OWNED NFT INVENTORY
              </button>
              <div style={{ fontSize: '9px', color: '#666', marginTop: '8px', textAlign: 'center', fontFamily: 'var(--font-lcd)' }}>
                {wallet ? 'WALLET LINKED — BROWSE YOUR NFTS' : 'WALLET NOT LINKED'}
              </div>
              </div>
            </div>
          </div>

          {/* Current Prize Pool List */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PixelIcon name="inventory" size={14} />
                CURRENT PRIZES IN MACHINE ({prizes.length}):
              </div>
              {prizes.length > 0 && (
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', color: '#666' }}>
                  {isFixed ? `${totalPrizeCount} PRIZES` : `${totalPrizeCount} TICKETS`}
                </span>
              )}
            </div>

            {prizes.length === 0 ? (
              <div
                style={{
                  border: '2px dashed var(--color-black)',
                  padding: '24px',
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '11px',
                  background: 'var(--color-lcd-bg)',
                }}
              >
                <PixelIcon name="prize" size={28} />
                <div style={{ marginTop: '8px', fontWeight: 'bold' }}>EMPTY HOPPER</div>
                <div style={{ marginTop: '4px' }}>
                  No prizes seeded yet. Add simulated RF rewards or a verified-owned NFT above.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {prizes.map((p, idx) => (
                  <div
                    key={p.id}
                    className="workshop-tray"
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 12px',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-lcd)',
                          fontSize: '9px',
                          background: '#000',
                          color: '#fff',
                          padding: '3px 6px',
                          flexShrink: 0,
                        }}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {p.type === 'FRIEND_PRIZE' ? (
                        <RareFriendImage
                          imageUrl={p.displayImageUrl || p.imageUrl}
                          name={p.name}
                          collectionName={p.collectionName}
                          tokenId={p.tokenId.toString()}
                          openseaUrl={p.openseaUrl}
                          size={56}
                        />
                      ) : (
                        <span
                          style={{
                            width: '56px',
                            height: '56px',
                            background: '#000',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <RfTokenIcon size={48} decorative />
                        </span>
                      )}

                      <div style={{ flex: 1, fontSize: '12px', minWidth: 0 }}>
                        <strong>
                          {p.type === 'FRIEND_PRIZE'
                            ? p.name
                            : p.type === 'RF_PRIZE'
                            ? formatRFGrouped(p.amountUnits)
                            : 'Try Again'}
                        </strong>
                        <span style={{ fontSize: '10px', color: '#666', marginLeft: '8px' }}>
                          {p.type === 'FRIEND_PRIZE'
                            ? `(Ref: ${formatRFGrouped(p.referenceValueUnits)})`
                            : `× ${p.initialQuantity} tickets`}
                        </span>
                        {p.type === 'FRIEND_PRIZE' && (
                          <div style={{ fontSize: '9px', color: '#555', marginTop: '4px', fontFamily: 'var(--font-lcd)' }}>
                            {p.valuationSnapshot ? (
                              <>
                                {p.valuationSnapshot.method === 'rare_friends_generation_bid' && p.valuationSnapshot.traitValue !== undefined
                                  ? `GEN ${p.valuationSnapshot.traitValue} TOP BID ${formatUsdAdaptive(p.valuationSnapshot.topBidUsd)}`
                                  : p.valuationSnapshot.method === 'rare_friends_collection_bid_fallback' || p.valuationSnapshot.method === 'collection_top_bid_fallback'
                                    ? `COLLECTION BID FALLBACK ${formatUsdAdaptive(p.valuationSnapshot.topBidUsd)}`
                                    : p.collectionType === 'GENESIS'
                                      ? `GENESIS TOP BID ${formatUsdAdaptive(p.valuationSnapshot.topBidUsd)}`
                                      : `TOP BID ${formatUsdAdaptive(p.valuationSnapshot.topBidUsd)}`}
                                {' '}• $RF {formatUsdAdaptive(p.valuationSnapshot.rfUsd)}
                                {' '}• {formatRfReferenceCompact(p.referenceValueUnits)}
                              </>
                            ) : (
                              <>LEGACY MANUAL REFERENCE • {formatRFGrouped(p.referenceValueUnits)}</>
                            )}
                          </div>
                        )}
                        {isFixed && (p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE') && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'center',
                              marginTop: '6px',
                              flexWrap: 'wrap',
                            }}
                          >
                            {p.type === 'RF_PRIZE' ? (
                              <label style={{ fontSize: '9px', color: '#666', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                QTY
                                <input
                                  type="number"
                                  min="1"
                                  max="10000"
                                  value={p.initialQuantity}
                                  onChange={(e) => updatePrizeQty(p.id, Number(e.target.value))}
                                  aria-label={`Quantity for ${p.id}`}
                                  style={{
                                    width: '70px',
                                    padding: '4px',
                                    border: '2px solid var(--color-black)',
                                    fontSize: '11px',
                                  }}
                                />
                              </label>
                            ) : (
                              <span style={{ fontSize: '9px', color: '#666' }}>QTY 1 (UNIQUE NFT)</span>
                            )}
                            <label style={{ fontSize: '9px', color: '#666', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              ODDS %
                              <input
                                type="number"
                                min="0.0001"
                                step="0.01"
                                value={
                                  p.oddsPpm !== undefined
                                    ? Number((p.oddsPpm / 10000).toFixed(4))
                                    : ''
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '') return;
                                  try {
                                    updatePrizeOdds(p.id, parseOddsPercentToPpm(v));
                                  } catch {
                                    // Live-typing an invalid value keeps the last good odds;
                                    // publish validation enforces correctness.
                                  }
                                }}
                                aria-label={`Fixed odds percent for ${p.id}`}
                                style={{
                                  width: '80px',
                                  padding: '4px',
                                  border: '2px solid var(--color-black)',
                                  fontSize: '11px',
                                }}
                              />
                            </label>
                            <span style={{ fontSize: '9px', fontWeight: 'bold' }}>
                              = {p.oddsPpm !== undefined ? formatOddsPpm(p.oddsPpm) : '—'} FIXED
                            </span>
                          </div>
                        )}
                        {p.type === 'FRIEND_PRIZE' && (
                          <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '1px 4px' }}>
                              VERIFIED OWNED NFT
                            </span>
                            <span style={{ fontSize: '8px', border: '1px solid #000', padding: '0 4px' }}>
                              SIMULATED FUNDING
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="pixel-btn pixel-btn-sm"
                        style={{ padding: '2px 6px', flexShrink: 0 }}
                        onClick={() => handleRemovePrize(p.id)}
                        title="Remove prize"
                      >
                        <PixelIcon name="close" size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total fixed-odds bar (Fixed Odds only) */}
          {isFixed && fixedTotals && (
            <div
              className="workshop-tray"
              style={{ marginBottom: '16px' }}
            >
              <div className="workshop-tray-body">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontFamily: 'var(--font-lcd)',
                    fontSize: '11px',
                  }}
                >
                  <span>
                    TOTAL PRIZE ODDS:{' '}
                    <strong style={fixedTotals.totalPpm > MAX_TOTAL_ODDS_PPM ? { color: '#000', background: '#fff', padding: '0 4px' } : undefined}>
                      {formatOddsPpm(Math.min(fixedTotals.totalPpm, MAX_TOTAL_ODDS_PPM))}
                      {fixedTotals.totalPpm > MAX_TOTAL_ODDS_PPM &&
                        ` (OVER BY ${formatOddsPpm(fixedTotals.totalPpm - MAX_TOTAL_ODDS_PPM)})`}
                    </strong>
                  </span>
                  <span>
                    NO-PRIZE: <strong>{formatOddsPpm(fixedTotals.noPrizePpm)}</strong>
                  </span>
                  {fixedConfiguredRtpBps !== null && (
                    <span>
                      CONFIGURED RTP: <strong>{formatBps(fixedConfiguredRtpBps, 2)}</strong>
                    </span>
                  )}
                </div>
                {fixedTotals.totalPpm > MAX_TOTAL_ODDS_PPM && (
                  <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '6px' }}>
                    PRIZE ODDS EXCEED 100% — lower prize odds before publishing.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Escrow Balance Check Banner */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <div className="workshop-lcd-tile">
              <div className="workshop-lcd-caption">REQUIRED RF ESCROW:</div>
              <div className="workshop-lcd-value">{formatRFGrouped(rfEscrowRequiredUnits)}</div>
            </div>
            <div className="workshop-lcd-tile">
              <div className="workshop-lcd-caption">YOUR BALANCE:</div>
              <div className="workshop-lcd-value">{formatRFGrouped(creatorRfBalanceUnits)}</div>
            </div>
            <div
              className="workshop-lcd-tile"
              style={
                hasEnoughRf
                  ? undefined
                  : { background: '#000', color: '#fff' }
              }
            >
              <div className="workshop-lcd-caption" style={hasEnoughRf ? undefined : { color: '#ccc' }}>
                ESCROW STATUS:
              </div>
              <div className="workshop-lcd-value">
                {hasEnoughRf ? '◼ FUNDED' : '◻ SHORTFALL'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="pixel-btn" onClick={() => setStep(1)}>
              &lt; BACK
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-primary"
              onClick={() => {
                if (prizes.length === 0) {
                  setErrorMsg('Add at least one prize to proceed.');
                  return;
                }
                soundFx.playClick();
                setStep(3);
              }}
            >
              NEXT: SET ECONOMICS &gt;
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: SET ECONOMICS & SCENARIOS */}
      {step === 3 && (
        <div className="pixel-panel">
          <div className="pixel-marquee" style={{ margin: '-16px -16px 14px -16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon name="rtp" size={16} color="#ffffff" />
              <span style={{ fontSize: '11px' }}>STEP 3: ECONOMICS & LAUNCH</span>
            </div>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)' }}>
              {isFixed
                ? `FIXED ODDS • ${fixedConfiguredRtpBps !== null ? formatBps(fixedConfiguredRtpBps, 2) : '—'} CONFIGURED`
                : `${totalPulls} TICKETS • ${formatBps(actualRtpBps, 2)} ACTUAL`}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            {/* Left: Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="workshop-tray">
                <div className="workshop-tray-label">
                  <PixelIcon name="rf" size={12} color="#ffffff" />
                  PULL PRICE (RF)
                </div>
                <div className="workshop-tray-body">
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {RARE_ARCADE_DEMO_ECONOMY.pullPriceSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`pixel-btn pixel-btn-sm ${pullPriceStr === s ? 'pixel-btn-primary' : ''}`}
                      onClick={() => {
                        setPullPriceStr(s);
                        setCustomPulls(null);
                        soundFx.playClick();
                      }}
                    >
                      {Number(s).toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={pullPriceStr}
                  onChange={(e) => {
                    setPullPriceStr(e.target.value);
                    setCustomPulls(null); // Recalculate recommended pulls
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid var(--color-black)',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                />
                </div>
              </div>

              {isFixed ? (
                <FixedOddsModeSection
                  oddsMode={oddsMode}
                  setOddsMode={setOddsMode}
                  assistTargetStr={assistTargetStr}
                  setAssistTargetStr={setAssistTargetStr}
                  onApplyAssist={handleApplyAssist}
                  assistResult={assistResult}
                  prizes={prizes}
                  onUpdateOdds={updatePrizeOdds}
                />
              ) : (
              <>
              <div className="workshop-tray">
                <div className="workshop-tray-label">
                  <PixelIcon name="odds" size={12} color="#ffffff" />
                  TARGET PLAYER RTP:{' '}
                  {rtpMode === 'custom' && customBps != null
                    ? formatBps(customBps, 2)
                    : formatBps(targetRtpBps)}
                </div>
                <div className="workshop-tray-body">
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {RTP_PRESET_BPS.map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      className={`pixel-btn pixel-btn-sm ${rtpMode === 'preset' && targetRtpBps === bps ? 'pixel-btn-primary' : ''}`}
                      onClick={() => {
                        setRtpMode('preset');
                        setTargetRtpBps(bps);
                        setCustomPulls(null);
                        soundFx.playClick();
                      }}
                    >
                      {formatBps(bps, 0)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`pixel-btn pixel-btn-sm ${rtpMode === 'custom' ? 'pixel-btn-primary' : ''}`}
                    onClick={() => {
                      setRtpMode('custom');
                      setCustomPulls(null);
                      soundFx.playClick();
                    }}
                  >
                    CUSTOM
                  </button>
                </div>
                {rtpMode === 'custom' && (
                  <div>
                    <label style={{ fontSize: '9px', color: '#666' }}>CUSTOM RTP (%)</label>
                    <div style={{ display: 'flex', gap: '0' }}>
                      <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={customRtpStr}
                        onChange={(e) => {
                          setCustomRtpStr(e.target.value);
                          setCustomPulls(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '2px solid var(--color-black)',
                          borderRight: 'none',
                          fontSize: '13px',
                          fontWeight: 'bold',
                        }}
                        placeholder="e.g. 72.5 or 107.5"
                      />
                      <span
                        style={{
                          background: '#000',
                          color: '#fff',
                          fontFamily: 'var(--font-lcd)',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0 12px',
                        }}
                      >
                        %
                      </span>
                    </div>
                    {customBps == null && (
                      <div style={{ fontSize: '9px', color: '#000', fontWeight: 'bold', marginTop: '2px' }}>
                        Enter a positive number (decimals OK, e.g. 72.5 or 110).
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>

              <div className="workshop-tray">
                <div className="workshop-tray-label">
                  <PixelIcon name="inventory" size={12} color="#ffffff" />
                  TOTAL TICKETS / PULLS
                </div>
                <div className="workshop-tray-body">
                <input
                  type="number"
                  min={Math.max(1, totalPrizeCount)}
                  value={totalPulls}
                  onChange={(e) => setCustomPulls(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid var(--color-black)',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                />
                <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
                  Recommended: {solved.recommendedPulls} pulls (Target:{' '}
                  {rtpMode === 'custom' && customBps != null
                    ? formatBps(customBps, 2)
                    : formatBps(targetRtpBps)}
                  )
                </div>
                </div>
              </div>
              </>
              )}
            </div>

            {/* Right: Modeled Economics Summary */}
            {isFixed ? (
              <>
                <FixedSummarySection
                  prizes={prizes}
                  pullPriceUnits={pullPriceUnits}
                  fixedConfiguredRtpBps={fixedConfiguredRtpBps}
                />
                <div style={{ marginTop: '16px' }}>
                  <FixedOddsRiskModel prizes={prizes} pullPriceUnits={pullPriceUnits} />
                </div>
              </>
            ) : (
            <div className="workshop-tray" style={{ alignSelf: 'start' }}>
              <div className="workshop-tray-label">
                <PixelIcon name="activity" size={12} color="#ffffff" />
                MODELED ECONOMICS SUMMARY
              </div>
              <div className="workshop-tray-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                  fontSize: '11px',
                }}
              >
                <div className="workshop-lcd-tile">
                  <div className="workshop-lcd-caption">PLATFORM BURN</div>
                  <div className="workshop-lcd-value">5.0% FIXED</div>
                </div>

                <div className="workshop-lcd-tile">
                  <div className="workshop-lcd-caption">TARGET PLAYER RTP</div>
                  <div className="workshop-lcd-value">
                    {rtpMode === 'custom' && customBps != null
                      ? formatBps(customBps, 2)
                      : formatBps(targetRtpBps)}
                  </div>
                </div>

                <div className="workshop-lcd-tile">
                  <div className="workshop-lcd-caption">ACTUAL PLAYER RTP</div>
                  <div className="workshop-lcd-value">{formatBps(actualRtpBps, 2)}</div>
                </div>

                <div className="workshop-lcd-tile">
                  <div className="workshop-lcd-caption">OPERATOR MARGIN:</div>
                  <div className="workshop-lcd-value">{formatBps(operatorMarginBps, 2)} (95% - RTP)</div>
                </div>

                <div className="workshop-lcd-tile">
                  <div className="workshop-lcd-caption">TOTAL PRIZE VALUE</div>
                  <div className="workshop-lcd-value">{formatRFGrouped(totalPrizeUnits)}</div>
                </div>

                <div className="workshop-lcd-tile">
                  <div className="workshop-lcd-caption">GROSS AT SELLOUT</div>
                  <div className="workshop-lcd-value">{formatRFGrouped(pullPriceUnits * BigInt(totalPulls))}</div>
                </div>

                <div className="workshop-lcd-tile" style={{ gridColumn: '1 / -1' }}>
                  <div className="workshop-lcd-caption">BURN AT SELLOUT</div>
                  <div className="workshop-lcd-value">
                    {formatRFGrouped(((pullPriceUnits * BigInt(totalPulls)) * 500n) / 10000n)}
                  </div>
                </div>
              </div>

              {rtpWarning.kind === 'player-favorable' && (
                <div style={{ marginTop: '8px', padding: '8px', background: '#000', color: '#fff', fontSize: '10px' }}>
                  <strong>PLAYER-FAVORABLE ECONOMICS</strong>
                  <br />
                  This machine's modeled prize value exceeds the creator's post-burn
                  pull receipts.
                </div>
              )}
              {rtpWarning.kind === 'subsidized' && (
                <div style={{ marginTop: '8px', padding: '8px', background: '#000', color: '#fff', fontSize: '10px' }}>
                  <strong>CREATOR-SUBSIDIZED MACHINE</strong>
                  <br />
                  Target RTP {rtpMode === 'custom' && customBps != null ? formatBps(customBps, 2) : formatBps(targetRtpBps)}{' '}
                  with modeled operator margin {formatBps(operatorMarginBps, 2)}.
                  Useful for promotions and giveaways.
                </div>
              )}
              {rtpWarning.kind === 'very-low' && (
                <div style={{ marginTop: '8px', padding: '8px', border: '2px solid #000', fontSize: '10px' }}>
                  <strong>VERY LOW RTP — {formatBps(actualRtpBps, 2)}</strong>
                  <br />
                  Modeled operator margin {formatBps(operatorMarginBps, 2)}. Players will
                  see this RTP publicly.
                </div>
              )}
              </div>
            </div>
            )}
          </div>

          {/* Scenario Lab (25%, 50%, 100% Sellout) */}
          {!isFixed && (
          <div className="workshop-tray" style={{ marginBottom: '20px' }}>
            <div className="workshop-tray-label">
              <PixelIcon name="stats" size={12} color="#ffffff" />
              ECONOMICS SCENARIO LAB (SELL-THROUGH SIMULATION):
            </div>
            <div className="workshop-tray-body">
            <div style={{ overflowX: 'auto' }}>
            <table className="pixel-table">
              <thead>
                <tr>
                  <th>SCENARIO</th>
                  <th>PULLS</th>
                  <th>RF VOLUME</th>
                  <th>RF BURNED (5%)</th>
                  <th>OPERATOR RECEIPTS (95%)</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((sc) => (
                  <tr key={sc.percentLabel}>
                    <td style={{ fontWeight: 'bold' }}>{sc.percentLabel}</td>
                    <td>{sc.pulls} pulls</td>
                    <td>{formatRFGrouped(sc.grossVolumeUnits)}</td>
                    <td>{formatRFGrouped(sc.burnUnits)}</td>
                    <td style={{ fontWeight: 'bold' }}>
                      {formatRFGrouped(sc.creatorReceiptsUnits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </div>
          </div>
          )}

          {/* Immutability + simulated-funding notice */}
          <div className="workshop-tray">
            <div className="workshop-tray-label">
              <PixelIcon name="lock" size={12} color="#ffffff" />
              LAUNCH PAD — READ BEFORE PUBLISHING
            </div>
            <div className="workshop-tray-body">
            <div
              style={{
                fontSize: '11px',
                lineHeight: '1.5',
                marginBottom: '14px',
              }}
            >
              <strong>IMMUTABLE PUBLISH NOTICE:</strong>
              <br />
              Once your Friend Machine receives its very first pull, its economics
              {isFixed ? (
                <>, fixed prize odds, prize quantities, and pull price lock immutably.</>
              ) : (
                <>, ticket deck, and pull price lock immutably.</>
              )}{' '}
              You may only cancel and reclaim escrow BEFORE pull #1.
              <br />
              <br />
              <strong>SIMULATED VIBEATHON DEMO — NO NFT OR RF IS TRANSFERRED.</strong> NFT
              ownership is verified (on-chain where supported, otherwise a fresh
              OpenSea ownership re-query), but funding stays simulated.
              <br />
              <br />
              <strong>LOCK MACHINE ECONOMICS?</strong>
              <br />
              Rare Arcade snapshots NFT top bids and the $RF market price when the
              machine is published. Future market moves do not change this machine&apos;s
              configured economics.
              {prizes.some((p) => p.type === 'FRIEND_PRIZE') && (
                <>
                  <br />
                  <br />
                  {prizes
                    .filter((p) => p.type === 'FRIEND_PRIZE')
                    .map((p) => {
                      if (p.type !== 'FRIEND_PRIZE') return null;
                      const snap = p.valuationSnapshot;
                      return (
                        <span key={p.id} style={{ display: 'block', marginTop: '4px' }}>
                          {p.name}: NFT reference {formatRFGrouped(p.referenceValueUnits)}
                          {snap
                            ? ` • $RF ${formatUsdAdaptive(snap.rfUsd)} • top bid ${formatUsdAdaptive(snap.topBidUsd)} • updated ${
                                snap.valuedAt ? new Date(snap.valuedAt).toLocaleTimeString() : '—'
                              }`
                            : ' • LEGACY MANUAL REFERENCE (locked at creation)'}
                        </span>
                      );
                    })}
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="pixel-btn" onClick={() => setStep(2)}>
                &lt; BACK
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn-primary pixel-btn-lg"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? 'VERIFYING OWNERSHIP + MARKET DATA…' : '★ PUBLISH FRIEND MACHINE ★'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Owned-NFT Selection Drawer */}
      {showFriendDrawer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2500,
            padding: '16px',
          }}
          onClick={() => setShowFriendDrawer(false)}
        >
          <div
            className="pixel-box"
            style={{
              maxWidth: '640px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-white)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pixel-marquee">
              <span style={{ fontSize: '11px' }}>YOUR NFTS (VERIFIED WALLET)</span>
              <button
                type="button"
                className="pixel-btn pixel-btn-sm"
                style={{ padding: '2px 6px' }}
                onClick={() => setShowFriendDrawer(false)}
              >
                <PixelIcon name="close" size={12} />
              </button>
            </div>

            <div ref={drawerScrollRef} style={{ padding: '16px', overflowY: 'auto' }}>
              <div style={{ fontSize: '11px', marginBottom: '12px' }}>
                Wallet: <strong>{wallet ? `${wallet.slice(0, 10)}…${wallet.slice(-6)}` : '—'}</strong>
                {' '}• Rare Arcade loads the NFTs you actually own. Tap cards to
                multi-select — each selected NFT becomes its OWN prize line.
                Ownership is re-verified before funding. Funding stays simulated
                — no transfer, no approval.
              </div>

              <NftPicker
                fetchState={fetchState}
                groups={priced.groups}
                rfUsd={priced.rfUsd}
                refreshedAt={priced.refreshedAt}
                pricingComplete={priced.pricingComplete}
                selectedKeys={selectedKeys}
                reservedKeys={reservedNftKeys}
                onSelect={handleSelectAsset}
                onRetry={reload}
                onRefreshPrices={refreshPrices}
              />

              {selectedAssets.length > 0 && (
                <div className="workshop-tray" style={{ marginTop: '12px' }}>
                  <div className="workshop-tray-label">
                    <PixelIcon name="check" size={12} color="#ffffff" />
                    SELECTED ({selectedAssets.length}): {selectedAssets.map((a) => a.name).join(' • ').toUpperCase().slice(0, 60)}
                    {selectedAssets.map((a) => a.name).join(' • ').length > 60 ? '…' : ''}
                  </div>
                  <div className="workshop-tray-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {selectedAssets.map((a) => {
                      const key = nftPickerKey(a);
                      const verified = verifiedKeys.has(key);
                      const ap = a.pricing;
                      const ref = ap?.referenceRfUnits;
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'center',
                            border: '2px solid var(--color-black)',
                            padding: '6px 8px',
                            background: '#fff',
                          }}
                        >
                          <RareFriendImage
                            imageUrl={a.displayImageUrl || a.imageUrl}
                            name={a.name}
                            collectionName={a.collectionName}
                            tokenId={a.tokenId}
                            openseaUrl={a.openseaUrl}
                            size={48}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{a.name}</div>
                            <div style={{ fontSize: '9px', color: '#555' }}>
                              {a.collectionName} • #{a.tokenId} • {bidBadgeLabel(a)}
                            </div>
                            <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)' }}>
                              {ap?.state === 'priced' && ref !== undefined ? (
                                <>TOP-BID REF <strong>{formatRfReferenceCompact(ref)}</strong> ({formatRFGrouped(ref)})</>
                              ) : ap?.state === 'rf_unavailable' ? (
                                <>$RF PRICE UNAVAILABLE</>
                              ) : (
                                <>NO BIDS YET — BLOCKS PUBLISH</>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: '8px', background: verified ? '#000' : '#fff', color: verified ? '#fff' : '#000', border: '1px solid #000', padding: '2px 4px', whiteSpace: 'nowrap' }}>
                            {verified ? 'OWNERSHIP VERIFIED' : 'UNVERIFIED'}
                          </span>
                          <button
                            type="button"
                            className="pixel-btn pixel-btn-sm"
                            style={{ padding: '2px 6px', flexShrink: 0 }}
                            onClick={() => handleSelectAsset(a)}
                            title={`Deselect ${a.name}`}
                            aria-label={`Deselect ${a.name}`}
                          >
                            <PixelIcon name="close" size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-sm"
                      onClick={handleVerifySelected}
                      disabled={verifying || selectedAssets.every((a) => verifiedKeys.has(nftPickerKey(a)))}
                    >
                      {verifying ? 'VERIFYING…' : `VERIFY OWNERSHIP (${selectedAssets.length})`}
                    </button>
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-sm"
                      onClick={() => {
                        setSelectedAssets([]);
                        setVerifiedKeys(new Set());
                        soundFx.playClick();
                      }}
                    >
                      CLEAR ALL
                    </button>
                  </div>
                  <div style={{ fontSize: '9px', color: '#666', marginBottom: '10px' }}>
                    RARE ARCADE VALUES NFT PRIZES AUTOMATICALLY • NOT A GUARANTEED MARKET VALUE
                    {isFixed && ' • EACH NFT BECOMES ITS OWN PRIZE LINE AT THE ODDS BELOW'}
                  </div>
                  {isFixed && (
                    <>
                      <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '6px' }}>
                        CHANCE PER PULL, PER NFT (FIXED ODDS %):
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {ODDS_QUICK_PICKS.map((qs) => (
                          <button
                            key={qs}
                            type="button"
                            className={`pixel-btn pixel-btn-sm ${nftOddsStr === qs ? 'pixel-btn-primary' : ''}`}
                            onClick={() => setNftOddsStr(qs)}
                          >
                            {qs}%
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '0', marginBottom: '6px' }}>
                        <input
                          type="number"
                          min="0.0001"
                          step="0.01"
                          value={nftOddsStr}
                          onChange={(e) => setNftOddsStr(e.target.value)}
                          aria-label="Custom odds percent for Rare Friend prize"
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '2px solid var(--color-black)',
                            borderRight: 'none',
                            fontSize: '12px',
                          }}
                          placeholder="CUSTOM, e.g. 0.25"
                        />
                        <span
                          style={{
                            background: '#000',
                            color: '#fff',
                            fontFamily: 'var(--font-lcd)',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0 10px',
                          }}
                        >
                          %
                        </span>
                      </div>
                      <div style={{ fontSize: '9px', color: '#666', marginBottom: '10px' }}>
                        QTY 1 PER NFT (UNIQUE) • EACH LINE STAYS FIXED EVERY PULL • SOLD-OUT SLOTS BECOME EMPTY
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleConfirmAddFriend}
                  >
                    CONFIRM & SIMULATE FUNDING ({selectedAssets.length})
                  </button>
                  <div style={{ fontSize: '9px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                    VERIFIED OWNED NFTS • SIMULATED MACHINE FUNDING • NO TRANSFER
                  </div>
                  </div>
                </div>
              )}
            </div>
            {selectedAssets.length > 0 && (
              <button
                type="button"
                className="pixel-btn pixel-btn-primary"
                style={{
                  position: 'absolute',
                  right: '12px',
                  bottom: '12px',
                  zIndex: 5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 12px',
                  fontSize: '11px',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.35)',
                }}
                onClick={() => {
                  drawerScrollRef.current?.scrollTo({
                    top: drawerScrollRef.current.scrollHeight,
                    behavior: 'smooth',
                  });
                  soundFx.playClick();
                }}
                title="Scroll to review panel and confirm"
                aria-label={`Scroll down to review ${selectedAssets.length} selected NFTs and confirm`}
              >
                <span aria-hidden="true">▼</span>
                REVIEW {selectedAssets.length} SELECTED
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Fixed Odds step-3 sections (top-level for stable identity — inputs keep
   focus because these components never remount on keystrokes).
   ========================================================================== */

function FixedOddsModeSection(props: {
  oddsMode: 'manual' | 'target';
  setOddsMode: (m: 'manual' | 'target') => void;
  assistTargetStr: string;
  setAssistTargetStr: (s: string) => void;
  onApplyAssist: () => void;
  assistResult: { achievedRtpBps: number; capped: boolean } | null;
  prizes: PrizeEntry[];
  onUpdateOdds: (id: string, ppm: number) => void;
}): React.ReactElement {
  const {
    oddsMode,
    setOddsMode,
    assistTargetStr,
    setAssistTargetStr,
    onApplyAssist,
    assistResult,
    prizes,
    onUpdateOdds,
  } = props;
  const lines = prizes.filter(
    (p): p is Extract<PrizeEntry, { type: 'RF_PRIZE' | 'FRIEND_PRIZE' }> =>
      p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE'
  );
  return (
    <div className="workshop-tray">
      <div className="workshop-tray-label">
        <PixelIcon name="dial" size={12} color="#ffffff" />
        PRIZE ODDS MODE
      </div>
      <div className="workshop-tray-body">
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`pixel-btn pixel-btn-sm ${oddsMode === 'manual' ? 'pixel-btn-primary' : ''}`}
            onClick={() => {
              setOddsMode('manual');
              soundFx.playClick();
            }}
          >
            SET ODDS
          </button>
          <button
            type="button"
            className={`pixel-btn pixel-btn-sm ${oddsMode === 'target' ? 'pixel-btn-primary' : ''}`}
            onClick={() => {
              setOddsMode('target');
              soundFx.playClick();
            }}
          >
            TARGET RTP
          </button>
        </div>

        {oddsMode === 'target' ? (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '6px' }}>
              Enter a desired RTP — Rare Arcade proposes per-prize odds. Review and
              edit them below; the final actual probabilities always win.
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '9px', color: '#666' }}>TARGET RTP (%)</label>
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={assistTargetStr}
                onChange={(e) => setAssistTargetStr(e.target.value)}
                aria-label="Assist target RTP percent"
                style={{
                  width: '110px',
                  padding: '6px',
                  border: '2px solid var(--color-black)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
                placeholder="e.g. 80"
              />
              <button
                type="button"
                className="pixel-btn pixel-btn-sm pixel-btn-primary"
                onClick={onApplyAssist}
              >
                APPLY SUGGESTED ODDS
              </button>
            </div>
            {assistResult && (
              <div style={{ fontSize: '10px', marginTop: '6px' }}>
                Suggested odds reach {formatBps(assistResult.achievedRtpBps, 2)} actual RTP
                {assistResult.capped ? ' (target unachievable — capped at 100% total)' : ''}.
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>
            Set each prize's chance per pull directly. Rare Arcade computes the
            resulting RTP live below.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {lines.length === 0 && (
            <div style={{ fontSize: '10px', color: '#666' }}>
              No prizes yet — go back to Step 2 and seed some.
            </div>
          )}
          {lines.map((p) => {
            const label =
              p.type === 'RF_PRIZE'
                ? formatRFGrouped(p.amountUnits)
                : `${p.name} (NFT ×1)`;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--color-lcd-bg)',
                  border: '2px solid var(--color-black)',
                  padding: '6px 8px',
                  fontSize: '11px',
                }}
              >
                <span style={{ flex: 1, fontWeight: 'bold', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                <label style={{ fontSize: '9px', color: '#666', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  ODDS %
                  <input
                    type="number"
                    min="0.0001"
                    step="0.01"
                    value={p.oddsPpm !== undefined ? Number((p.oddsPpm / 10000).toFixed(4)) : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') return;
                      try {
                        onUpdateOdds(p.id, parseOddsPercentToPpm(v));
                      } catch {
                        // Live-typing an invalid value keeps last good odds.
                      }
                    }}
                    aria-label={`Fixed odds percent for prize ${p.id}`}
                    style={{
                      width: '84px',
                      padding: '4px',
                      border: '2px solid var(--color-black)',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  />
                </label>
                <span style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  = {p.oddsPpm !== undefined ? formatOddsPpm(p.oddsPpm) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FixedSummarySection(props: {
  prizes: PrizeEntry[];
  pullPriceUnits: bigint;
  fixedConfiguredRtpBps: number | null;
}): React.ReactElement {
  const { prizes, pullPriceUnits, fixedConfiguredRtpBps } = props;

  const totals = (() => {
    let totalPpm = 0;
    for (const p of prizes) {
      if ((p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE') && p.oddsPpm !== undefined) {
        totalPpm += p.oddsPpm;
      }
    }
    return { totalPpm, noPrizePpm: Math.max(0, 1000000 - totalPpm) };
  })();

  const selloutRange = React.useMemo(() => {
    const lines = prizes
      .filter(
        (e): e is Extract<PrizeEntry, { type: 'RF_PRIZE' | 'FRIEND_PRIZE' }> =>
          (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') &&
          e.initialQuantity > 0 &&
          (e.oddsPpm ?? 0) > 0
      )
      .map((e) => ({
        prizeEntryId: e.id,
        oddsPpm: e.oddsPpm ?? 0,
        quantity: e.initialQuantity,
        referenceValueUnits: e.type === 'RF_PRIZE' ? e.amountUnits : e.referenceValueUnits,
      }));
    if (lines.length === 0 || pullPriceUnits <= 0n) return null;
    try {
      const report = simulateFixedOddsLifetime({ lines, pullPriceUnits, runs: 300, seed: 5 });
      const fmt = (n: number) => n.toLocaleString('en-US');
      return `${fmt(report.pullsToSellout.p25)} – ${fmt(report.pullsToSellout.p75)} PULLS (MODELED)`;
    } catch {
      return null;
    }
  }, [prizes, pullPriceUnits]);

  const edge =
    fixedConfiguredRtpBps !== null ? calculateCreatorEdgeBps(fixedConfiguredRtpBps) : null;

  return (
    <div className="workshop-tray" style={{ alignSelf: 'start' }}>
      <div className="workshop-tray-label">
        <PixelIcon name="activity" size={12} color="#ffffff" />
        MODELED ECONOMICS SUMMARY
      </div>
      <div className="workshop-tray-body">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          <div className="workshop-lcd-tile">
            <div className="workshop-lcd-caption">PLATFORM BURN</div>
            <div className="workshop-lcd-value">5.0% FIXED</div>
          </div>
          <div className="workshop-lcd-tile">
            <div className="workshop-lcd-caption">CONFIGURED RTP</div>
            <div className="workshop-lcd-value">
              {fixedConfiguredRtpBps !== null ? formatBps(fixedConfiguredRtpBps, 2) : '—'}
            </div>
          </div>
          <div className="workshop-lcd-tile">
            <div className="workshop-lcd-caption">MODELED EDGE</div>
            <div className="workshop-lcd-value">
              {edge !== null ? `${formatBps(edge, 2)} (95% − RTP)` : '—'}
            </div>
          </div>
          <div className="workshop-lcd-tile">
            <div className="workshop-lcd-caption">NO-PRIZE ODDS</div>
            <div className="workshop-lcd-value">{formatOddsPpm(totals.noPrizePpm)}</div>
          </div>
          <div className="workshop-lcd-tile" style={{ gridColumn: '1 / -1' }}>
            <div className="workshop-lcd-caption">MODELED SELLOUT RANGE</div>
            <div className="workshop-lcd-value">{selloutRange ?? '—'}</div>
          </div>
        </div>
        {fixedConfiguredRtpBps !== null && fixedConfiguredRtpBps > 10000 && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#000', color: '#fff', fontSize: '10px' }}>
            <strong>CREATOR-SUBSIDIZED MACHINE</strong>
            <br />
            Configured RTP {formatBps(fixedConfiguredRtpBps, 2)} with modeled edge{' '}
            {edge !== null ? formatBps(edge, 2) : '—'}. Useful for promotions and giveaways.
          </div>
        )}
        {fixedConfiguredRtpBps !== null && fixedConfiguredRtpBps > 9500 && fixedConfiguredRtpBps <= 10000 && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#000', color: '#fff', fontSize: '10px' }}>
            <strong>PLAYER-FAVORABLE ECONOMICS</strong>
            <br />
            This machine&apos;s modeled prize value exceeds the creator&apos;s post-burn
            pull receipts.
          </div>
        )}
      </div>
    </div>
  );
}
