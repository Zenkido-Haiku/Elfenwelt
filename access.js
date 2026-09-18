(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('config').textContent);
  const form = document.getElementById('unlock');
  const status = document.getElementById('status');
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  let key;
  let manifest;
  let galleryOverlay;
  const blobUrls = new Map();

  async function decrypt(entry) {
    const response = await fetch('./' + entry.file);
    if (!response.ok) throw Error('Eine verschlüsselte Datei konnte nicht geladen werden.');
    return crypto.subtle.decrypt({name:'AES-GCM',iv:decode(entry.iv),tagLength:128}, key, await response.arrayBuffer());
  }
  async function bytesFor(ref) {
    const entry = manifest[ref];
    if (!entry) throw Error('Datei fehlt: ' + ref);
    return decrypt(entry);
  }
  async function urlFor(ref) {
    if (!blobUrls.has(ref)) {
      const entry = manifest[ref];
      if (!entry) throw Error('Datei fehlt: ' + ref);
      const pending = bytesFor(ref).then(bytes => URL.createObjectURL(new Blob([bytes], {type:entry.type})));
      blobUrls.set(ref, pending);
      pending.catch(() => blobUrls.delete(ref));
    }
    return blobUrls.get(ref);
  }
  function localPath(ref, base = '') {
    if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) return null;
    const result = new URL(ref, 'https://protected.invalid/' + base).pathname.slice(1);
    return decodeURIComponent(result);
  }
  function stripInitialSources(doc) {
    doc.querySelectorAll('img[src],video[src],audio[src],source[src]').forEach(node => {
      const value = node.getAttribute('src');
      if (localPath(value) !== null) {
        node.dataset.privateSrc = value;
        node.removeAttribute('src');
      }
    });
    doc.querySelectorAll('video[poster]').forEach(node => {
      const value = node.getAttribute('poster');
      if (localPath(value) !== null) {
        node.dataset.privatePoster = value;
        node.removeAttribute('poster');
      }
    });
  }
  function errorText(message) {
    let note = document.getElementById('private-error');
    if (!note) {
      note = document.createElement('p');
      note.id = 'private-error';
      note.style.cssText = 'position:fixed;z-index:9999;left:16px;bottom:16px;max-width:400px;padding:12px 18px;background:#532c29;color:#fff;font:14px sans-serif;box-shadow:0 4px 24px #0008';
      document.body.append(note);
    }
    note.textContent = message;
    setTimeout(() => note.remove(), 7000);
  }
  function setupDocument(doc, base = '') {
    const activeRefs = new WeakMap();
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          entry.target._privateLoad?.();
        }
      }
    }, {rootMargin:'400px'}) : null;
    function queue(node, load) {
      // An unloaded portrait is only as tall as its alt text. Its crop can
      // therefore sit outside the clipped card and never intersect the viewport.
      const target = node.tagName === 'IMG' ? node.closest('.portrait') || node : node;
      target._privateLoad = load;
      if (observer) observer.observe(target); else load();
    }
    function loadResource(node) {
      const raw = node.getAttribute('src') || node.dataset.privateSrc;
      const ref = localPath(raw, base);
      if (ref !== null && manifest[ref] && activeRefs.get(node) !== ref) {
        activeRefs.set(node, ref);
        node.removeAttribute('src');
        delete node.dataset.privateSrc;
        const apply = () => urlFor(ref).then(url => {
          if (activeRefs.get(node) !== ref) return;
          node.src = url;
          if (node.tagName === 'SOURCE') node.closest('video,audio')?.load();
        }).catch(error => errorText(error.message));
        if (node.tagName === 'IMG') queue(node, apply);
        else if (node.tagName === 'AUDIO' && node.closest('details') && !node.closest('details').open) node._privateLoad = apply;
        else if (node.tagName === 'SOURCE' && node.parentElement?.tagName === 'VIDEO') queue(node.parentElement, apply);
        else if (node.tagName === 'VIDEO') queue(node, apply);
        else apply();
      }
      const poster = node.getAttribute('poster') || node.dataset.privatePoster;
      const posterRef = localPath(poster, base);
      if (posterRef !== null && manifest[posterRef] && activeRefs.get(node)?.poster !== posterRef) {
        delete node.dataset.privatePoster;
        node.removeAttribute('poster');
        urlFor(posterRef).then(url => node.poster = url).catch(error => errorText(error.message));
      }
    }
    function scan(root) {
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      if (root.matches?.('img,video,audio,source')) loadResource(root);
      root.querySelectorAll?.('img,video,audio,source').forEach(loadResource);
    }
    scan(doc);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') loadResource(record.target);
        else record.addedNodes.forEach(scan);
      }
    }).observe(doc.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['src','poster']});
    doc.addEventListener('toggle', event => {
      if (event.target.matches?.('details[open]')) event.target.querySelectorAll('audio').forEach(node => node._privateLoad?.());
    }, true);
    doc.addEventListener('click', async event => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const ref = localPath(link.getAttribute('href'), base);
      if (ref === null) return;
      if (base && ref === 'index.html') {
        event.preventDefault();
        galleryOverlay?.remove();
        galleryOverlay = undefined;
        return;
      }
      if (!manifest[ref]) return;
      event.preventDefault();
      if (ref.toLowerCase().endsWith('.html')) {
        try { await openGallery(ref); } catch(error) { errorText(error.message); }
        return;
      }
      const download = link.hasAttribute('download');
      const popup = !download ? window.open('', '_blank') : null;
      try {
        const url = await urlFor(ref);
        if (download) {
          const a = document.createElement('a');
          a.href = url;
          a.download = manifest[ref].name;
          document.body.append(a);
          a.click();
          a.remove();
        } else if (popup) popup.location.href = url;
        else window.open(url, '_blank', 'noopener');
      } catch(error) {
        popup?.close();
        errorText(error.message);
      }
    }, true);
  }
  async function openGallery(ref) {
    const html = new TextDecoder().decode(await bytesFor(ref));
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    stripInitialSources(parsed);
    galleryOverlay?.remove();
    galleryOverlay = document.createElement('div');
    galleryOverlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#081210;display:flex;flex-direction:column';
    const close = document.createElement('button');
    close.textContent = '← Zur Projektseite';
    close.style.cssText = 'align-self:flex-end;margin:8px 16px;padding:8px 14px;background:#e8b86a;color:#16241e;border:0;cursor:pointer';
    close.onclick = () => { galleryOverlay.remove(); galleryOverlay = undefined; };
    const frame = document.createElement('iframe');
    frame.title = 'Elfenwelt – Bildfolge';
    frame.style.cssText = 'width:100%;flex:1;border:0;background:#101d1b';
    galleryOverlay.append(close, frame);
    document.body.append(galleryOverlay);
    frame.onload = () => setupDocument(frame.contentDocument, ref.slice(0, ref.lastIndexOf('/') + 1));
    frame.srcdoc = '<!doctype html>' + parsed.documentElement.outerHTML;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = 'Elfenwelt wird geöffnet …';
    try {
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(form.password.value), 'PBKDF2', false, ['deriveKey']);
      key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},
        material, {name:'AES-GCM',length:256}, false, ['decrypt']);
      const content = JSON.parse(new TextDecoder().decode(await decrypt(config)));
      manifest = content.manifest;
      form.reset();
      const parsed = new DOMParser().parseFromString(content.html, 'text/html');
      stripInitialSources(parsed);
      document.head.innerHTML = parsed.head.innerHTML;
      document.body.innerHTML = parsed.body.innerHTML;
      setupDocument(document);
      const script = document.createElement('script');
      script.textContent = content.script;
      document.body.append(script);
      const logout = document.createElement('button');
      logout.textContent = 'Abmelden';
      logout.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9997;padding:10px 16px;background:#142422;color:#f0eadc;border:1px solid #e8b86a;cursor:pointer';
      logout.onclick = () => location.reload();
      document.body.append(logout);
    } catch(error) {
      key = undefined;
      status.textContent = error.name === 'OperationError' ? 'Das Passwort stimmt nicht. Bitte versuche es erneut.' : error.message;
      form.password.focus();
    } finally { button.disabled = false; }
  });
})();
