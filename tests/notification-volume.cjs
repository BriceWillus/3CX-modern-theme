const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const source=fs.readFileSync(path.join(__dirname,'../3cx-slack-avatars.user.js'),'utf8').replace(/\r\n/g,'\n');
const start=source.lastIndexOf('  applyPreferences();\n  ensureControls();');assert(start>0);
// Signal PCM constant : le rendu hors ligne permet de mesurer l'amplification
// produite par le véritable graphe audio, sans son sur les haut-parleurs.
const wave=Buffer.alloc(44+1600);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);
wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);
wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(1600,40);
for(let n=0;n<800;n++)wave.writeInt16LE(Math.round(.2*32767),44+n*2);
const fixtureSource=source.slice(0,start)+`
 window.volumeApi={
  async ready(){
   for(let n=0;n<24;n++)customNotificationSounds.set('sound'+n,{id:'sound'+n,label:'Son '+n,url:window.fixtureConfig.direct?'https://audio.example.test/tone.wav':'/fixture.wav',volume:.5});
   customNotificationSound=customNotificationSounds.get('sound23');preferences.notificationSound=true;preferences.notificationSoundId='sound23';
   requestNotificationAudioSource=async()=>{if(window.fixtureConfig.direct)throw new Error('Fixture CORS fallback');
    const binary=atob(window.fixtureConfig.wave),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)).buffer;
    return {playbackUrl:'data:audio/wav;base64,'+window.fixtureConfig.wave,bytes:window.fixtureConfig.mode==='offline'?bytes:null};};
   ensureControls();await prepareNotificationAudio();
  },
  play(){playCustomNotification({preview:true});},
  percent(value){preferences.notificationVolume=normalizeNotificationVolume(value);applyNotificationVolume();},
  refresh:updateControls,
  clear:clearNotificationAudio,
  async render(){const buffer=await notificationAudioContext.startRendering();return Math.max(...buffer.getChannelData(0));},
 };})();`;
const html='<html><head><meta charset="utf-8"></head><body></body></html>';
let passed=0;const check=(value,label)=>{assert(value,label);passed++;};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const install=async(page,config)=>{
   await page.evaluate(config=>{
    window.fixtureConfig=config;window.starts=0;window.mediaNodes=[];window.gains=[];window.playbacks=[];window.pageErrors=[];
    window.Notification=class{static permission='granted';};
    if(config.firefox)Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 Firefox/145.0'});
    if(config.mode==='offline'){
     window.AudioContext=class extends OfflineAudioContext{
      constructor(){super(1,800,8000);}resume(){return Promise.resolve();}
      createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node);node.start=(...args)=>{window.starts++;return start(...args);};return node;}
     };
    }else{
     class Node{constructor(){this.connections=[];}connect(target){this.connections.push(target);}disconnect(){this.disconnected=true;}}
     window.AudioContext=config.mode==='media'?class{
      constructor(){this.destination=new Node();this.state='running';this.currentTime=0;}resume(){return Promise.resolve();}
      createGain(){const node=new Node();node.gain={value:1,setValueAtTime(value){this.value=value;}};window.gains.push(node);return node;}
      createMediaElementSource(audio){const node=new Node();node.audio=audio;window.mediaNodes.push(node);return node;}
     }:undefined;
     window.webkitAudioContext=undefined;
     window.Audio=class{
      constructor(src){this.src=src;this.dataset={};this._volume=1;}
      get volume(){return this._volume;}
      set volume(value){if(value<0||value>1)throw new Error('Invalid HTMLAudio volume');this._volume=value;}
      pause(){}play(){window.playbacks.push({volume:this.volume,src:this.src});return Promise.resolve();}
     };
    }
   },config);
   await page.evaluate(fixtureSource);await page.evaluate(()=>volumeApi.ready());
  };
  const make=async(settings={})=>{
   const config={mode:'offline',wave:wave.toString('base64'),...settings};const page=await browser.newPage();
   page.on('pageerror',error=>{console.error(error);});
   await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
   await page.goto('https://decindustrie.3cx.no:5001/fixture');
   if(settings.stored!==undefined)await page.evaluate(value=>localStorage.setItem('decSlackNotificationVolume',value),String(settings.stored));
   await install(page,config);return {page,config};
  };
  const amplitude=async(percent,settings={})=>{
   const {page}=await make({stored:percent,...settings});await page.evaluate(()=>volumeApi.play());
   if(percent>0)await page.waitForFunction(()=>starts===1);
   const result=await page.evaluate(async()=>({peak:await volumeApi.render(),starts}));await page.close();return result;
  };
  const normal=await amplitude(100),boost=await amplitude(300),quarter=await amplitude(25),muted=await amplitude(0);
  check(Math.abs(normal.peak-.1)<.001,'100 percent preserves the per-sound reference level');
  check(Math.abs(boost.peak/normal.peak-3)<.001,'300 percent really triples the rendered audio amplitude');
  check(Math.abs(quarter.peak/normal.peak-.25)<.001,'25 percent scales the actual signal');
  check(muted.peak===0&&muted.starts===0,'0 percent renders silence and starts no sound');
  const firefox=await amplitude(300,{firefox:true});
  check(Math.abs(firefox.peak-boost.peak)<.001,'Firefox path also uses gain instead of disabling Web Audio');
  const live=await make({stored:100});await live.page.evaluate(()=>volumeApi.play());await live.page.waitForFunction(()=>starts===1);
  await live.page.evaluate(()=>volumeApi.percent(0));
  check(await live.page.evaluate(async()=>await volumeApi.render())===0,'Changing the volume to zero also mutes an already started notification');
  const ui=await make();await ui.page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../3cx-slack-stylish.css'),'utf8')});
  await ui.page.locator('[data-dec-control="sound"]').click();
  const slider=ui.page.getByRole('slider',{name:'Volume des notifications'});
  check(await slider.getAttribute('min')==='0'&&await slider.getAttribute('max')==='300'&&await slider.inputValue()==='100','Slider covers 0 to 300 with a default of 100 percent');
  check(await ui.page.getByRole('switch',{includeHidden:true}).count()===0,'Desktop notification opt-out is absent');
  check(await slider.evaluate(el=>{const r=el.getBoundingClientRect(),m=el.closest('#dec-slack-notification-sound-menu').getBoundingClientRect();return r.top>=m.top&&r.bottom<=m.bottom;}),'Volume remains visible when opening a long sound list');
  await slider.press('Home');
  check(await slider.inputValue()==='0'&&await slider.getAttribute('aria-valuetext')==='0 %','Home reaches zero and updates the accessible readout');
  check(await ui.page.evaluate(()=>starts===0),'The zero-volume slider preview stays silent');
  await slider.press('ArrowUp');check(await slider.inputValue()==='1','Up arrow edits the range instead of moving to a sound option');
  await slider.press('End');check(await slider.inputValue()==='300','End reaches 300 percent');
  await ui.page.waitForFunction(()=>starts>0);
  check(await ui.page.evaluate(()=>starts>0),'Changing the slider plays a preview at the selected level');
  await slider.press('ArrowDown');check(await slider.inputValue()==='299','Down arrow preserves native slider keyboard handling');
  await slider.evaluate(el=>{window.sliderBefore=el;el.value='175';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await ui.page.evaluate(()=>volumeApi.refresh());
  check(await ui.page.evaluate(()=>document.getElementById('dec-slack-notification-volume')===sliderBefore&&document.activeElement===sliderBefore),'Changing volume does not rebuild or unfocus the slider');
  check(await ui.page.locator('[data-dec-notification-volume]').innerText()==='175 %'&&await ui.page.evaluate(()=>localStorage.getItem('decSlackNotificationVolume'))==='175','Readout and saved preference follow the chosen volume');
  await ui.page.reload();await install(ui.page,ui.config);
  check(await ui.page.locator('#dec-slack-notification-volume').inputValue()==='175','Chosen volume survives reload');
  for(const [stored,expected] of [['999','300'],['-20','0'],['invalid','100']]){
   const item=await make({stored});check(await item.page.locator('#dec-slack-notification-volume').inputValue()===expected,'Stored value '+stored+' is normalized');await item.page.close();
  }
  const media=await make({mode:'media',stored:300});await media.page.evaluate(()=>volumeApi.play());await media.page.waitForFunction(()=>playbacks.length===1);
  check(await media.page.evaluate(()=>mediaNodes.length===1&&mediaNodes[0].connections[0]===gains[0]&&gains[0].gain.value===3&&playbacks[0].volume===.5),'Media playback fallback is routed through the gain node without applying volume twice');
  await media.page.evaluate(()=>volumeApi.percent(200));
  check(await media.page.evaluate(()=>gains[0].gain.value===2&&mediaNodes[0].audio.volume===.5),'Volume changes apply immediately to media routing');
  await media.page.evaluate(()=>volumeApi.clear());
  check(await media.page.evaluate(()=>mediaNodes[0].disconnected),'Switching sounds disconnects the former media source');
  const basic=await make({mode:'basic',stored:25});await basic.page.evaluate(()=>volumeApi.play());await basic.page.waitForFunction(()=>playbacks.length===1);
  check(await basic.page.evaluate(()=>playbacks[0].volume===.125),'HTMLAudio-only fallback still obeys attenuation');
  const direct=await make({mode:'media',stored:300,direct:true});await direct.page.evaluate(()=>volumeApi.play());await direct.page.waitForFunction(()=>playbacks.length===1);
  check(await direct.page.evaluate(()=>mediaNodes.length===0&&playbacks[0].volume===1),'A direct cross-origin fallback is not muted by unsafe media routing');
  console.log(`${passed} notification volume checks passed`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
