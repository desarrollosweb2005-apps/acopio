const input = document.getElementById('base');
chrome.storage.sync.get('base').then(({ base }) => { input.value = base || 'https://acopio-murex.vercel.app'; });
document.getElementById('save').addEventListener('click', async () => {
  const value = input.value.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(value)) { input.setCustomValidity('Escribe solo la dirección, por ejemplo https://acopio-murex.vercel.app'); input.reportValidity(); return; }
  input.setCustomValidity('');
  // Dominio propio: hace falta permiso para entregar las capturas a esa web
  if (!/\.vercel\.app$/.test(new URL(value).hostname)) {
    const ok = await chrome.permissions.request({ origins: [`${value}/*`] });
    if (!ok) { input.setCustomValidity('Sin ese permiso no funcionará «Capturar zona de la página» en tu dominio.'); input.reportValidity(); return; }
  }
  await chrome.storage.sync.set({ base: value });
  const ok = document.getElementById('ok');
  ok.hidden = false;
  setTimeout(() => (ok.hidden = true), 1500);
});
