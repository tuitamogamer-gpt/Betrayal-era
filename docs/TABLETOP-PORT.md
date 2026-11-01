# Published tabletop adaptation

This work implements the published **The Elder Scrolls: Betrayal of the Second Era** rules in new modules. The original application in `src/rules.js` is a separate, simplified fan prototype. Its tests are not evidence of tabletop fidelity.

The requested destination is an application that enforces the rules, supports solo play and online cooperative play, and implements the complete base-game campaign. **That destination is not complete.**

## Current playable scope

`/tabletop.html` is a **Jailbreak combat alpha** using the official extended tutorial's fixed two-adventurer setup: Argonian and Dark Elf against the High Elf and Argonian Bandits. One person controls both adventurers locally; the multiplayer adapter assigns them to two players. It is not the published one-adventurer solo setup or a complete randomized Jailbreak encounter.

The new combat implementation uses the actual 33-hex layout, separate Stamina/Magicka limits, battle forms, actual die faces, active dice, the 13-slot cooldown track, enemy priorities, and end-of-round victory checks. The component research records both publisher references and the limited community evidence used to confirm die-face frequencies. No scanned component artwork or story text is bundled.

The common cache, reward/class-selection flow, other races/enemies, provincial travel, quests, and the full campaign are not connected to this playable screen. A separately tested lockpicking module is available for subsequent integration. Do not describe this screen as the full board game or as ready for a complete campaign.

## Verification and sources

- [Rules research](tabletop-rules-research.md): rulebook page references, actual campaign structure, and discrepancies in the old prototype.
- [Component and digital-source research](tabletop-assets-research.md): official downloads, community modules, and missing component sets.
- [Jailbreak component facts](jailbreak-component-data.md): map, enemies and die faces.
- [Lockpicking contract](lockpicking.md): immutable checks and the published cache example.
- [Network contract](tabletop-network.md): authenticated rooms, authoritative actions, persistence and deployment requirements.

Run `npm run test:tabletop` for the new rules and room tests. The battle integration tests reproduce documented tutorial outcomes; other tests cover rejected moves, cooldown ordering, concurrency and turn ownership. A further 150 seeded encounter simulations check completion and conservation of physical dice, legal health and cooldown capacity; these are consistency checks, not proof of the entire published ruleset.

## Remaining campaign work

The publisher's public PDFs cover rules and character references. Further research found broad component coverage in a public community Tabletop Simulator module, including accessible gazetteer PDFs and card textures. Those sources are not a verified machine-readable rules database or proof of publisher authorization. See the [public component inventory](public-component-inventory.md) for what was actually checked. The remaining work includes factual transcription, completeness checks, current errata, implementation of each component's effects, and campaign-wide verification. Invented substitutes would produce a different game. Scanned art and story text are not bundled in this application.

Online play also requires private durable storage connected to the existing Vercel project. The current connector returned HTTP 403 when asked to create that storage. The production API must report that it is unavailable until the dependency is configured; it must never pretend an in-memory server process is a durable online session.

## Completion criteria

1. Cover every base-game component and current erratum with traceable data.
2. Complete the Jailbreak encounter, including cache, achievements, class rewards and cleanup.
3. Implement each province's overland, town, conflict, delve and dungeon flows.
4. Verify all three campaign sessions, progression, failures and endgames.
5. Verify actual one-to-four-adventurer setups, solo ownership, online reconnects, and concurrent actions against deployed durable storage.

Only after these pass should the application be described as a complete, ready-to-play online edition.
