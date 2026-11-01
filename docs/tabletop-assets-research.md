# Official tabletop resources and digital-edition research

Researched 2026-11-01. This concerns **The Elder Scrolls: Betrayal of the Second Era**, the Chip Theory Games tabletop game. It does not treat a new Elder Scrolls-themed combat game as an adaptation of this game.

## Findings

The publisher provides substantial authentic rules and character reference material, including downloadable base race, class, and skill sheets. These are enough to establish real character statistics and abilities rather than inventing replacements. They are **not a complete downloadable game**: the reviewed official support page does not provide the complete encounter decks, guild quests, province gazetteers, maps, enemy chips, loot, delve content, and endgame material required to reproduce every campaign.

Public Tabletop Simulator community modules exist and describe broad campaign support. No public **publisher-authored or publisher-licensed** full digital edition, browser edition, public official TTS demo, or structured gameplay-content API was established by this research. This is a finding about the reviewed sources, not proof that none exists. An official publisher update confirms that CTG used TTS for external playtesting; it does not publish that playtest module.

Follow-up inspection established broad **community** source availability: the public TTS state contains six province gazetteer references, encounter/item/component textures, factual statistics, and setup metadata. Ranged GET checks verified all six gazetteer PDFs and sampled card textures were reachable. See [public-component-inventory.md](public-component-inventory.md). Missing official downloads therefore must not be confused with an absence of obtainable public community data; its completeness and correctness still need auditing.

## Publisher resources

The source of provenance is CTG's own [The Elder Scrolls support page](https://chiptheorygames.com/pages/support/the-elder-scrolls), which directly links the files below. The Dropbox domain alone would not establish publisher provenance; the links on CTG's site do. The support page also links the [official FAQ and errata collection](https://support.chiptheorygames.com/support/solutions/33000138888).

| Resource | What is available | Scope and evidence |
| --- | --- | --- |
| [Rulebook](https://www.dropbox.com/scl/fi/w8kkq9m6gwcwaawien7cw/TES_Rulebook.pdf?rlkey=tz1ctc1cc0ttummjzzx5xt24i&dl=0) | Publisher-linked rules PDF | Authoritative rules source; not a complete component database. |
| [Extended Tutorial Guide](https://www.dropbox.com/scl/fi/4qs75zew966mo5x34xo60/TES_Tutorial_Online.pdf?rlkey=63ep6fiz174wk9rvqferu8qts&dl=0) | Publisher-linked learning guide | Detailed tutorial guidance; a guide is not independently verified as a standalone print-and-play kit. |
| [Enemy Skills Reference](https://www.dropbox.com/scl/fi/xmpxpq3fb3m06of7yk4os/TES_Reference-Sheet.pdf?rlkey=fw34rzteilf8j8mqo45tg6006&dl=0) | Publisher-linked rules reference | Enemy skill definitions; not a complete inventory of every enemy chip's statistics. |
| [Base Race Sheets](https://www.dropbox.com/scl/fi/y60sqtjmydnxj217wz9uj/TES_Race-Sheets.pdf?rlkey=sxa5es8vxhq07grvvk4ircd6u&dl=0) | Actual character sheet faces and base statistics | Download verified: 40 pages, 10 race names repeated four times. |
| [Base Class Sheets](https://www.dropbox.com/scl/fi/ox3wyt4moul16exl7kq7h/TES_Class-Sheets.pdf?rlkey=djo9987sg57zl8ef3wi6naqre&dl=0) | Actual class faces, abilities, and upgrades | Download verified: 30 pages, novice/master faces for 15 classes. |
| [Base Skill Sheets](https://www.dropbox.com/scl/fi/wdszv9azzjvj5qhc9dpbm/TES_Skill-Sheets.pdf?rlkey=rsfy9ut9osmhiw6h8kwr85bx7&dl=0) | Actual skill references and turn reference | Download verified: 22 pages; combat, turn reference, and ten named skill lines. |
| [Campaign Journal](https://www.dropbox.com/scl/fi/wqerjcv89rwi4bioksx86/TES_Campaign-Journal.pdf?rlkey=h0v2un6w6ms7dgylsinsuzsz6&dl=0) | Campaign record sheet | Useful for persistent character/session state; not the campaign's narrative/component content. |
| [Jailbreak Checklist](https://www.dropbox.com/scl/fi/f5atkf06p5w8139qmq5ts/TES_Jailbreak-Checklist.pdf?rlkey=g2tg9ssz2upam6b9122qpq8nc&dl=0) | Tutorial checklist | Supports the actual learning scenario. |
| [Corrected Sheogorath card](https://www.dropbox.com/scl/fi/7gip0j7v8dj312zuqd69k/TES-SO1_Daedric-Princes-Card.pdf?rlkey=2yoswo6tq1xy8j00jd06hef7v&dl=0) | A specific corrected Shadows of Oblivion component | Does not imply all expansion cards are available. |

Other official downloads on the page are Arvan's Adventurous Achievements and box packing instructions. None is described as a complete print-and-play edition or an asset SDK.

The race PDF contains Argonian, Breton, Dark Elf, High Elf, Imperial, Khajiit, Nord, Orc, Redguard, and Wood Elf. The class PDF contains Acrobat, Archer, Bard, Healer, Knight, Scout, Sorcerer, Spellsword, Templar, Dragonknight, Necromancer, Nightblade, Pilgrim, Warden, and Rogue. The skill PDF covers Combat plus Acrobatics, Bow, Destruction Staff, One Hand and Shield, Restoring Light, Shadow, Daedric Summoning, Heavy Armor, Two Handed, and Speech. Text extraction drops graphical symbols, so implementation must verify symbols and dice results against the PDF page images rather than trusting extracted text alone.

## Existing digital tabletop implementations

| Source | Provenance | What it establishes | Limitations |
| --- | --- | --- | --- |
| [CTG Gamefound update 27](https://gamefound.com/en/projects/chip-theory-games/the-elder-scrolls/updates/27) | Publisher-authored update under the Chip Theory Games campaign | CTG reports external playtesting through Tabletop Simulator during development. | No public download, Steam Workshop item, or public-use license is provided in the update. This is development evidence, not an available retail digital edition. |
| [The Elder Scrolls: Betrayal of the Second Era — community TTS module](https://steamcommunity.com/sharedfiles/filedetails/?id=3463937562) | Workshop authors include Weasel, phire, and Nonprophet; publisher ownership/authorization was not established | Public Workshop page, scanned game components, campaign session 2/3 progression, character building, dice tooltips, province effects, and encounter setup described. | Community implementation; complete component inventory and correctness were not audited. Changelog references some Valenwood content but does not establish complete expansion coverage. Requires the desktop Tabletop Simulator platform. |
| [Mark's Table](https://steamcommunity.com/sharedfiles/filedetails/?id=3492491314) | Workshop author Mark; description identifies scripting by MarkTheQuark and credits scans/models from the community module above | Public Workshop page; session 1/2/3, guild and province selection, campaign continuation, tutorial setup, town/conflict encounters, cooldown automation, and player import/export described. | Its own to-do list includes remaining peaceful encounters, side quests, guild quest clashes, endgames, delve encounters, and special town setup automation. Therefore it should not be described as fully rules-automated. Publisher licensing and a browser redistribution grant were not found. |

Both Workshop descriptions concern campaign-scale implementations, not merely a small demo, but this research did not run TTS or verify every asset. A link to CTG's shop and crediting CTG as the tabletop publisher do not make a community module an official digital edition. These modules are useful references for interaction design and existing player workflows; their published existence is not an export license for the scanned art or scripts.

Steam scraping caveat: Firecrawl included generic “removed” and “incompatible” warning text. The raw HTML for both items places those messages inside `style="display: none"`. They are template elements, not evidence that the modules were removed or incompatible. Both public descriptions and subscription controls were accessible during research; actual loading/subscription was not tested.

Targeted searches of Tabletopia, Tabletop Playground, and CTG's site did not locate an official playable listing for this exact title. Search results for physical demos, unrelated games, or a general platform home page are not evidence of an edition.

## API and asset reuse

No official machine-readable gameplay API or complete downloadable component dataset was found. The official resources reviewed are PDFs and FAQ pages. Product/shop endpoints, generic Elder Scrolls APIs, and game-wiki data would not supply this board game's complete decks or exact mechanics.

CTG's published [Terms of Service](https://chiptheorygames.com/policies/terms-of-service), under “No Unlawful or Prohibited Use/Intellectual Property,” reserve protected site content to personal use and state that other use requires express written permission from CTG and the copyright owner. No contrary open license or general browser-app redistribution grant was found on the support page or reviewed downloads. Public download availability should therefore not be recorded in the project as permission to bundle all art/card text in a publicly deployed app. This distinction does not prevent implementing factual rules in original code and original presentation.

## What a faithful browser implementation still needs

1. **Exact rules and state model:** use the publisher rulebook, tutorial, FAQ, and real character references. Represent campaign sessions, daily phases, province travel, town options, encounter variants, hex combat, stamina/magicka, skill dice and cooldowns, progression, and campaign outcomes as the tabletop specifies.
2. **A component inventory:** enumerate every base-game deck, province sheet/gazetteer, map/tile, enemy chip, die face, quest, delve, loot component, and endgame entry. Record which are verifiable from the public official documents and which are still missing. The official downloads reviewed do not establish complete coverage.
3. **Missing authoritative content:** obtain the absent component data from a complete authorized source or user-owned materials made available for this project. Do not silently fill gaps with invented enemies, quests, or statistics and label the result the original tabletop game.
4. **Asset distribution basis:** keep source provenance and any explicit applicable license/permission with an asset manifest. Official art can be linked as reference while original UI artwork and verified factual mechanics are implemented. Do not infer a public deployment license from Steam subscription or a PDF download.
5. **Rules verification:** validate an actual published scenario from setup to completion, then test multi-session continuation and remaining encounter types. A campaign selector and attractive board alone do not demonstrate 1:1 playability.

Research artifacts are local only under `scratch/tabletop-assets/`: raw official support HTML, raw Workshop page HTML, and the three official character-reference PDFs plus extracted text. They were downloaded for inspection, not copied into the application's public asset directory.
