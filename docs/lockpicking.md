# Lockpicking foundation

Source: official [Rulebook v1.0](https://www.dropbox.com/scl/fi/w8kkq9m6gwcwaawien7cw/TES_Rulebook.pdf?rlkey=tz1ctc1cc0ttummjzzx5xt24i&dl=0), printed pp68–70, and [extended tutorial](https://www.dropbox.com/scl/fi/4qs75zew966mo5x34xo60/TES_Tutorial_Online.pdf?rlkey=63ep6fiz174wk9rvqferu8qts&dl=0), p19. These links originate on the publisher's [support page](https://chiptheorygames.com/pages/support/the-elder-scrolls). The same links now serve Rulebook v1.1 and Tutorial v1.1; pp.68–70 and T p19 were re-read on 2026-11-10 and describe the same procedure, example numbers and item.

`src/tabletop/lockpicking.js` implements a pure check with injected rolls and choices. It covers the published three-digit common code and the example containing one prerequisite key digit plus three ordinary digits. Other code structures are explicitly unsupported, pending component evidence.

## Sequence and contract

1. `createLockpickCheck({digits, attemptLimit, keyDigit?})` creates the check; digits are ordinary required values and the optional key is separate.
2. `rollLockpick(check, {results, keep?})` supplies three results on the first attempt. Later, `keep` contains physical die indexes to retain; new results fill other indexes in ascending order. The function does not generate randomness.
3. `adjustLockpick(check, {dieIndex, delta})` proposes an adjusted state and returns its `fatigueCost`. Every step costs one light fatigue; moving from 1 to 6 costs 5, and crossing the face bounds is invalid. The controller must apply fatigue through the real cooldown/supply rules before committing the proposed adjustment. If fatigue application fails, do not commit either change.
4. `resolveLockpick(check)` compares the results and transitions to `success`, `failure`, or `continue`. To continue, roll again with selected kept dice. A key must be matched before other values may be retained; the key match persists after resolving that attempt, so its physical die can be rerolled. Ordinary digits only persist while their physical dice remain kept.
5. `stopLockpick(check)` fails a check after an unsuccessful attempt if the player chooses not to continue.
6. `cacheOutcome(check, {takeItem?})` reports normal-cache disposition: always remove the cache; take or discard the item after success; cycle the top card to deck bottom on failure. Trap effects and encounter-specific cache overrides must be handled by the encounter controller.

The functions return detached state and never mutate inputs. `fatigueSpent` records the proposed check's cumulative cost; it is not a replacement for the adventurer's actual ordered cooldown track.

## Exact Jailbreak test fixture

R p69 and T p19 prescribe a common cache with code 5-2-2 and three attempts. The tutorial's first roll is 1, 2, 3; change 3 to 2 for one light fatigue. Keep both 2s, reroll the 1 into 3, then change 3 to 5 for two more light fatigue. The check succeeds on attempt 2, costing three light fatigue in total. The item is **Falkreath Meat Loaf**, placed into the adventurer's ready slots. The test reproduces these exact numerical inputs and outcome.

Entering the cache hex during the adventurer's own turn allows the optional check. It interrupts movement rather than inherently ending the move; remaining movement may continue after the check. Success counts toward the Jailbreak lockpick achievement (R pp68–69,93; T p19). If the player declines to attempt the check, do not remove the cache merely for entering its hex.

The public tutorial deliberately fixes the item on top of the common deck. Normal Jailbreak uses the actual shuffled common deck, so this single item/code may be called a **tutorial fixture**, not a substitute for all 100 common items. The official [item-count erratum](https://support.chiptheorygames.com/support/solutions/articles/33000292376-item-card-count-should-be-100-common-60-legendary) corrects the printed rulebook's 110 common / 50 legendary split to 100 common / 60 legendary.

The pictured card on T p5 was visually verified: **CO-019**, common consumable, Meat trait. Consuming it discards the item and gives either its user 3 bonus HP or every adventurer 1 bonus HP. This adds bonus HP, not ordinary healing. R p28 allows an item without specific timing during deployment or its owner's turn, with battle use restricted to ready items. Inventory holds 8 cards total, with 4 ready slots; a newly gained item may be placed immediately into a ready slot, moving an existing item into the pack if needed. R p29 requires a consumable to be discarded after its single use. R p20 requires bonus HP to absorb physical damage first, allows it beyond the Health maximum, and excludes it from true-damage absorption and enemy strongest/weakest priority. R p86 clears remaining bonus HP after battle. The lockpick module intentionally leaves this verified item effect and those inventory rules to the encounter engine.

## Encounter integration

`src/tabletop/engine.js` applies this module to the Jailbreak cache (actions `lockpick-roll`, `lockpick-adjust`, `lockpick-resolve`, `lockpick-stop`, `lockpick-decline` and `cache-item`):

- The server supplies every lockpick roll; a client can choose only which dice to keep.
- Each adjustment's whole fatigue cost is paid through the adventurer's actual cooldown track and the finite fatigue supply before the proposed check state is committed. Light fatigue falls back to overfatigue when the silver supply is empty (R23); with no fatigue dice left at all, the adjustment is refused.
- The check interrupts the move that entered the cache hex. Afterwards the unused hexes of that move may be moved without a new move action, until an engagement or the end of the turn.
- Declining before the first roll leaves the cache in place. Once rolled, the check continues until success, failure or a voluntary stop.
- Success records the achievement; the item goes to a ready slot or the pack, or is left. Failure and stopping discard the cache and cycle the card.

## Tests and remaining scope

Run `node --test tests/tabletop-lockpicking.test.js tests/tabletop-jailbreak-flow.test.js`.

The module tests cover the exact common and legendary examples, repeated digits, preservation only through kept dice, key gating/reuse, attempt exhaustion, voluntary stopping, all normal cache outcomes, non-wrapping adjustment cost, phase validation and immutability. The encounter tests replay the tutorial's lockpick inside the full battle and cover declining, continuing movement, failure, stopping, fatigue payment and inventory placement.

Still outside this foundation: item deck order beyond the tutorial's fixed top card, other items' abilities, race/class overrides (e.g. automatic lockpick success), trap effects, multiple-key or longer code structures, and caches placed by other encounters or abilities.
