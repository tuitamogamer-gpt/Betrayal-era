# Jailbreak: factual component data and implementation boundaries

Research date: 2026-11-01; updated 2026-11-10 when the cache, item, cleanup and class rewards were implemented. Those additions were checked against the publisher's current downloads, which are now Rulebook v1.1 and Extended Tutorial v1.1 (see [rules research](tabletop-rules-research.md#source-update-2026-11-10)). This document records mechanics and component facts, not the scenario's story prose. `R` means the printed page in the official Rulebook; `T` means the printed page in the official Extended Tutorial; `SS` means the PDF page in the official Base Skill Sheets. Official source links are catalogued in [tabletop-assets-research.md](tabletop-assets-research.md).

## Feasible first slice

The tutorial's fixed two-adventurer setup is sufficiently documented to implement a real automated battle: Argonian with One Hand and Shield, Dark Elf with Destruction Staff, High Elf Bandit and Argonian Bandit, the actual map, common cache, exits, and class achievements. One person can control both adventurers, or two people can control one each. This is distinct from the separate true-solo setup rules.

The official references omit complete six-face pictures for the enemy Combat die and Force Shock. These gaps were checked against the **unofficial** [Mark's Table community TTS module](https://steamcommunity.com/sharedfiles/filedetails/?id=3492491314). The probabilities below are verified against that module's component scans, not certified by the publisher. No scanned artwork or copied mod code needs to be included in the browser app.

## Map and deployment

R92 supplies the exact diagram: **28 clash hexes plus 5 entrance hexes**, no impassable obstacles, three exit hexes, one common cache. The following coordinate IDs are an implementation convention, not labels printed on the physical board.

Use doubled flat-top coordinates `(x,y)`, left to right. Neighbor deltas are `(0,+2)`, `(0,-2)`, `(+1,+1)`, `(+1,-1)`, `(-1,+1)`, `(-1,-1)`. A coordinate exists only if listed below.

| Column x | Existing y coordinates | Tile |
| --- | --- | --- |
| 0 | 2, 4, 6 | Clash; all three are exits |
| 1 | 1, 3, 5, 7 | Clash |
| 2 | 0, 2, 4, 6, 8 | Clash |
| 3 | 1, 3, 5, 7 | Clash |
| 4 | 0, 2, 4, 6, 8 | Clash |
| 5 | 1, 3, 5, 7 | Clash |
| 6 | 2, 4, 6 | Clash |
| 7 | 3, 5 | Entrance |
| 8 | 2, 4, 6 | Entrance |

- Enemy deployment hexes, in printed order: `1=(3,1)`, `2=(3,7)`, `3=(1,1)`, `4=(1,7)`.
- Common cache: `(2,4)`.
- Standard Jailbreak: draw one level-1 enemy per adventurer, without replacement, from High Elf Bandit, Argonian Bandit, Skeever Pup, Skeleton, Spriggan; deploy in numbered order (R92–93).
- Tutorial fixed draw: High Elf Bandit at `(3,1)`, Argonian Bandit at `(3,7)` (T10).
- Adventurers normally choose unoccupied entrance hexes in first-player order. Tutorial positions: Argonian `(7,3)`, Dark Elf `(8,2)`, Argonian acts first (T10).
- Party XP starts at 1; day remains unset; round starts at 1; no classes have been selected yet (R92–93).

Validation against the worked example: Argonian moves three hexes to `(4,0)`, adjacent to High Elf Bandit and four hexes from Argonian Bandit. Dark Elf moves two hexes to `(6,2)`, three from High Elf Bandit and four from Argonian Bandit. Argonian Bandit later moves north to `(3,5)`, bringing both heroes within range 3. Cache `(2,4)` is adjacent to that destination. These distances match T11, T13, T16, T18.

Movement cannot pass through an occupied hex; a cache without a unit does not occupy its hex. Range ignores occupied hexes. Sight means same tile or adjacent tile, so the entire Jailbreak map is mutually in sight; do not implement line-of-sight ray casting (R58).

## Adventurer profiles

| Profile | Health | Stamina | Magicka | Combat dice | Cooldown | Starting additional dice | Tutorial form |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Argonian | 5 | 3 | 2 | 1 | 2 | 2 Shield Discipline | Light Weapon |
| Dark Elf | 4 | 2 | 3 | 2 | 2 | 2 Force Shock | Magic |

Both start at zero tenacity and zero saved XP, with empty cooldown and active slots. Sources: T8–9 and official Base Race Sheets pages 1 and 9.

- **Argonian Resistance:** once per battle, when about to be dealt damage, prevent the whole damage instance. It does not expressly prevent true damage, so R63's true-damage exception applies.
- **Dark Elf Dynamic:** once per battle during its turn, recover any four skill dice from its cooldown track and replace each recovered die with light fatigue; retain slot order for replacements. The publisher's current [do-as-much-as-possible ruling](https://support.chiptheorygames.com/support/solutions/articles/33000314951-resolving-skills-and-abilities-do-as-much-as-possible) means recovering `min(4, eligible skill dice)` is allowed. If four are available, choosing only one is not the same as resolving as much as possible.

Stamina and Magicka are stat limits, **not resource pools spent by rolling dice**. Movement uses up to Stamina hexes; the corresponding stat limits how many dice of that resource type can be gathered for an engage (R20, R59–61).

## Exact dice distributions

Each entry below is one equally likely face of a six-sided die. Ordinary tenacity is the hollow octagon and grants 1 tenacity if resolved; it is not a blank. Tenacity has a maximum of 5.

| Die | Six-face multiset | Source |
| --- | --- | --- |
| Adventurer Combat | `tenacity, 1, 1, 1, 1, 2` | SS1: face pips and illustrations |
| Shield Discipline | `tenacity, 1, 1, 1, 1, 2` | SS9: face pips and illustrations |
| Force Shock | `tenacity, damage2, damage2, damage2, damage4+backlash1, tenacity2+backlash1` | SS7 confirms the five special faces; community scan confirms ordinary tenacity as the sixth |
| Enemy Combat | `0, 1, 1, 1, 1, 2` | Community scan plus TTS object's explicit rotation labels |

The community TTS object GUIDs used for the missing evidence are `cf535a` for enemy Combat and `e1f7aa` for Force Shock. Enemy Combat's `RotationValues` are `1,2,1,1,1,0`, which independently agree with its scanned six-face texture. A zero on enemy Combat deals zero damage; it grants no tenacity. Order in the multiset has no gameplay meaning.

### Adventurer Combat

- Can be rolled in Light Weapon, Heavy Weapon, Ranged, or Defensive form, **not Magic**.
- In weapon forms, resolve a numeric face to deal that value to the declared target, then exhaust the die.
- In Defensive form, a numeric face enters an active slot. Later, exhaust it to prevent up to its value of damage dealt by an enemy. Defensive form has no target/range.
- Ordinary tenacity: gain 1, then exhaust.

### Shield Discipline

- Requires Light Weapon form; its target must be adjacent.
- Resolve numeric face `X` by placing the die in an active slot and dealing `X` damage to the target at placement.
- The active die later exhausts to prevent up to `X` damage dealt by an enemy.
- A face showing 2 therefore deals 2 initially and can later prevent 2. It does not become a one-point shield.
- Prevention is single-use: exhausting removes the whole die; unused prevention is lost. A value-2 die used against 1 damage cannot retain its other point for a later engage (R63).
- The tenacity face grants 1 then exhausts instead of entering an active slot.

### Force Shock

- Requires Magic form. Target range is the adventurer's Magicka stat.
- Three faces deal 2 damage to the target.
- One face deals 4 damage to the target and 1 **true damage** to any adventurer chosen by the resolving player.
- One face grants 2 tenacity and deals 1 **true damage** to any adventurer chosen by that player.
- One ordinary tenacity face grants 1.
- These are instant effects: resolve, then exhaust. Neither Shield Discipline nor Defensive Combat can prevent the true backlash. It is not damage from an enemy, either.

### Die states

“Spent,” “exhausted,” and “drained” are not additional faces of these dice.

- Available dice occupy trained attribute slots and can be gathered.
- Active dice occupy one of four active slots and retain their rolled face/value. Voluntarily removing an active die still exhausts it.
- Exhaustion adds a die after existing cooldown dice, in the leftmost unoccupied cooldown slot.
- Recovery removes dice from the left equal to the Cooldown stat, returning skill dice to availability. Fatigue/status handling differs; see the project's cooldown rules implementation.
- Drained dice are unavailable for the rest of battle until cleanup recovers them. These level-1 abilities do not inherently drain; cooldown overflow can drain any skill die.
- A rolled die whose ability the player declines to resolve still exhausts (R60). Do not return it directly to availability.

## Enemy component definitions

All five are level 1. “Combat” is the number of enemy Combat dice rolled, not fixed damage. All follow the standard move-up-to-two rule (R64); there is no separate printed speed stat.

| Enemy | HP | Range | Combat | Defense | Targets | Priority | Skills |
| --- | --- | --- | --- | --- | --- | --- | --- |
| High Elf Bandit | 3 | 4 | 1 | 0 | 2 | Weakest | Dodge |
| Argonian Bandit | 3 | 3 | 1 | 1 | 2 | Strongest | Enfeeble 1 |
| Skeleton | 2 | 1 | 1 | 2 | 2 | Weakest | None |
| Skeever Pup | 3 | 1 | 1 | 0 | All in range | Weakest | Rot |
| Spriggan | 4 | 2 | 0 | 1 | 2 | Strongest | Bane |

Provenance: bandit statistics and chip faces are visible in T10 and confirmed by T12, T14, T16, T20. Skeleton is shown in T36 and described in T39/T42; Spriggan is shown in T32 and described in T33. The high-resolution community scan supplied the complete remaining fields and Skeever Pup. Its source texture is the `CustomMesh.DiffuseURL` shared by these chip objects in Mark's Table. Full chip GUIDs: High Elf `b36a99`, Argonian `ae6e40`, Skeleton `64a1cf`, Skeever `2faa18`, Spriggan `687f60`.

Priority is based on current HP, excluding bonus HP. “Strongest” means highest HP and “weakest” means lowest; a priority tie is a **party decision**, not an automatic arbitrary selection (R55).

- **Dodge:** prevent damage equal to the number of rolled skill dice that did not deal damage during this engage. The publisher's [Dodge FAQ](https://support.chiptheorygames.com/support/solutions/articles/33000290395-dodge-what-dice-are-considered-to-deal-damage-) clarifies that damage to **any unit** during the engage counts. Thus Force Shock's tenacity-plus-true-backlash face counts as damage-dealing even though it does not damage the bandit. A die that merely applies a damaging status or grants tenacity later used to damage does not count. Decide use of the entire roll before computing Dodge.
- **Enfeeble 1:** after its engage, every target gains one light fatigue even if its damage was prevented.
- **Rot:** the adventurer who defeats this unit gains one overfatigue.
- **Bane:** after its engage, apply Bane status to its target. Spriggan has zero Combat dice but still completes an engage and applies its skill (R64). Bane's full status implementation is outside the fixed two-bandit tutorial battle and must be included before enabling random draws of all five enemies.

## Turn and attack sequence

R57, R59–64 specify:

1. Start of round effects; from round 6 onward, each adventurer gains one overfatigue and takes true damage equal to all overfatigue in its cooldown track. All fatigue rounds count as round 6 for rules that inspect the number.
2. Adventurers act in the established first-player order. On their turn: start-of-turn effects, recovery, then chosen actions, then end-of-turn effects.
3. Each adventurer can normally move once and engage any number of times, subject to available legal dice and fatigue. A second move is allowed only if the adventurer has not engaged and will not engage that turn. This is **not a generic two-action system**.
4. The first engage each turn is free. Each additional engage first adds one light fatigue at the tutorial's normal difficulty; Expert uses two.
5. Choose/change battle form, declare an eligible target if the form has one, gather available legal dice within the relevant stat limits, roll, then perform rerolls/modifications before resolving selected abilities individually in a chosen order.
6. Resolve after-engage reactions. All damage to one unit during that action is one damage instance; defense does not reset separately for each die. True damage bypasses ordinary defense and prevention.
7. After adventurers and any companions, enemies act from highest level to lowest. The party chooses the order of equal-level enemies. All Jailbreak enemies are level 1.
8. An enemy moves only if no targetable opponent is already in range and sight. Its destination is the closest unoccupied hex, reached through unoccupied hexes, that puts at least one targetable opponent in range and sight. It moves up to two hexes along that route and stops upon reaching the destination, even if it could continue to target more units. Among equally close destinations its **priority icon** decides: prefer destinations from which the strongest (or weakest) such opponent would be targetable; remaining ties are a party decision, and the number of possible targets is ignored (R64 v1.1 and the official [Enemy movement FAQ](https://support.chiptheorygames.com/support/solutions/articles/33000292544-enemy-movement-how-does-it-work-in-more-detail-)). Without any destination, the enemy approaches the closest opposing unit as far as it can. The earlier engine broke destination ties toward the closest opponent instead; this was corrected on 2026-11-10 with a regression test.
9. An enemy determines its target list in priority order, rolls its Combat dice **once**, and applies the same sum to each target. Each target can use its own prevention. Resolve relevant after-engage skills for every target.
10. Check completion at the end of the round, after end-of-round effects.

## Cache and item

The tutorial fixes the top common item to **Falkreath Meat Loaf**, code `CO-019`, with three lockpick attempts and difficulty multiset `5,2,2` (T19; R69). Standard Jailbreak instead uses the top of the shuffled common-item deck; this fixed item is specific to the worked tutorial.

The item is a common consumable of type Meat. Its mechanical effect is to discard it and choose either: gain three bonus HP yourself, or grant one bonus HP to each adventurer (card face in T5). Bonus HP is not healing and must be tracked separately.

A lockpick check can interrupt a move into the cache hex. First roll all three ordinary D6. Later attempts may keep selected results. Each gained light fatigue changes one die result by one, without wrapping between 1 and 6. Success discards the cache and gains the item; failure also discards the cache and cycles the item. A completed check resumes any remaining movement (R68–69).

Implementation (2026-11-10), from R pp.20, 28–29, 59, 61, 68–70 and 89:

- Ending a move on the cache hex during the adventurer's own turn offers the check; declining leaves the cache in place, and passing through it without stopping is the same as declining. The offer records the unused hexes of that move, which may be moved afterwards without a new move action. An engagement ends the interrupted move (R59). Using an item, exhausting active dice or the Dark Elf's Dynamic does not: R59 forbids interrupting movement with other *actions* (move, engage, class ability, explore), and these are not actions. This is an interpretation of ambiguous text.
- The server rolls the lockpick dice. Each ±1 adjustment gains one light fatigue through the actual cooldown track, or overfatigue once no light fatigue remains (R23). An adjustment is refused when the supply cannot pay its whole cost (R61, cost paid in full).
- Success records the **Succeed at Cache Lockpick** achievement even if the item is left. The item may go into a ready slot or the pack (R28) or be left, discarding card and chip. Inventories that are already full are refused rather than rearranged; this encounter has only one cache.
- The Falkreath Meat Loaf is used only from a ready slot during its owner's turn (R28: no stated timing). Its user discards it, then gains 3 bonus HP or every adventurer still on the map gains 1 bonus HP. R89 lets the resolving adventurer give another adventurer less than the stated bonus HP; that never helps in this encounter, so the full amount is applied.
- Bonus HP is removed first when an adventurer takes enemy damage, never by true damage, and never counts toward strongest/weakest priority (R20, R55, R63). Damage absorbed by bonus HP is still damage taken for the two first-damage achievements; prevented damage is not.

## Escape, completion, and rewards

At the **start of its turn**, an adventurer occupying `(0,2)`, `(0,4)`, or `(0,6)` may escape. Remove it from the map; its turn ends and it takes no more turns. Reaching an exit during movement does not immediately escape (R93).

At the **end of the round**, the battle ends if all enemies are defeated, all adventurers are defeated, or all undefeated adventurers have escaped. Other heroes still receive their turns in a round where the last enemy was defeated (T21). Jailbreak awards class choices, not encounter XP.

Track the published achievements: defeat each named enemy; succeed at cache lockpick; escape first; take the first turn; take the last turn; first to take enemy damage at range 2+; first to take enemy damage at range 1. The tutorial results offer Argonian Acrobat/Scout/Dragonknight/Rogue/Archer and Dark Elf Sorcerer/Healer; actual achievements may differ in live play. Do not award these scripted example outcomes automatically.

End of battle cleanup (R86 with the Jailbreak instructions on R93): remove bonus HP, exhaust every die still in an active slot, recover drained dice and leave the cooldown track as it is. Tenacity and items gained in battle are kept unless the adventurer declines its achievement classes.

Class rewards, transcribed from Rulebook v1.1 p94 and matching the worked example on Tutorial v1.1 p22. *VW* classes need the Valenwood expansion and are offered only when it is in play (`createJailbreak({ expansions: ['valenwood'] })`).

| Achievement | Classes |
| --- | --- |
| Defeat High Elf Bandit | Arcanist (VW), Sorcerer |
| Defeat Argonian Bandit | Acrobat, Scout |
| Defeat Skeever Pup | Nightblade, Warden |
| Defeat Skeleton | Necromancer, Spellsword |
| Defeat Spriggan | Pilgrim, Templar |
| Succeed at Cache Lockpick | Burglar (VW), Rogue |
| Escape First | Bard, Ranger (VW) |
| Take the First Turn | Dragonknight |
| Take the Last Turn | Healer |
| First to Take Damage from an Enemy at Range 2+ | Archer |
| First to Take Damage from an Enemy at Range 1 | Knight |

Each adventurer chooses one class sheet; sheets are unique. An adventurer with fewer than two earned classes waits until the others have chosen, sets aside its earned sheet (if any), shuffles every other remaining sheet and draws until holding two, then chooses one. Several such adventurers draw one at a time. An adventurer may instead decline its earned classes: it loses all tenacity and discards the items gained in the battle, then chooses any class remaining after the others. If every adventurer was defeated, the sheets are shuffled once and each adventurer draws two and chooses one (R93–94).

Two derived conventions are recorded in `src/tabletop/engine.js`: an adventurer who declines chooses last (read literally, it and a drawing adventurer would each wait for the other), and a drawn, non-achievement class chosen through the fewer-than-two procedure carries no penalty, because that procedure is the rulebook's normal path for such an adventurer.

After class rewards, set party XP to 2, retain zero saved XP, heal heroes to maximum, and clear the whole cooldown track. Day remains unset until normal campaign play begins (R94). Choosing the starting guild quest (R13 step 7) and the rest of the campaign require content not supplied by this encounter implementation.

## Validation fixtures and remaining scope

- T12: Shield Discipline 1 + Shield Discipline 1 + Combat tenacity against High Elf Bandit deals 2 before Dodge, so the bandit loses 1 HP. Two shields become active; Combat exhausts and grants 1 tenacity.
- T14: Force Shock 2 + Force Shock 4 deals 6 to the bandit and one true backlash to a chosen adventurer; both dice exhaust.
- T15: Dark Elf's second engage first gains light fatigue, changes to Defensive, and stores two Combat-1 faces as active prevention.
- T16: Argonian Bandit's result 2 applies to both heroes. Argonian uses one shield-1, loses one HP, and gains Enfeeble fatigue. Dark Elf uses two Combat-1 shields, loses no HP, and still gains Enfeeble fatigue.
- T20: Combat-2 plus Shield Discipline-2 deals 4 against Argonian Bandit's defense 1, causing 3 HP loss and defeat. Shield Discipline stays active; Combat exhausts.

The fixed tutorial slice does not establish implementation of every class's abilities, true-solo customization, every item, random full-game encounters, campaign progression, or all enemy skills. These must not be implied by the presence of a complete first battle. Network authority, action validation, turn ownership, reconnection, and save compatibility are software concerns that require separate tests.

Local visual evidence is in `scratch/tabletop-assets/jailbreak/` and `scratch/tabletop-assets/jailbreak-dice/`. It includes official rendered pages, community texture crops, Workshop metadata, and the decoded TTS state. These are research inputs only, not application assets.
