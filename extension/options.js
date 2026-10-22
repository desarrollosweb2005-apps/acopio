const input = document.getElementById('base');
chrome.storage.sync.get('base').then(({ base }) => { input.value = base || 'https://acopio-murex.vercel.app'; });
document.getElementById('save').addEventListener('click', async () => {
  const value = input.value.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(value)) { input.setCustomValidity('Escribe solo la dirección, por ejemplo https://acopio-murex.vercel.app'); input.reportValidity(); return; }
  input.setCustomValidity('');
  await chrome.storage.sync.set({ base: value });
  const ok = document.getElementById('ok');
  ok.hidden = false;
  setTimeout(() => (ok.hidden = true), 1500);
});
