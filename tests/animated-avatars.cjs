const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'))); }
const source = fs.readFileSync(path.join(__dirname, '../3cx-slack-avatars.user.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.lastIndexOf('  applyPreferences();\n  ensureControls();');
assert(start > 0);
const testSource = source.slice(0, start) + `
  window.avatarTest = {
    init:initializeAnimatedAvatars, enhance:enhanceAnimatedAvatars,
    info:avatarGifInfo, chunks:avatarPngChunks, embed:avatarEmbedGif, extract:avatarExtractGif,
    crc:avatarCrc32, allowedUrl:animatedAvatarUrl, apply:applyProfileToAvatar,
    base64:avatarBytesToBase64, bytes:avatarBase64ToBytes,
    first:avatarFirstFramePng, stop:stopAnimatedAvatarImport,
    state:()=>({pending:!!animatedAvatarImport,exported:animatedAvatarImport?.exported,
      failed:!!animatedAvatarImport?.failed,
      verification:!!animatedAvatarVerification,cache:[...animatedAvatarCache.keys()]}),
  };
  scheduleUpdate = () => {};
})();`;
// Deux images de 128 px, rouge puis bleue, avec boucle et palette locale.
const gif = 'R0lGODlhgACAAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACAAAACwAAAAAgACAAAAIzgABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izat3KtavXr2DDih1LtqzZs2jTql3Ltq3bt3Djyp1Lt67du3jz6t3Lt6/fv4ADCx5MuLDhw4gTK17MuLHjx5AjS55MubLly5gza97MubPnz6BDix5NurTp06hTq17NurXr17Bjy55N22tAACH5BAEIAAEALAAAAACAAIAAgQAA/wAAAAAAAAAAAAjOAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMmypcuXMGPKnEmzps2bOHPq3Mmzp8+fQIMKHUq0qNGjSJMqXcq0qdOnUKNKnUq1qtWrWLNq3cq1q9evYMOKHUu2rNmzaNOqXcu2rdu3cOPKnUu3rt27ePPq3cu3r9+/gAMLHky4sOHDiBMrXsy4sePHkCNLnky5suXLmDNr3sy5s+fPoEOLHk26tOnTqFOrXs26tevXsGPLnk3ba0AAOw==';
const origin = 'https://decindustrie.3cx.no:5001';
const html = `<!doctype html><html><head><style>
  app-avatar{display:inline-block} .avatar-container,.fixture-avatar{position:relative;width:64px;height:64px;display:block;background-size:cover}
  .avatar-container>img{width:64px;height:64px} img-cropper{display:block}
</style></head><body>
<app-header><wc-account-menu><app-avatar><div class="avatar-container"><img data-qa="profile-image" alt="54" src="/user_images/before.png"></div></app-avatar></wc-account-menu></app-header>
<app-profile-image><app-avatar><div class="avatar-container"><img data-qa="profile-image" src="/user_images/before.png"></div></app-avatar><input type="file"></app-profile-image>
<app-chat-message-file><input type="file"></app-chat-message-file>
</body></html>`;
let passed = 0;
const check = (condition, text) => { assert(condition, text); passed++; };
// Ajouter un commentaire GIF valide pour tester le poids réel, sans modifier
// les images ni dépendre de la compression d'une image générée au hasard.
function padGif(original, targetLength) {
  const chunks=[original.subarray(0,-1),Buffer.from([0x21,0xfe])];
  let remaining=targetLength-(original.length-1)-4;
  while(remaining>0){const length=Math.min(255,remaining-1);assert(length>0);chunks.push(Buffer.from([length]),Buffer.alloc(length,65));remaining-=length+1;}
  chunks.push(Buffer.from([0,0x3b]));
  const result=Buffer.concat(chunks);assert.equal(result.length,targetLength);return result;
}
(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const serverImages = new Map();
  const errors = [];
  try {
    const fixture = async (withTheme = true) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/fixture') return route.fulfill({contentType:'text/html',body:html});
        if (url.pathname.startsWith('/user_images/')) {
          const image = serverImages.get(url.pathname);
          return image ? route.fulfill({contentType:'image/png',body:Buffer.from(image,'base64')}) : route.fulfill({status:404,body:''});
        }
        throw new Error('Unexpected network request: ' + url.href);
      });
      await page.goto(origin + '/fixture#/settings');
      if (withTheme) {
        await page.evaluate(testSource);
        await page.evaluate(() => avatarTest.init());
      }
      return {page,context};
    };
    const {page} = await fixture();
    const basePng = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width=128;canvas.height=128;
      canvas.getContext('2d').fillStyle='#ff0000';canvas.getContext('2d').fillRect(0,0,128,128);
      return canvas.toDataURL().split(',')[1];
    });
    serverImages.set('/user_images/before.png', basePng);
    const encoded = await page.evaluate(async gif => {
      const bytes=avatarTest.bytes(gif), info=avatarTest.info(bytes);
      const png=await avatarTest.first(info);
      const enriched=avatarTest.embed(avatarTest.bytes(png.split(',')[1]),bytes,{x:32,y:16,width:64,height:64});
      const roundtrip=avatarTest.extract(enriched);
      return {info:{width:info.width,height:info.height,frames:info.frames},png:avatarTest.base64(enriched),
        crop:roundtrip.crop,exact:avatarTest.base64(roundtrip.gif)===gif,
        types:avatarTest.chunks(enriched).map(c=>c.type)};
    }, gif);
    check(encoded.info.frames===2 && encoded.info.width===128, 'GIF parser reads animated frames and palette');
    check(encoded.exact, 'PNG preserves every original GIF byte');
    check(JSON.stringify(encoded.crop)===JSON.stringify({x:32,y:16,width:64,height:64}), 'PNG preserves exact native crop');
    check(encoded.types.includes('deCg') && encoded.types.at(-1)==='IEND', 'PNG remains structurally valid');
    serverImages.set('/user_images/animated.png',encoded.png);
    const invalid = await page.evaluate(({png,gif}) => {
      const valid=avatarTest.bytes(png), bad=valid.slice();
      const chunk=avatarTest.chunks(bad).find(c=>c.type==='deCg');bad[chunk.offset+10]^=1;
      return {crc:avatarTest.extract(bad),truncated:avatarTest.extract(valid.slice(0,-4)),
        gif:avatarTest.info(avatarTest.bytes(gif).slice(0,-3)),
        remote:avatarTest.allowedUrl('https://example.com/user_images/avatar.png'),
        attachment:avatarTest.allowedUrl('/MyPhone/downloadChatFile/image.png'),
        oversized:avatarTest.info(new Uint8Array(1024*1024+1)),
        crcKnown:avatarTest.crc(new TextEncoder().encode('123456789'))};
    }, {png:encoded.png,gif});
    check(invalid.crc===null && invalid.truncated===null && invalid.gif===null, 'Damaged PNG/GIF and bad CRC safely ignored');
    check(!invalid.remote && !invalid.attachment && !invalid.oversized, 'Only bounded same-server native avatars are read');
    check(invalid.crcKnown===0xcbf43926, 'Standard PNG CRC32');
    const native = await fixture(false);
    const nativePixel = await native.page.evaluate(async () => {
      const image=new Image(); image.src='/user_images/animated.png';await image.decode();
      const c=document.createElement('canvas');c.width=128;c.height=128;c.getContext('2d').drawImage(image,0,0);
      await new Promise(resolve=>setTimeout(resolve,250));return [...c.getContext('2d').getImageData(20,20,1,1).data];
    });
    check(nativePixel[0]===255 && nativePixel[2]===0, 'Without theme the enriched PNG displays the red first frame');
    const teammate = await fixture();
    await teammate.page.evaluate(() => {
      document.querySelector('app-header img').src='/user_images/animated.png';
      const avatar=document.createElement('span');avatar.className='fixture-avatar';document.body.append(avatar);
      avatarTest.apply(avatar,{imageUrl:'/user_images/animated.png',name:'Neil'},'Neil','54');
      avatarTest.enhance();
    });
    await teammate.page.waitForFunction(() => !avatarTest.state().cache.length || avatarTest.state().cache.includes(location.origin+'/user_images/animated.png'));
    await teammate.page.waitForTimeout(80);await teammate.page.evaluate(() => avatarTest.enhance());
    await teammate.page.waitForSelector('.dec-animated-avatar-ready');
    check(await teammate.page.locator('.dec-animated-avatar-layer').count()===2, 'Fresh browser discovers shared GIF in native and message avatars');
    check(await teammate.page.locator('app-header img[data-qa]').getAttribute('src')==='/user_images/animated.png', 'Native identity and source URL stay intact');
    const cropStyle=await teammate.page.locator('.fixture-avatar .dec-animated-avatar-image').evaluate(image=>({width:image.style.width,height:image.style.height,left:image.style.left,top:image.style.top}));
    check(cropStyle.width==='200%' && cropStyle.left==='-50%' && cropStyle.top==='-25%', 'Animated crop matches the selected PNG region');
    // drawImage(GIF) utilise sa première image selon HTML, même s'il s'anime
    // à l'écran. Vérifier les pixels réellement composités par le navigateur.
    const frames = new Set();
    for (let n=0;n<10;n++) {
      const screenshot=await teammate.page.locator('app-header .avatar-container').screenshot({animations:'allow'});
      frames.add(await teammate.page.evaluate(async png=>{
        const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
        const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
        c.getContext('2d').drawImage(image,0,0);const p=c.getContext('2d').getImageData(20,20,1,1).data;return [p[0],p[2]].join(',');
      },screenshot.toString('base64')));
      await teammate.page.waitForTimeout(35);
    }
    check(frames.has('255,0') && frames.has('0,255'), 'Teammate actually sees multiple animated GIF frames: '+[...frames]);
    await teammate.page.emulateMedia({reducedMotion:'reduce'});
    check(await teammate.page.locator('.dec-animated-avatar-layer').first().evaluate(el=>getComputedStyle(el).display)==='none', 'Reduced motion retains the static avatar');
    await teammate.page.evaluate(() => {document.querySelector('app-header img[data-qa]').src='/user_images/before.png';avatarTest.enhance();});
    check(await teammate.page.locator('app-header .dec-animated-avatar-layer').count()===0, 'Changing back to PNG removes the previous animation');
    // Simuler le composant natif : FileReader -> recadrage canvas 128 -> aperçu.
    await page.evaluate(() => {
      window.originalCanvasExport=HTMLCanvasElement.prototype.toDataURL;
      window.originalCanvasDraw=CanvasRenderingContext2D.prototype.drawImage;
      document.querySelector('app-profile-image input').addEventListener('change',async event=>{
        window.nativeChanges=(window.nativeChanges||0)+1;
        const reader=new FileReader();reader.onload=async()=>{
          const image=new Image();image.src=reader.result;await image.decode();
          const dialog=document.createElement('app-modal-dialog');
          const cropper=document.createElement('img-cropper');cropper.append(document.createElement('canvas'));dialog.append(cropper);
          const ok=document.createElement('button');ok.dataset.qa='modal-ok';ok.textContent='OK';dialog.append(ok);document.body.append(dialog);
          avatarTest.enhance();
          const crop=document.createElement('canvas');crop.width=128;crop.height=128;
          crop.getContext('2d').drawImage(image,0,0,128,128,0,0,128,128);
          window.nativeExport=crop.toDataURL();
          ok.onclick=()=>{document.querySelector('app-profile-image img').src=window.nativeExport;dialog.remove();};
        };reader.readAsDataURL(event.target.files[0]);
      });
    });
    await page.locator('app-profile-image input').setInputFiles({name:'avatar.gif',mimeType:'image/gif',buffer:Buffer.from(gif,'base64')});
    await page.waitForFunction(()=>!!window.nativeExport);
    const imported = await page.evaluate(() => ({count:window.nativeChanges,pending:avatarTest.state().pending,
      exact:avatarTest.base64(avatarTest.extract(avatarTest.bytes(window.nativeExport.split(',')[1])).gif),png:window.nativeExport.split(',')[1]}));
    check(imported.count===1 && imported.pending && imported.exact===gif, 'Native GIF selection automatically exports fixed PNG with shared animation');
    await page.locator('[data-qa="modal-ok"]').click();await page.evaluate(() => avatarTest.enhance());
    check(await page.evaluate(()=>HTMLCanvasElement.prototype.toDataURL===window.originalCanvasExport && CanvasRenderingContext2D.prototype.drawImage===window.originalCanvasDraw), 'Canvas methods restored after cropping');
    check(await page.evaluate(()=>avatarTest.state().verification), 'Validation waits for server profile save');
    serverImages.set('/user_images/uploaded.png',imported.png);
    await page.evaluate(()=>{document.querySelector('app-header img').src='/user_images/uploaded.png';avatarTest.enhance();});
    await page.waitForTimeout(80);await page.evaluate(()=>avatarTest.enhance());
    check((await page.locator('#dec-slack-library-notice').innerText()).includes('Avatar animé enregistré'), 'Save success confirmed from server bytes');
    // Préserver le même parcours puis simuler un serveur qui nettoie les métadonnées.
    await page.evaluate(()=>{window.nativeExport=null;});
    await page.locator('app-profile-image input').setInputFiles({name:'second.gif',mimeType:'image/gif',buffer:Buffer.from(gif,'base64')});
    await page.waitForFunction(()=>!!window.nativeExport);
    await page.locator('[data-qa="modal-ok"]').click();await page.evaluate(()=>avatarTest.enhance());
    serverImages.set('/user_images/stripped.png',basePng);
    await page.evaluate(()=>{document.querySelector('app-header img').src='/user_images/stripped.png';avatarTest.enhance();});
    await page.waitForTimeout(80);await page.evaluate(()=>avatarTest.enhance());
    check((await page.locator('#dec-slack-library-notice').innerText()).includes('supprimé les données'), 'Server stripping explicitly reported instead of claiming shared GIF');
    await page.evaluate(()=>{window.nativeExport=null;});
    await page.locator('app-profile-image input').setInputFiles({name:'cancel.gif',mimeType:'image/gif',buffer:Buffer.from(gif,'base64')});
    await page.waitForFunction(()=>!!window.nativeExport);
    await page.evaluate(()=>{
      document.querySelector('app-modal-dialog').remove();avatarTest.enhance();
    });
    check(await page.evaluate(()=>!avatarTest.state().pending && !avatarTest.state().verification), 'Cancel does not queue or confirm a profile update');
    const count=await page.evaluate(()=>window.nativeChanges);
    await page.locator('app-chat-message-file input').setInputFiles({name:'chat.gif',mimeType:'image/gif',buffer:Buffer.from(gif,'base64')});
    check(await page.evaluate(()=>window.nativeChanges)===count, 'Chat GIF attachments are untouched');
    await teammate.page.evaluate(() => {
      const avatar=document.querySelector('.fixture-avatar');
      avatarTest.apply(avatar,{imageUrl:'/user_images/before.png',name:'Neil'},'Neil','54');avatarTest.enhance();
    });
    check(await teammate.page.locator('.fixture-avatar').evaluate(el=>!el.classList.contains('dec-animated-avatar-ready') && getComputedStyle(el).backgroundImage.includes('before.png')), 'Replacing a themed GIF with PNG restores its static background');
    await page.evaluate(()=>{window.nativeExport=null;});
    await page.locator('app-profile-image input').setInputFiles({name:'leaving.gif',mimeType:'image/gif',buffer:Buffer.from(gif,'base64')});
    await page.waitForFunction(()=>!!window.nativeExport);
    await page.evaluate(()=>{location.hash='#/chat/21';});
    await page.waitForFunction(()=>!avatarTest.state().pending);
    check(await page.evaluate(()=>HTMLCanvasElement.prototype.toDataURL===window.originalCanvasExport && CanvasRenderingContext2D.prototype.drawImage===window.originalCanvasDraw), 'Leaving settings restores native canvas methods');
    await page.evaluate(()=>{document.querySelector('app-modal-dialog')?.remove();location.hash='#/settings';});
    await page.waitForFunction(()=>location.hash==='#/settings');
    await page.evaluate(()=>{window.nativeExport=null;});
    const changesBefore=await page.evaluate(()=>window.nativeChanges);
    const savedPreview=await page.locator('app-profile-image img').getAttribute('src');
    await page.locator('app-profile-image input').setInputFiles({name:'too-large.gif',mimeType:'image/gif',buffer:padGif(Buffer.from(gif,'base64'),100*1024)});
    await page.waitForFunction(()=>document.querySelector('#dec-slack-library-notice')?.textContent.includes('100 Kio'));
    check(await page.evaluate(()=>window.nativeChanges)===changesBefore, 'Oversized GIF rejected before invoking the native importer');
    check(await page.locator('app-profile-image img').getAttribute('src')===savedPreview, 'Oversized input leaves the selected profile unchanged');
    check(await page.evaluate(()=>!avatarTest.state().pending && HTMLCanvasElement.prototype.toDataURL===window.originalCanvasExport), 'Rejected GIF installs no canvas hooks');
    // Le GIF tient seul, mais le PNG fixe et le bloc privé font dépasser le budget.
    await page.locator('app-profile-image input').setInputFiles({name:'combined-too-large.gif',mimeType:'image/gif',buffer:padGif(Buffer.from(gif,'base64'),96*1024-16)});
    await page.waitForFunction(()=>!!window.nativeExport);
    check(await page.evaluate(()=>avatarTest.state().failed && !avatarTest.state().exported), 'Combined PNG plus GIF size checked after native cropping');
    await page.locator('[data-qa="modal-ok"]').click();
    check(await page.locator('app-modal-dialog').count()===1 && await page.locator('app-profile-image img').getAttribute('src')===savedPreview, 'Oversized cropped avatar cannot be submitted with OK');
    await page.locator('[data-qa="modal-ok"]').press('Enter');
    check(await page.locator('app-modal-dialog').count()===1 && !await page.evaluate(()=>avatarTest.state().verification), 'Enter cannot bypass the size guard or claim a successful save');
    await page.evaluate(()=>{document.querySelector('app-modal-dialog').remove();avatarTest.enhance();window.nativeExport=null;});
    check(await page.evaluate(()=>!avatarTest.state().pending && HTMLCanvasElement.prototype.toDataURL===window.originalCanvasExport), 'Cancel after a size rejection restores the native importer');
    await page.locator('app-profile-image input').setInputFiles({name:'fits.gif',mimeType:'image/gif',buffer:padGif(Buffer.from(gif,'base64'),90*1024)});
    await page.waitForFunction(()=>!!window.nativeExport);
    const formSize=await page.evaluate(async()=>{
      const data=avatarTest.bytes(window.nativeExport.split(',')[1]);
      const form=new FormData();form.append('file',new Blob([data],{type:'image/png'}),'profile.png');
      return {png:data.length,form:(await new Response(form).arrayBuffer()).byteLength,animated:!!avatarTest.extract(data)};
    });
    check(formSize.png<=96*1024 && formSize.form<102400 && formSize.animated, 'Accepted GIF plus PNG and multipart envelope fit the observed 102400-byte server limit');
    check(errors.length===0, 'No JavaScript exceptions: '+errors.join('\n'));
    console.log(`${passed} animated avatar checks passed`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
