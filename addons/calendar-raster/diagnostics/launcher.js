'use strict';
(async()=>{
  const api=globalThis.messenger || globalThis.browser;
  const button=document.createElement('button');
  button.type='button';button.textContent='Diagnose';button.disabled=true;
  button.title='Nur Pakete mit Release-Name test_ aktivieren die Diagnose.';
  const host=document.querySelector('.top-actions,.view-controls,.settings-actions,#settings-form') || document.body;
  host.append(button);
  try {
    const response=await fetch(api.runtime.getURL('diagnostics/build-info.json'));
    const info=await response.json();
    button.disabled=!TbDiagnostics.enabled(info);
    if(!button.disabled) button.title='Lokale Tests starten und bereinigtes Protokoll exportieren';
  } catch { /* Remain disabled if build metadata is missing or malformed. */ }
  button.addEventListener('click',()=>{
    if(!button.disabled) api.tabs.create({url:api.runtime.getURL('diagnostics/index.html')});
  });
})();
