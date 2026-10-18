/* Applies an authenticated update to its verified base document. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.ElfGamePatch=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function apply(source,patch){if(patch.format!=='elfquest-splices-v1'||source.length!==patch.sourceCharacters||!Array.isArray(patch.operations))throw Error('Die Update-Basis stimmt nicht.');let pos=0;const parts=[];for(const op of patch.operations){if(!Number.isSafeInteger(op.at)||!Number.isSafeInteger(op.remove)||op.at<pos||op.remove<0||op.at+op.remove>source.length||typeof op.text!=='string')throw Error('Das Update ist ungültig.');parts.push(source.slice(pos,op.at),op.text);pos=op.at+op.remove;}parts.push(source.slice(pos));const result=parts.join('');if(result.length!==patch.targetCharacters)throw Error('Das Update ist unvollständig.');return result;}
return{apply};});

(()=>{
 'use strict';
 const $=id=>document.getElementById(id),config=JSON.parse($('fighter-config').textContent),decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 let controller=null;
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 async function decrypt(key,entry,bytes){return crypto.subtle.decrypt({name:'AES-GCM',iv:decode(entry.iv),additionalData:new TextEncoder().encode(entry.aad),tagLength:128},key,bytes);}
 function reset(){controller=null;$('password').disabled=false;$('open').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;}
 $('cancel').onclick=()=>controller?.abort();
 $('unlock').addEventListener('submit',async event=>{
  event.preventDefault();if(controller)return;
  if(!crypto.subtle||typeof DecompressionStream==='undefined'){$('status').textContent='Bitte einen aktuellen Browser über HTTPS verwenden.';return;}
  controller=new AbortController();const signal=controller.signal;
  $('password').disabled=true;$('open').disabled=true;$('status').textContent='Passwort wird geprüft …';
  try{
   const material=await crypto.subtle.importKey('raw',new TextEncoder().encode($('password').value),'PBKDF2',false,['deriveKey']);
   const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
   $('password').value='';
   try{const marker=await decrypt(key,config.check,decode(config.check.data));if(new TextDecoder().decode(marker)!=='Elfquest-Fighter II Turbo / 0.12')throw Error();}catch{throw Error('Das Passwort stimmt nicht. Bitte erneut versuchen.');}
   if(signal.aborted)throw new DOMException('Abgebrochen','AbortError');
   $('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
   const parts=[];let received=0;
   for(const entry of config.parts){
    const response=await fetch(new URL(entry.file,config.base),{signal,cache:'force-cache',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('Spieldaten konnten nicht geladen werden. Bitte später erneut versuchen.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength!==entry.bytes||await digest(bytes)!==entry.sha256)throw Error('Die geladenen Spieldaten sind unvollständig. Bitte erneut laden.');
    parts.push(await decrypt(key,entry,bytes));received+=bytes.byteLength;
    const percent=Math.round(received/config.bytes*100);$('progress').value=percent;$('status').textContent='Arena wird geladen · '+percent+' % · '+Math.round(received/1024/1024)+' / '+Math.ceil(config.bytes/1024/1024)+' MB';
   }
   $('status').textContent='Arena wird vorbereitet …';
   const packed=new Blob(parts);parts.length=0;
   const html=await new Response(packed.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
   if(html.size!==config.htmlBytes||await digest(await html.arrayBuffer())!==config.htmlSha256)throw Error('Die Spielprüfung ist fehlgeschlagen. Bitte erneut laden.');
   if(signal.aborted)throw new DOMException('Abgebrochen','AbortError');
   // Open the verified self-contained game in this document. Large blob iframe
   // navigation can stall in embedded browsers; no second navigation is needed.
   let markup=await html.text();
   if(config.update){
    $('status').textContent='Optimierte Spielversion wird geladen …';const entry=config.update;
    const response=await fetch(new URL(entry.file,location.href),{signal,cache:'force-cache',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('Das Spielupdate konnte nicht geladen werden. Bitte erneut laden.');const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==entry.bytes||await digest(bytes)!==entry.sha256)throw Error('Das Spielupdate ist unvollständig.');
    const packed=await decrypt(key,entry,bytes),patch=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    markup=ElfGamePatch.apply(markup,patch);const checked=new TextEncoder().encode(markup);
    if(checked.byteLength!==entry.htmlBytes||await digest(checked)!==entry.htmlSha256)throw Error('Die Update-Prüfung ist fehlgeschlagen.');
   }
   if(signal.aborted)throw new DOMException('Abgebrochen','AbortError');
   const exit='<button id="protectedArenaExit" type="button" style="position:fixed;left:12px;bottom:12px;z-index:500;background:#071612d9;color:#efdfbc;border:1px solid #c9aa76;padding:8px 13px;font:12px Segoe UI;cursor:pointer">Arena schließen</button>';
   document.open();document.write(markup.replace('</body>',exit+'</body>'));document.close();
   document.getElementById('protectedArenaExit').onclick=()=>location.reload();
  }catch(error){$('password').value='';$('status').textContent=error.name==='AbortError'?'Laden abgebrochen.':error.message||'Die Arena konnte nicht geöffnet werden.';reset();$('password').focus();}
 });
})();
