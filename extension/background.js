// Acopio: guarda páginas, links y texto seleccionado abriendo la ventanita /save de la app.
// La sesión es la misma del navegador, así que no hace falta iniciar sesión en la extensión.

const DEFAULT_BASE = 'https://acopio-murex.vercel.app';

async function baseUrl() {
  const { base } = await chrome.storage.sync.get('base');
  return (base || DEFAULT_BASE).replace(/\/+$/, '');
}

async function openSave(params) {
  if (!params.url || !/^https?:\/\//.test(params.url)) {
    params = { url: '' }; // páginas internas del navegador: /save explica que no hay link
  }
  const u = new URL(`${await baseUrl()}/save`);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v.slice(0, 4000));
  u.searchParams.set('popup', '1');
  await chrome.windows.create({ url: u.toString(), type: 'popup', width: 560, height: 780, focused: true });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'link', title: 'Guardar link en Acopio', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'selection', title: 'Guardar texto seleccionado en Acopio', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'page', title: 'Guardar esta página en Acopio', contexts: ['page'] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'link') openSave({ url: info.linkUrl });
  if (info.menuItemId === 'selection') openSave({ url: tab?.url, title: tab?.title, highlight: info.selectionText });
  if (info.menuItemId === 'page') openSave({ url: tab?.url, title: tab?.title });
});

// Clic en el icono o Alt+Shift+S
chrome.action.onClicked.addListener((tab) => openSave({ url: tab.url, title: tab.title }));

// La página /save marca la dirección con #acopio-saved o #acopio-cancel al terminar: se cierra la ventanita
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  const url = change.url || '';
  if (!/#acopio-(saved|cancel)$/.test(url)) return;
  const win = await chrome.windows.get(tab.windowId);
  if (win.type === 'popup') setTimeout(() => chrome.windows.remove(tab.windowId).catch(() => {}), url.endsWith('saved') ? 600 : 0);
});
