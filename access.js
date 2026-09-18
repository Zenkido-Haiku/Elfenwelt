(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('config').textContent);
  const decode = value => Uint8Array.from(atob(value), c=>c.charCodeAt(0));
  const form = document.getElementById('unlock');
  const status = document.getElementById('status');
  const frame = document.getElementById('project');
  const urls = new Map();
  let key;
  async function decrypt(entry) {
    const response = await fetch('./'+entry.file);
    if (!response.ok) throw Error('Datei konnte nicht geladen werden.');
    return crypto.subtle.decrypt({name:'AES-GCM',iv:decode(entry.iv),tagLength:128},key,await response.arrayBuffer());
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = 'Elfenwelt wird geöffnet …';
    try {
      if (!crypto.subtle) throw Error('Bitte diese Seite über HTTPS oder localhost öffnen.');
      const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(form.password.value),'PBKDF2',false,['deriveKey']);
      key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
      const {html,manifest} = JSON.parse(new TextDecoder().decode(await decrypt(config)));
      form.reset();
      async function asset(ref) {
        if (!urls.has(ref)) {
          const entry = manifest[ref];
          const promise = decrypt(entry).then(bytes=>URL.createObjectURL(new Blob([bytes],{type:entry.type})));
          urls.set(ref,promise);
          promise.catch(()=>urls.delete(ref));
        }
        return urls.get(ref);
      }
      frame.onload = () => {
        const doc = frame.contentDocument;
        doc.querySelectorAll('a[href^="#"]:not([data-private])').forEach(link=>link.addEventListener('click',event=>{
          const target=doc.getElementById(link.getAttribute('href').slice(1));
          if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth'});}
        }));
        doc.querySelectorAll('a[data-private]').forEach(link=>link.addEventListener('click',async event=>{
          event.preventDefault();
          if(link.dataset.busy) return;
          link.dataset.busy='1';
          const ref=link.dataset.private;
          const note=doc.createElement('span');note.className='private-status';note.setAttribute('role','status');note.textContent=' Wird geladen …';link.after(note);
          try {
            const a=doc.createElement('a');a.href=await asset(ref);a.download=manifest[ref].name;doc.body.append(a);a.click();a.remove();note.remove();
          } catch {note.textContent=' Laden fehlgeschlagen. Bitte erneut versuchen.';setTimeout(()=>note.remove(),6000);}
          finally {delete link.dataset.busy;}
        }));
        doc.querySelectorAll('audio').forEach(audio=>{
          const source=audio.matches('[data-private]')?audio:audio.querySelector('[data-private]');
          if(!source)return;
          audio.preload='none';audio.hidden=true;
          const load=doc.createElement('button');load.className='private-load';load.textContent='▶ Musik laden & abspielen';audio.before(load);
          load.addEventListener('click',async()=>{
            load.disabled=true;load.textContent='Musik wird geladen …';
            try {audio.src=await asset(source.dataset.private);audio.hidden=false;audio.load();load.remove();audio.play().catch(()=>{});}
            catch {load.disabled=false;load.textContent='Erneut laden';}
          });
        });
        doc.querySelectorAll('img[data-private]').forEach(async img=>{try{img.src=await asset(img.dataset.private);}catch{img.alt='Bild konnte nicht geladen werden.';}});
        document.getElementById('entrance').hidden=true;frame.hidden=false;document.getElementById('logout').hidden=false;document.title='Elfenwelt – Das Musicalprojekt';
      };
      frame.srcdoc=html;
    } catch(error) {
      key=undefined;
      status.textContent=error.name==='OperationError'?'Das Passwort stimmt nicht. Bitte versuche es erneut.':(error.message || 'Öffnen fehlgeschlagen. Bitte erneut versuchen.');
      form.password.focus();
    } finally {button.disabled=false;}
  });
  document.getElementById('logout').addEventListener('click',()=>location.reload());
})();
