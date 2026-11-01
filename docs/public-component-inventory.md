# Public community component inventory

Audited 2026-11-01. Source: the public [Mark's Table TTS Workshop module, item 3492491314](https://steamcommunity.com/sharedfiles/filedetails/?id=3492491314), whose description credits scans from [the community module, item 3463937562](https://steamcommunity.com/sharedfiles/filedetails/?id=3463937562). This is community material, not an official CTG API or publisher-certified dataset.

**A broad public source for the real board-game components exists.** The decoded module provides component identities, asset references, factual statistics, die-face descriptions, and substantial setup metadata. Six province gazetteer PDFs and sampled card textures were reachable. The remaining work is extraction, verification, and implementing the actual rules, rather than claiming that the campaign has no obtainable public sources.

This audit does not establish complete accuracy, complete expansion coverage, or a redistribution license for scanned artwork, narrative text, or mod code. The browser implementation can express verified factual mechanics in original code and presentation while maintaining source references. No full narrative, art collection, or copied TTS scripts were added to the application.

## Snapshot and method

The Workshop's public metadata was queried read-only through Steam's published-file API. Its referenced state file was downloaded and decoded from BSON. Snapshot fields identify `SaveName: Elder Scrolls: BotSE`, date `1/12/2026 8:38:03 PM`, and TTS version `v14.1.7`. That version is the save format/application version, not a verified game-rules version.

The state has **405 top-level objects** and **1,172 recursively counted objects with unique GUIDs**, including contents of bags/decks and alternate object states. These counts include table furniture, scripting areas, player copies, and references; they must not be presented as the physical game's component totals.

| Object category | Records |
| --- | ---: |
| Cards | 495 |
| Additional custom cards | 10 |
| Custom dice | 189 |
| Custom tokens | 153 |
| Custom models | 126 |
| Scripting areas | 85 |
| Deck containers | 30 |
| Model bags | 25 |
| Custom tiles | 25 |
| PDF objects | 14 |
| Asset bundles | 13 |
| Hand areas | 4 |
| Infinite bags | 3 |

The **505 card records** include 493 cards in decks, two standalone province delve cards, eight repeated Combat references, and two unnamed custom references. All 505 card `Description` fields are empty: card rules are principally in face images, while some setup logic lives elsewhere in scripts. The absence of a card tooltip is not evidence that its face is absent.

## Content present by name and family

| Family | Snapshot contents |
| --- | --- |
| Provinces | Black Marsh, Cyrodiil, High Rock, Morrowind, Skyrim, Valenwood |
| Overland maps | Seven: one per province except eastern and western Skyrim separately |
| Gazetteers | Six named province PDFs; duplicate table PDF objects reference the same files |
| Encounters | 116 identified cards: 58 conflict and 58 peaceful. Each province has 8 of each; generic decks add 10 of each. |
| Delves | General deck 7; province decks BM10, CY13, HR10, MW10, SK10, VW10; standalone Submerged Chamber and Icy Buildup; separate Dark Elf Patrol deck 3 and Forest Blights deck 8 |
| Items | Common deck 127; legendary deck 66. Expansion composition is not fully audited. |
| Side quests | 30 card records with IDs |
| Guilds | Nine: Circle of Champions, Fighters Guild, Undaunted, Psijic Order, Outer Watch, Thieves Guild, Mages Guild, Eyes of the Queen, Dark Brotherhood |
| Classes | 18: the 15 base classes plus Arcanist, Burglar, Ranger |
| Race cards | 20 records representing 10 names: Argonian, Breton, Dark Elf, High Elf, Imperial, Khajiit, Nord, Orc, Redguard, Wood Elf |
| Skill references | 26 records representing two sheets each for 13 named skill lines; separate Combat reference copies |
| Regular enemy chips | 58 double-sided models: 34 in generic enemy bags plus 24 across six province bags |
| Quest/companion chips | 19 additional models in the quest/companion bag |
| Adventurer chips | 20 models |
| Battle tiles/caches | Entrance tile, clash mats, 19/7/6/3-hex tile bags, obstacle hexes, six cache chips |

The 13 named skill lines are Acrobatics, Bow, Daedric Summoning, Destruction Staff, Heavy Armor, Illusion, Legerdemain, Light Armor, One Hand and Shield, Restoring Light, Shadow, Speech, and Two Handed. Combat is an additional skill line in the structured die metadata.

The base classes are Acrobat, Archer, Bard, Dragonknight, Healer, Knight, Necromancer, Nightblade, Pilgrim, Rogue, Scout, Sorcerer, Spellsword, Templar, and Warden. The presence of Valenwood, its three additional classes, and its additional skill lines establishes expansion material in this snapshot. No equivalent complete coverage was established for later expansions.

These are observed module counts. The printed base rulebook includes known component-count errata, so a difference from its component page is not by itself proof of missing or extra content. A complete edition/expansion manifest remains to be reconciled against current official errata.

## Structured mechanical data versus images

| Data family | Machine-readable facts available | Limits |
| --- | --- | --- |
| Enemy/quest/companion statistics | 77 double-sided records, 154 face records. Fields: HP, Combat dice, defense, range, level, type, keywords. There are 29 face records at each of levels 1/5/10/20 and 38 quest-face records. | Not 154 necessarily distinct enemy types. Target count and priority are absent from these fields and require reading chip faces. No separate speed stat is supplied. |
| Race statistics | 20 sheet records / 10 race names, with base Health, Stamina, Magicka, Combat, Cooldown, race ID, sometimes opposite-face reference | Innate ability resolution still needs official sheet/rule verification and an original handler. |
| Skill dice | 134 object records / 77 distinct named skill types across 14 lines including Combat. Metadata identifies line, name, level; rotation labels and Lua tables supply face descriptions/frequencies. | The descriptions are strings for tooltips, not executable effects. They are not a complete validated probability/effect schema. |
| Encounter setup | 90 modules: Jailbreak plus 89 card encounters; all 58 conflict encounters and 31 of 58 peaceful encounters | Setup support does not imply automated encounter choices, objectives, rewards, or battle adjudication. |
| Setup registrations | 314 registered setup effects across initial setup, EP calculation, deployment/modifiers, before/after deployment, and final setup | Coordinates are TTS positions. Relevant fields include tile transforms, enemy deployment, caches, EP changes, enemy filters, and HP modifiers. Must be normalized into browser hex/state data. |
| Towns | 90 records: BM13, CY13, HR13, MW13, SK25, VW13. Fields include item/legendary/trainer counts, available services, optional town-effect identifiers, constellation conditions. | Some town effects refer to separately interpreted rules. A data entry is not a tested town engine. |
| Overland locations | 307 records across seven maps, with position, type, optional name | TTS coordinates do not establish a correct hex adjacency graph. Route/movement rules need reconstruction and validation. |
| Cards, quests, item effects | Names, IDs, deck membership, sprite-sheet URLs, and face positions are present | Most actual effects and scenario content must be read from faces/PDFs; the empty `Description` fields are not a usable rules dataset. |

Example of useful extraction: the Jailbreak's five chip profiles can be read from the live shared enemy atlas; official tutorial illustrations corroborate the two bandits. Enemy Combat's six-face texture agrees with its explicit rotation labels. See [jailbreak-component-data.md](jailbreak-component-data.md).

Example of a data-quality problem: the Breath of Life tooltip table expands to **10 descriptions** while the die has **six rotation values**. This is sufficient evidence against blindly treating every tooltip table as an authoritative die distribution. Use the official skill sheets and actual component faces to resolve discrepancies.

## What is not automated by this module

The public source is a substantial setup assistant and virtual tabletop. Its scripts do not constitute a complete rules engine. Missing or manual areas include objective completion, normal action legality, enemy movement/target choice, damage/ability adjudication, complete side-quest and guild-quest execution, and endgames. The global script explicitly indicates manual setup for endgames. Enemy scripts provide HP/stat controls and display behavior.

A browser adaptation still needs its own authoritative state machine, validated action commands, randomization, prevention/targeting choices, campaign persistence, and online synchronization. Copying component images into a table would not satisfy automated solo/co-op play.

## Availability checks

Ranged HTTP **GET** requests succeeded on all ten sampled asset references, returning status 206 and valid `%PDF` or PNG signatures. Only the first kilobyte was requested for these checks, not the narrative/PDF contents.

| Referenced resource | Reported complete file size | GET result |
| --- | ---: | --- |
| Black Marsh Gazetteer | 84,608,316 bytes | 206; PDF signature |
| Cyrodiil Gazetteer | 76,269,910 bytes | 206; PDF signature |
| High Rock Gazetteer | 73,125,829 bytes | 206; PDF signature |
| Morrowind Gazetteer | 67,671,269 bytes | 206; PDF signature |
| Skyrim Gazetteer | 84,988,965 bytes | 206; PDF signature |
| Valenwood Gazetteer | 105,573,962 bytes | 206; PDF signature |
| First Guilds face sheet | 13,905,396 bytes | 206; PNG signature |
| First Legendary Items face sheet | 28,841,390 bytes | 206; PNG signature |
| First Common Items face sheet | 28,026,821 bytes | 206; PNG signature |
| First Side Quests face sheet | 18,081,710 bytes | 206; PNG signature |

The enemy atlas and two relevant die textures were downloaded and visually inspected. Other card pages, all remaining asset references, PDF internal completeness, and gameplay correctness were not exhaustively checked.

**Method caveat:** Steam's CDN returned misleading 404 responses to HEAD requests for nine of these ten resources. Subsequent ranged GETs succeeded on all ten. Do not classify these assets as unavailable using HEAD alone.

## Local evidence

- `scratch/tabletop-assets/jailbreak-dice/workshop-metadata.json`: public Workshop metadata.
- `scratch/tabletop-assets/jailbreak-dice/marks-table-decoded.json`: decoded source snapshot.
- `scratch/tabletop-assets/jailbreak-dice/global.lua`: extracted script for research only.
- `scratch/tabletop-assets/public-component-inventory.json`: object names, types, parents, and metadata-presence booleans; no card/story text.
- `scratch/tabletop-assets/public-component-get-checks.json`: exact sampled URLs, HTTP method/status, total lengths, and file signatures.
- `scratch/tabletop-assets/jailbreak/`: inspected enemy component crops and official tutorial renders.

All evidence remains under scratch. None is a runtime art bundle, narrative catalog, or claim of a complete licensed digital edition.
