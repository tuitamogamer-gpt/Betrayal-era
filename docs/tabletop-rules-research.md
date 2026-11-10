# Official tabletop rules: implementation research

Research date: 2026-11-01. This document describes the published tabletop game and the minimum evidenced scenario for a faithful browser implementation. It does not certify the current application as a complete implementation.

## Primary sources inspected

All downloads below were linked by the publisher's [The Elder Scrolls support page](https://chiptheorygames.com/pages/support/the-elder-scrolls). PDF page numbers below are the printed page numbers, which match the PDF page indexes for the pages cited. Sources were downloaded locally under `scratch/tabletop/`, extracted with `pdftotext -layout`, and selected diagrams were rendered for inspection. The local PDFs are research material, not an instruction to bundle them with the deployed application.

| Key | Publisher document | Version / use |
| --- | --- | --- |
| R | [Rulebook](https://www.dropbox.com/scl/fi/w8kkq9m6gwcwaawien7cw/TES_Rulebook.pdf?rlkey=tz1ctc1cc0ttummjzzx5xt24i&dl=0) | Cover states version 1.0; core rules and Jailbreak scenario. |
| T | [Extended Tutorial](https://www.dropbox.com/scl/fi/4qs75zew966mo5x34xo60/TES_Tutorial_Online.pdf?rlkey=63ep6fiz174wk9rvqferu8qts&dl=0) | Cover states online version 1.0; two-player Black Marsh walkthrough with prescribed random outcomes. |
| E | [Enemy Skills Reference](https://www.dropbox.com/scl/fi/xmpxpq3fb3m06of7yk4os/TES_Reference-Sheet.pdf?rlkey=fw34rzteilf8j8mqo45tg6006&dl=0) | Definitions for enemy skill keywords; not a complete enemy-chip catalogue. |
| RS | [Base Race Sheets](https://www.dropbox.com/scl/fi/y60sqtjmydnxj217wz9uj/TES_Race-Sheets.pdf?rlkey=sxa5es8vxhq07grvvk4ircd6u&dl=0) | Race statistics and character sheets. |
| CS | [Base Class Sheets](https://www.dropbox.com/scl/fi/ox3wyt4moul16exl7kq7h/TES_Class-Sheets.pdf?rlkey=djo9987sg57zl8ef3wi6naqre&dl=0) | Actual novice/master abilities and promotion conditions. |
| SS | [Base Skill Sheets](https://www.dropbox.com/scl/fi/wdszv9azzjvj5qhc9dpbm/TES_Skill-Sheets.pdf?rlkey=rsfy9ut9osmhiw6h8kwr85bx7&dl=0) | Actual skill abilities, dice supplies, and face frequencies. |

The publisher also provides a [Campaign Journal](https://www.dropbox.com/scl/fi/wqerjcv89rwi4bioksx86/TES_Campaign-Journal.pdf?rlkey=h0v2un6w6ms7dgylsinsuzsz6&dl=0) and [Jailbreak Checklist](https://www.dropbox.com/scl/fi/f5atkf06p5w8139qmq5ts/TES_Jailbreak-Checklist.pdf?rlkey=g2tg9ssz2upam6b9122qpq8nc&dl=0). Those links were discovered but their PDF content was not needed for the findings below.

Rules precedence is explicit: published errata, component text, current province gazetteer, rulebook, then official tutorials/videos (R p10). A shipping rules database must therefore track component source/version and apply errata before treating tutorial examples as universally authoritative. Selected current official FAQs were subsequently inspected, as recorded below; this is not an exhaustive errata audit.

### Subsequent official FAQ checks and version target

The implementation target is the downloaded **v1.0 rulebook plus applicable official clarifications/errata**, not an unlabelled mixture of forthcoming v1.1 changes.

- [Resolving skills and abilities: do as much as possible](https://support.chiptheorygames.com/support/solutions/articles/33000314951-resolving-skills-and-abilities-do-as-much-as-possible), modified 2026-05-01, explicitly requires resolving as much of an ability as possible and ignoring impossible portions. Costs must be paid fully; wording that requires one thing **to** or **then** do another treats the first portion as the cost. This is in General Rules Questions and carries no future-version caveat.
- **Dark Elf Dynamic:** RS p9 says to recover any four skill dice from cooldown and replace each with light fatigue, once per battle during the adventurer's turn. Applying the general FAQ means recovering exactly `min(4, eligible cooldown skill dice)` when activated: fewer than four is possible if fewer exist, but selecting fewer while four are available does not satisfy the maximum-resolution requirement. This is a derived application of the general ruling, not a separately published Dynamic-specific answer. No Dynamic-specific answer was found in the inspected official Races & Classes FAQs or Dized FAQ. A public [BGG thread asking the same question](https://boardgamegeek.com/thread/3478477/dynamic-dark-elf-ability) was found but no authoritative answer was verified there.
- [Running out of overfatigue dice](https://support.chiptheorygames.com/support/solutions/articles/33000314949-running-out-of-overfatigue-dice), modified 2026-05-01, distinguishes two versions. In **v1.0**, if the black supply is empty, no fatigue dice are placed. In **v1.1**, each overfatigue die that cannot be placed instead causes one true damage. The article says these adjustments are not yet in printed/digital files and will roll out officially with the Heroes of Tamriel campaign. It does not describe the new rule as already mandatory for v1.0 or call it an optional v1.0 rule. No independent release-status check was performed. Keep the two behaviors versioned.
- [Item card count correction](https://support.chiptheorygames.com/support/solutions/articles/33000292376-item-card-count-should-be-100-common-60-legendary) corrects the printed inventory to **100 common items and 60 legendary items**.
- [Drained dice correction to R p23](https://support.chiptheorygames.com/support/solutions/articles/33000292517-recover-dice-section-in-rulebook-pg-23-re-drained-dice) replaces the erroneous End of Day rest timing with **End of Battle Cleanup**. Rest does not recover drained dice.

### Source update 2026-11-10

The publisher's support-page links now download **Rulebook version 1.1** (PDF created 2026-11-09) and **Tutorial Guide online version 1.1** (2026-11-05). The official FAQ's "Gameplay Adjustments for v1.1" folder lists one adjustment, [running out of overfatigue dice](https://support.chiptheorygames.com/support/solutions/articles/33000314949-running-out-of-overfatigue-dice): v1.1 deals 1 true damage for each overfatigue that cannot be placed, while v1.0 places nothing. The v1.1 R p21 contains that adjustment.

- The combat engine remains verified against v1.0 and keeps the v1.0 overfatigue behavior. A complete page-by-page v1.0→v1.1 comparison of the combat rules has not been made, so a move to v1.1 must be an explicit, tested change rather than an unlabelled mixture.
- The pages used for the 2026-11-10 additions were read in v1.1: R pp.20, 28–29, 59–61, 63–64, 68–70, 86, 89 and 92–94; T pp.5 and 19–22. Their cache procedure, example numbers, item, achievements list, cleanup and closing rest agree with the v1.0 facts recorded in this repository on 2026-11-01. The achievement-to-class table was first transcribed from v1.1 p94; the tutorial's worked example corroborates its Jailbreak entries.
- The official [Enemy movement FAQ](https://support.chiptheorygames.com/support/solutions/articles/33000292544-enemy-movement-how-does-it-work-in-more-detail-) (in the general Combat folder, not a v1.1 adjustment) and v1.1 R p64 resolve equally close destinations by the enemy's priority icon, then by party decision. The engine previously broke such ties toward the closest opponent; it now follows the FAQ.

Argonian Resistance's general damage prevention does not mention true damage, so R p63 prevents it from blocking true damage. Its availability should be checked when physical damage would be dealt, before subtracting bonus or normal HP.

## What the actual game is

- Cooperative play for one to four players; each player controls an adventurer (R p10 and the solo setup provision on p12).
- A campaign comprises **three sessions total**. Session 3 is the endgame; it is not a fourth session. Session 1's epilogue determines the next quest/province, and Session 2's epilogue introduces the endgame in the same province as Session 2 (R p49).
- A normal session is a guild quest spanning multiple days. A day has New Day, Overland, Encounter, Reward, and End of Day phases. The day dial advances to a maximum of 12; an unfinished quest fails at the end of day 12 (R p34).
- The core game has five provinces (T p6). Black Marsh is the recommended first province (R p12). Province effects, town features, dungeon layouts and guild quest steps depend on that province's gazetteer (R pp12, 34–35, 45, 49).
- Battles have three distinct map modes: clash, delve and dungeon. A clash uses its encounter layout; a delve expands as it is explored; a dungeon has a prescribed multi-tile layout and its own rules (R pp54, 57).
- Campaign success is not just winning three fights. Guild outcomes, major/minor quest keywords, side quests, province effects, saved adventurers and an endgame all matter. Failing the guild quest loses the session and campaign; a guild assist is available once per campaign (R pp49–50).

## Setup and state model

### Session setup

Choose province/map/gazetteer; build province-specific enemy bags and decks; prepare tiles, journal and dials; create or restore adventurers; choose guild quest and difficulty (R pp12–13).

Enemy chips have dual levels 1/5 or 10/20. Include general enemies and enemies matching the selected province code. For each overland type, combine four randomly selected general cards with that province's eight cards, yielding separate 12-card Peaceful and Conflict decks. The delve deck combines general and province cards, handling special cards as the gazetteer directs. Common and Legendary items are separate decks (R p12; T p6).

Starting party XP is 2 normally, or 1 during the optional Jailbreak introduction. The day dial is not advanced until after Jailbreak. The actual difficulty levels are **Apprentice, Adept and Expert** (R pp12–13, 92–94).

### Adventurer creation and progression

Choose race; place its Health, Stamina and Magicka attributes; add its starting Combat dice; select another skill line and add two level-1 dice; set battle form and Cooldown; start with zero tenacity and saved XP; choose novice class, either openly or via Jailbreak achievements (R p19).

The adventurer mat's attribute rows and opposing ends are meaningful capacity constraints. Health has a base-value token; Stamina/Magicka use stat tokens. **Combat is a skill line, not an adventurer stat** (R pp19–22). Stamina limits movement and physical dice; Magicka limits magic dice and magic range (R p20).

Advancement costs depend on the attribute-row position. Higher-level skill dice require an existing die of the same level or one level below. Increasing Cooldown costs XP equal to the new value. New skill lines require a trainer. Class promotion is triggered by the novice sheet's specific condition and persists for the campaign (R p31).

Track party total XP separately from each adventurer's unspent XP. Ordinary XP rewards increase both; bonus XP does not increase the party dial. After reward-phase spending, saved XP is capped at 3; excess becomes tenacity up to its cap and then is lost. Untraining does not refund spent XP (R p43).

Between sessions retain the developed character, saved XP, Cooldown and novice/master class side, with the exceptions in the cleanup rules. Reset tenacity, restore HP, recover skills and clear fatigue/status dice. Store the campaign's party XP, quest choices and keywords (R pp49–50).

## Core engine requirements

### Cooldown, fatigue and dice destinations

The cooldown track is an ordered queue with **13 slots**. New dice enter its leftmost empty slot; removing a die closes the gap. At the start of an adventurer's turn, recover as many dice from the head as their Cooldown stat (R pp23, 59).

- Exhausted skill dice return to their trained rows when recovered.
- Light fatigue returns to supply when recovered.
- Overfatigue cycles to the queue's tail when recovery would remove it; ordinary recovery cannot clear it.
- Status dice return to supply when recovered. Reapplying an already present status moves it to the tail rather than stacking a duplicate.
- The queue overflow rule drains an incoming skill die (or returns incoming fatigue/status to supply), then replaces the rightmost non-overfatigue die with overfatigue. This is not an HP-max reduction (R p23).

Dice results have distinct resolution codes: active slot, cooldown track, drained, instant and status placement. There are four active slots. Active effects persist until their triggering/removal rule, and removed active dice normally exhaust. Drained skills do not re-enter ordinary turn recovery (R pp24, 60).

Face frequencies are printed as pips beside the ability icons on each skill reference sheet; supply counts are also shown (R p21). PDF text extraction loses icon shapes, so exact distributions require visual transcription of SS. A generic `[hit, hit, critical, blank]` table cannot substitute for those actual faces. A tenacity-result skill die exhausts and increases tenacity by 1; a voluntarily unresolved die still exhausts but does not automatically grant tenacity (R p60).

At battle cleanup, exhaust active dice and recover drained dice; **leave the existing cooldown queue in place**. Ordinary battles do not fully reset a hero (R p86). End-of-day rest heals 2 HP/removes any two cooldown dice on Apprentice, or heals 1 HP/removes one die on Adept/Expert. Expert requires discarding an item for that rest. These are chosen removals, not queue-head recovery (R p45).

The separate cooldown foundation visits each initially queued die at most once during recovery. If the Cooldown stat exceeds the initial queue length, every remaining die is overfatigue; additional visits could only rotate mechanically identical overfatigue IDs. Retaining their order is a derived canonical representation, not an asserted extra rulebook instruction. This module has no per-die recovery triggers; such triggers would require revisiting this normalization. Overflow onto a track containing only overfatigue remains explicitly unsupported because R p23 supplies no replacement fallback.

### Turns, engagements and battle forms

Round order: start-of-round effects, all adventurers in fixed first-player order, companions, then enemies from highest level to lowest, then end-of-round effects/checks. Party members resolve ties. Quest units act before numbered enemy levels (R pp57, 64).

An adventurer's turn has start effects, recovery, actions, then end effects. There is no generic fixed action-point allowance. A hero may move up to Stamina, and may take a second movement only if they do not engage that turn. Movement cannot be split around an engagement. Explore is mutually exclusive with movement (R p59).

Multiple engagements are allowed. Each engagement after the first adds one light fatigue, or two on Expert. Declare battle form, select at most one target if needed, gather compatible available dice, roll, choose/reroll before resolving abilities, resolve chosen abilities in the player's order, then react. Physical dice and magical dice have separate Stamina and Magicka caps, so neutral-form skills may allow mixed-stat rolls (R pp59–60).

| Battle form | Target range / restriction |
| --- | --- |
| Light Weapon | Adjacent only. |
| Heavy Weapon | Adjacent only. |
| Defensive | No engage target range; e.g. Combat results can become active prevention. |
| Ranged Weapon | From 2 hexes through Stamina; adjacent targets are excluded. |
| Magic | Up to Magicka; Combat dice cannot be gathered. |

Source: R p61. Combat dice otherwise combine with all forms. A ready weapon must match the form and at most one item's abilities may be used per engage. Class abilities have their own timings/costs, with enduring and interrupt abilities; each non-enduring paid ability is at most once per turn, rather than every class having a generic two-tenacity attack (R pp25, 60–61).

### Rounds, objectives and movement

There is **no default immediate loss after round 5**. From round 6 onward, each fatigue round adds one overfatigue to each adventurer, then deals true damage equal to their overfatigue dice in cooldown. All such rounds are considered round 6 for numeric effects (R p57).

Objectives include Conquer, Eliminate, Survey and Uncover, with scenario overrides. Uncover normally requires gaining the required skyshards and retreating; Survey does not use the same retreat condition. Battle completion is evaluated after the current round, including a Conquer battle where the last enemy died mid-round (R p86).

Hex distance excludes impassable hexes. Units block movement but do not by themselves block range counting. Sight is determined by whether the two units occupy the same tile or adjacent tiles, not a conventional ray-cast line of sight. Overland tokens can share/traverse occupied hexes; battle units cannot (R p58). The engine therefore needs tile identity/adjacency as well as axial coordinates.

### Enemy generation and AI

Unless overridden, enemy pool = party XP × adventurer count. Spend it efficiently using the highest affordable levels 20/10/5/1, drawing one chip at a time from the matching bag; mode/setup determines deployment limits. Example: EP8 yields one level5 and three level1 enemies. Special named enemies may be added without subtracting from EP; final quest steps use a special end-of-session calculation (R p54).

An enemy chip supplies level, province, type, health, range, Combat dice count, defense, target count, strongest/weakest priority and skills (R p55). The reference sheet supplies skill definitions, not these individual numerical profiles.

Enemies normally move up to two hexes only if no targetable opponent is already in range. They seek the closest reachable destination with an opponent in range/sight, with priority/tie fallback rules; they stop when reaching that destination. They roll their Combat dice once, applying that same result to each chosen target in priority order. Reaction and timing effects must run (R p64). Fixed deterministic damage or simply always attacking the closest hero is insufficient.

### Overland and days

Base overland movement is three hexes, modified by province effects. Additional movement, limited to that base rate, costs every adventurer one light fatigue per hex and stops if any hero's cooldown is full. On day 1 the party remains in its starting town. Encounter precedence is guild quest, side quest, town, then landmark encounter; unstable landmarks roll their special die (R p34).

End-of-day province activation uses the peaceful encounter card's icon, drawing a card for this purpose if no peaceful card was used. The province effect and rest are separate steps. Resolved encounter cards discard; cards drawn only for province activation cycle to deck bottom (R p45).

## Minimum faithful playable fixture

Implement **the official Jailbreak introduction** first, explicitly identified as the introduction, not as the entire game. It is an actual authored scenario with bounded required data and an authoritative walkthrough. Its complete rules are R pp92–94, and the deterministic two-hero tutorial setup is T pp7–10.

| State | Official tutorial value |
| --- | --- |
| Difficulty / province | Adept; Black Marsh prepared for the ensuing session. |
| Party XP / day | XP1; no day has begun. |
| First adventurer | Shannon's Argonian: Health5, Stamina3, Magicka2, Combat1 die, Cooldown2, two level1 Shield Discipline dice; light weapon form. |
| Second adventurer | Ryan's Dark Elf: Health4, Stamina2, Magicka3, Combat2 dice, Cooldown2, two level1 Force Shock dice; magic form. |
| Class / tenacity / saved XP | No class before the encounter; tenacity0; savedXP0. |
| Map | Clash tile plus five-hex entrance; common cache and exit/enemy hexes exactly as R p92 diagram. |
| Draw | High Elf Bandit at enemy hex1, Argonian Bandit at enemy hex2 (T p10). |
| Hero placement | Argonian at northmost hex of entrance's two-hex column; Dark Elf at northmost hex of its three-hex column (T p10). |
| Round | 1. |

The general Jailbreak bag contains High Elf Bandit, Argonian Bandit, Skeever Pup, Skeleton and Spriggan, drawing one level1 enemy per adventurer (R pp92–93). The two-enemy draw above is the tutorial's prescribed fixture, not a replacement for normal random setup.

Win either by removing all enemies or having every undefeated adventurer escape. A hero escapes only **at the start of their turn** while in a marked exit hex; they then leave the battle and take no more turns. Evaluate the ending after the round. Record per-hero achievements for defeats, turn order, first escape, cache success and first damage at the indicated range categories (R p93).

Achievements determine class choices; an adventurer with insufficient options gets the specified draw/fallback procedure. Choosing an unearned class forfeits introductory tenacity/items. After class selection, partyXP becomes2, savedXP remains0, all HP is restored and cooldown cleared as a special inn-like recovery; then select the starting guild quest (R pp93–94).

Required fixture data still to transcribe/verify before calling this playable:

1. Exact hex graph, cache/enemy/exit positions from R p92 and T p10 diagrams.
2. Full level1 profiles and skills for the selected enemies; preferably all five for variable party-size/random setup. Text-only extraction cannot reliably read the numbers/icons on the pictured chips.
3. Combat, Shield Discipline and Force Shock face multiplicities and abilities from SS, including active/status behavior and damage prevention.
4. Common-cache lockpicking dice and sequence, plus the selected item result. R pp68–70 and T p19 were verified and implemented in `src/tabletop/lockpicking.js` and, since 2026-11-10, integrated into the encounter; see [lockpicking notes](lockpicking.md). The exact tutorial uses code 5-2-2, three attempts and Falkreath Meat Loaf, whose effect was visually verified from T p5.
5. Achievement-to-class reward mapping, followed by cleanup and readiness to start Day1. Implemented on 2026-11-10 from R pp93–94 ([table](jailbreak-component-data.md#escape-completion-and-rewards)); the CS class abilities themselves are not implemented.
6. Recorded random inputs and choices from the tutorial, checked step-by-step against state snapshots. A faithful free-play mode should use these mechanics with normal random inputs; a tutorial mode can replay prescribed outcomes.

The extended tutorial's later fixture also uses specific overland cards, two delve cards, three guild choices, common/legendary items and a side quest (T pp4–5). Those are a useful next bounded integration target; they do not constitute the full base-game card library.

## Existing implementation gaps

Observed in the pre-existing `src/rules.js` during this research pass:

| Existing behavior | Required correction / source |
| --- | --- |
| Three invented fights in Glenumbra/Stormhaven/Rivenspire presented as campaign progression | Actual guild quests, three sessions including endgame, province/day/encounter structure; R pp34,49. |
| One `player`, invented starting stats and three generic class attacks | Party1–4, race-based stats, exact skill lines/classes; R pp19–25. |
| Invented Iron Blade, Flames, Iron Ward, Restoration and Lightning Bolt distributions | Actual published skill-sheet faces, abilities, dice supply and destination states; R pp21,60; SS. |
| `player.combat` treated as an improvable stat/pool cap | Combat is a skill line; dice selection is governed separately by Stamina and Magicka; R pp20–22,60. |
| Fatigue reduces maximum HP | Ordered13-slot cooldown, light fatigue, overfatigue and fatigue rounds; R pp23,57. |
| A fixed radius-three map and invented cover/hazards | Encounter tile graphs, entrance, cache, impassable spaces, tile-based sight; R pp57–58,92. |
| Fixed enemy attack damage and invented enemies | Chip-defined stats, enemy Combat rolls, priorities/multiple targets/skills; R pp54–55,64. |
| Defeat at battle round limit | Round6+ fatigue pressure; scenario-specific objectives checked at round end; R pp57,86. |
| Story/Standard/Veteran difficulty | Apprentice/Adept/Expert with published rest, fatigue and end-session modifiers; R pp13,45,59. |
| Fixed +3HP and shop/training upgrades | Attribute-row costs, trained skill prerequisites, trainers, party versus personalXP; R pp31,43. |
| Invented gold economy and route events | Real town/card/guild/province content and associated effects, not interchangeable flavor; R pp12,34,45. |

The existing hex rendering, input/UI and persistence infrastructure may be reusable. Passing the old unit tests alone would only validate the prior adaptation's behavior; new deterministic tests must be grounded in the actual tutorial and rulebook edge cases.

## Full-game content not established by these downloads

The public source set is substantial: base races, novice/master classes, skill lines, main rules and a detailed tutorial are available. It is not evidence that every physical component is present in a complete, machine-readable catalogue.

Before claiming a complete core-game implementation, obtain and verify every province gazetteer and overland map, guild/quest branches and endgame, all encounter/side-quest/delve/item cards, all enemy and quest-unit chip sides, companions, map tile features, special dice and finite component counts. R pp4–6 inventory lists 100 overland cards, 65 delve cards, 9 guild cards and 30 side quests. The printed item counts are corrected by the official FAQ above to **100 common and 60 legendary items**; examples in a tutorial do not cover that catalogue.

Record provenance per component and identify any content supplied through an official digital module separately. Do not generate substitute quest rules, enemy stats or dice faces with an image model and label them authentic. New UI art can support the experience, but it cannot resolve missing rules data. Networked multiplayer also requires shared authoritative state, turn ownership, reconnect/save handling and deterministic event synchronization; none of those is supplied by the rule PDFs.
