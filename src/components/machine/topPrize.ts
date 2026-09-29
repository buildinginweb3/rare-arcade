import type {
  FriendPrizeEntry,
  Machine,
  RFPrizeEntry,
} from '../../domain/types.ts';

export type TopPrizeVisual =
  | { kind: 'nft'; entry: FriendPrizeEntry }
  | { kind: 'rf'; entry: RFPrizeEntry }
  | { kind: 'mascot' };

/**
 * Decide what a cabinet LCD shows as its top prize.
 * - A remaining Friend prize (real art or legacy sprite) wins over RF.
 * - RF tokens render the $RF pixel coin — never a random Rare Friend sprite.
 * - The mascot sprite is only a last resort when nothing remains.
 */
export function selectTopPrizeVisual(
  machine: Pick<Machine, 'remainingPrizes'>
): TopPrizeVisual {
  const topFriend = machine.remainingPrizes.find(
    (p): p is FriendPrizeEntry => p.type === 'FRIEND_PRIZE' && p.remainingQuantity > 0
  );
  if (topFriend) return { kind: 'nft', entry: topFriend };

  const topRf = machine.remainingPrizes
    .filter((p): p is RFPrizeEntry => p.type === 'RF_PRIZE' && p.remainingQuantity > 0)
    .sort((a, b) => Number(b.amountUnits - a.amountUnits))[0];
  if (topRf) return { kind: 'rf', entry: topRf };

  return { kind: 'mascot' };
}
