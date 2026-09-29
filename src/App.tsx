import React, { useState, useEffect } from 'react';
import {
  loadAppState,
  saveAppState,
  resetDemoData,
  type AppState,
  type AppSettings,
} from './data/storage.ts';
import { subRF, addRF } from './domain/rf.ts';
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
      // 1. Deduct pull price from player RF
      let newPlayerRf = subRF(prev.playerInventory.rfBalanceUnits, result.spentUnits);

      // 2. If won RF prize, add to player balance
      if (result.prizeType === 'RF_PRIZE') {
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

      // 5. Credit creator proceeds
      const newCreatorProceeds = addRF(
        prev.creatorAccount.totalProceedsUnits,
        result.creatorReceiptUnits
      );
      const newCreatorBurn = addRF(
        prev.creatorAccount.totalBurnGeneratedUnits,
        result.burnedUnits
      );

      // Also credit creator balance if one of this operator's identities
      // owns this machine (demo address and/or connected wallet, any case).
      let newCreatorRf = prev.creatorAccount.rfBalanceUnits;
      const operatorIds = buildOperatorAddresses(
        prev.creatorAccount.address,
        prev.settings.connectedWalletAddress
      );
      if (activeMachine && isOperatorMachine(activeMachine.creatorAddress, operatorIds)) {
        newCreatorRf = addRF(newCreatorRf, result.creatorReceiptUnits);
      }

      return {
        ...prev,
        playerInventory: {
          ...prev.playerInventory,
          rfBalanceUnits: newPlayerRf,
          wonFriends: newWonFriends,
          pullHistory: newPullHistory,
        },
        creatorAccount: {
          ...prev.creatorAccount,
          rfBalanceUnits: newCreatorRf,
          totalProceedsUnits: newCreatorProceeds,
          totalBurnGeneratedUnits: newCreatorBurn,
        },
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
    rfEscrow: bigint,
    seededFriends: RareFriendMetadata[],
    events: LedgerEvent[]
  ) => {
    setState((prev) => {
      // Deduct RF escrow
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
              demoReferenceValueUnits: entry.referenceValueUnits,
            });
          }
        }
      }

      return {
        ...prev,
        machines: prev.machines.map((m) => (m.id === cancelledMachine.id ? cancelledMachine : m)),
        creatorAccount: {
          ...prev.creatorAccount,
          rfBalanceUnits: addRF(prev.creatorAccount.rfBalanceUnits, refundRf),
          ownedFriends: restoredFriends,
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
        playerRfBalanceUnits={state.playerInventory.rfBalanceUnits}
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
                ? state.playerInventory.rfBalanceUnits
                : state.creatorAccount.rfBalanceUnits
            }
            onUpdateMachine={handleUpdateMachine}
            onPlayerWonPrize={handlePlayerWonPrize}
            onMachineCancelled={handleMachineCancelled}
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
