import './app.css';
import {
  createJailbreak, reduceJailbreak, getLegalMoves, upgradeJailbreak, isJailbreakState,
  classOptions, canDrawClasses, JAILBREAK_MAP, SKILLS, ITEMS, READY_SLOTS, INVENTORY_LIMIT,
} from './engine.js';
import { JAILBREAK_ACHIEVEMENTS, achievementHolder, isClassAvailable } from './jailbreak-rewards.js';

// The key predates schema 2; saved states carry their own schema version and upgrade on load.
const SAVE_KEY = 'betrayal.tabletop.jailbreak.v1';
const FORMS = [
  ['light-weapon', 'Light weapon'], ['heavy-weapon', 'Heavy weapon'],
  ['defensive', 'Defensive'], ['ranged-weapon', 'Ranged weapon'], ['magic', 'Magic'],
];
const ITEM_TEXT = Object.freeze({
  'CO-019': 'Common consumable · Meat. Discard it to gain 3 bonus HP yourself, or give each adventurer on the map 1 bonus HP.',
});
const root = document.querySelector('#tabletop-app');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
let notice = '';
let noticeError = false;
let saveAvailable = true;
let state = loadGame();
let selectedDice = new Set();
let targetId = null;
let form = currentHero()?.form ?? 'light-weapon';
let modal = null;
let networkStatus = null;
let networkSession = null;
let room = null;
let networkBusy = false;
let networkError = '';
let rollOrder = [];
let skippedResults = new Set();
let backlashTargets = {};
let viewGeneration = 0;
const requestedRoom = new URLSearchParams(location.search).get('room') ?? '';

/** Whether this browser may act for an adventurer: always locally, by seat in a shared room. */
function controls(heroId) {
  if (networkBusy || (room && room.phase !== 'playing')) return false;
  if (!room || room.members.length === 1) return true;
  return state.heroes.find(hero => hero.id === heroId)?.ownerSeat === room.self.seat;
}
const canAct = () => controls(currentHero()?.id);

async function requestApi(body, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (networkSession) headers.Authorization = `Bearer ${networkSession.token}`;
  const query = method === 'GET' ? `?${new URLSearchParams(body)}` : '';
  const response = await fetch(`/api/tabletop${query}`, { method, headers,
    body: method === 'GET' ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'The shared table could not be reached.');
  return data;
}

function receiveSnapshot(snapshot) {
  if (room?.id === snapshot.id && snapshot.revision < room.revision) return false;
  // A room stored before schema 2 upgrades on its next action; read it as upgraded now.
  const game = snapshot.game ? upgradeJailbreak(snapshot.game) : null;
  const changed = !room || snapshot.revision !== room.revision;
  room = snapshot;
  if (game) {
    const previousHero = currentHero()?.id;
    state = game;
    if (changed) { rollOrder = []; skippedResults.clear(); }
    if (currentHero()?.id !== previousHero) { selectedDice.clear(); form = currentHero().form; }
  }
  return changed;
}

async function refreshRoom() {
  if (!networkSession || networkBusy) return;
  const session = networkSession;
  try {
    const snapshot = await requestApi({ roomId: session.roomId }, 'GET');
    if (networkSession !== session) return;
    if (receiveSnapshot(snapshot)) render();
  } catch (error) {
    if (networkSession !== session) return;
    networkError = error.message;
  }
}

async function connectRoom(operation) {
  if (networkBusy) return;
  viewGeneration++;
  networkBusy = true;
  networkError = '';
  const name = root.querySelector('#player-name')?.value.trim() || 'Adventurer';
  const roomId = root.querySelector('#room-code')?.value.trim() || requestedRoom;
  render();
  try {
    const result = await requestApi({ operation, name, ...(operation === 'join' ? { roomId } : {}) });
    networkSession = { roomId: result.roomId, token: result.token, memberId: result.memberId };
    try {
      localStorage.setItem(`betrayal.tabletop.room.${result.roomId}`, JSON.stringify(networkSession));
      localStorage.setItem('betrayal.tabletop.last-room', result.roomId);
    } catch { /* The current session still works without reconnect persistence. */ }
    receiveSnapshot(result.snapshot);
  } catch (error) {
    networkError = error.message;
  } finally {
    networkBusy = false;
    render();
  }
}

async function sendRoomAction(operation, action, options) {
  if (networkBusy || !room) return;
  networkBusy = true;
  render();
  try {
    // A joining guest advances the lobby revision. Refresh before host start so
    // clicking immediately after a friend joins does not submit stale membership.
    if (operation === 'start') receiveSnapshot(await requestApi({ roomId: room.id }, 'GET'));
    const body = { operation, roomId: room.id, requestId: crypto.randomUUID(), expectedRevision: room.revision,
      ...(action ? { action } : {}), ...(options ? { options } : {}) };
    let result;
    try { result = await requestApi(body); }
    catch (error) {
      // A transport failure may have happened after acceptance. Reuse the exact
      // request id so the authoritative server returns its stored receipt.
      if (error.name !== 'TypeError' && error.name !== 'TimeoutError') throw error;
      result = await requestApi(body);
    }
    receiveSnapshot(result.snapshot);
    selectedDice.clear();
    form = currentHero().form;
    notice = '';
    networkError = '';
    if (operation === 'start') modal = null;
  } catch (error) {
    notice = error.message;
    noticeError = true;
    networkError = error.message;
  } finally {
    networkBusy = false;
    await refreshRoom();
    render();
  }
}

function currentHero() {
  if (state.phase === 'enemy-defense' && state.pending?.heroId) return state.heroes.find(hero => hero.id === state.pending.heroId);
  return state.heroes[state.activeHero] ?? state.heroes[0];
}
const heroName = id => state.heroes.find(hero => hero.id === id)?.name ?? id;
const itemName = code => ITEMS[code]?.name ?? code;

function loadGame() {
  try {
    const stored = localStorage.getItem(SAVE_KEY);
    if (stored) {
      const saved = upgradeJailbreak(JSON.parse(stored).state);
      if (isJailbreakState(saved)) return saved;
      notice = 'This browser’s tabletop save could not be restored. A fresh encounter is ready.';
    }
  } catch {
    notice = 'Your tabletop save could not be read. A fresh encounter is ready.';
  }
  return createJailbreak();
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() }));
    saveAvailable = true;
  } catch {
    saveAvailable = false;
  }
}

function dispatch(action, actorId = currentHero()?.id) {
  if (!controls(actorId)) {
    notice = room?.phase === 'lobby' ? 'Start the shared encounter from the lobby first.' : 'The other player controls this adventurer.';
    noticeError = true;
    render();
    return;
  }
  if (room) { void sendRoomAction('action', action); return; }
  viewGeneration++;
  try {
    const beforeHero = currentHero()?.id;
    state = reduceJailbreak(state, action);
    selectedDice.clear();
    rollOrder = []; skippedResults.clear();
    if (currentHero()?.id !== beforeHero || action.type === 'begin-turn') form = currentHero().form;
    if (!state.enemies.some(enemy => enemy.id === targetId && enemy.hp > 0)) targetId = null;
    notice = '';
    saveGame();
  } catch (error) {
    notice = error.message || 'That action is not available now.';
    noticeError = true;
  }
  render();
}

function skillName(skill) {
  return SKILLS?.[skill]?.label ?? SKILLS?.[skill]?.name ?? skill;
}

function skillIcon(skill) {
  return skill === 'combat' ? '⚔' : skill === 'shield-discipline' ? '◇' : '✧';
}

function compatible(die) {
  if (die.skill === 'combat') return form !== 'magic';
  if (die.skill === 'force-shock') return form === 'magic';
  if (die.skill === 'shield-discipline') return form === 'light-weapon';
  return false;
}

function heroStatus(hero) {
  if (hero.className) return `${hero.className} class`;
  if (hero.escaped) return 'Escaped';
  if (hero.hp <= 0) return 'Defeated';
  return 'No class yet';
}

function renderInventory(hero) {
  if (!hero.items.length) return '';
  const usable = hero.id === currentHero()?.id && ['start', 'heroes'].includes(state.phase) && controls(hero.id);
  const ready = hero.items.filter(item => item.slot === 'ready').length;
  return `<div class="mat-label"><span>Inventory</span><span>${ready}/${READY_SLOTS} ready · ${hero.items.length}/${INVENTORY_LIMIT}</span></div><ul class="inventory">${hero.items.map(item => `<li><div><strong>${escapeHtml(itemName(item.code))}</strong><small>${item.slot === 'ready' ? 'Ready slot' : 'Pack · not usable in battle'} · ${escapeHtml(item.code)}</small></div>${usable && item.slot === 'ready' && item.code === 'CO-019' ? `<div class="item-actions"><button class="quiet-button" data-action="use-item" data-item="${escapeHtml(item.code)}" data-mode="self" title="${escapeHtml(ITEM_TEXT[item.code])}">Eat · +3 bonus HP</button><button class="quiet-button" data-action="use-item" data-item="${escapeHtml(item.code)}" data-mode="party">Share · +1 each</button></div>` : ''}</li>`).join('')}</ul>`;
}

function renderHero(hero) {
  const active = hero.id === currentHero()?.id && !['rewards', 'complete'].includes(state.phase);
  const activeDice = hero.dice.filter(die => die.state === 'active');
  const isElf = /elf/i.test(hero.race);
  return `<article class="hero-card ${active ? 'current' : ''}" aria-label="${escapeHtml(hero.name)} character mat">
    <div class="hero-heading"><div class="hero-sigil ${isElf ? 'dark-elf' : ''}" aria-hidden="true">${isElf ? 'D' : 'A'}</div><div><h3>${escapeHtml(hero.race)}</h3><p>${escapeHtml(hero.name)} · ${escapeHtml(heroStatus(hero))}</p></div>${active ? '<span class="hero-state">Active turn</span>' : ''}</div>
    <div class="health-track"><div class="health-caption"><span>Health</span><strong>${hero.hp} / ${hero.maxHp}${hero.bonusHp ? ` <span class="bonus-hp">+ ${hero.bonusHp} bonus</span>` : ''}</strong></div><div class="health-bar"><span style="width:${Math.max(0, Math.min(100, hero.hp / hero.maxHp * 100))}%"></span></div></div>
    <div class="hero-stats"><div><strong>${hero.stamina}</strong><span>Stamina</span></div><div><strong>${hero.magicka}</strong><span>Magicka</span></div><div><strong>${hero.cooldownStat}</strong><span>Cooldown</span></div><div><strong>${hero.tenacity}</strong><span>Tenacity</span></div></div>
    <div class="mat-label"><span>Active slots</span><span>${activeDice.length} / 4</span></div><div class="active-slots">${Array.from({ length: 4 }, (_, index) => {
      const die = activeDice[index];
      return `<span class="active-slot ${die ? 'filled' : ''}" title="${die ? escapeHtml(`${skillName(die.skill)}: ${die.face?.label ?? die.face?.value ?? ''}`) : 'Empty active slot'}">${die ? `${skillIcon(die.skill)} ${escapeHtml(die.face?.value ?? '')}` : '·'}</span>`;
    }).join('')}</div>
    <div class="mat-label"><span>Cooldown →</span><span>${hero.cooldown.length} / 13</span></div><div class="cooldown-track" aria-label="Cooldown track, ${hero.cooldown.length} of 13 slots used">${Array.from({ length: 13 }, (_, index) => {
      const die = hero.cooldown[index];
      const fatigue = die?.kind === 'light-fatigue' || die?.kind === 'overfatigue';
      const title = die ? `${index + 1}: ${fatigue ? die.kind : skillName(die.skill ?? hero.dice.find(item => item.id === die.id)?.skill ?? 'Skill die')}` : `Empty slot ${index + 1}`;
      return `<span class="cooldown-slot ${die ? 'filled' : ''} ${fatigue ? 'fatigue' : ''} ${die?.kind === 'overfatigue' ? 'overfatigue' : ''}" title="${escapeHtml(title)}">${die ? fatigue ? '◆' : '◇' : index + 1}</span>`;
    }).join('')}</div>${renderInventory(hero)}<p class="hero-note">${escapeHtml(FORMS.find(([id]) => id === hero.form)?.[1] ?? hero.form)} form · ${hero.dice.filter(die => die.state === 'available').length} dice available</p>
  </article>`;
}

function point(hex) {
  return { x: 38 + Number(hex.x ?? hex.id.split(',')[0]) * 36, y: 40 + Number(hex.y ?? hex.id.split(',')[1]) * Math.sqrt(3) * 12 };
}

function polygon(x, y) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3;
    return `${(x + 24 * Math.cos(angle)).toFixed(2)},${(y + 24 * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

function cacheDescription() {
  const cache = state.cache;
  if (cache.present) return `common cache, lockpick code ${cache.digits.join('-')} with ${cache.attemptLimit} attempts; end a move here to try it`;
  return cache.result === 'cycled' ? 'cache discarded after a failed lockpick check' : 'cache opened';
}

function renderBoard() {
  let reachable = [];
  try { reachable = state.phase === 'heroes' && canAct() ? getLegalMoves(state) : []; } catch { /* The engine may have a pending event. */ }
  const cells = Object.values(JAILBREAK_MAP.cells);
  const units = [...state.heroes.map(hero => ({ ...hero, kind: 'hero' })), ...state.enemies.map(enemy => ({ ...enemy, kind: 'enemy' }))]
    .filter(unit => unit.hp > 0 && unit.position && !unit.escaped);
  return `<div class="map-frame"><span class="map-label">Jailbreak · Clash map</span><span class="map-label right">${escapeHtml(state.difficulty)}</span>
    <svg class="battle-map" viewBox="0 0 368 248" role="group" aria-label="Jailbreak battle map. Choose a highlighted hex to move, or an enemy to target.">
      <defs><pattern id="stone-grain" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 5h4m7 8h4M6 2h2" stroke="#f3efce" stroke-opacity=".035" stroke-width="1"/></pattern></defs>
      ${cells.map(hex => {
        const { x, y } = point(hex);
        const isReachable = reachable.includes(hex.id);
        const showCache = hex.cache && state.cache.present;
        const description = `${hex.tile === 'entrance' ? 'Entrance' : 'Clash'} hex ${hex.id}${hex.exit ? ', exit' : ''}${hex.cache ? `, ${cacheDescription()}` : ''}${isReachable ? ', available movement' : ''}`;
        return `<g class="hex-group ${isReachable ? 'reachable' : ''} ${hex.exit ? 'exit' : ''} ${showCache ? 'cache' : ''}" data-hex="${hex.id}" role="button" tabindex="${isReachable ? '0' : '-1'}" aria-label="${escapeHtml(description)}"><title>${escapeHtml(description)}</title><polygon class="hex" points="${polygon(x, y)}"/><polygon fill="url(#stone-grain)" points="${polygon(x, y)}" pointer-events="none"/><text class="hex-coordinate" x="${x}" y="${y + 15}" text-anchor="middle">${hex.id}</text>${hex.exit ? `<text class="exit-mark" x="${x}" y="${y + 4}" text-anchor="middle">↟</text>` : ''}${showCache ? `<path class="cache-mark" d="M${x - 8} ${y - 4}h16v11h-16z M${x - 8} ${y - 4}l3-5h10l3 5"/><path d="M${x} ${y - 4}v7" stroke="#3d3524" stroke-width="2" pointer-events="none"/>` : ''}</g>`;
      }).join('')}
      ${units.map(unit => {
        const hex = JAILBREAK_MAP.cells[unit.position];
        if (!hex) return '';
        const { x, y } = point(hex);
        const enemy = unit.kind === 'enemy';
        const letters = enemy ? unit.name.includes('High') ? 'HE' : 'AR' : /elf/i.test(unit.race) ? 'D' : 'A';
        return `<g class="unit ${unit.kind} ${/elf/i.test(unit.race ?? '') ? 'dark-elf' : ''} ${unit.id === targetId ? 'selected' : ''} ${unit.id === currentHero()?.id && !enemy ? 'current' : ''}" ${enemy ? `data-target="${unit.id}" tabindex="0" role="button"` : ''} aria-label="${escapeHtml(`${unit.name}, ${unit.hp} health${unit.bonusHp ? ` plus ${unit.bonusHp} bonus` : ''}${enemy ? ', select as target' : ''}`)}"><title>${escapeHtml(`${unit.name} · ${unit.hp} HP${unit.bonusHp ? ` + ${unit.bonusHp} bonus` : ''}${enemy ? ` · Defense ${unit.defense}` : ''}`)}</title><circle class="unit-ring" cx="${x}" cy="${y - 2}" r="19"/><circle class="unit-circle" cx="${x}" cy="${y - 2}" r="16"/><text class="unit-letters" x="${x}" y="${y - 4}">${letters}</text><text class="unit-hp" x="${x}" y="${y + 8}">${unit.hp}${unit.bonusHp ? `+${unit.bonusHp}` : ''} HP</text></g>`;
      }).join('')}
    </svg><div class="board-legend"><span><i class="legend-dot"></i>Adventurers</span><span><i class="legend-dot enemy"></i>Enemies</span><span><i class="legend-dot exit"></i>Exit at start of turn</span>${state.cache.present ? '<span><i class="legend-dot cache"></i>Cache · end a move on it to pick the lock</span>' : ''}</div>
  </div>`;
}

function renderDice() {
  const hero = currentHero();
  const dice = hero.dice.filter(die => die.state === 'available');
  return `<div><label>Available skill dice</label><div class="dice-tray">${dice.map(die => `<button type="button" class="die-button ${selectedDice.has(die.id) ? 'chosen' : ''}" data-die="${die.id}" aria-pressed="${selectedDice.has(die.id)}" ${!canAct() || state.phase !== 'heroes' || !compatible(die) ? 'disabled' : ''}><span class="die-icon" aria-hidden="true">${skillIcon(die.skill)}</span><span class="die-name">${escapeHtml(skillName(die.skill))}<small>${die.skill === 'force-shock' ? 'Magicka' : 'Stamina'}</small></span></button>`).join('') || '<p class="small-note">No dice available. Active dice and cooldown still matter.</p>'}</div><p class="small-note" style="margin-top:8px">${selectedDice.size} selected · Stamina ${hero.stamina} / Magicka ${hero.magicka}</p></div>`;
}

function renderRoll() {
  const results = state.pending.results;
  if (rollOrder.length !== results.length || rollOrder.some(id => !results.some(result => result.dieId === id))) rollOrder = results.map(result => result.dieId);
  return `<div class="rolling-results"><label>Resolve your roll</label>${rollOrder.map((id, index) => {
    const result = results.find(item => item.dieId === id);
    return `<div class="roll-result"><div class="roll-row"><label class="result-choice" style="margin:0;text-transform:none;letter-spacing:0"><input type="checkbox" data-resolve="${result.dieId}" ${skippedResults.has(id) ? '' : 'checked'}><span>${escapeHtml(skillName(result.skill))}</span></label><strong>${escapeHtml(result.face.label ?? result.face.id)}</strong><button class="quiet-button order-button" data-roll-up="${id}" aria-label="Resolve ${escapeHtml(skillName(result.skill))} earlier" ${index === 0 ? 'disabled' : ''}>↑</button></div>${result.face.backlash ? `<label for="backlash-${id}" style="margin-top:8px">This die’s backlash recipient</label><select id="backlash-${id}" data-backlash="${id}" class="field">${state.heroes.filter(hero => hero.hp > 0 && !hero.escaped).map(hero => `<option value="${hero.id}" ${hero.id === backlashTargets[id] ? 'selected' : ''}>${escapeHtml(hero.name)} · ${hero.hp} HP</option>`).join('')}</select>` : ''}</div>`;
  }).join('')}<p class="small-note">Use ↑ to choose resolution order. Unchecked dice exhaust without resolving their ability.</p><button class="button primary" data-action="resolve">Resolve dice</button></div>`;
}

/** Display-only greedy match of lockpick dice against the code digits. */
function matchedDice(values, digits) {
  const needed = [...digits];
  const matched = new Set();
  values.forEach((value, index) => {
    const position = needed.indexOf(value);
    if (value !== null && position !== -1) { needed.splice(position, 1); matched.add(index); }
  });
  return matched;
}

function renderLockpick() {
  const hero = currentHero();
  const { check, remainingSteps } = state.pending;
  const cache = state.cache;
  const supplyLeft = state.supply.light + state.supply.over;
  const intro = `<div class="lockpick-card"><p class="eyebrow">Common cache</p><h3>Pick the lock</h3><p class="small-note">Match <strong>${cache.digits.join(' · ')}</strong> in any order within ${cache.attemptLimit} attempts. Each ±1 change gains 1 light fatigue in ${escapeHtml(hero.name)}’s cooldown track.${remainingSteps ? ` Afterwards ${escapeHtml(hero.name)} may continue this move for ${remainingSteps} more ${remainingSteps === 1 ? 'hex' : 'hexes'}.` : ''}</p>`;
  if (!check) {
    return `${intro}<div class="actions-stack"><button class="button primary" data-action="lockpick-roll">Roll three lockpick dice</button><button class="quiet-button" data-action="lockpick-decline">Leave the cache locked</button></div></div>`;
  }
  const matched = matchedDice(check.dice, check.digits);
  const adjusting = check.phase === 'adjust';
  const dice = check.dice.map((value, index) => `<div class="lock-die ${matched.has(index) ? 'matched' : ''}"><button class="quiet-button" data-action="lockpick-adjust" data-die-index="${index}" data-delta="-1" aria-label="Lower die ${index + 1} by one for one fatigue" ${!adjusting || value <= 1 || !supplyLeft ? 'disabled' : ''}>−</button><strong aria-label="Die ${index + 1} shows ${value}">${value}</strong><button class="quiet-button" data-action="lockpick-adjust" data-die-index="${index}" data-delta="1" aria-label="Raise die ${index + 1} by one for one fatigue" ${!adjusting || value >= 6 || !supplyLeft ? 'disabled' : ''}>+</button>${check.phase === 'continue' ? `<label class="keep-choice"><input type="checkbox" data-keep="${index}" ${matched.has(index) ? 'checked' : ''}> Keep</label>` : ''}</div>`).join('');
  const status = `<p class="small-note">Attempt ${check.attemptsUsed} of ${check.attemptLimit} · ${check.fatigueSpent} fatigue spent on this check${adjusting && !supplyLeft ? ' · the fatigue supply is empty' : ''}</p>`;
  if (check.phase === 'success') {
    return `${intro}<div class="lock-dice">${dice}</div><div class="notice">Unlocked! The top common card is <strong>${escapeHtml(itemName(cache.itemCode))}</strong> (${escapeHtml(cache.itemCode)}). ${escapeHtml(ITEM_TEXT[cache.itemCode] ?? '')}</div><div class="actions-stack"><button class="button primary" data-action="cache-item" data-placement="ready">Take it into a ready slot</button><button class="button" data-action="cache-item" data-placement="pack">Put it in the pack</button><button class="quiet-button" data-action="cache-item" data-placement="discard">Leave it (discard the card)</button></div></div>`;
  }
  if (check.phase === 'continue') {
    return `${intro}<div class="lock-dice">${dice}</div>${status}<p class="small-note">Not matched yet. Keep any dice, then roll the others for the next attempt — or stop, which fails the check.</p><div class="actions-stack"><button class="button primary" data-action="lockpick-roll">Roll unkept dice</button><button class="quiet-button" data-action="lockpick-stop">Stop · the cache is discarded</button></div></div>`;
  }
  return `${intro}<div class="lock-dice">${dice}</div>${status}<div class="actions-stack"><button class="button primary" data-action="lockpick-resolve">Check the result</button></div></div>`;
}

function renderFreeActions() {
  const hero = currentHero();
  const active = hero.dice.filter(die => die.state === 'active');
  const exhausted = hero.dice.filter(die => die.state === 'cooldown');
  const recoverCount = Math.min(4, exhausted.length);
  if (state.phase !== 'heroes' || (!active.length && (!/elf/i.test(hero.race) || hero.racialUsed || !exhausted.length))) return '';
  return `<details class="free-actions"><summary>Active dice & racial ability</summary>${active.length ? `<p class="small-note">Exhaust selected active dice to free their slots.</p>${active.map(die => `<label class="result-choice"><input type="checkbox" data-dismiss="${die.id}"> ${escapeHtml(skillName(die.skill))} ${escapeHtml(die.face?.value ?? '')}</label>`).join('')}<button class="quiet-button" data-action="dismiss-active">Exhaust selected active dice</button>` : ''}${/elf/i.test(hero.race) && !hero.racialUsed && exhausted.length ? `<p class="small-note">Dynamic · once per battle: recover four exhausted skill dice, or all if fewer are available. Replace each with light fatigue. Select ${recoverCount} ${recoverCount === 1 ? 'die' : 'dice'}.</p>${exhausted.map(die => `<label class="result-choice"><input type="checkbox" data-racial="${die.id}"> ${escapeHtml(skillName(die.skill))}</label>`).join('')}<button class="quiet-button" data-action="racial">Recover ${recoverCount} skill ${recoverCount === 1 ? 'die' : 'dice'}</button>` : ''}</details>`;
}

function renderEnemies() {
  return `<div class="enemy-profiles" aria-label="Enemy profiles">${state.enemies.map(enemy => `<button class="enemy-profile ${enemy.id === targetId ? 'selected' : ''} ${enemy.hp <= 0 ? 'defeated' : ''}" data-target="${enemy.id}" ${enemy.hp <= 0 ? 'disabled' : ''}><div class="enemy-title"><strong>${escapeHtml(enemy.name)}</strong><span>${enemy.hp <= 0 ? 'Defeated' : `${enemy.hp}/${enemy.maxHp} HP`}</span></div><div class="enemy-stats"><span>Defense <b>${enemy.defense}</b></span><span>Range <b>${enemy.range}</b></span><span>Combat <b>${enemy.combat}</b></span><span>Targets <b>${enemy.targets}</b></span></div><p class="enemy-priority">Priority: ${escapeHtml(enemy.priority)} adventurer</p><p><b>${escapeHtml(enemy.skill)}</b> · ${enemy.skill === 'Dodge' ? 'Prevents damage equal to rolled skill dice that deal no damage.' : 'After engaging, each target gains one light fatigue.'}</p></button>`).join('')}</div>`;
}

function renderDefense() {
  const hero = currentHero();
  const enemy = state.enemies.find(item => item.id === state.pending.enemyId);
  const active = hero.dice.filter(die => die.state === 'active');
  return `<div class="rolling-results"><div class="notice">${escapeHtml(enemy?.name ?? 'Enemy')} deals <strong>${state.pending.damage} damage</strong> to ${escapeHtml(hero.name)}.${hero.bonusHp ? ` Bonus HP absorbs damage first (${hero.bonusHp} left).` : ''} Choose active dice to prevent damage.</div>${active.map(die => `<label class="roll-row result-choice"><span><input type="checkbox" data-defend="${die.id}"> ${escapeHtml(skillName(die.skill))}</span><strong>${escapeHtml(die.face?.label ?? die.face?.value ?? 'Active')}</strong></label>`).join('') || '<p class="small-note">No active dice are available to prevent this damage.</p>'}${/argonian/i.test(hero.race) && !hero.racialUsed ? '<label class="roll-row result-choice"><span><input id="racial-defense" type="checkbox"> Argonian racial ability</span><strong>Prevent all · once per battle</strong></label>' : ''}<button class="button primary" data-action="defend">Confirm defense</button><p class="small-note">Unselected active dice stay ready. The engine checks which selected dice can prevent this attack.</p></div>`;
}

function renderAchievements({ showClasses = false, open = false } = {}) {
  const inEncounter = new Set(state.enemies.map(enemy => enemy.id));
  return `<details class="achievements" ${open ? 'open' : ''}><summary>Achievements checklist${showClasses ? ' and class rewards' : ''}</summary><ul>${JAILBREAK_ACHIEVEMENTS.map(item => {
    const holder = achievementHolder(state.achievements, item);
    const absent = item.enemyId && !inEncounter.has(item.enemyId);
    const classes = item.classes.map(name => isClassAvailable(name, state.expansions) ? name : `${name} (Valenwood)`).join(' · ');
    return `<li class="${holder ? 'done' : ''} ${absent ? 'absent' : ''}"><span>${escapeHtml(item.label)}</span><strong>${holder ? escapeHtml(heroName(holder)) : absent ? 'Not drawn here' : '—'}</strong>${showClasses ? `<small>${escapeHtml(classes)}</small>` : ''}</li>`;
  }).join('')}</ul>${showClasses ? '' : '<p class="small-note">The rulebook suggests looking at the class rewards only after the battle.</p>'}</details>`;
}

function renderHeroReward(hero) {
  const entry = state.rewards.heroes[hero.id];
  const mine = controls(hero.id);
  const options = classOptions(state, hero.id);
  const drawable = canDrawClasses(state, hero.id);
  const allDefeated = state.rewards.mode === 'all-defeated';
  const achievements = entry.achievements.map(id => JAILBREAK_ACHIEVEMENTS.find(item => item.id === id)?.label ?? id);
  let body;
  if (entry.choice) {
    body = `<p class="class-choice">${escapeHtml(entry.choice)}</p><p class="small-note">${entry.method === 'non-achievement' ? 'Chosen without achievement classes.' : entry.method === 'draw' ? 'Chosen from drawn class sheets.' : 'Chosen from earned classes.'}</p>`;
  } else if (options.length) {
    const intro = entry.declined ? 'Choose any remaining class.' : entry.offered ? 'Choose one of these class sheets.' : 'Choose one earned class.';
    body = `<p class="small-note">${intro}</p><div class="class-options">${options.map(name => `<button class="button ${entry.earned.includes(name) && !entry.declined ? '' : 'quiet-button'}" data-action="choose-class" data-hero="${hero.id}" data-class="${escapeHtml(name)}" ${mine ? '' : 'disabled'}>${escapeHtml(name)}</button>`).join('')}</div>`;
  } else if (drawable) {
    const count = allDefeated ? 2 : 2 - entry.earned.length;
    body = `<p class="small-note">${allDefeated ? 'Every adventurer was defeated: draw two class sheets and choose one.' : `Fewer than two earned classes. Set ${entry.earned.length ? `aside ${escapeHtml(entry.earned.join(', '))}, ` : ''}shuffle every other sheet and draw ${count}.`}</p><button class="button primary" data-action="draw-classes" data-hero="${hero.id}" ${mine ? '' : 'disabled'}>Draw ${count} class ${count === 1 ? 'sheet' : 'sheets'}</button>`;
  } else {
    body = `<p class="small-note">${entry.declined ? 'Waiting until the other adventurers have chosen; then any remaining class can be chosen.' : 'Waiting for the other adventurers to choose first.'}</p>`;
  }
  const canDecline = !allDefeated && entry.earned.length && !entry.choice && !entry.offered && !entry.declined;
  const loses = [hero.tenacity ? `${hero.tenacity} tenacity` : '', ...hero.items.filter(item => item.gainedInBattle).map(item => itemName(item.code))].filter(Boolean);
  return `<article class="reward-card"><div class="reward-heading"><h3>${escapeHtml(hero.name)}</h3><span>${mine ? 'You choose' : 'Other player'}</span></div><p class="reward-achievements">${achievements.length ? escapeHtml(achievements.join(' · ')) : 'No achievements'}</p>${!allDefeated && entry.earned.length ? `<p class="small-note">Earned: ${escapeHtml(entry.earned.join(', '))}</p>` : ''}${body}${canDecline ? `<button class="quiet-button decline-button" data-action="decline-earned-classes" data-hero="${hero.id}" ${mine ? '' : 'disabled'}>Choose a non-achievement class instead${loses.length ? ` · lose ${escapeHtml(loses.join(' and '))}` : ''}</button>` : ''}</article>`;
}

function renderRewards() {
  return `<section class="rewards-panel" aria-label="Class rewards"><div class="board-heading"><div><p class="eyebrow">${state.outcome === 'victory' ? 'Battle won' : 'Party defeated'} · cleanup complete</p><h2>Choose class rewards</h2><p>Active dice were exhausted and bonus HP removed. Tenacity and items gained in the battle are kept unless an adventurer declines its achievement classes.</p></div></div>${state.rewards.mode === 'all-defeated' ? '<div class="notice">Every adventurer was defeated. Each adventurer draws two class sheets and chooses one.</div>' : ''}<div class="reward-grid">${state.heroes.map(renderHeroReward).join('')}</div>${renderAchievements({ showClasses: true, open: true })}</section>`;
}

function renderComplete() {
  return `<section class="rewards-panel" aria-label="Jailbreak result"><div class="board-heading"><div><p class="eyebrow">Jailbreak introduction finished</p><h2>${state.outcome === 'victory' ? 'The party is free' : 'Escaped at last'}</h2><p>${state.outcome === 'victory' ? 'The adventurers fought their way out of the jail.' : 'The adventurers fell, but they still get away once the jailers leave.'} Each now has a class.</p></div></div><div class="reward-grid">${state.heroes.map(hero => `<article class="reward-card"><div class="reward-heading"><h3>${escapeHtml(hero.name)}</h3><span>Novice class</span></div><p class="class-choice">${escapeHtml(hero.className)}</p><p class="small-note">${hero.hp}/${hero.maxHp} HP · ${hero.tenacity} tenacity · ${hero.items.length ? escapeHtml(hero.items.map(item => itemName(item.code)).join(', ')) : 'no items'}</p></article>`).join('')}</div><div class="notice">Party XP is now 2 and saved XP 0. The guild’s refuge works like an inn: full HP and empty cooldown tracks. Day 1 has not begun.</div><p class="small-note">In the tabletop game the party now chooses a starting guild quest (Rulebook p.13, step 7). Class abilities and the campaign are not implemented in this browser version yet.</p></section>`;
}

function renderActionPanel() {
  const hero = currentHero();
  const target = state.enemies.find(enemy => enemy.id === targetId && enemy.hp > 0);
  const noticeBlock = notice ? `<div role="status" class="notice ${noticeError ? 'error' : ''}">${escapeHtml(notice)}</div>` : '';
  if (state.phase === 'complete') return `<div class="action-panel"><div class="end-card"><p class="eyebrow">Encounter complete</p><h2>Ready for Day 1</h2><p>${state.heroes.map(item => `${escapeHtml(item.name)}: ${escapeHtml(item.className)}`).join('<br>')}</p><p>The campaign itself is not connected yet.</p><button class="button primary" data-action="reset" ${room ? 'disabled' : ''}>Play again</button></div></div>`;
  if (state.phase === 'rewards') return `<div class="action-panel"><div class="panel-heading section-label" style="margin:0"><span>Class rewards</span><small>${state.outcome === 'victory' ? 'Victory' : 'Defeat'}</small></div>${noticeBlock}<p class="small-note">Each adventurer chooses one class (Rulebook pp.93–94). Adventurers with fewer than two earned classes draw after the others choose.</p></div>`;
  const contextual = state.phase === 'roll' ? renderRoll() : state.phase === 'enemy-defense' ? renderDefense() : state.phase === 'lockpick' ? renderLockpick() : `
    <div><label for="battle-form">Battle form</label><select id="battle-form" class="field" ${state.phase !== 'heroes' ? 'disabled' : ''}>${FORMS.map(([id, title]) => `<option value="${id}" ${form === id ? 'selected' : ''}>${title}</option>`).join('')}</select><p class="small-note" style="margin-top:7px">${form === 'magic' ? 'Range: Magicka. Combat dice cannot be rolled.' : form === 'ranged-weapon' ? 'Range: 2 to Stamina. Adjacent enemies cannot be targeted.' : form === 'defensive' ? 'Build active defense without an attack target.' : 'Range: adjacent hexes.'}</p></div>
    ${renderDice()}<div><label>Engage target</label><div class="target-box">${target ? `<div>${escapeHtml(target.name)}<br><span>${target.hp} HP · ${target.defense} defense · ${escapeHtml(target.skill ?? '')}</span></div><button class="quiet-button" data-action="clear-target" title="Clear target" aria-label="Clear target">×</button>` : '<span>Choose an enemy on the board.</span>'}</div></div>
    <div class="actions-stack">${state.phase === 'start' ? `<button class="button primary" data-action="begin-turn">Begin turn · recover ${hero.cooldownStat}</button>${JAILBREAK_MAP.cells[hero.position]?.exit ? '<button class="button" data-action="escape">Escape through this exit</button>' : ''}` : `<button class="button primary" data-action="engage">Roll selected dice${state.turn?.engages > 0 ? ' · +1 fatigue' : ''}</button><button class="quiet-button" data-action="end-turn">End ${escapeHtml(hero.name)}’s turn</button><p class="small-note">${state.turn?.moves ?? 0}/2 move actions · ${state.turn?.engages ?? 0} engages${state.turn?.continueMove ? ` · ${state.turn.continueMove} ${state.turn.continueMove === 1 ? 'hex' : 'hexes'} left in the interrupted move` : ''}<br>A second move prevents engaging this turn.</p>`}</div>`;
  return `<div class="action-panel"><div class="panel-heading section-label" style="margin:0"><span>${state.phase === 'enemy-defense' ? 'Enemy attack' : state.phase === 'lockpick' ? 'Lockpick check' : 'Adventurer actions'}</span><small>${escapeHtml(hero.name)}</small></div>${noticeBlock}${contextual}${renderFreeActions()}</div>`;
}

function phaseMessage() {
  const hero = currentHero();
  if (state.phase === 'complete') return ['Jailbreak finished', 'Classes are chosen; the adventurers are rested and ready for Day 1.'];
  if (state.phase === 'rewards') return ['Class rewards', 'Each adventurer chooses a class from their achievements.'];
  if (state.phase === 'lockpick') return [`${hero.name} · lockpick check`, 'Roll, adjust results with fatigue, then check them against the cache code.'];
  if (state.phase === 'roll') return ['Resolve rolled dice', 'Resolve or skip each face, then confirm the result.'];
  if (state.phase === 'enemy-defense') return [`${hero.name} is being attacked`, 'Choose active dice for prevention, or accept the damage.'];
  if (state.phase === 'start') return [`${hero.name} · start of turn`, 'Begin to recover cooldown dice. You may escape now if standing on an exit.'];
  if (state.turn?.continueMove) return [`${hero.name} · continue moving`, `The lockpick check interrupted a move: up to ${state.turn.continueMove} more ${state.turn.continueMove === 1 ? 'hex' : 'hexes'} without a new move action.`];
  return [`${hero.name} · take your actions`, 'Choose a highlighted hex to move. Select a form, dice and a target to engage.'];
}

const valenwoodOption = checked => `<label class="result-choice option-choice"><input type="checkbox" id="valenwood-option" ${checked ? 'checked' : ''}> Include Valenwood expansion classes (Arcanist, Burglar, Ranger)</label>`;

function renderModal() {
  if (!modal) return '';
  if (modal === 'reset') return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><p class="eyebrow">New encounter</p><h2 id="modal-title">Reset this table?</h2><p>Your current local Jailbreak encounter will be replaced with the official two-adventurer tutorial setup.</p>${valenwoodOption(state.expansions?.includes('valenwood'))}<div class="modal-actions"><button class="quiet-button" data-action="close-modal">Keep playing</button><button class="button primary" data-action="confirm-reset">Start again</button></div></section></div>`;
  const inviteUrl = room ? `${location.origin}/tabletop.html?room=${encodeURIComponent(room.id)}` : '';
  const unavailable = networkStatus?.onlineAvailable === false;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><p class="eyebrow">Online co-op</p><h2 id="modal-title">A shared table</h2>${networkError ? `<div class="notice error" role="status">${escapeHtml(networkError)}</div>` : ''}${room ? `<p>${room.phase === 'lobby' ? 'Invite a friend or start with both adventurers under your control.' : 'Your encounter is synchronized with the shared table.'}</p><ul class="room-members">${room.members.map(member => `<li>${escapeHtml(member.name)} <span>${member.isHost ? 'Host' : 'Player'} · ${member.seat === 0 ? 'Argonian' : 'Dark Elf'}</span></li>`).join('')}</ul><label for="invite-link">Invite link — no session token included</label><input id="invite-link" class="field" readonly value="${escapeHtml(inviteUrl)}"><button class="quiet-button" data-action="copy-invite">Copy invite link</button>${room.phase === 'lobby' && room.self.isHost ? `${valenwoodOption(false)}<button class="button primary" data-action="start-room">Start shared encounter</button>` : room.phase === 'lobby' ? '<p class="small-note">Waiting for the host to start.</p>' : ''}<div class="modal-actions"><button class="quiet-button" data-action="leave-room">Return to local table</button><button class="button" data-action="close-modal">Close</button></div>` : `<p>${unavailable ? 'Online co-op is not connected on this deployment. Local play is available now.' : networkStatus === null ? 'Checking the multiplayer server…' : 'Create a table or join a friend. This tutorial has two adventurers and supports up to two human players.'}</p>${unavailable ? `<p class="small-note">${escapeHtml(networkStatus.reason ?? 'The server needs persistent shared storage before it can host rooms.')}</p>` : ''}<label for="player-name">Your name</label><input id="player-name" class="field" maxlength="40" value="Adventurer" ${unavailable ? 'disabled' : ''}><button class="button primary" data-action="create-room" ${unavailable || networkStatus === null || networkBusy ? 'disabled' : ''}>Create a table</button><label for="room-code">Room code from an invite link</label><input id="room-code" class="field" value="${escapeHtml(requestedRoom)}" placeholder="Paste the room code" ${unavailable ? 'disabled' : ''}><button class="button" data-action="join-room" ${unavailable || networkStatus === null || networkBusy ? 'disabled' : ''}>Join table</button><p class="small-note" style="margin-top:15px">Local play controls both heroes in the fixed tutorial. The published one-adventurer solo setup is not implemented yet.</p><div class="modal-actions"><button class="quiet-button" data-action="close-modal">Back to local play</button></div>`}</section></div>`;
}

function renderBoardColumn() {
  const [phaseTitle, phaseDescription] = phaseMessage();
  const banner = `<div class="turn-banner" role="status"><span class="turn-number">${['complete', 'rewards'].includes(state.phase) ? '✓' : state.phase === 'enemy-defense' ? '!' : state.activeHero + 1}</span><div><strong>${escapeHtml(phaseTitle)}</strong><p>${escapeHtml(phaseDescription)}</p></div></div>`;
  if (state.phase === 'rewards') return `${renderRewards()}${banner}`;
  if (state.phase === 'complete') return `${renderComplete()}${banner}${renderAchievements({ showClasses: true })}`;
  return `<div class="board-heading"><div><p class="eyebrow">Introduction encounter</p><h2>Find a way out</h2><p>Defeat all enemies or escape with every undefeated adventurer.</p></div></div>${renderBoard()}${renderEnemies()}${banner}${renderAchievements()}`;
}

function render() {
  const roundLabel = ['complete', 'rewards'].includes(state.phase) ? ['✓', 'Battle over'] : [state.round >= 6 ? 'VI+' : ['', 'I', 'II', 'III', 'IV', 'V'][state.round] ?? state.round, state.round >= 6 ? 'Fatigue round' : 'Battle round'];
  root.innerHTML = `<header class="topbar"><div class="brand"><img src="/favicon.svg" alt=""><div><p class="eyebrow">The Elder Scrolls · Betrayal of the Second Era</p><h1>Jailbreak</h1></div></div><div class="top-actions"><div class="round-tag"><strong>${roundLabel[0]}</strong><span>${roundLabel[1]}</span></div><span class="network-tag">${room ? `Shared table · ${room.members.length} player${room.members.length > 1 ? 's' : ''}<br>${networkBusy ? 'Synchronizing…' : canAct() ? 'You control this adventurer' : 'Waiting for the other player'}` : 'Local table<br>Both adventurers under your control'}</span><button class="quiet-button" data-action="network">${room ? 'Shared table' : 'Co-op status'}</button><button class="quiet-button" data-action="reset" ${room ? 'disabled' : ''}>Restart</button></div></header>
    <div class="scope-note"><span class="alpha-pill">TABLETOP ALPHA</span><span>The full Jailbreak introduction for the fixed two-hero tutorial setup: battle, cache, achievements and class rewards. Class abilities and the campaign are not connected yet.</span><a href="#tabletop-help">Rules & scope</a></div>
    <main class="game-layout"><aside class="party-column"><div class="section-label"><span>Your adventurers</span><small>Party XP ${state.partyXp}</small></div>${state.heroes.map(renderHero).join('')}</aside>
    <section class="board-column">${renderBoardColumn()}</section>
    <aside class="actions-column">${renderActionPanel()}<section class="log-panel"><div class="section-label"><span>Table chronicle</span><small>Latest events</small></div><ol class="event-log" aria-label="Battle event history">${state.log.slice(-7).reverse().map(line => `<li>${escapeHtml(line)}</li>`).join('') || '<li>The party enters the jail.</li>'}</ol></section><p class="save-note">${room ? 'Shared state is saved by the multiplayer server' : saveAvailable ? 'Saved automatically on this browser' : 'Browser storage unavailable · this encounter is not saved'}</p></aside>
    </main><footer class="footer-notes"><details class="help-box" id="tabletop-help"><summary>How to play · verified rules and current scope</summary><div class="help-content"><div><strong>On your turn</strong><ul><li>Begin the turn to recover dice from the left of your cooldown track.</li><li>Move up to Stamina per move action. A second move excludes engaging.</li><li>Choose a battle form, compatible dice and an enemy in range, then roll.</li><li>Resolve dice, use active defense when attacked, and end your turn.</li><li>End a move on the cache to try its lockpick check; unused movement may continue afterwards.</li></ul></div><div><strong>Tabletop rules in this encounter</strong><p>Combat is a skill line. Stamina and Magicka limit different skill dice. Extra engages add light fatigue; exhausted dice queue in a 13-slot cooldown track.</p><p>Round six and later add overfatigue and deal true damage. Victory is checked at the end of the round. Escaping is available at the start of a turn from an exit. Achievements decide the class choices after the battle.</p></div><div><strong>An implementation in progress</strong><p>This fixed two-hero tutorial setup is the beginning of a rules-enforced adaptation, not the complete board game. Class abilities, the random five-enemy draw, the one-hero solo setup and the campaign are not yet connected.</p><p class="sources">Rules reference: <a href="https://chiptheorygames.com/pages/support/the-elder-scrolls" target="_blank" rel="noreferrer">official CTG rulebook and extended tutorial</a>, plus the <a href="https://support.chiptheorygames.com/support/solutions/articles/33000314951-resolving-skills-and-abilities-do-as-much-as-possible" target="_blank" rel="noreferrer">ability-resolution</a> and <a href="https://support.chiptheorygames.com/support/solutions/articles/33000292544-enemy-movement-how-does-it-work-in-more-detail-" target="_blank" rel="noreferrer">enemy movement</a> FAQs. Map graphics here are original SVG components.</p></div></div></details><p class="footer-credit">Unofficial implementation in progress. The Elder Scrolls and the tabletop game belong to their respective owners.</p></footer>${renderModal()}`;
  bindEvents();
  if (!canAct()) root.querySelectorAll('.action-panel button,.action-panel input,.action-panel select').forEach(element => { element.disabled = true; });
  if (modal) root.querySelector('.modal button')?.focus();
}

function bindEvents() {
  root.querySelectorAll('[data-backlash]').forEach(select => select.addEventListener('change', () => { backlashTargets[select.dataset.backlash] = select.value; }));
  root.querySelectorAll('[data-resolve]').forEach(input => input.addEventListener('change', () => {
    input.checked ? skippedResults.delete(input.dataset.resolve) : skippedResults.add(input.dataset.resolve);
  }));
  root.querySelectorAll('[data-roll-up]').forEach(button => button.addEventListener('click', () => {
    const index = rollOrder.indexOf(button.dataset.rollUp);
    if (index > 0) [rollOrder[index - 1], rollOrder[index]] = [rollOrder[index], rollOrder[index - 1]];
    render();
  }));
  root.querySelectorAll('[data-hex]').forEach(element => {
    const move = () => { if (state.phase === 'heroes') dispatch({ type: 'move', to: element.dataset.hex }); };
    element.addEventListener('click', move);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); move(); } });
  });
  root.querySelectorAll('[data-target]').forEach(element => {
    const select = event => { event.stopPropagation(); targetId = element.dataset.target; render(); };
    element.addEventListener('click', select);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event); } });
  });
  root.querySelectorAll('[data-die]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.die;
    selectedDice.has(id) ? selectedDice.delete(id) : selectedDice.add(id);
    render();
    root.querySelector(`[data-die="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }));
  root.querySelector('#battle-form')?.addEventListener('change', event => {
    form = event.target.value;
    selectedDice.clear();
    if (form === 'defensive') targetId = null;
    render();
  });
  const expansionsChoice = () => (root.querySelector('#valenwood-option')?.checked ? ['valenwood'] : []);
  root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'reset' || action === 'network') { modal = room && action === 'reset' ? 'network' : action; render(); return; }
    if (action === 'close-modal') { modal = null; render(); return; }
    if (action === 'create-room' || action === 'join-room') { void connectRoom(action === 'create-room' ? 'create' : 'join'); return; }
    if (action === 'start-room') { const expansions = expansionsChoice(); void sendRoomAction('start', undefined, expansions.length ? { expansions } : undefined); return; }
    if (action === 'copy-invite') {
      const input = root.querySelector('#invite-link');
      input?.select();
      navigator.clipboard?.writeText(input.value).then(() => { button.textContent = 'Link copied'; }).catch(() => { button.textContent = 'Select and copy the link'; });
      return;
    }
    if (action === 'leave-room') {
      viewGeneration++;
      room = null; networkSession = null; networkError = ''; modal = null;
      try { localStorage.removeItem('betrayal.tabletop.last-room'); } catch { /* Optional preference. */ }
      state = loadGame(); selectedDice.clear(); targetId = null; form = currentHero().form; render(); return;
    }
    if (action === 'confirm-reset') {
      state = createJailbreak({ expansions: expansionsChoice() }); selectedDice.clear(); targetId = null; form = currentHero().form; modal = null; notice = ''; saveGame(); render(); return;
    }
    if (action === 'clear-target') { targetId = null; render(); return; }
    if (action === 'engage') { dispatch({ type: 'engage', form, targetId, diceIds: [...selectedDice] }); return; }
    if (action === 'resolve') {
      dispatch({ type: 'resolve', order: rollOrder,
        skip: [...root.querySelectorAll('[data-resolve]')].filter(input => !input.checked).map(input => input.dataset.resolve),
        backlashTargets: Object.fromEntries([...root.querySelectorAll('[data-backlash]')].map(select => [select.dataset.backlash, select.value])) }); return;
    }
    if (action === 'defend') {
      dispatch({ type: 'defend', diceIds: [...root.querySelectorAll('[data-defend]:checked')].map(input => input.dataset.defend), useRacial: root.querySelector('#racial-defense')?.checked ?? false }); return;
    }
    if (action === 'dismiss-active') { dispatch({ type: action, diceIds: [...root.querySelectorAll('[data-dismiss]:checked')].map(input => input.dataset.dismiss) }); return; }
    if (action === 'racial') { dispatch({ type: action, diceIds: [...root.querySelectorAll('[data-racial]:checked')].map(input => input.dataset.racial) }); return; }
    if (action === 'lockpick-roll') {
      const keep = [...root.querySelectorAll('[data-keep]:checked')].map(input => Number(input.dataset.keep));
      dispatch({ type: action, ...(state.pending?.check ? { keep } : {}) }); return;
    }
    if (action === 'lockpick-adjust') { dispatch({ type: action, dieIndex: Number(button.dataset.dieIndex), delta: Number(button.dataset.delta) }); return; }
    if (action === 'cache-item') { dispatch({ type: action, placement: button.dataset.placement }); return; }
    if (action === 'use-item') { dispatch({ type: action, itemCode: button.dataset.item, mode: button.dataset.mode }); return; }
    if (action === 'choose-class') { dispatch({ type: action, heroId: button.dataset.hero, className: button.dataset.class }, button.dataset.hero); return; }
    if (action === 'draw-classes' || action === 'decline-earned-classes') { dispatch({ type: action, heroId: button.dataset.hero }, button.dataset.hero); return; }
    dispatch({ type: action });
  }));
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal) { modal = null; render(); }
  if (event.key === 'Tab' && modal) {
    const focusable = [...root.querySelectorAll('.modal button,.modal input,.modal select,.modal a')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
saveGame();
render();

async function initializeNetwork() {
  const generation = viewGeneration;
  try {
    networkStatus = await requestApi({ operation: 'status' }, 'GET');
  } catch {
    networkStatus = { onlineAvailable: false, reason: 'The multiplayer service is not available on this deployment.' };
  }
  if (viewGeneration !== generation) { render(); return; }
  try {
    const roomId = requestedRoom || localStorage.getItem('betrayal.tabletop.last-room');
    const stored = roomId && localStorage.getItem(`betrayal.tabletop.room.${roomId}`);
    if (stored && networkStatus.onlineAvailable) {
      networkSession = JSON.parse(stored);
      const session = networkSession;
      const snapshot = await requestApi({ roomId }, 'GET');
      if (networkSession !== session || viewGeneration !== generation) return;
      receiveSnapshot(snapshot);
      if (room.phase === 'lobby') modal = 'network';
    } else if (requestedRoom) modal = 'network';
  } catch (error) {
    networkSession = null;
    networkError = error.message;
    if (requestedRoom) modal = 'network';
  }
  render();
}
void initializeNetwork();
setInterval(() => { if (!document.hidden) void refreshRoom(); }, 2000);
