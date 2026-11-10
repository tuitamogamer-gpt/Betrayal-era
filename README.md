# Betrayal of the Second Era — browser project

## Published tabletop adaptation: in development

The goal is the actual Chip Theory Games tabletop game with automatic rules, solo play and online co-op. New work lives in `src/tabletop/` and is playable at **`/tabletop.html`**: the complete **Jailbreak Introduction encounter** with the two tutorial adventurers. Choose the tutorial's fixed setup or the standard setup, which draws one of the five Jailbreak enemies per adventurer and lets you deploy, solo or as a pair, at Apprentice, Adept or Expert difficulty. It covers the battle, the common cache's lockpick check and its Falkreath Meat Loaf, the achievements checklist, end-of-battle cleanup, class rewards and the closing rest. It is not the complete campaign: other races and skill lines, class abilities and Day 1 onward are not connected. [Scope, verified sources and remaining work](docs/TABLETOP-PORT.md).

Run `npm run test:tabletop` for the new rules and multiplayer tests. Online rooms require connected private Vercel Blob storage; without it the API explicitly reports that online play is unavailable. [Networking setup](docs/tabletop-network.md).

## Earlier fan prototype

A playable, unofficial solo adaptation inspired by Chip Theory Games’ *The Elder Scrolls: Betrayal of the Second Era*. Three linked tactical encounters combine dice, positioning, character progression, and choices between battles.

The encounters, dice faces, balance, and illustrations are original. This compact campaign uses selected tabletop concepts with simplified rules; it does not implement the complete published board game.

## Start playing

The **ready-to-play ZIP** contains the built game. Extract it, install Node.js 20.19+ (22.12+ recommended), then double-click `start-game.cmd` on Windows or run `node serve.mjs` in the extracted folder. Open **http://127.0.0.1:4173** and keep the terminal open. No `npm install` is needed for that package. See [PLAY-NOW.md](PLAY-NOW.md) for English and Bosnian instructions.

On first launch, choose **Start playing** for a ready-made Dunmer Sorcerer on **Story** difficulty, with guidance enabled. **Create your own adventurer** lets you choose race, class, and difficulty. Existing saves resume without starting over.

The turn guide suggests a useful next action from the current board state. Hide it with its close button or **Settings → Turn guide**. Optional **Turn reminders** review selected dice, skipped actions, or a potentially losing end turn before you commit.

## Run from source

Requires Node.js 20.19+ or 22.12+ and npm:

```sh
npm install
npm run play
```

This builds the game and starts the local production runner at **http://127.0.0.1:4173**. To rebuild separately, use `npm run build`; to serve an existing build, use `npm start`. Choose another port with `node serve.mjs --port 4174` or the `PORT` environment variable.

For development with live updates:

```sh
npm run dev -- --port 5173
```

Open `http://localhost:5173`. Export a backup before switching between this address and the production address: browser saves belong to their exact hostname and port.

Deploy the contents of `dist/` to a static host. Art, fonts, and textures are bundled; play requires no external API, account, or API key. WebGL displays the 3D board. The game switches to a playable 2D board if WebGL fails at startup or loses its context; **Settings → Board display → Use 2D** also enables it. Reload to attempt 3D again.

Run rules checks with `npm run test:rules`, or runner checks with `npm run test:server`. For rules, runner, and desktop/mobile browser tests:

```sh
npx playwright install chromium
npm test
```

## Campaign and difficulty

| Mission | Objective | Standard/Veteran limit |
| --- | --- | ---: |
| **An uneasy welcome — Glenumbra** | Defeat the ambushers. An optional strongbox contains 15 gold. | 5 rounds |
| **Whispers in the ruins — Stormhaven** | Recover both skyshards **and** defeat every guardian. | 6 rounds |
| **The price of betrayal — Rivenspire** | Defeat Deslandra and her guardian. Breaking both ritual wards removes Deslandra’s 2 armor; this is optional. | 5 rounds |

End a move directly on a chest, skyshard, or ward to collect or activate it. Deslandra’s armor absorbs 2 damage from each engagement or class ability while either ward remains. Zero health or an unfinished objective at the round limit loses the encounter. Retry returns to its starting checkpoint.

Choose difficulty when creating an adventurer:

| Mode | Changes |
| --- | --- |
| **Story** | Two extra rounds per encounter; enemies deal 1 less damage, with a minimum attack of 1. |
| **Standard** | Default enemy stats and the limits above. |
| **Veteran** | Every enemy gains 2 health and deals 1 more damage. |

## Playing a turn

- **Move:** select Move and choose a highlighted hex, up to your Stamina range. Living enemies block movement. Move and engage in either order; a second move spends the free engagement, but a fatigue engagement remains possible.
- **Undo a move:** use **Undo** or `Z` to reverse the last ordinary move, including its movement cost. Undo is unavailable after a pickup, hazard damage, roll, ability, potion, or end turn. It cannot reverse combat or recover spent rewards.
- **Use terrain:** stone cover reduces each incoming enemy attack by 1 before Guard. Ending a move on unstable ground costs 1 health; passing through does not. Enemies ignore hazards. Hover or focus a hex to inspect terrain, tokens, occupants, and reachability.
- **Engage:** choose an enemy and ready dice, up to your Combat stat. Stamina limits physical/defense dice; Magicka limits magic/restoration dice. Iron Blade reaches 1 hex, Flames 3, and Lightning Bolt 4. **Prepare attack** selects suitable offensive dice. The preview accounts for range, equipment, and wards; expected damage is an average.
- **Resolve dice:** damage harms the target, Guard absorbs attacks, and Restoration heals. Each blank grants 1 Tenacity, capped at 6. Spend 2 Tenacity on a class ability within 3 hexes. The skill reference shows all six equally likely faces of each die.
- **Recover:** every rolled die enters the cooldown queue. End turn lets enemies act, then recovers dice in queue order up to your Cooldown stat. Enemy intent previews account for movement, cover, and shared Guard. Additional engagements cost 1 Fatigue, reducing maximum health for this encounter; they are unavailable at 1 health.
- **Heal and develop:** drink a potion to restore up to 6 health. The first two victories grant gold, XP, and a free upgrade: +3 maximum health, +1 Combat, or +1 Cooldown. Prepare and travel before the next battle; win the third to finish.

Drag sideways to rotate the 3D board; scroll or use **+ / −** to zoom. On touchscreens, vertical swipes scroll the page. **Reset board view** restores the camera. Health, Guard, Tenacity, and Fatigue remain visible in the mobile layout. Tab to focus either board, use **arrow keys** to move the hex cursor, and **Enter/Space** to activate that hex for movement or targeting.

Shortcuts: **1** Move · **2** Engage · **R** Roll · **E** End turn · **H** Potion · **Z** Undo move · **I** Inventory · **?** Help · **Esc** Close panel. Settings control sound, guidance, turn reminders, and board display. The interface respects reduced-motion preferences.

## Adventurers

The default is **Lyris Ashwind, a Dunmer Sorcerer**. Character → New adventurer offers three races, each with its own original portrait, and three classes with live stat previews.

| Race | Health | Stamina | Magicka |
| --- | ---: | ---: | ---: |
| Dunmer | 12 | 3 | 3 |
| Nord | 14 | 4 | 3 |
| Breton | 12 | 3 | 4 |

All begin with Combat 3, Cooldown 2, three potions, and six dice: two Iron Blade, two Flames, one Iron Ward, and one Restoration. **Sorcerer** deals 4 ability damage; **Dragonknight** deals 3 and gains 2 Guard; **Nightblade** deals 3 and heals up to 2 health. Abilities cost 2 Tenacity and have range 3; armor can reduce their damage.

## Between encounters

Visit the merchant and trainer in the preparation hub before choosing a road.

| Purchase or training | Cost | Effect |
| --- | ---: | --- |
| Health potion | 15 gold | Add one potion; repeatable. |
| Ward charm | 40 gold | Begin each turn with 1 Guard. |
| Sharpening stone | 45 gold | +1 engagement damage when any physical die hits. |
| Focus crystal | 45 gold | +1 engagement damage when any magic die hits. |
| Enduring spirit | 2 XP | +3 maximum health and heal 3. |
| Battle discipline | 3 XP | +1 Cooldown. |
| Lightning Bolt | 2 XP | Learn a magic die with range 4. |

Equipment is automatic and permanent. Equipment and training can each be acquired once; a spell already learned at a shrine cannot be purchased again. Damage bonuses apply once per matching engagement. Free victory upgrades are separate from paid training.

Each road opens a short story with two responses. Effects are shown before choosing; your response is recorded in the quest journal and begins the next battle. Fatigue clears before travel healing is applied.

| Road | Response | Effect |
| --- | --- | --- |
| Camp | Share their fire | Fully heal; gain 1 potion. |
| Camp | Stand the night watch | Heal 6; gain 1 starting Guard every turn of the next encounter, stacking with Ward charm. |
| Shrine | Listen to the ancient spell | Heal 4; learn Lightning Bolt, or gain 2 Tenacity if already known. |
| Shrine | Ask for renewal | Fully heal; gain 2 Tenacity. |
| Ruins | Open the strongbox | Gain 35 gold and 1 potion; heal 3. |
| Ruins | Read the forgotten journal | Gain 2 XP and 2 Tenacity; heal 3. |

Tenacity remains capped at 6. Travel gold and XP can only be spent at a later preparation hub; there is no further shop after the final road choice. The potion or Tenacity from the ruins is available in the immediately following battle.

## Saves and retries

Successful actions save locally under `betrayal-board-save-v1`; reloading resumes the adventure. New game replaces that browser’s campaign. Saves do not sync between devices or different site addresses. Settings → **Back up** downloads a portable JSON save; **Restore** validates it before replacing progress. Invalid files preserve the current adventure.

If browser storage is blocked, play continues in memory and **Back up / Restore still work**. Download a backup before closing or reloading that session. To transfer an existing development save from `localhost:5173` to `127.0.0.1:4173`, back it up at the old address, then restore it at the new one. Sound and guide preferences are stored separately under `betrayal-preferences-v2`.

Older v1 saves migrate to Standard difficulty with current round limits and defaults for new fields. Terrain is reconstructed from the encounter, and already-completed legacy encounters keep their completed objective status. New saves retain difficulty, tokens, route responses, equipment, and training. Retry restores the checkpoint taken after preparation and travel, including supplies, objective tokens, and statistics; rewards from a failed attempt are rolled back. A legacy save without a checkpoint restarts its encounter at full health while keeping earned progression.

## Scope and sources

This is a three-encounter solo campaign on a 37-hex arena. It includes a small original shop, training system, terrain set, and three travel stories. It does not reproduce the official rulebook, dice distributions, full region maps, encounter decks, character/skill/item catalogues, guild systems, multi-day structure, cooperative multiplayer, or official balance.

The name, setting, and character references belong to their respective owners. This independent fan project is not endorsed by Chip Theory Games or Bethesda/ZeniMax.

- [Official support and rulebooks](https://chiptheorygames.com/pages/support/the-elder-scrolls)
- [Stidjen Plays Solo review](https://stidjenplayssolo.wordpress.com/2025/04/17/the-elder-scrolls-betrayal-of-the-second-era-a-solo-review/) — background for selected tabletop concepts.
- [Asset credits and licenses](public/assets/CREDITS.md) — original generated illustrations, procedural geometry, CC0 Poly Haven textures acquired through its API, and bundled OFL fonts.

Built with Three.js, Lucide, and Vite. `src/rules.js` owns campaign logic; `src/board.js` renders the battlefield; `src/main.js`, `src/readiness-ui.js`, `src/tactics-ui.js`, and `src/layout.js` provide the interface. `serve.mjs` runs the built game using only Node’s standard library. Tests exercise rules, serving, and browser interactions; run the commands above for current results.
