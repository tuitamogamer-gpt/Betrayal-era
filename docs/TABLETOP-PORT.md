# Published tabletop adaptation

This work implements the published **The Elder Scrolls: Betrayal of the Second Era** rules in new modules. The original application in `src/rules.js` is a separate, simplified fan prototype. Its tests are not evidence of tabletop fidelity.

The requested destination is an application that enforces the rules, supports solo play and online cooperative play, and implements the complete base-game campaign. **That destination is not complete.**

## Current playable scope

`/tabletop.html` plays the complete **Jailbreak Introduction encounter** with the official extended tutorial's fixed two-adventurer setup: Argonian and Dark Elf against the High Elf and Argonian Bandits. One person controls both adventurers locally; the multiplayer adapter assigns them to two players. It is not the published one-adventurer solo setup or a randomized Jailbreak draw.

- **Battle:** the actual 33-hex layout, separate Stamina/Magicka limits, battle forms, actual die faces, active dice, the 13-slot cooldown track, enemy priorities and movement, fatigue rounds and end-of-round victory checks.
- **Common cache:** ending a move on the cache hex offers the lockpick check (code 5-2-2, three attempts). Server-generated lockpick dice, kept dice, ±1 adjustments paid with real fatigue from the finite supply, voluntary stopping, failure (cache discarded, card cycled) and success. Unused movement of the interrupted move can continue afterwards.
- **Falkreath Meat Loaf (CO-019):** placed in a ready slot or the pack, or left. From a ready slot during its owner's turn it gives 3 bonus HP to its user or 1 bonus HP to each adventurer on the map. Bonus HP absorbs enemy damage first, never true damage, and is ignored by enemy priority.
- **Achievements, cleanup and class rewards:** the eleven-entry achievements checklist, end-of-battle cleanup, the published achievement-to-class table, the draw procedure for adventurers with fewer than two earned classes, the non-achievement choice and its cost, and the all-defeated draw. Afterwards party XP becomes 2 and the adventurers rest to full HP with empty cooldown tracks. Day 1 has not begun.

Class abilities are recorded by class name only. The random five-enemy draw (Skeever Pup's Rot and Spriggan's Bane are not implemented), provincial travel, quests and the full campaign are not connected. Do not describe this screen as the full board game or as ready for a complete campaign.

## Verification and sources

- [Rules research](tabletop-rules-research.md): rulebook page references, actual campaign structure, the 2026-11-10 v1.1 source check and discrepancies in the old prototype.
- [Component and digital-source research](tabletop-assets-research.md): official downloads, community modules, and missing component sets.
- [Jailbreak component facts](jailbreak-component-data.md): map, enemies, die faces, cache, item, achievements and class rewards.
- [Lockpicking contract](lockpicking.md): immutable checks, the published cache example and how the encounter applies it.
- [Network contract](tabletop-network.md): authenticated rooms, authoritative actions, persistence and deployment requirements.

Run `npm run test:tabletop` for the rules and room tests. Integration tests replay the extended tutorial from setup through its lockpick example, final attack, cleanup and class options (T pp.11–22), then complete the rewards. Other tests cover rejected moves, cooldown ordering, interrupted movement, fatigue payment, inventory limits, bonus HP, enemy destination ties, every reward path, save upgrades, concurrency and turn ownership. A further 300 seeded encounters play to completion, checking conservation of physical dice and fatigue, legal health and cooldown capacity, structural validity and plain-JSON persistence; these are consistency checks, not proof of the entire published ruleset.

## Remaining campaign work

The publisher's public PDFs cover rules and character references. Further research found broad component coverage in a public community Tabletop Simulator module, including accessible gazetteer PDFs and card textures. Those sources are not a verified machine-readable rules database or proof of publisher authorization. See the [public component inventory](public-component-inventory.md) for what was actually checked. The remaining work includes factual transcription, completeness checks, current errata, implementation of each component's effects, and campaign-wide verification. Invented substitutes would produce a different game. Scanned art and story text are not bundled in this application.

The publisher's support page now links Rulebook and Tutorial **v1.1**. The combat engine was verified against v1.0; the Jailbreak pages used for the new cache, cleanup and reward flow were read in v1.1 and agree with the v1.0 facts recorded earlier. A complete v1.0→v1.1 comparison of the combat rules has not been made; the one published v1.1 gameplay adjustment (running out of overfatigue) is deliberately still the v1.0 behavior. See the rules research for details.

Online play also requires private durable storage connected to the existing Vercel project. The current connector returned HTTP 403 when asked to create that storage. The production API must report that it is unavailable until the dependency is configured; it must never pretend an in-memory server process is a durable online session.

## Completion criteria

1. Cover every base-game component and current erratum with traceable data.
2. Complete the Jailbreak encounter, including cache, achievements, class rewards and cleanup. **Done for the fixed tutorial setup**; the random draw of all five enemies, their remaining skills and the true-solo setup remain.
3. Implement each province's overland, town, conflict, delve and dungeon flows.
4. Verify all three campaign sessions, progression, failures and endgames.
5. Verify actual one-to-four-adventurer setups, solo ownership, online reconnects, and concurrent actions against deployed durable storage.

Only after these pass should the application be described as a complete, ready-to-play online edition.
