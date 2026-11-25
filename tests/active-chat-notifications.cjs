const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const source=fs.readFileSync(path.join(__dirname,'../3cx-slack-avatars.user.js'),'utf8').replace(/\r\n/g,'\n');
const start=source.lastIndexOf('  applyPreferences();\n  ensureControls();');assert(start>0);
const fixtureSource=source.slice(0,start)+`
 const realPlay=playCustomNotification;
 window.api={
  init(){initializeActiveChatNotifications();suppressAnimationsUntil=0;},
  spy(){playCustomNotification=options=>window.sounds.push(options);},
  controls:ensureControls,scan:scanActiveChatNotifications,
  suppress(){suppressAnimationsUntil=performance.now()+1200;},
  volume(value){preferences.notificationVolume=value;},
  audioTest(){customNotificationSound={url:'fixture.wav',volume:1};preferences.notificationSound=true;
    ensureNotificationAudioContext=()=>null;lastNotificationAt=-Infinity;
    prepareNotificationAudio=()=>new Promise(resolve=>window.resolveAudio=()=>resolve({pause(){},play(){window.audioPlays++;return Promise.resolve();},currentTime:0}));},
  play(options){realPlay(options);},
 };
})();`;
const html=`<html><body>
 <app-header><wc-account-menu><app-avatar><img alt="54"></app-avatar></wc-account-menu></app-header>
 <chat-component><app-chat-messages><chat-messages-header><h5 data-qa="chat-name">Contact 52</h5></chat-messages-header>
 <div class="chat-massages-main"><div class="scrollable" id="messages"></div></div>
 <app-chat-message-input><textarea></textarea></app-chat-message-input></app-chat-messages></chat-component></body></html>`;
let passed=0;const check=(value,label)=>{assert(value,label);passed++;};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const make=async(permission='granted')=>{
   const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
   await page.goto('https://decindustrie.3cx.no:5001/fixture#/chat/21');
   await page.evaluate(permission=>{
    window.focused=false;window.hidden=true;window.sounds=[];window.notices=[];window.permissionCalls=0;window.audioPlays=0;window.focusCalls=0;
    localStorage.setItem('decSlackActiveChatDesktopNotifications','false');
    Object.defineProperty(document,'hidden',{get:()=>window.hidden});document.hasFocus=()=>window.focused;
    window.requestAnimationFrame=()=>0;window.focus=()=>window.focusCalls++;
    window.Notification=class{static permission=permission;static async requestPermission(){window.permissionCalls++;return this.permission='granted';}
     constructor(title,options){this.title=title;this.options=options;this.closed=false;window.notices.push(this);}close(){this.closed=true;this.onclose?.();}};
    window.addMessage=(text,own=false,prepend=false)=>{
     const message=document.createElement('chat-message');
     message.innerHTML='<div class="message-align'+(own?' sent-by-me':'')+'"><app-chat-message-text></app-chat-message-text><div class="message-data"><small title="Aujourd\'hui">09:42</small></div></div>';
     message.querySelector('app-chat-message-text').textContent=text;
     const list=document.getElementById('messages');prepend?list.prepend(message):list.append(message);return message;
    };
    window.addMessage('Historique');
   },permission);
   await page.evaluate(fixtureSource);await page.evaluate(()=>{api.spy();api.init();});return page;
  };
  const settle=async page=>{await page.waitForTimeout(25);};
  const page=await make();
  check(await page.evaluate(()=>sounds.length===0&&notices.length===0),'Initial history is silent even in a hidden tab');
  await page.evaluate(()=>addMessage('Message en arrière-plan'));await settle(page);
  check(await page.evaluate(()=>sounds.length===1&&notices.length===1),'Hidden active conversation gets sound and desktop notice without animation frames');
  check(await page.evaluate(()=>sounds[0].onlyWhenAway&&notices[0].options.silent&&notices[0].options.tag==='dec-3cx-open-chat-21'),'Chosen sound controls audio; desktop alert adds no second system sound');
  await page.evaluate(()=>{hidden=false;focused=false;addMessage('Autre fenêtre');});await settle(page);
  check(await page.evaluate(()=>sounds.length===2&&notices.length===2),'Visible page in an unfocused window still alerts');
  await page.evaluate(()=>{focused=true;addMessage('Au premier plan');});await settle(page);
  check(await page.evaluate(()=>sounds.length===2&&notices.length===2),'Focused page gets neither sound nor desktop notice');
  await page.evaluate(()=>{focused=false;dispatchEvent(new Event('blur'));});await settle(page);
  check(await page.evaluate(()=>sounds.length===2),'Losing focus does not replay a message already seen');
  await page.evaluate(()=>addMessage('Mon propre message',true));await settle(page);
  check(await page.evaluate(()=>sounds.length===2),'Outgoing messages never alert');
  await page.evaluate(()=>addMessage('Ancien message',false,true));await settle(page);
  check(await page.evaluate(()=>sounds.length===2),'Prepending older history never alerts');
  await page.evaluate(()=>{
   const receipt=document.createElement('delivered-check');document.querySelector('chat-message').append(receipt);
   document.querySelector('chat-message app-chat-message-text').textContent='Historique modifié';
  });await settle(page);
  check(await page.evaluate(()=>sounds.length===2),'Receipt updates and message edits never alert');
  await page.evaluate(()=>{const list=document.getElementById('messages');list.replaceChildren(...[...list.children].map(node=>node.cloneNode(true)));});await settle(page);
  check(await page.evaluate(()=>sounds.length===2),'Recreating an unchanged message list does not replay notices');
  await page.evaluate(()=>{
   const list=document.getElementById('messages');list.replaceChildren(...[...list.children].map(node=>node.cloneNode(true)));addMessage('Nouveau après reconstruction');
  });await settle(page);
  check(await page.evaluate(()=>sounds.length===3),'Incoming message after DOM recreation is detected');
  await page.evaluate(()=>addMessage('Identique'));await settle(page);
  await page.evaluate(()=>addMessage('Identique'));await settle(page);
  check(await page.evaluate(()=>sounds.length===5),'Two identical messages in the same minute are distinct arrivals');
  await page.evaluate(()=>{localStorage.setItem('decSlackActiveChatDesktopNotifications','false');addMessage('Toujours actif');});await settle(page);
  check(await page.evaluate(()=>sounds.length===6&&notices.length===6),'Old opt-out setting cannot disable desktop notifications');
  await page.evaluate(()=>{focused=true;dispatchEvent(new Event('focus'));});
  check(await page.evaluate(()=>notices.every(notice=>notice.closed)),'Returning to 3CX closes its active-chat desktop notices');
  await page.evaluate(()=>{focused=false;api.suppress();addMessage('Chargement après navigation');});await settle(page);
  check(await page.evaluate(()=>sounds.length===6),'Initial route-settling window remains silent');
  await page.evaluate(()=>{location.hash='#/chat/99';document.querySelector('[data-qa="chat-name"]').textContent='Groupe';document.getElementById('messages').replaceChildren();addMessage('Historique du groupe');});await settle(page);
  check(await page.evaluate(()=>sounds.length===6),'Switching chats does not notify for the new history');
  await page.evaluate(()=>{api.init();}); // Conserver l'observateur unique, finir la période de chargement.
  await page.evaluate(()=>addMessage('Premier nouveau du groupe'));await settle(page);
  check(await page.evaluate(()=>sounds.length===7&&notices.at(-1).options.tag==='dec-3cx-open-chat-99'),'Group conversations also get background alerts');
  await page.evaluate(()=>{location.hash='#/people';});await settle(page);
  await page.evaluate(()=>addMessage('Ancienne vue encore dans le DOM'));await settle(page);
  check(await page.evaluate(()=>sounds.length===7),'A stale conversation outside the chat route cannot alert');
  await page.evaluate(()=>notices.at(-1).onclick({preventDefault(){}}));await settle(page);
  check(await page.evaluate(()=>location.hash==='#/chat/99'&&focusCalls===1&&notices.at(-1).closed),'Clicking a notice focuses 3CX and returns to the correct chat');
  const hydrate=await make();
  await hydrate.evaluate(()=>{document.getElementById('messages').replaceChildren();location.hash='#/chat/55';});await settle(hydrate);
  await hydrate.evaluate(()=>{const message=document.createElement('chat-message');message.id='pending';document.getElementById('messages').append(message);});await settle(hydrate);
  await hydrate.evaluate(()=>{document.getElementById('pending').innerHTML='<div class="message-align"><app-chat-message-text>Historique chargé</app-chat-message-text><div class="message-data"><small title="Aujourd\'hui">09:41</small></div></div>';});await settle(hydrate);
  check(await hydrate.evaluate(()=>sounds.length===0),'An initially empty chat can hydrate incrementally without a false notice');
  await hydrate.evaluate(()=>{api.init();addMessage('Message après hydratation');});await settle(hydrate);
  check(await hydrate.evaluate(()=>sounds.length===1),'New arrivals work after incremental hydration');
  const permission=await make('default');await permission.evaluate(()=>{api.controls();addMessage('Pas encore autorisé');});await settle(permission);
  check(await permission.evaluate(()=>sounds.length===1&&notices.length===0&&permissionCalls===0),'Missing permission keeps sound and never opens an unsolicited permission prompt');
  await permission.locator('[data-dec-control="sound"]').click();
  await permission.getByRole('button',{name:'Autoriser les notifications du navigateur'}).click();
  check(await permission.evaluate(()=>permissionCalls===1&&Notification.permission==='granted'),'Desktop permission is requested only by the user control');
  await permission.evaluate(()=>addMessage('Autorisation accordée'));await settle(permission);
  check(await permission.evaluate(()=>notices.length===1),'Granted permission enables desktop alerts');
  check(await permission.getByRole('switch',{includeHidden:true}).count()===0 &&
    await permission.getByRole('button',{name:'Autoriser les notifications du navigateur',includeHidden:true}).count()===0,
    'Granted desktop notifications have no opt-out control');
  await permission.evaluate(()=>{api.volume(0);addMessage('Notification visuelle à volume nul');});await settle(permission);
  check(await permission.evaluate(()=>notices.length===2),'Zero volume does not disable desktop notifications');
  const denied=await make('denied');await denied.evaluate(()=>{api.controls();addMessage('Permission bloquée');});await settle(denied);
  check(await denied.getByText('Notifications bloquées dans les réglages du site.',{exact:true}).count()===1 &&
    await denied.getByRole('switch',{includeHidden:true}).count()===0,'Denied permission shows status without a toggle');
  check(await denied.evaluate(()=>sounds.length===1&&notices.length===0),'Browser refusal does not prevent sound');
  const delayed=await make();await delayed.evaluate(()=>{api.audioTest();api.play({onlyWhenAway:true});focused=true;hidden=false;resolveAudio();});await settle(delayed);
  check(await delayed.evaluate(()=>audioPlays===0),'Returning before audio finishes loading cancels delayed playback');
  await delayed.evaluate(()=>{focused=false;api.audioTest();api.play({onlyWhenAway:true});resolveAudio();});await settle(delayed);
  check(await delayed.evaluate(()=>audioPlays===1),'Sound actually plays when the page stays unfocused');
  await delayed.evaluate(()=>{focused=true;hidden=false;api.audioTest();api.play({preview:true});resolveAudio();});await settle(delayed);
  check(await delayed.evaluate(()=>audioPlays===2),'Explicit sound preview still works while focused');
  console.log(`${passed} active conversation notification checks passed`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
