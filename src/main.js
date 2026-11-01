import * as THREE from 'three';
import { createElement, Sword, Swords, Shield, Flame, Dices, Heart, Map, BookOpen, Backpack, Settings, Volume2, VolumeX, ChevronRight, X, Footprints, Sparkles, CircleHelp, RotateCcw, ScrollText, Compass, Gem, Coins, Moon, Sun, Check, ArrowRight, Flag, Zap, Save, Plus } from 'lucide';
import { createBoard } from './board.js';
import { createCampaign, ENCOUNTERS, SKILLS, CLASSES, SHOP_ITEMS, TRAINING_OPTIONS, hexDistance, DIFFICULTIES } from './rules.js';
import { createLayout } from './layout.js';
import { racePortraits, suggestedNames, tokenIcons, describeHex, missionMarkup, difficultyMarkup, storyMarkup, skillMarkup, journeyMarkup } from './tactics-ui.js';
import { welcomeMarkup, coachMarkup } from './readiness-ui.js';
import './style.css';
import './refinements.css';
import './tactics.css';
import './readiness.css';

const icons = { Sword, Swords, Shield, Flame, Dices, Heart, Map, BookOpen, Backpack, Settings, Volume2, VolumeX, ChevronRight, X, Footprints, Sparkles, CircleHelp, RotateCcw, ScrollText, Compass, Gem, Coins, Moon, Sun, Check, ArrowRight, Flag, Zap, Save, Plus };
const ico = (name, size = 18) => {
  const [tag, attributes, children] = icons[name] || icons.Gem;
  return createElement([tag, {...attributes, width:size, height:size, 'stroke-width':1.5}, children]).outerHTML;
};
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const chapterArt = ['/assets/hero.jpg', '/assets/shrine.jpg', '/assets/keep.jpg'];
const chapterPlaces = ['The Old Road', 'The Forgotten Sanctum', 'The Hollow Keep'];
const chapterTitles = ['Shadows over Glenumbra', 'Secrets of Stormhaven', 'The fall of Rivenspire'];
const chapterTags = ['ROADSIDE AMBUSH', 'ANCIENT RUINS', 'FINAL CONFRONTATION'];
const roman = ['I','II','III'];
const settingsKey = 'betrayal-preferences-v2';
let campaign, board, current, openPanel = null, travelTab = 'route', busy = '', actionTimer, bannerTimer, toastTimer, audioContext;
let lastReport = null, lastPhase = null, returnFocus = null, muted = true, guideDismissed = false;
let hoveredHex = null, keyboardHex = null, boardKeyboardMode = false, boardPointerTime = 0;
let safeTurns = true, hasStarted = false, boardMode = '3d', storageNoticeShown = false;
try { const preferences = JSON.parse(localStorage.getItem(settingsKey) || '{}'); muted = preferences.muted ?? true; guideDismissed = preferences.guideDismissed ?? false; safeTurns = preferences.safeTurns ?? true; } catch { /* Private browsing still supports play. */ }
const savePreferences = () => { try { localStorage.setItem(settingsKey, JSON.stringify({muted, guideDismissed, safeTurns})); } catch {} };
$('#app').innerHTML = createLayout(ico);

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3800);
}
function tone(type = 'click') {
  if (muted) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const notes = type === 'roll' ? [210, 280, 150] : type === 'victory' ? [330, 415, 494, 660] : [type === 'damage' ? 95 : type === 'heal' ? 620 : 440];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const time = audioContext.currentTime + index * (type === 'victory' ? .12 : .045);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.type = type === 'roll' || type === 'damage' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(.045, time + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .22);
      oscillator.start(time); oscillator.stop(time + .25);
    });
  } catch { /* Audio is optional. */ }
}
function healthChips(health, maxHealth) {
  return Array.from({length: Math.min(30,maxHealth)}, (_, i) => `<i class="${i < health ? 'filled' : ''}"></i>`).join('');
}
function showBanner(title, detail = '') {
  clearTimeout(bannerTimer);
  $('#turn-banner').innerHTML = `<strong>${escape(title)}</strong>${detail ? `<span>${escape(detail)}</span>` : ''}`;
  $('#turn-banner').classList.add('visible');
  bannerTimer = setTimeout(() => $('#turn-banner').classList.remove('visible'), 1500);
}
function renderGuide(s) {
  const guide = $('#first-turn-guide');
  guide.hidden = guideDismissed || s.phase!=='combat';
  if (guide.hidden) return;
  guide.innerHTML = coachMarkup(s,ico,escape);
  guide.querySelectorAll('button').forEach(button=>button.disabled=!!busy);
}
function renderDice(s) {
  const selected = s.dice.filter(d => d.selected), preview = s.combatPreview;
  const focusedDie = document.activeElement?.dataset.die;
  $('#dice-count').textContent = `${selected.length} / ${s.player.combat} SELECTED`;
  $('#roll-caption').textContent = busy === 'roll' ? 'Casting your fate…' : preview?.fatigueCost && selected.length ? 'Extra engage · +1 fatigue' : selected.length ? 'One engagement' : 'Choose ready dice';
  $('#dice-list').innerHTML = s.dice.map(d => {
    const symbol = d.face === 'blank' ? 'Sparkles' : d.type === 'magic' ? 'Flame' : d.type === 'defense' ? 'Shield' : d.type === 'support' ? 'Heart' : 'Sword';
    const cooling = d.status === 'cooldown';
    const turns = Math.ceil(d.cooldown / s.player.cooldown);
    const range = SKILLS[d.skill].range;
    const title = `${d.name} · ${range ? `Range ${range} hex${range===1?'':'es'}` : d.type==='defense'?'Blocks incoming damage':'Restores health'} · ${cooling?`Ready in ${turns} turn${turns===1?'':'s'}`:'Click to select'}`;
    return `<button class="die-card ${d.type} ${d.selected?'selected':''} ${cooling?'on-cooldown':''}" data-die="${escape(d.id)}" aria-label="${escape(title)}" aria-pressed="${!!d.selected}" title="${escape(title)}" ${cooling || busy || s.phase!=='combat'?'disabled':''}><span class="die-cube">${ico(symbol,25)}${d.face ? `<span class="die-value">${d.value||'✦'}</span>` : ''}<i class="pip one"></i><i class="pip two"></i>${d.selected?`<span class="selected-check">${ico('Check',10)}</span>`:''}</span><span class="die-name">${escape(d.name)}</span><small>${cooling ? `${turns} TURN${turns===1?'':'S'}` : range ? `RANGE ${range}` : d.type==='defense'?'GUARD':'HEAL'}</small></button>`;
  }).join('');
  if (focusedDie && !openPanel) $(`[data-die="${focusedDie}"]`)?.focus({preventScroll:true});
  $('#roll-button').disabled = !!busy || !s.canRoll;
  $('#roll-button').innerHTML = `${ico(busy==='roll'?'Sparkles':'Dices',19)} ${busy==='roll'?'Rolling…':'Roll dice'}`;
  $('.dice-panel').classList.toggle('rolling', busy==='roll');
  const queue = s.cooldownQueue.map(id => s.dice.find(d => d.id === id)).filter(Boolean);
  $('#cooldown-track').innerHTML = queue.length ? `<span>${ico('RotateCcw',13)} Recover next turn</span><div>${queue.slice(0,s.player.cooldown).map(d=>`<span class="queue-chip">${ico(d.type==='magic'?'Flame':d.type==='physical'?'Sword':d.type==='defense'?'Shield':'Heart',11)} ${escape(d.name)}</span>`).join('')}</div>${queue.length>s.player.cooldown?`<small>+${queue.length-s.player.cooldown} waiting</small>`:''}` : `<span>${ico('Check',13)} All skills ready</span><small>${s.player.cooldown} dice recover at the start of each turn.</small>`;
}
function renderPreview(s) {
  const preview = s.combatPreview, target = s.enemies.find(e=>e.id===s.targetId&&e.health>0);
  const attack = $('#attack-preview');
  const selected = s.dice.some(d=>d.selected);
  attack.className = `attack-preview ${selected && !s.canRoll ? 'invalid' : selected ? 'ready' : ''}`;
  if (s.phase !== 'combat') {
    attack.innerHTML = `${ico('Check',17)}<div><strong>${s.phase==='defeat'?'A chance to try again':'Your story continues'}</strong><span>Use the journey button below to continue.</span></div>`;
    return;
  }
  const offensive=selected&&s.dice.some(d=>d.selected&&['physical','magic'].includes(d.type));
  let headline = selected ? preview?.canRoll ? (offensive ? `${Number(preview.expectedDamage.toFixed(1))} expected damage` : 'Support skills ready') : 'Adjust your attack' : target ? `Target: ${target.name}` : 'Choose your target';
  const description = selected ? preview?.reason || `${preview.distance ?? 0} hexes away · ${preview.fatigueCost ? '+1 fatigue' : 'Free engagement'}${preview.armorReduction ? ` · Ward absorbs ${preview.armorReduction}` : ''}` : target ? `${hexDistance(s.player,target)} hexes away${target.type==='boss'&&(s.tokens||[]).some(t=>t.type==='ward'&&!t.collected)?' · Break both wards to remove its protection.':' · Select dice below, or prepare an attack.'}` : 'No enemies remain. Collect your remaining objectives to complete the encounter.';
  attack.innerHTML = `${ico(selected&&!s.canRoll?'CircleHelp':'Swords',19)}<div><strong>${escape(headline)}</strong><span>${escape(description)}</span></div>${selected&&s.canRoll&&preview.maxDamage?`<span class="max-damage">UP TO <b>${preview.maxDamage}</b></span>`:''}`;
}
function renderEnemies(s) {
  const enemies = s.enemies.filter(e=>e.health>0);
  $('#enemy-count').textContent = `${enemies.length} REMAINING`;
  $('#enemy-list').innerHTML = enemies.map(enemy => {
    const intent = s.enemyIntents?.find(i=>i.id===enemy.id);
    const description = intent?.willAttack ? `${intent.healthDamage} damage${intent.coverBlocked?' · cover −'+intent.coverBlocked:''}${intent.blocked?' · guard −'+intent.blocked:''}` : 'Moving into range';
    return `<button class="enemy-row ${s.targetId===enemy.id?'targeted':''}" data-target="${escape(enemy.id)}" ${busy||s.phase!=='combat'?'disabled':''} aria-label="Target ${escape(enemy.name)}, ${enemy.health} health, ${escape(description)}"><span class="enemy-icon">${ico(enemy.type==='boss'?'Flame':enemy.type==='ranged'?'Zap':'Swords',18)}</span><span class="enemy-detail"><strong>${escape(enemy.name)}</strong><span class="health-chips">${healthChips(enemy.health,enemy.maxHealth)}</span><span class="enemy-intent ${intent?.willAttack?'danger':''}">${ico(intent?.willAttack?'Sword':'Footprints',10)} ${description}</span></span><span class="enemy-hp">${enemy.health}<small>/${enemy.maxHealth}</small></span></button>`;
  }).join('') || `<p class="all-clear">${ico('Check',15)} ${s.phase==='combat'?'Enemies defeated. Collect the remaining objectives.':'The battlefield is clear.'}</p>`;
}
function renderInspector(hex=hoveredHex) {
  const inspector=$('#board-inspector');
  if(!current||!hex||openPanel){inspector.hidden=true;return;}
  const info=describeHex(current,hex);
  inspector.hidden=false;inspector.dataset.kind=info.kind;
  inspector.innerHTML=`<span>${ico(info.icon,17)}</span><div><strong>${escape(info.title)} <small>${info.coordinate}</small></strong><p>${escape(info.description)}</p></div>`;
}
function render(s) {
  if (!s?.player) return;
  const previousPhase = lastPhase;
  current = s; lastPhase = s.phase;
  const p = s.player, encounter = ENCOUNTERS[s.encounter];
  document.body.dataset.encounter = s.encounter;
  document.body.classList.toggle('is-busy', !!busy);
  const saveStatus=campaign?.getSaveStatus()||'preview';
  $('.save-label').innerHTML=`${ico(saveStatus==='unavailable'?'CircleHelp':'Check',13)} ${saveStatus==='saved'?'Adventure saved':saveStatus==='unavailable'?'Use Back up to keep your progress':'Ready to begin'}`;
  if(saveStatus==='unavailable'&&!storageNoticeShown){storageNoticeShown=true;notify('Browser saving is unavailable. Keep your progress with Settings → Back up.');}
  $('#player-name').textContent = p.name;
  const portrait=$('.portrait'),portraitPath=racePortraits[p.race]||racePortraits.Dunmer;
  if(portrait.getAttribute('src')!==portraitPath)portrait.src=portraitPath;
  portrait.alt=`${p.race} adventurer ${p.name}`;
  $('#player-class').innerHTML = `${escape(p.race)} · ${escape(p.className)}<span class="mobile-health">${ico('Heart',11)} ${p.health}/${p.maxHealth}</span>`;
  $('#health-value').innerHTML = `${p.health} <small>/ ${p.maxHealth}</small>`;
  $('#health-bar').style.width = `${Math.max(0,p.health/p.maxHealth*100)}%`;
  $('.health-section').classList.toggle('low-health', p.health<=p.maxHealth*.3);
  for(const key of ['stamina','magicka','combat']) $('#stat-'+key).textContent=p[key];
  $('#gold-count').textContent=p.gold; $('#level-badge').textContent=s.session;
  $('#xp-label').textContent=`${p.xp} XP TO SPEND`;
  $('#cooldown-stat').textContent=`${p.cooldown} dice / turn`;
  $('#tenacity-pips').innerHTML=Array.from({length:6},(_,i)=>`<i class="${i<p.tenacity?'filled':''}" title="${p.tenacity} of 6 Tenacity"></i>`).join('');
  $('#guard-resource').innerHTML=`${ico('Shield',13)} <b>${p.guard}</b> Guard${p.cover?' <em>+ Cover</em>':''}`;
  $('#fatigue-resource').innerHTML=`${ico('Moon',13)} <b>${p.fatigue}</b> Fatigue`;
  $('#mobile-health-status').innerHTML=`<span>${ico('Heart',14)} <b>${p.health}/${p.maxHealth}</b> Health</span><span>${ico('Shield',14)} <b>${p.guard}</b> Guard${p.cover?' + Cover':''}</span>`;
  $('#mobile-resource-status').innerHTML=`<span>${ico('Sparkles',14)} <b>${p.tenacity}/6</b> Tenacity</span><span>${ico('Moon',14)} <b>${p.fatigue}</b> Fatigue</span>`;
  $('#round-count').textContent=s.round; $('#day-count').textContent=s.session;
  $('#round-limit').textContent=`/ ${s.maxRounds}`;
  $('.solo-status').innerHTML=`<i></i> ${(DIFFICULTIES[s.difficulty]||DIFFICULTIES.standard).name.toUpperCase()} · SOLO`;
  $('#quick-potions').textContent=p.potions;
  $('[data-action="quick-potion"]').disabled=!!busy||s.phase!=='combat'||p.potions<=0||p.health>=p.maxHealth;
  $('#day-caption').textContent=`${encounter.location} · ${s.phase==='combat'?'Round '+s.round:'Journey'}`;
  $('#session-number').textContent=roman[s.encounter]; $('#campaign-location').textContent=encounter.location.toUpperCase();
  $('#campaign-title').textContent=chapterTitles[s.encounter]; $('#board-location').textContent=chapterPlaces[s.encounter].toUpperCase();
  $('#encounter-title').textContent=encounter.name; $('#encounter-description').textContent=encounter.description;
  $('#encounter-objective').textContent=s.objective||encounter.objective; $('#encounter-tag').textContent=chapterTags[s.encounter];
  $('#mission-progress').innerHTML=missionMarkup(s,ico,escape);
  $('#card-number').textContent=`0${s.session} / 03`;
  const sceneImage=$('.encounter-art img'); if(sceneImage.getAttribute('src')!==chapterArt[s.encounter]) sceneImage.src=chapterArt[s.encounter];
  sceneImage.alt=`${chapterPlaces[s.encounter]} in ${encounter.location}`;
  $('.encounter-rewards').innerHTML=`<span>VICTORY REWARDS</span><span>${ico('Gem',13)} ${encounter.reward.xp} XP</span><span>${ico('Coins',13)} ${encounter.reward.gold} gold</span>`;
  renderGuide(s); renderDice(s); renderPreview(s); renderEnemies(s);
  $('#activity-log').innerHTML=s.log.slice(0,3).map((line,i)=>`<div class="log-entry ${i===0?'latest':''}"><span class="log-dot"></span><p>${escape(line)}</p></div>`).join('');
  document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===s.mode);button.disabled=!!busy||s.phase!=='combat';button.setAttribute('aria-pressed',button.dataset.mode===s.mode)});
  const target=s.enemies.find(e=>e.id===s.targetId&&e.health>0);
  $('#board-notice').innerHTML=`${ico(s.mode==='attack'?'Swords':'Footprints',14)} ${s.phase!=='combat'?'Encounter resolved':s.mode==='attack'&&target?`${escape(target.name)} · ${hexDistance(p,target)} hexes away`:s.reachable.length?`Choose a gold hex · Up to ${p.stamina} spaces`:'Movement complete · Choose your dice'}`;
  $('#action-info').innerHTML=`<span class="action-dot"></span> ${s.engaged?'Extra engage costs 1 fatigue':s.moved?'Moved · Engage or move again':'Move + engage in either order'}`;
  const classInfo=CLASSES[p.className]||CLASSES.Sorcerer;
  const ability=$('[data-game="ability"]'); ability.innerHTML=`${ico('Zap',16)} <span class="ability-name">${escape(classInfo.ability)}</span><span class="ability-short">Ability</span><span class="ability-cost">2 ✦</span>`;
  ability.title=`${classInfo.description}${target?.armor?` Against ${target.name}: ${Math.max(0,classInfo.damage-target.armor)} damage after ${target.armor} ward armor.`:''}`; ability.disabled=!!busy||p.tenacity<2||s.phase!=='combat'||!target||hexDistance(p,target)>3;
  $('[data-action="prepare"]').disabled=!!busy||s.phase!=='combat';
  const undo=$('[data-game="undo-move"]');undo.disabled=!!busy||!s.canUndoMove;undo.title=s.canUndoMove?'Undo the last ordinary move (Z)':s.undoMoveReason||'Move to an empty safe hex to enable Undo.';
  const end=$('[data-game="end-turn"]');end.disabled=!!busy;
  end.innerHTML=`${s.phase!=='combat'?'Continue journey':busy==='enemy'?'Enemy turn…':'End turn'} ${ico('ArrowRight',18)}`;
  $('#incoming-preview').innerHTML=s.phase==='combat'?`${ico(s.incomingDamage?'Heart':'Shield',13)} ${s.incomingDamage?`${s.incomingDamage} incoming damage`:'No incoming damage'}`:'';
  $('#incoming-preview').classList.toggle('danger',s.incomingDamage>=p.health&&s.phase==='combat');
  document.querySelectorAll('.turn-phases>span').forEach((element,index)=>element.classList.toggle('current',index===(busy==='enemy'?2:1)));
  $('#combat-report').innerHTML=lastReport?`<span class="report-icon ${lastReport.type}">${ico(lastReport.type==='enemy-turn'?'Shield':lastReport.type==='heal'?'Heart':lastReport.type==='hazard'?'Flame':lastReport.type==='pickup'?'Gem':'Dices',16)}</span><div><strong>${escape(lastReport.title)}</strong><span>${escape(lastReport.text)}</span></div>`:`${ico('Dices',17)}<span>Every blank earns Tenacity. Even a missed roll moves you forward.</span>`;
  board?.render(s);
  renderInspector(boardKeyboardMode&&keyboardHex?keyboardHex:hoveredHex);
  if (s.phase!=='combat' && previousPhase!==s.phase) showPhase(s);
  else if (openPanel==='travel' && s.phase==='travel') showPhase(s);
}

function modal(title, subtitle, body, {wide=false, panel='info'}={}) {
  const previous=$('.modal'), same=openPanel===panel, scroll=same?previous?.scrollTop||0:0;
  const active=document.activeElement;
  const restoreSelector=same&&active?.dataset.buy?`[data-buy="${active.dataset.buy}"]`:same&&active?.dataset.train?`[data-train="${active.dataset.train}"]`:null;
  if(!openPanel) returnFocus=active;
  openPanel=panel;
  $('.app-shell').inert=true;
  $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''} ${panel==='travel'?'travel-hub':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="modal-close icon-button" data-close aria-label="Close dialog">${ico('X',20)}</button><div class="eyebrow">${subtitle}</div><h2 id="dialog-title" tabindex="-1">${title}</h2>${body}</section></div>`;
  $('.modal').scrollTop=scroll;
  const focus=restoreSelector?$(restoreSelector):$('#dialog-title');
  (focus&&!focus.disabled?focus:$('#dialog-title')).focus({preventScroll:true});
}
function closeModal() {
  $('#modal-root').innerHTML=''; openPanel=null;
  $('.app-shell').inert=false;
  if(returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
}
function campaignMap(s) {
  return `<div class="campaign-map"><div class="map-route-line"></div><div class="map-watermark">T A M R I E L</div>${ENCOUNTERS.map((encounter,i)=>`<div class="map-stop ${i<=s.encounter?'visited':''} ${i===s.encounter?'here':''}"><span>${ico(i<s.encounter?'Check':i===s.encounter?'Compass':'Flag',20)}</span><b>${encounter.location}</b><small>${i<s.encounter?'COMPLETED':i===s.encounter?'YOUR LOCATION':'SESSION '+roman[i]}</small></div>`).join('')}</div>`;
}
function routeContent(s) {
  const next=ENCOUNTERS[Math.min(s.encounter+1,2)];
  return `<div class="next-destination" style="--destination:url('${chapterArt[Math.min(s.encounter+1,2)]}')"><span>YOUR NEXT DESTINATION</span><h3>${next.location}</h3><p>${next.name}</p></div><div class="section-label">CHOOSE YOUR ROAD <span>A new story waits at each stop</span></div><div class="route-cards"><button data-travel="camp"><span class="route-icon">${ico('Moon',26)}</span><small>RECOVER</small><strong>A sheltered camp</strong><p>Find refuge with fellow travellers. Share supplies or prepare for the battle ahead.</p><span class="route-link">Approach the fire ${ico('ArrowRight',15)}</span></button><button data-travel="shrine"><span class="route-icon violet">${ico('Sparkles',26)}</span><small>DISCOVER</small><strong>The wayside shrine</strong><p>An ancient presence offers a choice between arcane knowledge and renewal.</p><span class="route-link">Enter the sanctuary ${ico('ArrowRight',15)}</span></button><button data-travel="ruins"><span class="route-icon">${ico('Coins',26)}</span><small>EXPLORE</small><strong>Forgotten ruins</strong><p>Salvage what the past left behind. Gold and lost knowledge await within.</p><span class="route-link">Explore the ruins ${ico('ArrowRight',15)}</span></button></div>`;
}
function merchantContent(s) {
  return `<p class="tab-intro">A travelling merchant has made camp beside the road. Equipment bonuses last for the rest of your campaign.</p><div class="market-grid">${s.shopItems.map(item=>`<article class="market-item ${item.owned&&item.kind!=='consumable'?'owned':''}"><span class="market-icon">${ico(item.icon,26)}</span><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><div><span>${ico('Coins',14)} ${item.cost} gold</span><button class="subtle-button" data-buy="${item.id}" ${!item.canBuy?'disabled':''} title="${escape(item.reason||'Buy '+item.name)}">${item.owned&&item.id!=='potion'?ico('Check',13)+' Owned':'Buy'}</button></div></article>`).join('')}</div>`;
}
function trainingContent(s) {
  return `<p class="tab-intro">Turn hard-won experience into lasting strength. Each lesson can be learned once during this campaign.</p><div class="training-list">${s.trainingOptions.map(item=>`<article class="training-item"><span class="market-icon violet">${ico(item.icon,24)}</span><div><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p></div><button class="subtle-button" data-train="${item.id}" ${!item.canTrain?'disabled':''} title="${escape(item.reason||'Learn '+item.name)}">${item.learned?ico('Check',13)+' Learned':`${ico('Gem',13)} ${item.cost} XP`}</button></article>`).join('')}</div><div class="help-note">You also keep the free upgrade earned from your victory. Training uses your remaining XP.</div>`;
}
function showPhase(s=current) {
  const p=s.player;
  if(s.phase==='reward' && !s.pendingUpgrade) {
    modal('Your legend grows','UPGRADE COMPLETE',`<div class="result-emblem">${ico('Check',38)}</div><p class="modal-copy">Your ${escape(s.reward?.upgrade||'character')} upgrade is saved. Continue to prepare for the next encounter.</p><button class="gold-button full" data-game="next">Continue your journey ${ico('ArrowRight')}</button>`,{panel:'reward'});
    return;
  }
  if(s.phase==='event') {
    modal(escape(s.travelEvent?.title||'A chance encounter'),'A STORY ON THE ROAD',storyMarkup(s,ico,escape),{panel:'event',wide:true});
  } else if(s.phase==='reward') {
    modal('A hard-won victory','ENCOUNTER COMPLETE',`<div class="victory-reward"><span>${ico('Flag',30)}</span><div><strong>${escape(ENCOUNTERS[s.encounter].name)}</strong><p>The battlefield is quiet. Your journey is far from over.</p></div></div><div class="reward-summary"><span>${ico('Gem')} +${s.reward?.xp||0} XP</span><span>${ico('Coins')} +${s.reward?.gold||0} gold</span></div><div class="section-label">CHOOSE YOUR FREE UPGRADE</div><div class="upgrade-options"><button data-upgrade="health">${ico('Heart',24)}<strong>Resilience</strong><b>+3 health</b><span>Increase maximum health and recover 3.</span></button><button data-upgrade="combat">${ico('Swords',24)}<strong>Mastery</strong><b>+1 combat</b><span>Roll one more die in every engagement.</span></button><button data-upgrade="cooldown">${ico('RotateCcw',24)}<strong>Focus</strong><b>+1 cooldown</b><span>Recover an extra die at the start of your turn.</span></button></div><p class="modal-footnote">Next: visit the merchant, spend XP, and choose your route.</p>`,{panel:'reward',wide:true});
  } else if(s.phase==='travel') {
    modal('A moment between battles',`THE ROAD TO ${ENCOUNTERS[Math.min(s.encounter+1,2)].location.toUpperCase()}`,`<div class="hub-wallet"><span>${ico('Coins',17)} <b>${p.gold}</b> gold</span><span>${ico('Gem',17)} <b>${p.xp}</b> XP</span><span>${ico('Heart',17)} <b>${p.health}/${p.maxHealth}</b> health</span></div><div class="hub-tabs" role="tablist" aria-label="Journey preparation"><button data-tab="route" role="tab" aria-selected="${travelTab==='route'}" class="${travelTab==='route'?'active':''}">${ico('Compass',16)} Your route</button><button data-tab="merchant" role="tab" aria-selected="${travelTab==='merchant'}" class="${travelTab==='merchant'?'active':''}">${ico('Coins',16)} Merchant</button><button data-tab="training" role="tab" aria-selected="${travelTab==='training'}" class="${travelTab==='training'?'active':''}">${ico('BookOpen',16)} Training${p.xp>=2?'<i class="tab-dot"></i>':''}</button></div><div class="hub-content" role="tabpanel">${travelTab==='merchant'?merchantContent(s):travelTab==='training'?trainingContent(s):routeContent(s)}</div>`,{panel:'travel',wide:true});
  } else if(s.phase==='victory') {
    modal('An era worth saving','CAMPAIGN COMPLETE',`<div class="ending-art"></div><p class="modal-copy">Deslandra’s ritual is broken. Across Tamriel, the first light of a quieter dawn finds the roads you walked. Your story will be remembered.</p><div class="campaign-stats"><div>${ico('Swords',22)}<b>${s.stats.defeated}</b><span>Enemies defeated</span></div><div>${ico('Dices',22)}<b>${s.stats.rolls}</b><span>Engagements</span></div><div>${ico('Heart',22)}<b>${p.health}</b><span>Health remaining</span></div></div><button class="gold-button full" data-open="new-game">Begin another story ${ico('ArrowRight')}</button>`,{panel:'victory'});
  } else if(s.phase==='defeat') {
    modal('Even heroes fall','THE BATTLE IS LOST',`<div class="result-emblem subdued">${ico('Shield',40)}</div><p class="modal-copy">${escape(s.defeatReason||'The enemy has claimed the field.')}</p><div class="help-note">Try ranged magic before closing in. Guard dice absorb damage; your class ability spends Tenacity without sending a die to cooldown.</div><button class="gold-button full" data-game="retry">Retry this encounter ${ico('RotateCcw')}</button><p class="modal-footnote">Restore your character and supplies to the start of this battle.</p><button class="bare-button full" data-open="new-game">Start a different adventure</button>`,{panel:'defeat'});
  }
}
function inventoryContent(p) {
  const gear=(p.equipment||[]).map(id=>SHOP_ITEMS.find(item=>item.id===id)).filter(Boolean);
  return `<div class="inventory-item"><span class="item-icon">${ico('Heart',28)}</span><div><h3>Health potion</h3><p>Restore up to 6 health during your turn.</p><strong>${p.potions} remaining</strong></div><button class="subtle-button" data-game="potion" ${p.potions<=0||p.health>=p.maxHealth||current.phase!=='combat'||busy?'disabled':''}>Drink</button></div>${gear.map(item=>`<div class="inventory-item"><span class="item-icon">${ico(item.icon,27)}</span><div><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><span class="equipped-label">EQUIPPED · CAMPAIGN BONUS</span></div></div>`).join('')}<div class="inventory-item"><span class="item-icon">${ico('Sword',28)}</span><div><h3>Iron longsword</h3><p>Iron Blade dice strike an adjacent enemy.</p><span class="equipped-label">ONE-HANDED · RANGE 1</span></div></div><div class="inventory-item"><span class="item-icon">${ico('Flame',28)}</span><div><h3>Apprentice’s focus</h3><p>Flames dice reach enemies up to 3 hexes away.</p><span class="equipped-label">DESTRUCTION · RANGE 3</span></div></div><div class="reward-summary">${ico('Coins')} ${p.gold} gold in your purse</div><p class="modal-footnote">Visit the merchant between encounters for potions and permanent equipment.</p>`;
}
function showModal(type) {
  const s=current,p=s.player,classInfo=CLASSES[p.className]||CLASSES.Sorcerer;
  if(type==='welcome') modal('Betrayal of the Second Era','THE ELDER SCROLLS',welcomeMarkup({hasSave:hasStarted,playerName:p.name,location:ENCOUNTERS[s.encounter].location},ico,escape),{panel:type,wide:true});
  else if(type==='help') modal('Every roll tells a story','HOW TO PLAY',`<div class="help-steps"><div><b>01</b><section><h3>Position your adventurer</h3><p>Click a gold hex to move up to your Stamina value. You may move and engage in either order, or move twice and pay fatigue to engage afterward. Drag sideways to rotate the board; scroll or use +/− to zoom. On a phone, swipe vertically to scroll the page. Undo reverses your last ordinary move until you commit another action; collecting an objective or taking damage cannot be undone.</p></section></div><div><b>02</b><section><h3>Plan an engagement</h3><p>Choose an enemy, then select up to your Combat value in dice. Iron Blade reaches 1 hex; Flames reaches 3. The attack preview explains range and expected damage. “Prepare attack” selects suitable ready dice for you.</p></section></div><div><b>03</b><section><h3>Make every face count</h3><p>Damage hurts enemies, Guard absorbs incoming attacks, and Restoration heals. Blank faces grant Tenacity. Spend 2 Tenacity on your class ability. Every rolled die enters cooldown; the recovery track shows which return next turn.</p></section></div><div><b>04</b><section><h3>Know when to end your turn</h3><p>The enemy list forecasts their next actions, including damage absorbed by cover. Hazards cost 1 health when you stop on them. An extra engagement costs 1 fatigue, reducing maximum health by 1 for this encounter. End your turn to let enemies act and recover your dice. Complete the encounter’s objective before its round limit. The shrine allows an extra round to collect its skyshards.</p></section></div><div><b>05</b><section><h3>Build your adventurer</h3><p>Victories grant a free upgrade, gold, and XP. Visit the merchant for equipment and potions, spend XP on training, then choose a road and resolve its story encounter. The consequences are shown before you choose. A lost battle can be retried from its starting checkpoint.</p></section></div></div><div class="help-note">Keyboard: 1 Move · 2 Engage · R Roll · E End turn · H Potion · Z Undo move · I Inventory · ? Help · Esc Close</div><button class="gold-button full" data-close>Take your place at the table ${ico('ArrowRight')}</button>`,{panel:type,wide:true});
  else if(type==='terrain') modal('Read the battlefield','TACTICAL FIELD GUIDE',`<div class="terrain-reference"><article><span class="terrain-ref-icon cover">${ico('Shield',26)}</span><div><h3>Stone cover</h3><p>End your move on a hex with a stone barricade. It absorbs 1 damage from each enemy attack before Guard is spent.</p></div></article><article><span class="terrain-ref-icon hazard">${ico('Flame',26)}</span><div><h3>Unstable ground</h3><p>Red cracks mark a hazard. Ending a move here costs 1 health; moving past it does not. Inspect a hex before choosing your position.</p></div></article><article><span class="terrain-ref-icon skyshard">${ico('Gem',26)}</span><div><h3>Skyshards & arcane wards</h3><p>Move directly onto a blue crystal to recover it, or a violet obelisk to break it. The shrine requires both skyshards and a clear battlefield. While either ward stands, Deslandra absorbs 2 damage once per engagement or class ability. Break both to remove this armor, or fight through it.</p></div></article><article><span class="terrain-ref-icon chest">${ico('Coins',26)}</span><div><h3>Roadside supplies</h3><p>The optional chest holds 15 gold. Move onto it to collect the reward before finishing the encounter.</p></div></article></div><div class="help-note">Keyboard: focus the board with Tab, inspect hexes using the arrow keys, then press Enter or Space to move or target. The same controls work with the 2D fallback.</div>`,{panel:type,wide:true});
  else if(type==='skills') modal('Know your dice','SKILL COMPENDIUM',skillMarkup(s,ico,escape),{panel:type,wide:true});
  else if(type==='inventory') modal('A traveller’s belongings','INVENTORY',inventoryContent(p),{panel:type});
  else if(type==='character') modal(escape(p.name),'YOUR ADVENTURER',`<div class="character-profile"><img src="${racePortraits[p.race]||racePortraits.Dunmer}" alt="Your ${escape(p.race)} adventurer"><div><h3>${escape(p.race)} · ${escape(p.className)}</h3><p>A wanderer far from home, drawn into a conspiracy that reaches across the provinces of Tamriel.</p><div class="profile-stats"><span>Health <b>${p.health}/${p.maxHealth}</b></span><span>Available XP <b>${p.xp}</b></span><span>Fatigue <b>${p.fatigue}</b></span><span>Guard <b>${p.guard}</b></span></div></div></div><div class="class-ability-card"><span>${ico('Zap',24)}</span><div><small>CLASS ABILITY · 2 TENACITY</small><h3>${escape(classInfo.ability)}</h3><p>${escape(classInfo.description)}</p></div></div>${p.trained?.length?`<div class="learned-lessons">${p.trained.map(id=>TRAINING_OPTIONS.find(t=>t.id===id)?.name||id).map(name=>`<span>${ico('Check',12)} ${escape(name)}</span>`).join('')}</div>`:''}<div class="profile-actions"><button class="subtle-button" data-open="inventory">${ico('Backpack')} Open inventory</button><button class="subtle-button" data-open="new-game">New adventurer</button></div>`,{panel:type,wide:true});
  else if(type==='journal') modal('A thread of betrayal','QUEST JOURNAL',`<p class="modal-copy">Rumours of a stolen relic have drawn you west. Every road leads to a name whispered in fear: Deslandra.</p><div class="journal-chapters">${ENCOUNTERS.map((encounter,i)=>`<div class="journal-chapter ${i===s.encounter?'present':''}"><span>${i<s.encounter?ico('Check'):String(i+1).padStart(2,'0')}</span><div><small>${encounter.location.toUpperCase()}</small><h3>${encounter.name}</h3><p>${encounter.description}</p><strong>${i<s.encounter||s.phase==='victory'?'COMPLETED':i===s.encounter?'IN PROGRESS':'UNDISCOVERED'}</strong></div></div>`).join('')}</div>${journeyMarkup(s,ico,escape)}<button class="subtle-button full" data-open="log">Read the adventure log ${ico('ScrollText',15)}</button>`,{panel:type,wide:true});
  else if(type==='log') modal('The story so far','ADVENTURE LOG',`<ol class="full-log">${s.log.map(line=>`<li>${escape(line)}</li>`).join('')}</ol>`,{panel:type});
  else if(type==='campaign') modal('Across a fractured realm','THE CAMPAIGN',`${campaignMap(s)}<p class="modal-copy">Three provinces, three different challenges: survive an ambush, recover lost skyshards, and break the wards protecting Deslandra. Your choices along the road shape how you arrive.</p><div class="campaign-progress">${s.stats.battles} of 3 encounters completed <span>${Math.round(s.stats.battles/3*100)}%</span><div><i style="width:${s.stats.battles/3*100}%"></i></div></div><button class="gold-button full" ${s.phase==='combat'?'data-close':'data-action="continue"'}>${s.phase==='combat'?'Return to '+ENCOUNTERS[s.encounter].location:'Continue your journey'} ${ico('ArrowRight')}</button>`,{panel:type,wide:true});
  else if(type==='settings') modal('Make yourself at home','SETTINGS',`<div class="settings-row"><div><h3>Sound effects</h3><p>Dice, impacts, healing, and interface sounds.</p></div><button class="subtle-button" data-action="sound">${ico(muted?'VolumeX':'Volume2')} ${muted?'Off':'On'}</button></div><div class="settings-row"><div><h3>Turn guide</h3><p>Contextual hints and suggested actions as you play.</p></div><button class="subtle-button" data-action="toggle-guide">${guideDismissed?'Show':'Hide'}</button></div><div class="settings-row"><div><h3>Turn reminders</h3><p>Review unused dice, skipped actions, and a turn that would lose the battle.</p></div><button class="subtle-button" data-action="toggle-turn-safety">${safeTurns?'On':'Off'}</button></div><div class="settings-row"><div><h3>Board display</h3><p>A simpler board for lower-powered devices. Reload to return to 3D.</p></div><button class="subtle-button" data-action="simple-board" ${boardMode==='2d'?'disabled':''}>${boardMode==='2d'?'2D active':'Use 2D'}</button></div><div class="settings-row"><div><h3>Your adventure</h3><p>${campaign.getSaveStatus()==='unavailable'?'Browser storage is unavailable. Download a backup before closing.':'Saved automatically in this browser.'}</p></div><button class="subtle-button" data-action="export-save">${ico('Save',14)} Back up</button></div><div class="settings-row"><div><h3>Restore a backup</h3><p>Replaces this adventure with a saved JSON file.</p></div><button class="subtle-button" data-action="import-save">${ico('RotateCcw',14)} Restore</button><input type="file" id="save-upload" accept=".json,application/json" hidden></div><div class="settings-row"><div><h3>Start a new campaign</h3><p>Replaces your current adventure.</p></div><button class="subtle-button" data-open="new-game">New game</button></div><div class="help-note">This game follows your device’s reduced-motion preference. Saves stay on this browser and do not sync across devices.</div>`,{panel:type});
  else if(type==='new-game') modal('Who will you become?','A NEW ADVENTURE',`<p class="modal-copy">Choose your heritage and the power you bring to the battlefield. A new adventure replaces your current progress.</p><form id="new-game-form"><label class="input-label">YOUR NAME<input id="character-name" maxlength="24" value="Lyris Ashwind" required autocomplete="off"></label><div class="form-grid"><label class="input-label">RACE<select id="character-race"><option>Dunmer</option><option>Nord</option><option>Breton</option></select></label><label class="input-label">CLASS<select id="character-class"><option>Sorcerer</option><option>Dragonknight</option><option>Nightblade</option></select></label></div><div id="creation-preview"></div>${difficultyMarkup(ico)}<button type="submit" class="gold-button full">Begin your journey ${ico('ArrowRight')}</button></form>`,{panel:type});
  else if(type==='credits') modal('Made for the adventure','ABOUT & CREDITS',`<p class="modal-copy">An unofficial solo adaptation inspired by <em>The Elder Scrolls: Betrayal of the Second Era</em>, the cooperative board game by Chip Theory Games. This independent fan project uses original encounters and simplified rules.</p><div class="credit-links"><a href="https://chiptheorygames.com/pages/support/the-elder-scrolls" target="_blank" rel="noopener">Official game & rulebooks ${ico('ArrowRight',15)}</a><a href="/assets/CREDITS.md" target="_blank">Asset sources & licenses ${ico('ArrowRight',15)}</a></div><p class="modal-copy small-copy">Original generated portraits and location art. CC0 Poly Haven textures acquired through its API. Cinzel and Manrope fonts under the SIL Open Font License. Three.js rendering; Lucide icons.</p><p class="small-copy muted">The Elder Scrolls and related names belong to their respective owners. This project is not affiliated with Chip Theory Games or Bethesda/ZeniMax.</p>`,{panel:type});
  if(type==='new-game'){renderCreationPreview();if(!hasStarted)$('input[name="difficulty"][value="story"]').checked=true;}
}
function renderCreationPreview() {
  const race=$('#character-race')?.value, className=$('#character-class')?.value;
  if(!race||!className) return;
  const info=CLASSES[className];
  $('#creation-preview').innerHTML=`<div class="creation-identity"><img src="${racePortraits[race]}" alt="${race} adventurer"><div><small>YOUR HERITAGE</small><strong>${race}</strong><span>${race==='Nord'?'Endurance forged in the cold.':race==='Breton'?'Arcane talent runs in your blood.':'Steel and sorcery in equal measure.'}</span></div></div><div class="creation-stats"><span>${ico('Heart',15)} ${race==='Nord'?14:12} health</span><span>${ico('Footprints',15)} ${race==='Nord'?4:3} stamina</span><span>${ico('Flame',15)} ${race==='Breton'?4:3} magicka</span></div><div class="class-ability-card"><span>${ico('Zap',23)}</span><div><small>${className.toUpperCase()} · 2 TENACITY</small><h3>${escape(info.ability)}</h3><p>${escape(info.description)}</p></div></div>`;
}

function onGameEvent(event) {
  board?.playEvent?.(event);
  if(['roll','enemy-turn','heal','ability','pickup','hazard'].includes(event.type)) {
    lastReport={type:event.type,title:event.type==='roll'?'The dice have spoken':event.type==='enemy-turn'?'Enemy turn resolved':event.title,text:event.text};
    tone(event.type==='enemy-turn'||event.type==='hazard'?'damage':event.type==='heal'?'heal':event.type==='ability'?'roll':'click');
  }
  if(event.type==='toast') notify(event.text);
  if(event.type==='pickup'){tone('heal');notify(event.text);}
  if(event.type==='hazard')notify(event.text);
  if(event.type==='victory'||event.type==='reward') tone('victory');
  if(event.type==='encounter') {lastReport=null;hoveredHex=null;keyboardHex=null;board?.clearFocus?.();board?.resetView?.();showBanner(event.title,'A new encounter begins');}
}
function finishAnimation() {
  busy='';
  if(current) render(campaign.getState());
}
function reviewEndTurn(s) {
  const reasons=[];
  if(s.round>=s.maxRounds)reasons.push('This is the final round. Ending it with the objective unfinished loses the encounter.');
  if(s.incomingDamage>=s.player.health)reasons.push(`The predicted ${s.incomingDamage} incoming damage would defeat you. A potion, Guard, cover, or defeating an attacker may help.`);
  if(s.selectedCount)reasons.push(`${s.selectedCount} selected ${s.selectedCount===1?'die has':'dice have'} not been rolled. They will be deselected when the turn ends.`);
  else if(!s.moved&&!s.engaged)reasons.push('You have not moved or used your free engagement this turn. You can still prepare an attack or choose a position.');
  if(!reasons.length)return false;
  modal('Before you end your turn','REVIEW YOUR NEXT MOVE',`<div class="turn-review"><span>${ico('Shield',28)}</span><div>${reasons.map(reason=>`<p>${escape(reason)}</p>`).join('')}</div></div><div class="turn-review-stats"><span>${ico('Heart',16)} ${s.player.health} health</span><span>${ico('Swords',16)} ${s.incomingDamage} incoming damage</span></div><div class="review-actions"><button class="gold-button" data-close>Keep playing ${ico('ArrowRight',16)}</button><button class="subtle-button" data-action="confirm-end-turn">End turn anyway</button></div><p class="modal-footnote">Turn reminders can be switched off in Settings.</p>`,{panel:'turn-review'});
  return true;
}
function perform(action,payload) {
  if(busy) return false;
  if(action==='end-turn'&&current.phase!=='combat') {showPhase();return true;}
  if(action==='end-turn'&&safeTurns&&!payload?.confirmed&&reviewEndTurn(current))return false;
  if(action==='roll') {
    if(!current.canRoll) {notify(current.combatPreview?.reason||'Choose ready dice before rolling.');return false;}
    hasStarted=true;busy='roll';tone('roll');render(current);
    actionTimer=setTimeout(()=>{campaign.action('roll');finishAnimation();},reducedMotion()?60:480);
    return true;
  }
  if(action==='end-turn') {
    hasStarted=true;
    const recovered=Math.min(current.cooldownQueue.length,current.player.cooldown);
    busy='enemy';showBanner('Enemy turn','The enemy makes its move');
    campaign.action('end-turn');
    actionTimer=setTimeout(()=>{finishAnimation();if(current.phase==='combat')showBanner('Your turn',`Round ${current.round} · ${recovered} ${recovered===1?'die':'dice'} recovered`);},reducedMotion()?60:650);
    return true;
  }
  if(action==='retry') {closeModal();lastReport=null;}
  tone('click');
  const success=campaign.action(action,payload);
  if(success)hasStarted=true;
  if(action==='undo-move'&&success){lastReport=null;render(campaign.getState());notify('Last move undone. Choose a new position.');}
  if(action==='retry'&&success) {board?.resetView?.();showBanner('A second chance','Your encounter checkpoint is restored');}
  return success;
}
function prepareAttack() {
  if(busy||current.phase!=='combat') return;
  const target=current.enemies.find(e=>e.id===current.targetId&&e.health>0);
  if(!target) {notify('Select an enemy first.');return;}
  for(const die of current.dice.filter(d=>d.selected)) campaign.action('die',die.id);
  const distance=hexDistance(current.player,target);
  const choices=current.dice.filter(d=>d.status==='ready'&&['physical','magic'].includes(d.type)&&d.range>=distance);
  let count=0,physical=0,magic=0;
  for(const die of choices) {
    if(count>=current.player.combat) break;
    if(die.type==='physical'&&physical>=current.player.stamina||die.type==='magic'&&magic>=current.player.magicka)continue;
    if(campaign.action('die',die.id)){count++;die.type==='magic'?magic++:physical++;}
  }
  if(!count) notify('No ready attack dice reach this enemy. Move closer, choose another target, or end your turn.');
  else {campaign.action('mode','attack');tone();}
}
function updateSoundButton() {
  const button=$('.header-actions [data-action="sound"]');
  button.innerHTML=ico(muted?'VolumeX':'Volume2');button.title=muted?'Enable sound':'Mute sound';button.setAttribute('aria-label',button.title);
}
function exportSave() {
  if(busy) return notify('Wait for the current action to finish before backing up.');
  try {
    const save=campaign.serialize();
    const url=URL.createObjectURL(new Blob([save],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='betrayal-adventure.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Adventure backup downloaded. Keep it with your game files.');
  } catch {notify('The backup could not be downloaded. Please try again.');}
}
function startAdventure(config={difficulty:'story'}) {
  clearTimeout(actionTimer);busy='';lastReport=null;lastPhase=null;travelTab='route';hasStarted=true;
  guideDismissed=false;savePreferences();closeModal();campaign.reset(config);board?.resetView?.();
  notify('Your adventure begins. Follow the turn guide or make your own plan.');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a.brand');
  if(!button||button.disabled)return;
  if(button.matches('a.brand')){event.preventDefault();showModal('welcome');return;}
  if(button.hasAttribute('data-close')){closeModal();return;}
  if(button.dataset.open){showModal(button.dataset.open);return;}
  if(button.dataset.mode){perform('mode',button.dataset.mode);return;}
  if(button.dataset.die){perform('die',button.dataset.die);return;}
  if(button.dataset.target){perform('target',button.dataset.target);return;}
  if(button.dataset.hex){const[q,r]=button.dataset.hex.split(',').map(Number);perform('hex',{q,r});return;}
  if(button.dataset.game){const panelBefore=openPanel;perform(button.dataset.game);if(button.dataset.game==='potion'&&panelBefore==='inventory')showModal('inventory');return;}
  if(button.dataset.upgrade){if(perform('upgrade',button.dataset.upgrade)){travelTab='route';perform('next');}return;}
  if(button.dataset.travel){if(busy)return;closeModal();perform('travel',button.dataset.travel);return;}
  if(button.dataset.eventChoice){if(!busy){closeModal();perform('choose-event',button.dataset.eventChoice);}return;}
  if(button.dataset.tab){travelTab=button.dataset.tab;showPhase();$(`[data-tab="${travelTab}"]`)?.focus({preventScroll:true});return;}
  if(button.dataset.buy){perform('buy',button.dataset.buy);return;}
  if(button.dataset.train){perform('train',button.dataset.train);return;}
  if(button.dataset.coachAction){
    if(busy)return;
    const action=button.dataset.coachAction;
    if(action==='prepare')prepareAttack();
    else if(action==='target'){perform('target',button.dataset.coachTarget);prepareAttack();}
    else if(action==='move'){perform('mode','move');$('#board-stage').scrollIntoView({block:'center',behavior:reducedMotion()?'instant':'smooth'});const focus=$('#board-canvas').hidden?$('#fallback-board [data-hex]'):$('#board-canvas');focus?.focus({preventScroll:true});}
    else if(action==='continue')showPhase();
    else perform(action);
    return;
  }
  switch(button.dataset.action){
    case 'quick-start':startAdventure({difficulty:'story'});break;
    case 'resume-game':closeModal();if(current.phase!=='combat')showPhase();break;
    case 'confirm-end-turn':closeModal();perform('end-turn',{confirmed:true});break;
    case 'toggle-turn-safety':safeTurns=!safeTurns;savePreferences();showModal('settings');break;
    case 'toggle-coach':guideDismissed=!guideDismissed;savePreferences();renderGuide(current);break;
    case 'zoom-in':board?.zoomIn?.();break;
    case 'zoom-out':board?.zoomOut?.();break;
    case 'simple-board':activateFallback();if(openPanel==='settings')showModal('settings');break;
    case 'sound': muted=!muted;savePreferences();tone();updateSoundButton();if(openPanel==='settings')showModal('settings');notify(muted?'Sound muted':'Sound enabled');break;
    case 'reset-view':board?.resetView?.();notify('Board view reset. Drag to rotate; scroll to zoom.');break;
    case 'prepare':prepareAttack();break;
    case 'quick-potion':perform('potion');break;
    case 'dismiss-guide':guideDismissed=true;savePreferences();renderGuide(current);break;
    case 'toggle-guide':guideDismissed=!guideDismissed;savePreferences();renderGuide(current);showModal('settings');break;
    case 'continue':showPhase();break;
    case 'export-save':exportSave();break;
    case 'import-save':if(!busy)$('#save-upload')?.click();else notify('Wait for the current action to finish.');break;
  }
});
document.addEventListener('change',async event=>{
  if(event.target.id==='character-race'){const name=$('#character-name');if(Object.values(suggestedNames).includes(name.value))name.value=suggestedNames[event.target.value];}
  if(['character-race','character-class'].includes(event.target.id))renderCreationPreview();
  if(event.target.id!=='save-upload')return;
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>1024*1024)return notify('This file is too large to be an adventure backup.');
  try {
    const contents=await file.text();const parsed=JSON.parse(contents);
    if(parsed?.version!==1||!parsed.state)throw new Error('Invalid backup');
    if(busy){notify('Wait for the current action to finish before restoring.');return;}
    if(!campaign.restore(contents)){notify('This backup could not be read. Your current adventure is unchanged.');return;}
    closeModal();clearTimeout(actionTimer);busy='';lastReport=null;hasStarted=true;
    render(campaign.getState());if(current.phase!=='combat')showPhase();
    board?.resetView?.();notify('Adventure restored from your backup.');
  } catch {notify('Choose a valid adventure backup exported from this game.');}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='new-game-form')return;
  event.preventDefault();
  const config={name:$('#character-name').value.trim()||'Lyris Ashwind',race:$('#character-race').value,className:$('#character-class').value,difficulty:document.querySelector('input[name="difficulty"]:checked')?.value||'standard'};
  startAdventure(config);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(openPanel)closeModal();return;}
  if(openPanel){
    if(event.key==='Tab'){
      const focusable=[...document.querySelectorAll('.modal button:not(:disabled),.modal a,.modal input,.modal select')];
      const first=focusable[0],last=focusable.at(-1),active=document.activeElement;
      if(event.shiftKey&&(active===first||active===$('#dialog-title'))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();}
    }
    return;
  }
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||event.ctrlKey||event.metaKey||event.altKey)return;
  const activeHex=document.activeElement?.dataset.hex;
  if(document.activeElement===$('#board-canvas')||activeHex) {
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(direction||event.key==='Enter'||event.key===' ') {
      event.preventDefault();
      if(busy||current.phase!=='combat')return;
      boardKeyboardMode=true;hoveredHex=null;
      if(activeHex){const[q,r]=activeHex.split(',').map(Number);keyboardHex={q,r};}
      keyboardHex??={q:current.player.q,r:current.player.r};
      if(direction){
        const next={q:keyboardHex.q+direction[0],r:keyboardHex.r+direction[1]};
        if(Math.max(Math.abs(next.q),Math.abs(next.r),Math.abs(next.q+next.r))<=3)keyboardHex=next;
      } else perform('hex',keyboardHex);
      board?.focusHex?.(keyboardHex.q,keyboardHex.r);
      if(activeHex)$(`[data-hex="${keyboardHex.q},${keyboardHex.r}"]`)?.focus({preventScroll:true});
      renderInspector(keyboardHex);
      return;
    }
  }
  const key=event.key.toLowerCase();
  if(['1','2','r','e','i','h','z','?'].includes(key))event.preventDefault();
  if(key==='1')perform('mode','move');if(key==='2')perform('mode','attack');if(key==='r')perform('roll');if(key==='e')perform('end-turn');if(key==='i')showModal('inventory');if(key==='h')perform('potion');if(key==='z')perform('undo-move');if(key==='?')showModal('help');
});
$('#modal-root').addEventListener('click',event=>{if(event.target.classList.contains('modal-backdrop'))closeModal();});
$('#board-canvas').addEventListener('pointerdown',()=>{boardPointerTime=performance.now();boardKeyboardMode=false;board?.clearFocus?.();});
$('#board-canvas').addEventListener('focus',()=>{
  if(performance.now()-boardPointerTime<200||!current)return;
  boardKeyboardMode=true;keyboardHex={q:current.player.q,r:current.player.r};
  board?.focusHex?.(keyboardHex.q,keyboardHex.r);renderInspector(keyboardHex);
});
$('#board-canvas').addEventListener('blur',()=>{boardKeyboardMode=false;board?.clearFocus?.();renderInspector(hoveredHex);});
document.addEventListener('focusin',event=>{const hex=event.target.dataset?.hex;if(hex){const[q,r]=hex.split(',').map(Number);renderInspector({q,r});}});

function createFallback() {
  boardMode='2d';
  $('#board-canvas').hidden=true;
  $('#board-stage').insertAdjacentHTML('beforeend','<div class="fallback-board" id="fallback-board" aria-label="Tactical hex board"></div>');
  return {
    render(s){
      const focusedHex=document.activeElement?.dataset.hex;
      $('#fallback-board').innerHTML=Array.from({length:7},(_,row)=>{
        const r=row-3;
        return `<div class="hex-row">${Array.from({length:7},(_,col)=>col-3).filter(q=>Math.abs(q+r)<=3).map(q=>{
          const enemy=s.enemies.find(e=>e.health>0&&e.q===q&&e.r===r),player=s.player.q===q&&s.player.r===r,reachable=s.reachable.some(h=>h.q===q&&h.r===r);
          const terrain=s.terrain?.find(t=>t.q===q&&t.r===r),token=s.tokens?.find(t=>!t.collected&&t.q===q&&t.r===r),info=describeHex(s,{q,r});
          return `<button data-hex="${q},${r}" class="fallback-hex ${player?'player':enemy?'enemy':reachable?'reachable':''} ${terrain?.type||''} ${token?.type||''}" aria-label="Hex ${q}, ${r}: ${escape(info.title)}. ${escape(info.description)}" title="${escape(info.description)}" ${busy?'disabled':''}>${player?'◆':enemy?ico('Swords',15):token?ico(tokenIcons[token.type],14):terrain?ico(terrain.type==='cover'?'Shield':'Flame',13):'·'}</button>`;
        }).join('')}</div>`;
      }).join('');
      if(focusedHex&&!openPanel&&!busy)$(`[data-hex="${focusedHex}"]`)?.focus({preventScroll:true});
    },resize(){},resetView(){},playEvent(){}
  };
}
function activateFallback() {
  if(boardMode==='2d')return;
  const previous=board;board=null;
  try{previous?.dispose?.();}catch{}
  board=createFallback();
  if(current)board.render(current);
  document.querySelectorAll('.zoom-control').forEach(button=>button.disabled=true);
  notify('Simplified board enabled. Your adventure is unchanged.');
}
campaign=createCampaign(render,onGameEvent);
try {board=createBoard({THREE,canvas:$('#board-canvas'),onContextLost:activateFallback,onHexClick:(q,r)=>{if(!openPanel&&!busy)perform('hex',{q,r});},onHexHover:hex=>{hoveredHex=hex;renderInspector(boardKeyboardMode&&keyboardHex?keyboardHex:hex);}});}
catch(error){console.warn('3D board unavailable; using the tactical fallback.',error);activateFallback();}
updateSoundButton();
hasStarted=campaign.load();
if(!hasStarted){render(campaign.getState());showModal('welcome');}
window.getGameState=()=>structuredClone(campaign.getState());
