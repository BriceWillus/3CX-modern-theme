const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const source=fs.readFileSync(path.join(__dirname,'../3cx-slack-avatars.user.js'),'utf8').replace(/\r\n/g,'\n');
const start=source.lastIndexOf('  applyPreferences();\n  ensureControls();');assert(start>0);
const testSource=source.slice(0,start)+`
 currentOwnProfile={extension:'54',name:'Neil Hilgenga'};
 window.typingTest={
  render(items){enhanceTypingIndicator(new Map(items));},
  profiles(items){return profilesFromTypingElements(nativeTypingElements(),new Map(items));},
  modern:enhanceModernChat,
 };})();`;
const profiles=[['52',{extension:'52',name:'Bob Martin',imageUrl:'',initials:'BM'}],['53',{extension:'53',name:'Léa Durand',imageUrl:'',initials:'LD'}],['54',{extension:'54',name:'Neil Hilgenga',imageUrl:'',initials:'NH'}],['55',{extension:'55',name:'',imageUrl:'https://decindustrie.3cx.no:5001/user_images/camille.png',initials:''}]];
const html=`<html class="dec-slack-ui-v2"><body>
 <app-header><wc-account-menu><app-avatar><img alt="54"></app-avatar></wc-account-menu></app-header>
 <chat-item class="selected"><a href="#/chat/10"><span data-qa="header-name">Équipe</span><small class="user-typing"></small></a></chat-item>
 <chat-item><a href="#/chat/20"><span data-qa="header-name">Autre groupe</span><small class="user-typing">Léa Durand 53 écrit…</small></a></chat-item>
 <chat-component><app-layout-type4><app-chat-messages>
 <chat-messages-header><div><app-avatar></app-avatar><h5 data-qa="chat-name">Équipe</h5><small data-qa="chat-description"></small></div></chat-messages-header>
 <div class="chat-massages-main"><div class="scrollable"><chat-message><div class="message-align"><app-chat-message-text>Historique</app-chat-message-text><div class="message-data"><small title="Aujourd'hui">09:42</small></div></div></chat-message></div></div>
 </app-chat-messages></app-layout-type4></chat-component></body></html>`;
let passed=0;const check=(value,label)=>{assert(value,label);passed++;};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});try{
  const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.goto('https://decindustrie.3cx.no:5001/fixture#/chat/10');
  await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../3cx-slack-stylish.css'),'utf8')});
  await page.evaluate(testSource);
  const render=async(text,items=profiles)=>{await page.evaluate(({text,items})=>{document.querySelector('[data-qa="chat-description"]').textContent=text;typingTest.render(items);},{text,items});};
  const ids=()=>page.locator('#dec-slack-typing-indicator .dec-slack-typing-avatar').evaluateAll(nodes=>nodes.map(node=>node.dataset.extension));
  await render('Bob Martin 52 écrit…');
  check(await page.locator('app-chat-participants').count()===0 && await page.locator('#dec-slack-typing-indicator').isVisible(),'Group typing works with the participant panel closed');
  check(JSON.stringify(await ids())==='["52"]','Typing participant gets the correct portrait');
  check(await page.locator('#dec-slack-typing-indicator .dec-slack-typing-dots i').count()===3,'Three animated typing dots remain present');
  check(await page.locator('[data-qa="chat-description"]').evaluate(el=>el.classList.contains('dec-slack-native-typing-hidden')),'Native header text is replaced by the custom indicator');
  await render('Léa Durand 53 et Bob Martin 52 écrivent…');
  check(JSON.stringify(await ids())==='["53","52"]','Multiple writers appear in the native text order');
  check((await page.locator('#dec-slack-typing-indicator').getAttribute('aria-label')).includes('Léa Durand, Bob Martin'),'Accessible label identifies multiple writers');
  await render('Camille 55 écrit…');
  check(JSON.stringify(await ids())==='["55"]' && (await page.locator('.dec-slack-typing-avatar').getAttribute('style')).includes('camille.png'),'An uncached name uses the known avatar matching the native extension');
  await render('Sandra écrit…');
  check((await ids()).length===1 && (await ids())[0].startsWith('typing:') && await page.locator('.dec-slack-typing-avatar').innerText()==='S','Unknown named participant gets initials without borrowing another profile');
  await render('Un participant écrit…');
  check((await ids()).length===0 && await page.locator('#dec-slack-typing-indicator').isVisible(),'Anonymous group activity still shows the typing dots');
  const homonyms=[['61',{extension:'61',name:'Alex Martin',initials:'AM'}],['62',{extension:'62',name:'Alex Dupont',initials:'AD'}]];
  await render('Alex écrit…',homonyms);
  check((await ids()).length===1 && !['61','62'].includes((await ids())[0]),'An ambiguous first name never borrows a named participant portrait');
  await render('Joanne écrit…',[['63',{extension:'63',name:'Ann',initials:'A'}]]);
  check(!(await ids()).includes('63'),'A short name cannot match part of another name');
  await render('Neil Hilgenga 54 écrit…');
  check(await page.locator('#dec-slack-typing-indicator').isHidden(),'The current user is excluded from the typing indicator');
  await render('Conversation de groupe');
  check(await page.locator('#dec-slack-typing-indicator').isHidden(),'Stopped group typing hides the reserved indicator');
  await page.evaluate(()=>{document.querySelector('chat-item.selected .user-typing').textContent='Bob Martin 52 écrit…';});
  await render('');
  check(JSON.stringify(await ids())==='["52"]','Typing can come from the active group entry in the sidebar');
  check(await page.locator('chat-item.selected .user-typing').evaluate(el=>!el.classList.contains('dec-slack-native-typing-hidden')),'Sidebar typing stays visible');
  await page.evaluate(()=>{document.querySelector('chat-item.selected .user-typing').textContent='';});
  await render('');
  check(await page.locator('#dec-slack-typing-indicator').isHidden(),'Typing in a different group does not leak into the active conversation');
  await page.evaluate(()=>{
   document.querySelector('[data-qa="chat-name"]').textContent='Qui écrit';
   document.querySelector('chat-item.selected [data-qa="header-name"]').textContent='Qui écrit';
  });await render('');
  check(await page.locator('#dec-slack-typing-indicator').isHidden(),'Group names containing typing words are not treated as activity');
  await page.evaluate(()=>{
   document.querySelector('[data-qa="chat-name"]').textContent='Projet 2026';
   document.querySelector('chat-item.selected [data-qa="header-name"]').textContent='Projet 2026';
  });await render('Bob Martin 52 écrit…');
  check(JSON.stringify(await ids())==='["52"]','A group name ending in a number is not mistaken for a private conversation');
  // Vérifier l'appel réel du rendu moderne, qui excluait auparavant les groupes.
  await page.evaluate(()=>{
   document.querySelector('[data-qa="chat-name"]').textContent='Équipe';
   document.querySelector('chat-item.selected [data-qa="header-name"]').textContent='Équipe';
   document.querySelector('[data-qa="chat-description"]').textContent='Bob Martin 52 écrit…';
   typingTest.modern();
  });
  check(await page.locator('#dec-slack-typing-indicator').isVisible(),'Modern chat enhancement no longer removes group typing when the pane is closed');
  await page.evaluate(()=>{
   document.querySelector('[data-qa="chat-name"]').textContent='Bob Martin 52';
   document.querySelector('chat-messages-header app-avatar').innerHTML='<img alt="52">';
  });await render('écrit…');
  check(JSON.stringify(await ids())==='["52"]','Private conversation typing still resolves its single interlocutor');
  console.log(`${passed} group typing checks passed`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
