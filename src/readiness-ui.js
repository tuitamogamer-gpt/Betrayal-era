import { hexDistance } from './rules.js';

/** First-run content. Starting or restoring a campaign remains the caller's job. */
export function welcomeMarkup({hasSave = false, playerName = '', location = ''} = {}, ico, escape) {
  return `<div class="welcome-intro">
    <div class="welcome-art" role="img" aria-label="A traveller approaches a ruined fortress in the mountains of Tamriel">
      <span class="welcome-art-label">${ico('Compass',15)} THREE PROVINCES. ONE BETRAYAL.</span>
      <div class="welcome-route"><span>Glenumbra</span><i></i><span>Stormhaven</span><i></i><span>Rivenspire</span></div>
    </div>
    <div class="welcome-content">
      <p class="welcome-prose">A stolen relic. An oath broken. Follow the trail across Tamriel, master your dice, and face the power behind the betrayal.</p>
      <div class="welcome-facts"><span>${ico('Shield',16)} Solo adventure</span><span>${ico('Map',16)} 3 linked battles</span><span>${ico('Save',16)} Saves as you play</span></div>
      ${hasSave ? `<div class="welcome-save"><span>${ico('BookOpen',23)}</span><div><small>YOUR STORY IS WAITING</small><strong>${escape(playerName || 'Your adventurer')}</strong><p>${escape(location || 'Tamriel')} · Resume exactly where you left off.</p></div></div>` : ''}
      <button class="welcome-primary" data-action="${hasSave?'resume-game':'quick-start'}"><span>${ico(hasSave?'BookOpen':'Compass',22)}</span><span><strong>${hasSave?'Continue adventure':'Start playing'}</strong><small>${hasSave?'Return to your saved campaign':'Story difficulty · Ready-made Sorcerer · Guidance on'}</small></span>${ico('ArrowRight',21)}</button>
      <div class="welcome-secondary"><button class="bare-button" data-open="new-game">${ico('Shield',16)} ${hasSave?'Create a new adventurer':'Create your own adventurer'}</button><button class="bare-button" data-open="help">How to play ${ico('CircleHelp',16)}</button></div>
      ${!hasSave ? `<div class="welcome-how"><div><span>01</span><p><strong>Find your position</strong>Move onto a highlighted hex, or cast from a distance.</p></div><div><span>02</span><p><strong>Choose your dice</strong>Prepare an attack, then roll. Every blank earns Tenacity.</p></div><div><span>03</span><p><strong>Keep your story alive</strong>End your turn to recover dice. Spend rewards between battles.</p></div></div>` : ''}
      <p class="welcome-footnote">Set aside around 20–35 minutes, or return whenever you like.<br>An independent, compact solo adaptation inspired by the board game.</p>
    </div>
  </div>`;
}

const offensive = die => die.status === 'ready' && ['physical','magic'].includes(die.type);
const result = (title, text, actionLabel, action, icon, extra = {}) => ({title,text,actionLabel,action,icon,...extra});

/** Suggestions expose legal options; they never spend a move, die, or resource. */
export function coachInfo(state) {
  if (!state?.player) return null;
  if (state.phase !== 'combat') return result('Your journey continues', 'Your next choice is waiting. Open the journey panel when you are ready.', 'Continue journey', 'continue', 'Compass');
  const player = state.player;
  const enemies = state.enemies.filter(enemy => enemy.health > 0);
  const target = enemies.find(enemy => enemy.id === state.targetId);
  const canMove = !!state.reachable?.length;
  const selected = state.dice.filter(die => die.selected && die.status === 'ready');
  const remainingShards = (state.tokens || []).filter(token => token.type === 'skyshard' && !token.collected);
  const readyAttacks = state.dice.filter(offensive);
  const reaches = enemy => readyAttacks.some(die => die.range >= hexDistance(player, enemy));
  const targetInReach = target && reaches(target);
  const alternative = enemies.find(enemy => reaches(enemy));
  const recover = Math.min(state.cooldownQueue?.length || 0, player.cooldown);

  if (state.incomingDamage >= player.health && player.potions > 0 && player.health < player.maxHealth) {
    return result('A potion could save this turn', `Enemies threaten ${state.incomingDamage} damage. Recover up to 6 health before handing over your turn; cover and Guard can also help.`, 'Drink a potion', 'potion', 'Heart', {tone:'danger'});
  }
  if (!enemies.length && remainingShards.length) {
    return canMove
      ? result('The skyshards are still waiting', `${remainingShards.length} skyshard${remainingShards.length===1?' remains':'s remain'}. Move directly onto each blue crystal to complete this encounter.`, 'Choose a hex', 'move', 'Gem')
      : result('A clear field, one last task', 'End your turn to move again, then recover the remaining skyshards before the round limit.', 'End turn', 'end-turn', 'Gem');
  }
  if (selected.length && state.canRoll) {
    const fatigue = state.combatPreview?.fatigueCost;
    return result(fatigue?'Another roll costs fatigue':'Your dice are ready', fatigue?'This engagement costs 1 maximum health for this battle. Roll if the trade is worth it, or end your turn to recover dice.':'Check the preview below, then roll to resolve your selected dice. Rolled dice enter cooldown.', 'Roll selected dice', 'roll', 'Dices', {tone:fatigue?'caution':'ready'});
  }
  if (selected.length && !state.canRoll) {
    if (state.engaged && (player.health <= 1 || player.maxHealth <= 1)) return result('Recover before engaging again', 'You cannot pay another fatigue cost. End your turn to refresh your free engagement and recover dice.', 'End turn', 'end-turn', 'RotateCcw', {tone:'caution'});
    if (targetInReach) return result('Adjust your selected dice', state.combatPreview?.reason || 'Some selected dice cannot reach this target. Prepare an attack to choose suitable ready dice.', 'Prepare attack', 'prepare', 'Swords');
    if (alternative) return result('Another enemy is within reach', `${alternative.name} can be reached by your ready attack dice. Select that target and prepare an attack.`, 'Choose target', 'target', 'Swords', {targetId:alternative.id});
    return canMove
      ? result('Close the distance', state.combatPreview?.reason || 'Your selected attack cannot reach the target. Choose a highlighted hex closer to an enemy.', 'Choose a hex', 'move', 'Footprints')
      : result('Recover your options', 'The selected attack cannot be used from here. End your turn to recover dice and move again.', 'End turn', 'end-turn', 'RotateCcw');
  }
  if (state.engaged) {
    const text = canMove
      ? 'You can still reposition. Ending your turn lets enemies act and restores your free engagement; another roll now would cost fatigue.'
      : `You have acted this turn. Let enemies respond${recover?` and recover ${recover} ${recover===1?'die':'dice'}`:''}. Another engagement now would cost fatigue.`;
    return result('Ready for the enemy’s response?', text, 'End turn', 'end-turn', 'RotateCcw');
  }
  if (targetInReach) {
    const distance = hexDistance(player,target);
    return result(state.round===1&&state.encounter===0&&!state.moved?'Your first attack':'An enemy is within reach', `${target.name} is ${distance} ${distance===1?'hex':'hexes'} away. Prepare attack selects suitable ready dice; you can change the selection before rolling.`, 'Prepare attack', 'prepare', 'Swords');
  }
  if (alternative) return result('Choose a reachable enemy', `${alternative.name} is within range of your ready dice. Select this target, then prepare your attack.`, 'Choose target', 'target', 'Swords', {targetId:alternative.id});
  if (canMove && readyAttacks.length) return result('Find a better position', 'Your ready attack dice do not reach an enemy yet. Move onto a highlighted hex. Stone cover reduces incoming damage.', 'Choose a hex', 'move', 'Footprints');
  if (canMove && remainingShards.length) return result('Use the moment to explore', 'Your attack dice need time to recover. You can still move toward a blue skyshard before ending the turn.', 'Choose a hex', 'move', 'Gem');
  return result('Bring your dice back', `End your turn to let enemies act${recover?` and recover ${recover} ${recover===1?'die':'dice'}`:''}. Ready Guard or Restoration dice can also help before you finish.`, 'End turn', 'end-turn', 'RotateCcw');
}

export function coachMarkup(state, ico, escape) {
  const tip = coachInfo(state);
  if (!tip) return '';
  return `<div class="turn-coach ${tip.tone || ''}"><span class="coach-emblem">${ico(tip.icon,22)}</span><div class="coach-copy"><span class="coach-kicker">YOUR NEXT STEP</span><strong>${escape(tip.title)}</strong><p>${escape(tip.text)}</p></div><button class="coach-action" data-coach-action="${escape(tip.action)}"${tip.targetId?` data-coach-target="${escape(tip.targetId)}"`:''}>${escape(tip.actionLabel)} ${ico('ArrowRight',16)}</button><button class="coach-dismiss bare-button" data-action="toggle-coach" aria-label="Hide turn guidance" title="Hide guidance; restore it in Settings">${ico('X',16)}</button></div>`;
}
