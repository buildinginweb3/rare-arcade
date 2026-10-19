import React, { useState, useEffect } from 'react';
import {
  loadAppState,
  saveAppState,
  resetDemoData,
  type AppState,
  type AppSettings,
} from './data/storage.ts';
import { subRF, addRF, formatRFGrouped } from './domain/rf.ts';
import { subUsdg, addUsdg, formatUsdgGrouped } from './domain/usdg.ts';
import { useRfPrice } from './nfts/useRfPrice.ts';
import {
  shouldExecuteBuyback,
  executeBuybackBurn,
  applyBurnToLedger,
  BUYBACK_BATCH_THRESHOLD_USDG,
} from './domain/buyback.ts';
import type { Machine, PullResult, LedgerEvent, RareFriendMetadata } from './domain/types.ts';
import { AppHeader, type NavTab } from './components/ui/AppHeader.tsx';
import { ArcadeFloor } from './pages/ArcadeFloor.tsx';
import { MachineDetail } from './pages/MachineDetail.tsx';
import { CreatorWorkshop } from './pages/CreatorWorkshop.tsx';
import { CreatorDashboard } from './pages/CreatorDashboard.tsx';
import { PlayerInventoryPage } from './pages/PlayerInventoryPage.tsx';
import { TokenActivityPage } from './pages/TokenActivityPage.tsx';
import { OnboardingModal } from './components/ui/OnboardingModal.tsx';
import { soundFx } from './utils/audio.ts';
import { collectReservedNftKeys, buildOperatorAddresses, isOperatorMachine } from './nfts/ownership.ts';
import { normalizeAddress } from './nfts/collections.ts';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => loadAppState());
  // Supplies the RF price each buyback batch executes at. Falls back to the
  // documented constant (flagged, never silent) if the live price is
  // unavailable; live mode routes this through the RF oracle instead.
  const rfPrice = useRfPrice();
  const [activeTab, setActiveTab] = useState<NavTab>('ARCADE');
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => !state.settings.hasSeenOnboarding
  );

  // Sync sound setting with retro audio engine
  useEffect(() => {
    soundFx.setEnabled(state.settings.soundEnabled);
  }, [state.settings.soundEnabled]);

  // Persist state changes
  useEffect(() => {
    saveAppState(state);
  }, [state]);

  const updateSettings = (partial: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...partial },
    }));
  };

  const handleResetData = () => {
    const fresh = resetDemoData();
    setState(fresh);
    setActiveTab('ARCADE');
    setActiveMachineId(null);
  };

  // Pull prize resolution
  const handlePlayerWonPrize = (result: PullResult) => {
    setState((prev) => {
      // 1. Deduct the pull price from the player's USDG balance.
      //    USDG is the only currency a pull can be paid in.
      let newPlayerUsdg = subUsdg(prev.playerInventory.usdgBalanceUnits, result.spentUnits);

      // 2. Rewards are credited into whichever balance they were won in:
      //    USDG rewards into USDG, RF rewards into the separate RF balance.
      let newPlayerRf = prev.playerInventory.rfBalanceUnits;
      if (result.usdgWonUnits > 0n) {
        newPlayerUsdg = addUsdg(newPlayerUsdg, result.usdgWonUnits);
      }
      if (result.rfWonUnits > 0n) {
        newPlayerRf = addRF(newPlayerRf, result.rfWonUnits);
      }

      // 3. If won Friend, add to wonFriends list
      const newWonFriends = [...prev.playerInventory.wonFriends];
      if (result.prizeType === 'FRIEND_PRIZE' && result.friendWon) {
        newWonFriends.push(result.friendWon);
      }

      // 4. Record pull history
      const activeMachine = prev.machines.find((m) => m.id === activeMachineId);
      const newPullHistory = [
        {
          machineId: activeMachineId || 'unknown',
          machineName: activeMachine?.name || 'Friend Machine',
          timestamp: Date.now(),
          result,
        },
        ...prev.playerInventory.pullHistory,
      ];

      // 5. Credit creator proceeds (95%) and track the 5% platform fee the
      //    machine generated: 75% to the treasury, 25% into the RF buyback
      //    pot — see PLATFORM_FEE_RECIPIENTS in domain/fees.ts.
      const newCreatorProceeds = addUsdg(
        prev.creatorAccount.totalProceedsUnits,
        result.creatorReceiptUnits
      );
      const newCreatorFees = addUsdg(
        prev.creatorAccount.totalPlatformFeesGeneratedUnits,
        result.platformFeeUnits
      );

      // Also credit creator balance if one of this operator's identities
      // owns this machine (demo address and/or connected wallet, any case).
      let newCreatorUsdg = prev.creatorAccount.usdgBalanceUnits;
      const operatorIds = buildOperatorAddresses(
        prev.creatorAccount.address,
        prev.settings.connectedWalletAddress
      );
      if (activeMachine && isOperatorMachine(activeMachine.creatorAddress, operatorIds)) {
        newCreatorUsdg = addUsdg(newCreatorUsdg, result.creatorReceiptUnits);
      }

      // 6. The 25% buyback share is pooled PLATFORM-WIDE, not per machine, so
      //    it accrues into a single pot. When the pot clears the batch
      //    threshold it is swapped to RF and burned in one go. The pot stays
      //    denominated in USDG right up to that point, which is what keeps a
      //    volatile RF price away from anything a player was charged.
      let buyback = {
        ...prev.buyback,
        totalFundedUsdgUnits: prev.buyback.totalFundedUsdgUnits + result.buybackFeeUnits,
        pendingUsdgUnits: prev.buyback.pendingUsdgUnits + result.buybackFeeUnits,
      };
      const ledgerEvents = [...prev.ledgerEvents];
      if (shouldExecuteBuyback(buyback.pendingUsdgUnits, BUYBACK_BATCH_THRESHOLD_USDG)) {
        try {
          const burn = executeBuybackBurn({
            accruedUsdgUnits: buyback.pendingUsdgUnits,
            quotedPriceUsdg: rfPrice.quote.usdgPerRf,
          });
          buyback = applyBurnToLedger(buyback, burn);
          ledgerEvents.unshift({
            id: `evt-burn-${burn.burnedAt}-${Math.random()}`,
            machineId: 'platform',
            machineName: 'Rare Arcade Platform',
            type: 'RF_BURNED',
            actorAddress: burn.burnSink,
            timestamp: burn.burnedAt,
            usdgAmountUnits: burn.usdgSpentUnits,
            rfAmountUnits: burn.rfBurnedUnits,
            burnPriceUsdg: burn.effectivePriceUsdg,
            burnSink: burn.burnSink,
            details:
              `Buyback batch: spent ${formatUsdgGrouped(burn.usdgSpentUnits)} of platform fees to buy ` +
              `${formatRFGrouped(burn.rfBurnedUnits)} $RAREFRIENDS at $${burn.effectivePriceUsdg}/RF and burned them`,
          });
        } catch {
          // A failed batch leaves the pot intact and unspendable-by-force.
          // Never book a burn that did not happen.
        }
      }

      return {
        ...prev,
        buyback,
        playerInventory: {
          ...prev.playerInventory,
          usdgBalanceUnits: newPlayerUsdg,
          rfBalanceUnits: newPlayerRf,
          wonFriends: newWonFriends,
          pullHistory: newPullHistory,
        },
        creatorAccount: {
          ...prev.creatorAccount,
          usdgBalanceUnits: newCreatorUsdg,
          totalProceedsUnits: newCreatorProceeds,
          totalPlatformFeesGeneratedUnits: newCreatorFees,
        },
        ledgerEvents,
      };
    });
  };

  // Update machine state and record ledger events
  const handleUpdateMachine = (updatedMachine: Machine, events: LedgerEvent[]) => {
    setState((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => (m.id === updatedMachine.id ? updatedMachine : m)),
      ledgerEvents: [...events, ...prev.ledgerEvents],
    }));
  };

  // Publish new machine from Creator Workshop
  const handlePublishMachine = (
    newMachine: Machine,
    usdgEscrow: bigint,
    rfEscrow: bigint,
    seededFriends: RareFriendMetadata[],
    events: LedgerEvent[]
  ) => {
    setState((prev) => {
      // Deduct both escrows: USDG rewards from the USDG balance, RF rewards
      // from the separate RF reserve. They are distinct pools and can never
      // substitute for each other.
      const newCreatorUsdg = subUsdg(prev.creatorAccount.usdgBalanceUnits, usdgEscrow);
      const newCreatorRf = subRF(prev.creatorAccount.rfBalanceUnits, rfEscrow);

      // Real NFTs were never in local inventory (simulated funding), so only
      // legacy demo entries are removed here. Never fabricate ownership.
      const seededLegacyIds = new Set(
        seededFriends.filter((f) => !f.contractAddress).map((f) => f.tokenId)
      );
      const remainingOwnedFriends = prev.creatorAccount.ownedFriends.filter(
        (f) => !seededLegacyIds.has(f.tokenId)
      );

      return {
        ...prev,
        machines: [newMachine, ...prev.machines],
        creatorAccount: {
          ...prev.creatorAccount,
          usdgBalanceUnits: newCreatorUsdg,
          rfBalanceUnits: newCreatorRf,
          ownedFriends: remainingOwnedFriends,
          machinesCreatedCount: prev.creatorAccount.machinesCreatedCount + 1,
        },
        ledgerEvents: [...events, ...prev.ledgerEvents],
      };
    });

    // Jump directly to view the newly published machine!
    setActiveMachineId(newMachine.id);
  };

  // Cancel pre-pull machine
  const handleMachineCancelled = (
    cancelledMachine: Machine,
    refundUsdg: bigint,
    refundRf: bigint,
    events: LedgerEvent[]
  ) => {
    setState((prev) => {
      const restoredFriends = [...prev.creatorAccount.ownedFriends];
      for (const entry of cancelledMachine.initialPrizes) {
        if (entry.type === 'FRIEND_PRIZE') {
          // Only legacy demo entries restore into local inventory. Real NFTs
          // were never removed (funding is simulated), so never fabricate them.
          if (!entry.contractAddress) {
            restoredFriends.push({
              tokenId: entry.tokenId,
              name: entry.name,
              familyName: entry.familyName,
              generation: entry.generation,
              spriteRows: entry.spriteRows,
              demoUsdgValueUnits: entry.usdgValueUnits,
            });
          }
        }
      }

      return {
        ...prev,
        machines: prev.machines.map((m) => (m.id === cancelledMachine.id ? cancelledMachine : m)),
        creatorAccount: {
          ...prev.creatorAccount,
          usdgBalanceUnits: addUsdg(prev.creatorAccount.usdgBalanceUnits, refundUsdg),
          rfBalanceUnits: addRF(prev.creatorAccount.rfBalanceUnits, refundRf),
          ownedFriends: restoredFriends,
        },
        ledgerEvents: [...events, ...prev.ledgerEvents],
      };
    });
  };

  // Pause / resume a machine. Both are pure state transitions over escrow:
  // no balance moves, the prizes simply stop being playable until resumed.
  const handleMachinePaused = (pausedMachine: Machine, events: LedgerEvent[]) => {
    setState((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => (m.id === pausedMachine.id ? pausedMachine : m)),
      ledgerEvents: [...events, ...prev.ledgerEvents],
    }));
  };

  const handleMachineResumed = (resumedMachine: Machine, events: LedgerEvent[]) => {
    setState((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => (m.id === resumedMachine.id ? resumedMachine : m)),
      ledgerEvents: [...events, ...prev.ledgerEvents],
    }));
  };

  // Creator withdraws the unused prize escrow still sitting in a machine.
  // The machine is already wound down by the domain layer, so this only has to
  // return the money and the returned Friends to the creator.
  const handleEscrowWithdrawn = (
    withdrawnMachine: Machine,
    refundUsdg: bigint,
    refundRf: bigint,
    refundFriends: RareFriendMetadata[],
    events: LedgerEvent[]
  ) => {
    setState((prev) => {
      const ownedFriends = [...prev.creatorAccount.ownedFriends];
      for (const friend of refundFriends) {
        // Real NFTs were never taken out of local inventory when the machine
        // was funded (funding is simulated), so they must not be duplicated
        // here — only legacy demo entries return to the local inventory.
        if (!friend.contractAddress) {
          ownedFriends.push(friend);
        }
      }

      return {
        ...prev,
        machines: prev.machines.map((m) =>
          m.id === withdrawnMachine.id ? withdrawnMachine : m
        ),
        creatorAccount: {
          ...prev.creatorAccount,
          usdgBalanceUnits: addUsdg(prev.creatorAccount.usdgBalanceUnits, refundUsdg),
          rfBalanceUnits: addRF(prev.creatorAccount.rfBalanceUnits, refundRf),
          ownedFriends,
        },
        ledgerEvents: [...events, ...prev.ledgerEvents],
      };
    });
  };

  // Determine current player address based on active role
  const currentPlayerAddress =
    state.settings.activeRole === 'PLAYER'
      ? '0xSimulatedPlayer99'
      : state.creatorAccount.address;

  const currentMachine = state.machines.find((m) => m.id === activeMachineId);
  const recentMachineEvents = state.ledgerEvents.filter(
    (e) => e.machineId === activeMachineId
  );

  // NFTs funded into LIVE local machines (demo reservation, real-nft only).
  const reservedNftKeys = collectReservedNftKeys(state.machines, { includeDrafts: false });
  const walletAddress = state.settings.connectedWalletAddress
    ? normalizeAddress(state.settings.connectedWalletAddress) || null
    : null;

  // Every address that counts as "you" when operating: the demo creator id
  // plus the connected wallet (if any). Published machines carry whichever
  // identity funded them, so the dashboard/cancel rights must accept both.
  const operatorAddresses = buildOperatorAddresses(
    state.creatorAccount.address,
    walletAddress
  );
  const isOwnMachine =
    !!currentMachine && isOperatorMachine(currentMachine.creatorAddress, operatorAddresses);

  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <AppHeader
        currentTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setActiveMachineId(null);
        }}
        playerUsdgBalanceUnits={state.playerInventory.usdgBalanceUnits}
        playerRfBalanceUnits={state.playerInventory.rfBalanceUnits}
        creatorUsdgBalanceUnits={state.creatorAccount.usdgBalanceUnits}
        creatorRfBalanceUnits={state.creatorAccount.rfBalanceUnits}
        settings={state.settings}
        onUpdateSettings={updateSettings}
        onResetData={handleResetData}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />

      <main style={{ flex: 1 }}>
        {/* If viewing a specific machine detail */}
        {activeMachineId && currentMachine ? (
          <MachineDetail
            machine={currentMachine}
            playerAddress={currentPlayerAddress}
            playerBalanceUnits={
              state.settings.activeRole === 'PLAYER'
                ? state.playerInventory.usdgBalanceUnits
                : state.creatorAccount.usdgBalanceUnits
            }
            onUpdateMachine={handleUpdateMachine}
            onPlayerWonPrize={handlePlayerWonPrize}
            onMachineCancelled={handleMachineCancelled}
            onMachinePaused={handleMachinePaused}
            onMachineResumed={handleMachineResumed}
            onEscrowWithdrawn={handleEscrowWithdrawn}
            operatorAddresses={operatorAddresses}
            onBack={() => setActiveMachineId(null)}
            recentMachineEvents={recentMachineEvents}
            isOwnMachine={isOwnMachine}
          />
        ) : activeTab === 'ARCADE' ? (
          <ArcadeFloor
            machines={state.machines}
            onSelectMachine={(id) => setActiveMachineId(id)}
            onNavigateCreate={() => setActiveTab('CREATE')}
          />
        ) : activeTab === 'CREATE' ? (
          <CreatorWorkshop
            creatorAddress={state.creatorAccount.address}
            creatorUsdgBalanceUnits={state.creatorAccount.usdgBalanceUnits}
            creatorRfBalanceUnits={state.creatorAccount.rfBalanceUnits}
            walletAddress={walletAddress}
            onConnectWallet={(addr) => updateSettings({ connectedWalletAddress: addr })}
            onDisconnectWallet={() => updateSettings({ connectedWalletAddress: undefined })}
            reservedNftKeys={reservedNftKeys}
            onPublishMachine={handlePublishMachine}
            onCancel={() => setActiveTab('ARCADE')}
          />
        ) : activeTab === 'CREATOR_DASHBOARD' ? (
          <CreatorDashboard
            creator={state.creatorAccount}
            machines={state.machines}
            operatorAddresses={operatorAddresses}
            onSelectMachine={(id) => setActiveMachineId(id)}
            onNavigateCreate={() => setActiveTab('CREATE')}
            onMachineCancelled={handleMachineCancelled}
            onMachinePaused={handleMachinePaused}
            onMachineResumed={handleMachineResumed}
            onEscrowWithdrawn={handleEscrowWithdrawn}
          />
        ) : activeTab === 'INVENTORY' ? (
          <PlayerInventoryPage
            inventory={state.playerInventory}
            onNavigateArcade={() => setActiveTab('ARCADE')}
          />
        ) : activeTab === 'ACTIVITY' ? (
          <TokenActivityPage
            events={state.ledgerEvents}
            machines={state.machines}
            buyback={state.buyback}
          />
        ) : null}
      </main>

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          onPlay={() => {
            setActiveTab('ARCADE');
            updateSettings({ hasSeenOnboarding: true });
          }}
          onCreate={() => {
            setActiveTab('CREATE');
            updateSettings({ hasSeenOnboarding: true });
          }}
          onClose={() => {
            setShowOnboarding(false);
            updateSettings({ hasSeenOnboarding: true });
          }}
        />
      )}
    </div>
  );
};
