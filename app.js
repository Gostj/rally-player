'use strict';
const $ = id => document.getElementById(id);
const audio = $('audio'), listEl = $('list'), seek = $('seek');
let tracks = [], curId = null, shuffleOn = false, repeatMode = 0, url = null;

/* ---------- Armazenamento local (IndexedDB) ---------- */
const idb = new Promise((ok, fail) => {
  const r = indexedDB.open('rally', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error);
});
const wrap = r => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
const store = async mode => (await idb).transaction('tracks', mode).objectStore('tracks');

async function refresh() {
  try { tracks = await wrap((await store('readonly')).getAll()); } catch { tracks = []; }
  render();
}

/* ---------- Lista ---------- */
function render() {
  listEl.textContent = '';
  $('empty').hidden = tracks.length > 0;
  $('count').textContent = String(idx() + 1).padStart(2, '0') + ' × ' + String(tracks.length).padStart(2, '0');
  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    if (t.id === curId) li.className = 'on';
    const row = document.createElement('button');
    row.className = 'row';
    row.onclick = () => play(i);
    const num = document.createElement('span'); num.className = 'num'; num.textContent = String(i + 1).padStart(2, '0');
    const name = document.createElement('span'); name.className = 'name'; name.textContent = t.name;
    row.append(num, name);
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', 'Remover ' + t.name);
    del.onclick = () => remove(t.id);
    li.append(row, del);
    listEl.append(li);
  });
}

$('files').onchange = async e => {
  for (const f of e.target.files) {
    await wrap((await store('readwrite')).add({ name: f.name.replace(/\.[^.]+$/, ''), blob: f }));
  }
  e.target.value = '';
  await refresh();
};

async function remove(id) {
  await wrap((await store('readwrite')).delete(id));
  if (id === curId) {
    audio.pause(); audio.removeAttribute('src'); curId = null;
    $('title').textContent = 'Nenhuma música';
    $('cur').textContent = $('dur').textContent = '0:00'; setProgress(0);
  }
  await refresh();
}

/* ---------- Reprodução ---------- */
const idx = () => tracks.findIndex(t => t.id === curId);

function play(i) {
  const t = tracks[i];
  if (!t) return;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(t.blob);
  audio.src = url;
  curId = t.id;
  audio.play().catch(() => {});
  $('title').textContent = t.name;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: 'Rally Player' });
  render();
}

function next(auto) {
  if (!tracks.length) return;
  const i = idx();
  if (shuffleOn && tracks.length > 1) {
    let n; do { n = Math.floor(Math.random() * tracks.length); } while (n === i);
    return play(n);
  }
  if (i + 1 < tracks.length) return play(i + 1);
  if (repeatMode === 1 || !auto) play(0);
}

function prev() {
  if (idx() <= 0 || audio.currentTime > 3) { audio.currentTime = 0; return; }
  play(idx() - 1);
}

function toggle() {
  if (!audio.src) return tracks.length ? play(0) : $('files').click();
  audio.paused ? audio.play() : audio.pause();
}

audio.onended = () => repeatMode === 2 ? (audio.currentTime = 0, audio.play()) : next(true);
audio.onplay = audio.onpause = () => {
  document.body.classList.toggle('playing', !audio.paused);
  $('play').setAttribute('aria-label', audio.paused ? 'Tocar' : 'Pausar');
};

/* ---------- Tempo e barra ---------- */
const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
function setProgress(v) { seek.value = v; seek.style.setProperty('--p', v / 10 + '%'); }
audio.ontimeupdate = () => {
  $('cur').textContent = fmt(audio.currentTime);
  setProgress(audio.duration ? audio.currentTime / audio.duration * 1000 : 0);
};
audio.onloadedmetadata = () => { $('dur').textContent = fmt(audio.duration); };
seek.oninput = () => {
  if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
  setProgress(seek.value);
};

/* ---------- Botões ---------- */
$('play').onclick = toggle;
$('next').onclick = () => next(false);
$('prev').onclick = prev;
$('shuffle').onclick = e => {
  shuffleOn = !shuffleOn;
  e.currentTarget.setAttribute('aria-pressed', shuffleOn);
};
$('repeat').onclick = e => {
  repeatMode = (repeatMode + 1) % 3;
  const b = e.currentTarget;
  b.dataset.mode = repeatMode;
  b.setAttribute('aria-pressed', repeatMode > 0);
  b.setAttribute('aria-label', 'Repetir: ' + ['desligado', 'todas', 'uma'][repeatMode]);
};

/* ---------- Controles na tela de bloqueio ---------- */
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => audio.play());
  ms.setActionHandler('pause', () => audio.pause());
  ms.setActionHandler('previoustrack', prev);
  ms.setActionHandler('nexttrack', () => next(false));
}

/* ---------- Início ---------- */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
refresh();
