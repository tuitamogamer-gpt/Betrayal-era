import { test, expect } from '@playwright/test';

test.setTimeout(240_000);
const ready = async page => expect(page.locator('body')).not.toHaveClass(/is-busy/);
async function endTurn(page){
  await ready(page);await page.locator('[data-game="end-turn"]').click();
  const confirm=page.locator('[data-action="confirm-end-turn"]');
  if(await confirm.isVisible())await confirm.click();
  await ready(page);
}
async function openBattle(page){
  await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.getGameState);
  if(await page.locator('[data-action="quick-start"]').isVisible())await close(page);
}
const snapshot = page => page.evaluate(() => window.getGameState());
const distance = (a,b) => Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
async function clickHex(page,q,r){
  const canvas=page.locator('#board-canvas');await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();
  // Project the actual axial hex center through the board's initial orthographic camera.
  const centerX=Math.sqrt(3)*(q+r/2)*1.15,centerZ=1.5*r*1.15,az=.22,extent=7.4,l=Math.hypot(18,19.65);
  const coordinate=`${q>=0?'+':''}${q}, ${r>=0?'+':''}${r}`;
  // Raised miniatures can overlap an adjacent tile. Use the same hover inspector
  // as a player to find a visible point on the intended hex before clicking.
  for(const [dx,dz] of [[0,0],[-.6,0],[.6,0],[0,-.55],[0,.55],[-.45,-.45],[.45,.45]]){
    const x=centerX+dx,z=centerZ+dz;
    const sx=(x*Math.cos(az)-z*Math.sin(az))/(extent*b.width/b.height);
    const sy=(-x*Math.sin(az)*19.65/l+(.30-.35)*18/l-z*Math.cos(az)*19.65/l)/extent;
    const point={x:b.x+(sx+1)*b.width/2,y:b.y+(1-sy)*b.height/2};
    await page.mouse.move(point.x,point.y);
    if(await page.locator('#board-inspector strong small').textContent({timeout:500}).catch(()=>null)!==coordinate)continue;
    await page.mouse.click(point.x,point.y);return;
  }
  throw new Error(`No visible pointer target for hex ${coordinate}`);
}
async function roll(page){
  await ready(page);
  const before=(await snapshot(page)).stats.rolls;
  await page.locator('[data-game="roll"]').click();
  await expect.poll(async()=>(await snapshot(page)).stats.rolls,{timeout:5000}).toBe(before+1);
  await ready(page);
}
async function close(page){await page.locator('.modal [data-close]').first().click();await expect(page.getByRole('dialog')).toHaveCount(0)}
async function usePotion(page){
  await page.locator('.character-bottom [data-open="inventory"]').click();
  await page.locator('[data-game="potion"]').click();await close(page);
}
async function finishCampaign(page){
  for(let step=0;step<65;step++){
    await ready(page);
    let s=await snapshot(page);
    if(s.phase==='victory')return;
    expect(s.phase,`Campaign failed on action ${step}`).not.toBe('defeat');
    if(s.phase==='reward'){
      await page.locator('[data-upgrade="health"]').click();
      await expect.poll(async()=>(await snapshot(page)).phase).toBe('travel');
      if(s.encounter===1){
        await page.locator('[data-tab="merchant"]').click();
        const before=await snapshot(page);await page.locator('[data-buy="focus-crystal"]').click();
        let after=await snapshot(page);expect(after.player.gold).toBe(before.player.gold-45);expect(after.player.equipment).toContain('focus-crystal');
        await expect(page.locator('[data-buy="focus-crystal"]')).toBeDisabled();
        await page.locator('[data-tab="training"]').click();await page.locator('[data-train="discipline"]').click();
        after=await snapshot(page);expect(after.player.xp).toBe(before.player.xp-3);expect(after.player.cooldown).toBe(before.player.cooldown+1);
        await page.reload();await page.waitForFunction(()=>window.getGameState);expect((await snapshot(page)).player.equipment).toContain('focus-crystal');
      }
      await page.locator('[data-travel="camp"]').click();
      await expect.poll(async()=>(await snapshot(page)).phase).toBe('event');
      await page.locator('[data-event-choice="camp-prepare"]').click();
      expect((await snapshot(page)).preparationGuard).toBe(1);
      continue;
    }
    if(s.player.potions>0&&s.player.health<=s.player.maxHealth-4){await usePotion(page);s=await snapshot(page)}
    // Objective tokens are real movement destinations; collect both before engaging.
    for(let move=0;move<2;move++){
      const token=s.tokens.filter(t=>!t.collected&&t.type!=='chest')
        .sort((a,b)=>distance(a,s.player)-distance(b,s.player))
        .find(t=>s.reachable.some(h=>h.q===t.q&&h.r===t.r));
      if(!token)break;
      await page.locator('[data-mode="move"]').click();await clickHex(page,token.q,token.r);
      await expect.poll(async()=>(await snapshot(page)).tokens.find(t=>t.id===token.id).collected).toBe(true);
      s=await snapshot(page);
      await expect(page.locator('#mission-progress')).toContainText(`${s.mission.progress}/2`);
      if(s.encounter===2)expect(s.enemies.find(e=>e.type==='boss').armor).toBe(s.mission.progress===2?0:2);
    }
    if(s.phase!=='combat')continue;
    const enemies=s.enemies.filter(e=>e.health>0).sort((a,b)=>distance(a,s.player)-distance(b,s.player));
    const enemy=enemies[0];
    if(!enemy){
      const token=s.tokens.find(t=>!t.collected);
      if(token&&s.reachable.length){
        const best=[...s.reachable].sort((a,b)=>distance(a,token)-distance(b,token))[0];
        await page.locator('[data-mode="move"]').click();await clickHex(page,best.q,best.r);
      } else await endTurn(page);
      continue;
    }
    if(distance(s.player,enemy)>1&&s.reachable.length){
      const best=[...s.reachable].sort((a,b)=>distance(a,enemy)-distance(b,enemy)||distance(a,s.player)-distance(b,s.player))[0];
      if(distance(best,enemy)<distance(s.player,enemy)){
        await page.locator('[data-mode="move"]').click();await clickHex(page,best.q,best.r);
        await expect.poll(async()=>{const n=await snapshot(page);return `${n.player.q},${n.player.r}`}).toBe(`${best.q},${best.r}`);
        s=await snapshot(page);
      }
    }
    await page.locator(`[data-target="${enemy.id}"]`).click();
    const attacks=s.dice.filter(d=>d.status==='ready'&&['physical','magic'].includes(d.type)&&distance(s.player,enemy)<=d.range);
    if(!attacks.length){await endTurn(page);continue}
    // Favor damage; unused support dice may heal or guard without spending another engagement.
    const selected=attacks.slice(0,s.player.combat);
    for(const support of s.dice.filter(d=>d.status==='ready'&&['support','defense'].includes(d.type)))if(selected.length<s.player.combat)selected.push(support);
    for(const d of selected)await page.locator(`[data-die="${d.id}"]`).click();
    await roll(page);
  }
  throw new Error('Campaign did not resolve within 65 actions');
}

test('desktop campaign: canvas movement, combat, panels, persistence, progression and new character',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1100});
  // Deterministic dice faces make a full, real UI campaign reproducible.
  await page.addInitScript(()=>{Math.random=()=>.1});
  await openBattle(page);
  await expect(page.locator('#board-canvas')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'scratch/v4-desktop.png',fullPage:true});
  await page.locator('[data-die="die-0"]').click();expect((await snapshot(page)).canRoll).toBe(false);
  await expect(page.locator('#roll-button')).toBeDisabled();await expect(page.locator('#attack-preview')).toContainText('selected dice reach 1');
  await page.locator('[data-action="prepare"]').click();let prepared=await snapshot(page);expect(prepared.canRoll).toBe(true);expect(prepared.dice.filter(d=>d.selected).every(d=>d.type==='magic')).toBe(true);
  for(const die of prepared.dice.filter(d=>d.selected))await page.locator(`[data-die="${die.id}"]`).click();
  await page.locator('[data-mode="move"]').click();await clickHex(page,0,1);await expect.poll(async()=>(await snapshot(page)).player.r).toBe(1);
  await clickHex(page,0,0);await expect.poll(async()=>(await snapshot(page)).mode).toBe('attack');
  expect((await snapshot(page)).targetId).toBe('raider');
  for(const i of [0,1,2])await page.locator(`[data-die="die-${i}"]`).click();
  expect((await snapshot(page)).selectedCount).toBe(3);
  await page.locator('[data-die="die-3"]').click();expect((await snapshot(page)).selectedCount).toBe(3);
  await expect(page.locator('#toast')).toContainText('up to 3');
  await page.locator('[data-die="die-2"]').click();expect((await snapshot(page)).selectedCount).toBe(2);
  await page.locator('[data-die="die-2"]').click();await roll(page);
  let s=await snapshot(page);expect(s.enemies.find(e=>e.id==='raider').health).toBe(0);expect(s.cooldownQueue).toHaveLength(3);
  await expect(page.locator('[data-die="die-0"]')).toBeDisabled();
  await endTurn(page);s=await snapshot(page);expect(s.round).toBe(2);expect(s.cooldownQueue).toHaveLength(1);expect(s.player.health).toBeLessThan(s.player.maxHealth);
  for(const type of ['help','journal','campaign','settings']){
    await page.locator(`[data-open="${type}"]`).first().click();await expect(page.getByRole('dialog')).toBeVisible();
    if(type==='settings'){await page.locator('.modal [data-action="sound"]').click();await expect(page.locator('.modal [data-action="sound"]')).toContainText('On')}
    await close(page);
  }
  const beforePotion=await snapshot(page);await usePotion(page);s=await snapshot(page);expect(s.player.potions).toBe(beforePotion.player.potions-1);expect(s.player.health).toBe(s.player.maxHealth);
  const beforeReload=await snapshot(page);await page.reload();await page.waitForFunction(()=>window.getGameState);s=await snapshot(page);
  for(const field of ['player','round','cooldownQueue','stats'])expect(s[field]).toEqual(beforeReload[field]);
  await page.locator('[data-target="archer"]').click();await page.locator('[data-die="die-3"]').click();await roll(page);
  await page.locator('[data-mode="move"]').click();await clickHex(page,1,0);await expect.poll(async()=>(await snapshot(page)).player.q).toBe(1);
  await page.locator('[data-die="die-0"]').click();await roll(page);
  expect((await snapshot(page)).phase).toBe('reward');await expect(page.getByRole('dialog')).toContainText('hard-won victory');
  await page.locator('[data-upgrade="health"]').click();expect((await snapshot(page)).phase).toBe('travel');
  const beforeMarket=await snapshot(page);
  await page.locator('[data-tab="merchant"]').click();await page.locator('[data-buy="potion"]').click();
  s=await snapshot(page);expect(s.player.gold).toBe(beforeMarket.player.gold-15);expect(s.player.potions).toBe(beforeMarket.player.potions+1);
  await page.locator('[data-tab="training"]').click();await page.locator('[data-train="vitality"]').click();
  s=await snapshot(page);expect(s.player.xp).toBe(beforeMarket.player.xp-2);expect(s.player.baseMaxHealth).toBe(beforeMarket.player.baseMaxHealth+3);
  await expect(page.locator('[data-train="vitality"]')).toBeDisabled();
  await page.screenshot({path:'scratch/v4-training.png',fullPage:true});
  await page.reload();await page.waitForFunction(()=>window.getGameState);const restoredMarket=await snapshot(page);expect(restoredMarket.player).toEqual(s.player);
  await page.locator('[data-travel="shrine"]').click();
  const pendingStory=await snapshot(page);expect(pendingStory.phase).toBe('event');expect(pendingStory.encounter).toBe(0);
  await expect(page.getByRole('dialog')).toContainText('The voice beneath the stones');
  await expect(page.locator('[data-event-choice="shrine-learn"]')).toContainText('Lightning Bolt');
  await page.reload();await page.waitForFunction(()=>window.getGameState);
  expect((await snapshot(page)).travelEvent).toEqual(pendingStory.travelEvent);
  expect((await snapshot(page)).player).toEqual(pendingStory.player);
  await expect(page.getByRole('dialog')).toContainText('The voice beneath the stones');
  await page.locator('[data-event-choice="shrine-learn"]').click();s=await snapshot(page);
  expect(s.encounter).toBe(1);expect(s.dice.some(d=>d.skill==='lightning')).toBe(true);expect(s.journey).toHaveLength(1);
  expect(s.journey[0].id).toBe('shrine-learn');
  await page.reload();await page.waitForFunction(()=>window.getGameState);
  expect((await snapshot(page)).journey).toEqual(s.journey);
  await page.locator('[data-open="journal"]').first().click();await expect(page.getByRole('dialog')).toContainText('Listen to the ancient spell');await close(page);
  await finishCampaign(page);
  await expect(page.getByRole('dialog')).toContainText('An era worth saving');s=await snapshot(page);expect(s.stats.battles).toBe(3);expect(s.phase).toBe('victory');expect(s.difficulty).toBe('standard');expect(s.journey).toHaveLength(2);expect(s.tokens.every(t=>t.collected)).toBe(true);
  await page.reload();await page.waitForFunction(()=>window.getGameState);await expect(page.getByRole('dialog')).toContainText('An era worth saving');
  await page.locator('.modal [data-open="new-game"]').click();await page.locator('#character-name').fill('QA Nord');await page.locator('#character-race').selectOption('Nord');await page.locator('#character-class').selectOption('Nightblade');await page.locator('#new-game-form button[type="submit"]').click();
  s=await snapshot(page);expect(s.player.name).toBe('QA Nord');expect(s.player.race).toBe('Nord');expect(s.player.className).toBe('Nightblade');expect(s.round).toBe(1);expect(s.encounter).toBe(0);
  await page.reload();await page.waitForFunction(()=>window.getGameState);expect((await snapshot(page)).player.name).toBe('QA Nord');expect(errors).toEqual([]);
});

test('mobile: no overflow, actual board movement, panels and combat',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await openBattle(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'scratch/v4-mobile.png',fullPage:true});
  await clickHex(page,0,1);await expect.poll(async()=>(await snapshot(page)).player.r).toBe(1);
  for(const type of ['help','journal','settings']){await page.locator(`[data-open="${type}"]`).first().click();await expect(page.getByRole('dialog')).toBeVisible();await close(page)}
  await page.locator('nav [data-open="character"]').click();await page.locator('.modal [data-open="inventory"]').click();await expect(page.getByRole('dialog')).toContainText('belongings');await close(page);
  await page.locator('[data-target="raider"]').click();await page.locator('[data-die="die-0"]').click();await roll(page);
  await endTurn(page);expect((await snapshot(page)).round).toBe(2);expect(errors).toEqual([]);
  await context.close();
});


test('defeat offers a checkpoint retry that restores encounter supplies',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await openBattle(page);
  const initial=await snapshot(page);await endTurn(page);await usePotion(page);
  expect((await snapshot(page)).player.potions).toBe(initial.player.potions-1);
  for(let turn=0;turn<6&&(await snapshot(page)).phase==='combat';turn++)await endTurn(page);
  await expect(page.getByRole('dialog')).toContainText('Even heroes fall');
  await page.locator('[data-game="retry"]').click();await ready(page);
  const state=await snapshot(page);expect(state.phase).toBe('combat');expect(state.round).toBe(1);expect(state.player.potions).toBe(initial.player.potions);expect(state.player.health).toBe(initial.player.health);expect(state.enemies).toEqual(initial.enemies);
  await expect(page.getByRole('dialog')).toHaveCount(0);await page.reload();await page.waitForFunction(()=>window.getGameState);expect((await snapshot(page)).round).toBe(1);
});

test('backup export and restore preserve progress and reject invalid files',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await openBattle(page);
  await clickHex(page,0,1);const expected=await snapshot(page);
  await page.locator('[data-open="settings"]').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export-save"]').click();const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('betrayal-adventure.json');const file=await download.path();
  await close(page);await endTurn(page);expect((await snapshot(page)).round).toBe(2);
  await page.locator('[data-open="settings"]').click();await page.locator('#save-upload').setInputFiles(file);
  await expect.poll(async()=>(await snapshot(page)).round).toBe(1);expect((await snapshot(page)).player).toEqual(expected.player);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-open="settings"]').click();const restoredSave=await page.evaluate(()=>localStorage.getItem('betrayal-board-save-v1'));
  await page.locator('#save-upload').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(page.locator('#toast')).toContainText('valid adventure backup');expect((await snapshot(page)).player).toEqual(expected.player);
  await page.locator('#save-upload').setInputFiles({name:'invalid-state.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,state:{}}))});
  await expect(page.locator('#toast')).toContainText('could not be read');
  expect(await page.evaluate(()=>localStorage.getItem('betrayal-board-save-v1'))).toBe(restoredSave);expect((await snapshot(page)).player).toEqual(expected.player);
});

test('an upgraded reward restored from storage can continue to travel',async({page})=>{
  await openBattle(page);await page.locator('[data-mode="attack"]').click();
  // Model a browser closing after the persisted upgrade, before its next action.
  await page.evaluate(()=>{
    const key='betrayal-board-save-v1',saved=JSON.parse(localStorage.getItem(key));
    saved.state.phase='reward';saved.state.pendingUpgrade=false;saved.state.reward={xp:2,gold:30,title:'Encounter complete',upgrade:'health'};
    saved.state.enemies.forEach(enemy=>enemy.health=0);localStorage.setItem(key,JSON.stringify(saved));
  });
  await page.reload();await page.waitForFunction(()=>window.getGameState);
  await expect(page.getByRole('dialog')).toContainText('Your legend grows');
  await page.locator('[data-game="next"]').click();await expect.poll(async()=>(await snapshot(page)).phase).toBe('travel');
  await expect(page.getByRole('dialog')).toContainText('A moment between battles');
});


test('character creation applies difficulty, heritage portraits and class previews',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await openBattle(page);
  const standard=await snapshot(page);expect(standard.difficulty).toBe('standard');expect(standard.maxRounds).toBe(5);
  let adventureStarted=false;
  for(const config of [
    {race:'Nord',className:'Dragonknight',difficulty:'story',portrait:'portrait-nord.jpg',ability:'Obsidian Shield',health:14,stamina:4,magicka:3,rounds:7,enemyHealth:5,enemyAttack:1},
    {race:'Breton',className:'Nightblade',difficulty:'veteran',portrait:'portrait-breton.jpg',ability:'Siphoning Strike',health:12,stamina:3,magicka:4,rounds:5,enemyHealth:7,enemyAttack:3}
  ]){
    await page.locator('nav [data-open="character"]').click();await page.locator('.modal [data-open="new-game"]').click();
    await expect(page.locator(`input[name="difficulty"][value="${adventureStarted?'standard':'story'}"]`)).toBeChecked();
    await page.locator('#character-race').selectOption(config.race);await page.locator('#character-class').selectOption(config.className);
    await expect(page.locator('#creation-preview img')).toHaveAttribute('src',`/assets/${config.portrait}`);
    await expect(page.locator('#creation-preview')).toContainText(config.ability);
    await expect(page.locator('#creation-preview')).toContainText(`${config.health} health`);
    await page.locator('#character-name').fill(`QA ${config.race}`);
    await page.locator(`input[name="difficulty"][value="${config.difficulty}"]`).check();
    await page.locator('#new-game-form button[type="submit"]').click();
    adventureStarted=true;
    let state=await snapshot(page);expect(state.difficulty).toBe(config.difficulty);expect(state.maxRounds).toBe(config.rounds);
    expect(state.player).toMatchObject({race:config.race,className:config.className,health:config.health,stamina:config.stamina,magicka:config.magicka});
    expect(state.enemies[0]).toMatchObject({health:config.enemyHealth,attack:config.enemyAttack});
    await expect(page.locator('.portrait')).toHaveAttribute('src',`/assets/${config.portrait}`);
    await expect.poll(()=>page.locator('.portrait').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(page.locator('.solo-status')).toContainText(config.difficulty.toUpperCase());
    await page.reload();await page.waitForFunction(()=>window.getGameState);state=await snapshot(page);
    expect(state.difficulty).toBe(config.difficulty);expect(state.player.race).toBe(config.race);
    await expect(page.locator('.portrait')).toHaveAttribute('src',`/assets/${config.portrait}`);
  }
});

test('keyboard board inspection, targeting, chest pickup, cover and hazard remain playable after reload',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await openBattle(page);
  const board=page.locator('#board-canvas'),inspector=page.locator('#board-inspector');
  await board.focus();await expect(inspector).toContainText('Your position');await expect(inspector).toContainText('+0, +2');
  await page.keyboard.press('ArrowUp');await expect(inspector).toContainText('+0, +1');
  await page.keyboard.press('Enter');expect((await snapshot(page)).player).toMatchObject({q:0,r:1});
  await page.keyboard.press('ArrowUp');await expect(inspector).toContainText('Iron Raider');
  await page.keyboard.press(' ');expect((await snapshot(page)).targetId).toBe('raider');expect((await snapshot(page)).mode).toBe('attack');
  await page.keyboard.press('1');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
  await expect(inspector).toContainText('Abandoned strongbox');await expect(inspector).toContainText('15 gold');await expect(inspector).toContainText('Cover absorbs 1');
  await page.keyboard.press('Enter');let state=await snapshot(page);
  expect(state.player).toMatchObject({q:-2,r:1,gold:15,cover:true});expect(state.tokens[0].collected).toBe(true);
  await expect(page.locator('[data-game="undo-move"]')).toBeDisabled();
  await expect(page.locator('#mission-progress')).toContainText('Supplies recovered');
  await page.reload();await page.waitForFunction(()=>window.getGameState);state=await snapshot(page);
  expect(state.player.gold).toBe(15);expect(state.tokens[0].collected).toBe(true);expect(state.player.cover).toBe(true);
  const beforeTurn=state;expect(beforeTurn.enemyIntents.some(intent=>intent.coverBlocked===1)).toBe(true);
  await endTurn(page);state=await snapshot(page);expect(state.player.health).toBe(beforeTurn.player.health-beforeTurn.incomingDamage);
  await board.focus();await page.keyboard.press('ArrowDown');await expect(inspector).toContainText('Unstable ground');await expect(inspector).toContainText('costs 1 health');
  await page.keyboard.press('Enter');const afterHazard=await snapshot(page);
  expect(afterHazard.player).toMatchObject({q:-2,r:2,health:state.player.health-1,cover:false});
  await expect(page.locator('[data-game="undo-move"]')).toBeDisabled();
  // One more move returns to the empty chest hex without paying its reward twice.
  await page.keyboard.press('ArrowUp');await expect(inspector).toContainText('Stone cover');await page.keyboard.press('Enter');
  expect((await snapshot(page)).player.gold).toBe(15);
});

test('first-run quick play teaches a real ranged engagement and resumes its save',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});
  await page.addInitScript(()=>{Math.random=()=>.1});
  await page.goto('/');await page.waitForFunction(()=>window.getGameState);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-action="quick-start"]')).toBeVisible();
  await page.locator('[data-action="quick-start"]').click();
  let state=await snapshot(page);expect(state.difficulty).toBe('story');expect(state.maxRounds).toBe(7);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#first-turn-guide [data-coach-action="prepare"]')).toBeVisible();
  await page.locator('#first-turn-guide [data-coach-action="prepare"]').click();
  state=await snapshot(page);expect(state.canRoll).toBe(true);expect(state.selectedCount).toBeGreaterThan(0);
  expect(state.dice.filter(d=>d.selected).every(d=>d.type==='magic')).toBe(true);
  await page.locator('#first-turn-guide [data-coach-action="roll"]').click();
  await expect.poll(async()=>(await snapshot(page)).stats.rolls).toBe(1);await ready(page);
  state=await snapshot(page);expect(state.enemies.find(e=>e.id==='raider').health).toBeLessThan(5);
  expect(state.cooldownQueue.length).toBeGreaterThan(0);
  await page.reload();await page.waitForFunction(()=>window.getGameState);
  await expect(page.locator('[data-action="quick-start"]')).toHaveCount(0);
  expect((await snapshot(page)).player).toEqual(state.player);expect((await snapshot(page)).stats).toEqual(state.stats);
});

test('ordinary movement can be undone after reload and guarded end turn preserves canceled actions',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await openBattle(page);
  const initial=await snapshot(page),board=page.locator('#board-canvas');
  await expect(page.locator('[data-game="undo-move"]')).toBeDisabled();
  await page.locator('[data-game="end-turn"]').click();
  await expect(page.locator('[data-action="confirm-end-turn"]')).toBeVisible();
  expect((await snapshot(page)).round).toBe(initial.round);expect((await snapshot(page)).player).toEqual(initial.player);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await board.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  expect((await snapshot(page)).player.r).toBe(1);expect((await snapshot(page)).canUndoMove).toBe(true);
  await expect(page.locator('[data-game="undo-move"]')).toBeEnabled();
  await page.reload();await page.waitForFunction(()=>window.getGameState);
  await page.locator('[data-game="undo-move"]').click();
  let state=await snapshot(page);expect(state.player.q).toBe(initial.player.q);expect(state.player.r).toBe(initial.player.r);expect(state.moved).toBe(false);expect(state.canUndoMove).toBe(false);
  await page.locator('[data-die="die-2"]').click();const selected=await snapshot(page);
  await page.locator('[data-game="end-turn"]').click();await expect(page.locator('[data-action="confirm-end-turn"]')).toBeVisible();
  await page.keyboard.press('Escape');state=await snapshot(page);expect(state.round).toBe(1);expect(state.selectedCount).toBe(1);expect(state.player).toEqual(selected.player);
  await endTurn(page);state=await snapshot(page);expect(state.round).toBe(2);expect(state.selectedCount).toBe(0);expect(state.stats.rolls).toBe(0);
});

test('mobile shows combat resources, scrolls across the board and survives WebGL loss',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await openBattle(page);
  await expect(page.locator('#mobile-battle-status')).toBeVisible();
  await expect(page.locator('#mobile-resource-status')).toContainText('Tenacity');
  await expect(page.locator('#mobile-battle-status')).toContainText('Guard');
  await expect(page.locator('#mobile-resource-status')).toContainText('Fatigue');
  await expect(page.locator('#incoming-preview')).toBeVisible();
  for(const selector of ['.quick-potion','.ability-button']){
    const size=await page.locator(selector).boundingBox();expect(size.height,`${selector} touch height`).toBeGreaterThanOrEqual(44);
  }
  const before=await snapshot(page);await page.locator('#board-canvas').scrollIntoViewIfNeeded();
  const box=await page.locator('#board-canvas').boundingBox(),start={x:box.x+box.width*.5,y:box.y+box.height*.75};
  const scrollBefore=await page.evaluate(()=>scrollY),cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x,y:start.y-i*25}]});await page.waitForTimeout(30)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(scrollBefore+50);
  expect((await snapshot(page)).player).toEqual(before.player);expect((await snapshot(page)).round).toBe(before.round);
  await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const lost=await page.evaluate(()=>{
    const gl=document.querySelector('#board-canvas').getContext('webgl2'),extension=gl?.getExtension('WEBGL_lose_context');
    if(!extension)return false;extension.loseContext();return true;
  });
  expect(lost).toBe(true);await expect(page.locator('#fallback-board')).toBeVisible();await expect(page.locator('#board-canvas')).toBeHidden();
  expect((await snapshot(page)).player).toEqual(before.player);
  await page.locator('[data-hex="0,2"]').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  expect((await snapshot(page)).player).toMatchObject({q:0,r:1});expect(await page.evaluate(()=>document.activeElement.dataset.hex)).toBe('0,1');
  expect(errors).toEqual([]);await context.close();
});
