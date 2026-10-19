import type {
  FriendPrizeEntry,
  Machine,
  RfPrizeEntry,
  UsdgPrizeEntry,
} from '../../domain/types.ts';

export type TopPrizeVisual =
  | { kind: 'nft'; entry: FriendPrizeEntry }
  | { kind: 'usdg'; entry: UsdgPrizeEntry }
  | { kind: 'rf'; entry: RfPrizeEntry }
  | { kind: 'mascot' };

/**
 * Decide what a cabinet LCD shows as its top prize.
 * - A remaining Friend prize (real art or legacy sprite) always wins.
 * - Otherwise the largest remaining cashback line, in USDG units so the two
 *   cashback currencies compare against each other on one scale.
 * - The mascot sprite is only a last resort when nothing remains.
 */
export function selectTopPrizeVisual(
  machine: Pick<Machine, 'remainingPrizes'>
): TopPrizeVisual {
  const topFriend = machine.remainingPrizes.find(
    (p): p is FriendPrizeEntry => p.type === 'FRIEND_PRIZE' && p.remainingQuantity > 0
  );
  if (topFriend) return { kind: 'nft', entry: topFriend };

  const topCashback = machine.remainingPrizes
    .filter(
      (p): p is UsdgPrizeEntry | RfPrizeEntry =>
        (p.type === 'USDG_PRIZE' || p.type === 'RF_PRIZE') && p.remainingQuantity > 0
    )
    .sort((a, b) => {
      const av = a.type === 'USDG_PRIZE' ? a.amountUnits : a.usdgValueUnits;
      const bv = b.type === 'USDG_PRIZE' ? b.amountUnits : b.usdgValueUnits;
      return av > bv ? -1 : av < bv ? 1 : 0;
    })[0];
  if (topCashback) {
    return topCashback.type === 'USDG_PRIZE'
      ? { kind: 'usdg', entry: topCashback }
      : { kind: 'rf', entry: topCashback };
  }

  return { kind: 'mascot' };
}
