import { SKILLS, DIFFICULTIES } from './rules.js';

export const racePortraits = {Dunmer:'/assets/portrait.jpg',Nord:'/assets/portrait-nord.jpg',Breton:'/assets/portrait-breton.jpg'};
export const suggestedNames = {Dunmer:'Lyris Ashwind',Nord:'Eira Frostborn',Breton:'Elara Valenne'};
export const tokenIcons = {skyshard:'Gem',ward:'Zap',chest:'Coins'};
export const tokenLabels = {skyshard:'Skyshard',ward:'Arcane ward',chest:'Supply chest'};

export function describeHex(state, hex) {
  if(!hex) return null;
  const at = item => item.q===hex.q&&item.r===hex.r;
  const terrain=state.terrain?.find(at),token=state.tokens?.find(item=>!item.collected&&at(item));
  const enemy=state.enemies.find(item=>item.health>0&&at(item));
  const player=at(state.player),reachable=state.reachable?.some(at);
  const parts=[];
  if(token) parts.push(token.type==='skyshard'?'Step here to recover the skyshard.':token.type==='ward'?'Step here to break this protective ward.':'Step here to collect 15 gold.');
  if(terrain) parts.push(terrain.type==='cover'?'Cover absorbs 1 damage from each enemy attack.':'Ending a move here costs 1 health.');
  if(enemy) parts.push(`${enemy.health}/${enemy.maxHealth} health · ${enemy.attack} attack.`);
  if(!parts.length) parts.push(player?'Your adventurer is standing here.':reachable?'This hex is within your movement range.':'Open ground. Move closer to reach this hex.');
  return {title:enemy?.name||token?.name||terrain?.name||(player?'Your position':'Open ground'),icon:enemy?'Swords':token?tokenIcons[token.type]:terrain?.type==='cover'?'Shield':terrain?.type==='hazard'?'Flame':'Footprints',kind:terrain?.type||token?.type||'plain',description:parts.join(' '),coordinate:`${hex.q>=0?'+':''}${hex.q}, ${hex.r>=0?'+':''}${hex.r}`,reachable,player};
}

export function missionMarkup(state,ico,escape) {
  const tokens=state.tokens||[],required=tokens.filter(t=>t.type!=='chest');
  const collected=required.filter(t=>t.collected).length;
  if(!required.length){
    const chest=tokens.find(t=>t.type==='chest');
    return chest?`<div class="mission-mini optional ${chest.collected?'complete':''}"><span>${ico(chest.collected?'Check':'Coins',15)}</span><div><strong>${chest.collected?'Supplies recovered':'Optional: roadside supplies'}</strong><span>${chest.collected?'+15 gold collected':'Move onto the chest to claim 15 gold.'}</span></div></div>`:'';
  }
  const kind=required[0].type,done=collected===required.length;
  return `<div class="mission-mini ${kind} ${done?'complete':''}"><span>${ico(done?'Check':tokenIcons[kind],17)}</span><div><strong>${kind==='skyshard'?'Recover the skyshards':'Optional: break the wards'}</strong><span>${done?(kind==='ward'?'Deslandra’s protection is broken.':'All skyshards recovered. Defeat the guardians.'):(kind==='ward'?'Until both break, Deslandra absorbs 2 damage per engagement or ability.':'Move onto each blue crystal to collect it.')}</span></div><b>${collected}/${required.length}</b></div><div class="mission-token-list">${required.map(t=>`<span class="${t.collected?'collected':''}" title="${escape(t.name)} at ${t.q},${t.r}">${ico(t.collected?'Check':tokenIcons[t.type],12)} ${escape(t.name)}</span>`).join('')}</div>`;
}

export function difficultyMarkup(ico) {
  return `<fieldset class="difficulty-options"><legend>CHOOSE YOUR CHALLENGE</legend>${Object.values(DIFFICULTIES).map(d=>`<label class="difficulty-choice"><input type="radio" name="difficulty" value="${d.id}" ${d.id==='standard'?'checked':''}><span class="difficulty-symbol">${ico(d.id==='story'?'BookOpen':d.id==='standard'?'Shield':'Swords',20)}</span><span><strong>${d.name}</strong><small>${d.description}</small></span><i></i></label>`).join('')}</fieldset>`;
}

export function storyMarkup(state,ico,escape) {
  const story=state.travelEvent;
  if(!story) return '<p class="modal-copy">Your next encounter is waiting.</p>';
  const allowedArt={'camp':'/assets/hero.jpg','shrine':'/assets/shrine.jpg','ruins':'/assets/keep.jpg'};
  const art=allowedArt[story.route]||allowedArt[story.id?.split('-')[0]]||'/assets/hero.jpg';
  return `<div class="story-art" style="background-image:linear-gradient(0deg,#18231b,transparent 75%),url('${art}')"><span>${ico('Compass',13)} ON THE ROAD TO ${state.encounter===0?'STORMHAVEN':'RIVENSPIRE'}</span></div><p class="story-prose">${escape(story.text)}</p><div class="story-choice-heading">CHOOSE YOUR RESPONSE <span>Each choice shapes what comes next.</span></div><div class="story-choices">${story.choices.map((choice,i)=>`<button data-event-choice="${escape(choice.id)}"><span class="story-choice-number">0${i+1}</span><div><h3>${escape(choice.label)}</h3><p>${escape(choice.description)}</p><span class="story-effects">${ico('Sparkles',13)} ${escape(choice.effectsLabel)}</span></div>${ico('ArrowRight',17)}</button>`).join('')}</div>`;
}

export function skillMarkup(state,ico,escape) {
  const unique=[...new Set(state.dice.map(d=>d.skill))];
  const faceIcon={hit:'Sword',critical:'Swords',blank:'Sparkles',heal:'Heart',block:'Shield'};
  return `<p class="modal-copy">Each die has six equally likely faces. Choose a mix that suits your position, health, and next turn.</p><div class="skill-compendium">${unique.map(id=>{
    const skill=SKILLS[id],count=state.dice.filter(d=>d.skill===id).length;
    const typeIcon=skill.type==='magic'?'Flame':skill.type==='physical'?'Sword':skill.type==='support'?'Heart':'Shield';
    return `<article class="skill-reference ${skill.type}"><div class="skill-reference-heading"><span>${ico(typeIcon,21)}</span><div><h3>${escape(skill.name)} <small>×${count}</small></h3><p>${skill.range?`Range ${skill.range} · `:''}${skill.type==='magic'||skill.type==='support'?'Uses Magicka':'Uses Stamina'} · Returns through cooldown</p></div></div><div class="die-faces">${skill.faces.map(([face,value])=>`<span class="die-face ${face}" title="${face==='blank'?'+1 Tenacity':value+' '+face}">${ico(faceIcon[face],16)}<b>${face==='blank'?'✦':value}</b></span>`).join('')}</div><p class="skill-explainer">${skill.type==='defense'?'Guard absorbs incoming damage until your next turn.':skill.type==='support'?'Restoration recovers health, up to your current maximum.':`Successful faces deal damage to your selected target within ${skill.range} hex${skill.range===1?'':'es'}.`} Blank faces grant 1 Tenacity.</p></article>`;
  }).join('')}</div><div class="help-note">The attack preview accounts for range, equipment, and protective wards. Expected damage is an average over all possible faces.</div>`;
}

export function journeyMarkup(state,ico,escape) {
  if(!state.journey?.length) return '';
  return `<div class="section-label">THE CHOICES YOU MADE</div><div class="journey-history">${state.journey.map(step=>`<article><span>${ico('ScrollText',18)}</span><div><small>AFTER ${['GLENUMBRA','STORMHAVEN'][step.fromEncounter]||'BATTLE'}</small><h3>${escape(step.title)}</h3><strong>${escape(step.choiceLabel)}</strong><p>${escape(step.effectsLabel)}</p></div></article>`).join('')}</div>`;
}
