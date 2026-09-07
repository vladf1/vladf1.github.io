import { test, expect, type Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => (window as any).__astra.snapshot());
async function route(page: Page, until: (s: any) => boolean, maxMoves = 200) {
  const key: Record<string,string> = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
  for (let i=0;i<maxMoves;i++) {
    const s=await snapshot(page); if(until(s)) return s;
    expect(s.phase, JSON.stringify(s)).toBe('playing');
    const next=await page.evaluate(()=>{
      const g=(window as any).__astra.game, target=g.bonus??g.food;
      const dirs={up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
      const occupied=new Set(g.body.slice(0,-1).map((c:any)=>c.y*20+c.x));
      const q=[{...g.body[0],first:''}], visited=new Set([g.body[0].y*20+g.body[0].x]);
      for(let i=0;i<q.length;i++){
        const n=q[i]; if(n.x===target?.x&&n.y===target?.y) return n.first;
        for(const [direction,d] of Object.entries(dirs)){
          if(!n.first){const current=dirs[g.direction as keyof typeof dirs];if(current.x+d.x===0&&current.y+d.y===0)continue;}
          const x=n.x+d.x,y=n.y+d.y,id=y*20+x;
          if(x<0||x>=20||y<0||y>=20||occupied.has(id)||visited.has(id))continue;
          visited.add(id);q.push({x,y,first:n.first||direction});
        }
      }
      return null;
    });
    expect(next, 'reachable food route').toBeTruthy();
    await page.keyboard.press(key[next!]);
    await page.waitForFunction(head=>{const g=(window as any).__astra.game;return g.phase!=='playing'||g.body[0].x!==head.x||g.body[0].y!==head.y;},s.body[0]);
  }
  throw new Error('Routing budget exhausted');
}

test('real keyboard routing: growth, combos, gold, speed, pause, collision, best and restart', async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/ai-slop/astra-snake/');await expect(page.getByRole('heading',{name:'One more bite.'})).toBeVisible();
  await page.getByRole('button',{name:"Let's play"}).click();
  await route(page,s=>s.score>=150&&s.level>=3&&s.body.length>=12,240);
  const playing=await snapshot(page);expect(playing.combo).toBeGreaterThan(1);
  expect(await page.evaluate(()=>(window as any).__astra.game.bonusEaten)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'On pause.'})).toBeVisible();
  const paused=await snapshot(page);await page.waitForTimeout(450);expect(await snapshot(page)).toEqual(paused);
  await page.getByRole('button',{name:'Keep going'}).click();
  await page.evaluate(()=>{const g=(window as any).__astra.game;g.body=[{x:19,y:4},{x:18,y:4},{x:17,y:4},{x:16,y:4}];g.previous=g.body.map((c:any)=>({...c}));g.direction='right';g.queue=[];g.moveClock=0;});
  await expect(page.getByRole('heading',{name:'Look at you.'})).toBeVisible();
  expect((await snapshot(page)).best.normal).toBe(playing.score);
  await page.screenshot({path:'test-results/desktop-result.png'});
  await page.keyboard.press('r');await expect(page.locator('#app')).toHaveAttribute('data-screen','playing');
  const fresh=await snapshot(page);expect(fresh.score).toBe(0);expect(fresh.body.length).toBe(4);expect(fresh.bonus).toBe(null);expect(fresh.queue).toEqual([]);
  await page.keyboard.press('p');await page.getByRole('button',{name:'Back to menu'}).click();
  await page.getByRole('button',{name:'Frenzy',exact:true}).click();
  await page.getByRole('button',{name:'Mute sound',exact:true}).click();
  await page.reload();await expect(page.getByRole('button',{name:'Frenzy',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Enable sound',exact:true})).toBeVisible();
  expect((await snapshot(page)).best.normal).toBe(playing.score);expect((await snapshot(page)).best.frenzy).toBe(0);
  expect(errors).toEqual([]);
});

test('rapid turns, bonus expiration, background pause, and resizing',async({page})=>{
  await page.goto('/ai-slop/astra-snake/');await page.getByRole('button',{name:"Let's play"}).click();
  await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>{const g=(window as any).__astra.game;return g.body[0].y===9&&g.body[0].x<7;});await page.keyboard.press('Escape');
  const s=await snapshot(page);expect(s.body[0].y).toBe(9);expect(s.body[0].x).toBeLessThan(7);
  await page.getByRole('button',{name:'Keep going'}).click();
  await page.evaluate(()=>{const g=(window as any).__astra.game;g.bonus={x:19,y:19,remaining:.25};});
  await expect(page.locator('#bonus-status')).toBeVisible();await page.waitForTimeout(350);expect((await snapshot(page)).bonus).toBe(null);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect((await snapshot(page)).phase).toBe('paused');
  await page.evaluate(()=>{(window as any).__astra.game.bonus={x:19,y:19,remaining:2};});
  await page.waitForFunction(()=>(window as any).__astra.view.goldTimer.geometry.drawRange.count===480);
  // With 25% of its life left, the visible countdown is a quarter-circle.
  expect(await page.evaluate(()=>{
    const geometry=(window as any).__astra.view.goldTimer.geometry,position=geometry.getAttribute('position');
    for(let i=0;i<geometry.drawRange.count;i++){const vertex=geometry.index.array[i];if(position.getX(vertex)<-.0001||position.getY(vertex)<-.0001)return false;}
    return true;
  })).toBe(true);
  for(const [width,height] of [[1440,900],[768,1024],[844,390],[360,640]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const canvas=await page.locator('canvas').boundingBox();expect(canvas!.width).toBeGreaterThan(200);expect(canvas!.height).toBeGreaterThan(170);
    const button=await page.getByRole('button',{name:'Keep going'}).boundingBox();expect(button!.y+button!.height).toBeLessThan(height);
  }
});

test('mobile title, touch pad, swipe, and reduced motion',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();await page.goto('/ai-slop/astra-snake/');
  await page.screenshot({path:'test-results/mobile-title.png'});
  const start=page.getByRole('button',{name:"Let's play"});await start.tap();
  await page.getByRole('button',{name:'Move up',exact:true}).tap();
  await page.getByRole('button',{name:'Move left',exact:true}).tap();
  await page.waitForTimeout(370);await page.getByRole('button',{name:'Pause game',exact:true}).tap();
  const s=await snapshot(page);expect(s.body[0].y).toBe(9);expect(s.body[0].x).toBeLessThan(7);
  await page.screenshot({path:'test-results/mobile-pause.png'});
  await page.getByRole('button',{name:'Keep going'}).tap();
  const cdp=await context.newCDPSession(page);
  const rect=await page.locator('#arena').boundingBox();const x=rect!.x+rect!.width/2,y=rect!.y+rect!.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+50}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(180);await page.getByRole('button',{name:'Pause game',exact:true}).tap();
  expect((await snapshot(page)).body[0].y).toBeGreaterThan(9);
  expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  await context.close();
});

test.describe('high-DPI performance',()=>{
test.use({deviceScaleFactor:2,viewport:{width:1440,height:900}});
test('long snake and saturated effects stay bounded',async({page})=>{
  await page.goto('/ai-slop/astra-snake/');await page.getByRole('button',{name:"Let's play"}).click();
  await page.evaluate(()=>{
    const a=(window as any).__astra,g=a.game;const route:any[]=[];
    for(let x=0;x<20;x++)route.push({x,y:0});
    for(let y=1;y<20;y++){if(y%2)for(let x=19;x>=1;x--)route.push({x,y});else for(let x=1;x<20;x++)route.push({x,y});}
    for(let y=19;y>=1;y--)route.push({x:0,y});
    let idx=300;g.body=Array.from({length:300},(_,i)=>({...route[(idx-i+400)%400]}));g.previous=g.body.map((c:any)=>({...c}));g.food=null;g.bonus=null;g.queue=[];g.moveClock=0;
    const steer=()=>{const head=g.body[0];idx=route.findIndex((c:any)=>c.x===head.x&&c.y===head.y);const next=route[(idx+1)%400];g.direction=next.x>head.x?'right':next.x<head.x?'left':next.y>head.y?'down':'up';};
    steer();const original=g.move.bind(g);g.move=()=>{steer();original();};
    (window as any).__stress=setInterval(()=>a.view.burst({x:9,y:9},0xffc566,2),60);a.resetPerformance();
  });
  await page.waitForTimeout(6000);
  const stats=await page.evaluate(()=>(window as any).__astra.performance());
  console.log('300-cell performance',JSON.stringify(stats));expect(stats.particles).toBeLessThanOrEqual(200);expect(stats.calls).toBeLessThan(70);expect((await snapshot(page)).phase).toBe('playing');
  await page.screenshot({path:'test-results/long-snake.png'});
  await page.evaluate(()=>{
    clearInterval((window as any).__stress);
    const g=(window as any).__astra.game,head=g.body[0],neck=g.body[1];
    g.direction=neck.x>head.x?'right':neck.x<head.x?'left':neck.y>head.y?'down':'up';g.queue=[];
    Object.getPrototypeOf(g).move.call(g);
  });
  await page.waitForFunction(()=>(window as any).__astra.view.stats.debris===160);
  expect(await page.evaluate(()=>(window as any).__astra.view.stats.calls)).toBeLessThan(70);
  expect(await page.evaluate(()=>(window as any).__astra.view.stats.particles)).toBeLessThanOrEqual(200);
  await page.waitForFunction(()=>{const v=(window as any).__astra.view;return v.stats.debris>0&&v.debrisMesh.material.opacity<.6;});
  await page.waitForFunction(()=>(window as any).__astra.view.stats.debris===0);
});
});

test('storage denial is harmless, audio starts on gesture, and settings stay operable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage denied');}});
    const Original=window.AudioContext;
    (window as any).__contexts=[];
    window.AudioContext=class extends Original{constructor(...args:any[]){super(...args);(window as any).__contexts.push(this);}};
  });
  await page.goto('/ai-slop/astra-snake/');await expect(page.getByRole('button',{name:"Let's play"})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__contexts.length)).toBe(0);
  await page.getByRole('button',{name:'Chill',exact:true}).click();
  await page.getByRole('button',{name:'Turn off flashes and camera shake'}).click();
  await page.getByRole('button',{name:"Let's play"}).click();
  await page.waitForFunction(()=>(window as any).__contexts[0]?.state==='running');
  await expect(page.locator('#score')).toHaveText('010');
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).body.length).toBe(5);expect((await snapshot(page)).mode).toBe('chill');
  expect(errors).toEqual([]);
});

test('whole-body death explosion, collision variants, restart cleanup, and reduced motion', async({page})=>{
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/ai-slop/astra-snake/'); await page.getByRole('button',{name:"Let's play"}).click();
  await page.evaluate(()=>{
    const g=(window as any).__astra.game;
    g.body=Array.from({length:18},(_,i)=>({x:19-i,y:10}));
    g.previous=g.body.map((c:any)=>({...c}));g.direction='right';g.queue=[];g.food=null;g.moveClock=0;
  });
  await page.waitForFunction(()=>{
    const a=(window as any).__astra;return a.game.phase==='dying'&&a.view.stats.debris>0;
  });
  const explosion=await page.evaluate(()=>{
    const v=(window as any).__astra.view;
    const xs=v.debris.map((p:any)=>p.position.x);
    return {count:v.stats.debris,span:Math.max(...xs)-Math.min(...xs),body:v.snake.visible,head:v.head.visible,shadow:v.shadow.visible};
  });
  expect(explosion.count).toBeGreaterThan(24);expect(explosion.count).toBeLessThanOrEqual(160);
  expect(explosion.span).toBeGreaterThan(14);
  expect([explosion.body,explosion.head,explosion.shadow]).toEqual([false,false,false]);
  await page.waitForTimeout(100);await page.screenshot({path:'test-results/death-explosion.png'});
  await expect(page.getByRole('button',{name:'Play again'})).toBeVisible();
  const behindDialog=await page.evaluate(()=>{
    const a=(window as any).__astra,v=a.view;return {phase:a.game.phase,count:v.stats.debris,position:v.debris[12].position.toArray()};
  });
  expect(behindDialog.phase).toBe('over');expect(behindDialog.count).toBeGreaterThan(0);
  await page.waitForTimeout(650);
  const aftermath=await page.evaluate(()=>{
    const a=(window as any).__astra,v=a.view;return {phase:a.game.phase,count:v.stats.debris,position:v.debris[12].position.toArray()};
  });
  expect(aftermath.phase).toBe('over');expect(aftermath.count).toBeGreaterThan(0);
  expect(aftermath.position).not.toEqual(behindDialog.position);
  await page.screenshot({path:'test-results/death-behind-dialog.png'});
  // Restart while the aftermath is still active; every old fragment is cleared.
  await page.keyboard.press('r');
  expect(await page.evaluate(()=>{
    const v=(window as any).__astra.view;return [v.snake.visible,v.head.visible,v.stats.debris,v.stats.particles];
  })).toEqual([true,true,0,0]);

  // Self-collision still explodes when optional flashes/shake are switched off.
  await page.evaluate(()=>{
    const a=(window as any).__astra,g=a.game;a.preferences.effects=false;a.configure();
    g.body=[{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2},{x:0,y:2}];
    g.previous=g.body.map((c:any)=>({...c}));g.direction='left';g.queue=[];g.moveClock=0;g.food=null;
  });
  await page.waitForFunction(()=>(window as any).__astra.game.phase==='dying');
  expect(await page.evaluate(()=>{const a=(window as any).__astra;return [a.view.stats.debris>0,a.view.cameraShake,a.game.reason];})).toEqual([true,0,'A little too close to yourself.']);
  await expect(page.getByRole('button',{name:'Play again'})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.keyboard.press('r');
  await page.evaluate(()=>{
    const g=(window as any).__astra.game;
    g.body=[{x:19,y:10},{x:18,y:10},{x:17,y:10},{x:16,y:10}];
    g.previous=g.body.map((c:any)=>({...c}));g.direction='right';g.queue=[];g.moveClock=0;g.food=null;
  });
  await page.waitForFunction(()=>(window as any).__astra.game.phase==='dying');
  expect(await page.evaluate(()=>{const v=(window as any).__astra.view;return [v.stats.debris,v.stats.particles,v.snake.visible,v.cameraShake];})).toEqual([0,0,false,0]);
  await expect(page.getByRole('button',{name:'Play again'})).toBeVisible();
  await page.getByRole('button',{name:'Back to menu'}).click();
  expect(await page.evaluate(()=>{const v=(window as any).__astra.view;return [v.snake.visible,v.head.visible,v.stats.debris];})).toEqual([true,true,0]);
  expect(errors).toEqual([]);
});
