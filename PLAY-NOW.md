# Play now / Pokreni igru

## English

1. **Extract the entire ZIP** into a folder. Keep `dist/`, `serve.mjs`, and the launch scripts together.
2. Install [Node.js](https://nodejs.org/) **20.19 or newer**; Node **22.12+** is recommended. The ready-to-play package needs **no npm install, account, or API key**.
3. On Windows, double-click **`start-game.cmd`**. On macOS/Linux, open a terminal in the extracted folder and run:

   ```sh
   node serve.mjs
   ```

Open **http://127.0.0.1:4173** in your browser. Keep the terminal open while playing; `Ctrl+C` stops the server. If that port is occupied, run `node serve.mjs --port 4174` and use the new address printed in the terminal.

Choose **Start playing** for a ready-made Sorcerer on **Story** difficulty, or **Create your own adventurer**. Follow **Your next step** to learn movement, dice, and turn recovery. The campaign has three linked battles; you can save and return between sessions.

- Click highlighted hexes to move. Choose an enemy, use **Prepare attack**, then **Roll dice**. End your turn to recover dice and let enemies act.
- **Undo / Z** reverses the last ordinary move before effects are committed. Potions restore health; objectives and terrain matter.
- **Settings** controls guidance and turn reminders. **Use 2D** provides a simpler board if needed.
- Progress autosaves in the same browser and at the same address. **Settings → Back up** downloads a portable save; **Restore** imports it. If browser storage is blocked, export before closing or reloading.

**Continuing an older game from port 5173?** Open the old address first and use **Back up**. Then use **Restore** at `127.0.0.1:4173`. Different ports or hostnames have separate browser saves.

## Bosanski

1. **Raspakuj cijeli ZIP** u jedan folder. `dist/`, `serve.mjs` i skripte za pokretanje trebaju ostati zajedno.
2. Instaliraj [Node.js](https://nodejs.org/) **20.19 ili noviji**; preporučena je verzija **22.12+**. Za gotovi paket **nisu potrebni npm install, račun ni API ključ**.
3. Na Windowsu dvaput klikni **`start-game.cmd`**. Na macOS-u/Linuxu otvori terminal u raspakovanom folderu i pokreni:

   ```sh
   node serve.mjs
   ```

U pregledniku otvori **http://127.0.0.1:4173**. Ostavi terminal otvoren dok igraš; `Ctrl+C` zaustavlja server. Ako je port zauzet, pokreni `node serve.mjs --port 4174` i otvori adresu koju terminal ispiše.

Klikni **Start playing** za početak s pripremljenim čarobnjakom na težini **Story**, ili **Create your own adventurer** za vlastitog lika. Vodič **Your next step** predlaže naredni potez. Kampanja ima tri povezane bitke i možeš je nastaviti kasnije.

- Klikni označeno polje za kretanje. Odaberi neprijatelja, zatim **Prepare attack** i **Roll dice**. Završi potez da se kockice oporave i neprijatelji odigraju svoj potez.
- **Undo / Z** poništava posljednje obično kretanje prije nego što se izvrši naredna akcija. Napitci vraćaju zdravlje; prati ciljeve i teren.
- U **Settings** možeš uključiti ili sakriti vodič i podsjetnike. **Use 2D** uključuje jednostavniju tablu.
- Napredak se automatski čuva u istom pregledniku na istoj adresi. **Settings → Back up** preuzima sačuvanu igru; **Restore** je učitava. Ako je pohrana u pregledniku blokirana, napravi backup prije zatvaranja ili osvježavanja stranice.

**Nastavljaš igru s porta 5173?** Na staroj adresi prvo klikni **Back up**, pa na `127.0.0.1:4173` klikni **Restore**. Različiti portovi i nazivi hosta imaju odvojene sačuvane igre.

---

This is an unofficial solo adaptation with three original encounters and simplified rules, not the complete published board game. / Ovo je nezvanična solo adaptacija s tri originalna susreta i pojednostavljenim pravilima, a ne cjelokupna objavljena društvena igra.
