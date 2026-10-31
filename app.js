// Supabase Project Settings → API. Never use a secret/service_role key here.
const SUPABASE_URL = 'https://lmatsfnefzxxiupstmry.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zxw6ciXZC6IA3EOAO2by4Q_BINUV5HD';
const sections = ['Өлең жаттау','Мәнерлеп оқу','Эссе жазу','Өлең шығару','ЖИ арқылы бағалау'];
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mode = params.has('admin') ? 'admin' : params.has('results') ? 'results' : 'vote';
let rating = 0, current = null, token = null, busy = false, polling = false;
let device;
try {
  device = localStorage.getItem('til_mura_device_v2');
  if (!device) { device = crypto.randomUUID(); localStorage.setItem('til_mura_device_v2', device); }
} catch (_) { device = crypto.randomUUID(); }
const message = text => { $('status').textContent = text; };
function voted() { try { return localStorage.getItem('til_mura_voted_' + current?.id) === '1'; } catch (_) { return false; } }
async function request(path, body, auth = false) {
  const headers = {apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json'};
  if (auth) { if (!token) throw Error('Алдымен ұйымдастырушы ретінде кіріңіз.'); headers.Authorization = 'Bearer ' + token; }
  const r = await fetch(SUPABASE_URL + path, {method:'POST', headers, body:JSON.stringify(body)});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(data.message || data.msg || data.error_description || 'Сұрау орындалмады.');
  return data;
}
const rpc = (name, body = {}, auth = false) => request('/rest/v1/rpc/' + name, body, auth);
function syncButton() { $('send').disabled = !current || busy || voted(); $('thanks').hidden = !voted(); }
function draw(data) {
  const changed = current?.id !== data.session.id;
  current = data.session;
  $('round').textContent = current.title;
  if (changed) {
    rating = 0; $('comment').value = ''; $('section').value = '';
    [...$('stars').children].forEach(b => b.classList.remove('on'));
    message('');
  }
  syncButton();
  $('count').textContent = data.count;
  $('avg').textContent = data.count ? Number(data.average).toFixed(1) + ' ★' : '—';
  $('bars').replaceChildren();
  for (const name of sections) {
    const n = Number(data.sections[name] || 0), pct = data.count ? Math.round(n / data.count * 100) : 0;
    const wrap = document.createElement('div'); wrap.className = 'result';
    const top = document.createElement('div'); top.className = 'top';
    const label = document.createElement('span'); label.textContent = name;
    const value = document.createElement('span'); value.textContent = n + ' · ' + pct + '%';
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = pct + '%';
    top.append(label, value); bar.append(fill); wrap.append(top, bar); $('bars').append(wrap);
  }
}
async function refresh() {
  if (polling) return;
  polling = true;
  try { draw(await rpc('tmv_current_results')); }
  catch (e) { message('Қосылым қатесі: ' + e.message); }
  finally { polling = false; }
}
async function archive() {
  const rows = await rpc('tmv_archive', {}, true);
  $('archive').replaceChildren();
  for (const row of rows) {
    const el = document.createElement('p');
    el.textContent = row.title + ' · ' + new Date(row.started_at).toLocaleString('kk-KZ') + ' · ' + row.vote_count + ' дауыс · ' + (row.average ? Number(row.average).toFixed(1) + ' ★' : '—') + (row.ended_at ? '' : ' · Қазіргі');
    $('archive').append(el);
  }
}
for (const name of sections) { const o = document.createElement('option'); o.value = o.textContent = name; $('section').append(o); }
for (let n = 1; n <= 5; n++) {
  const b = document.createElement('button'); b.className = 'star'; b.textContent = '★'; b.setAttribute('aria-label', n + ' жұлдыз');
  b.onclick = () => { rating = n; [...$('stars').children].forEach((el,i) => el.classList.toggle('on', i < n)); };
  $('stars').append(b);
}
$('vote').classList.toggle('hidden', mode !== 'vote');
$('results').classList.toggle('hidden', mode === 'vote');
$('admin').classList.toggle('hidden', mode !== 'admin');
$('send').onclick = async () => {
  if (!current || busy || voted()) return;
  if (!rating || !$('section').value) { message('Жұлдызды және бөлімді таңдаңыз.'); return; }
  const sessionId = current.id;
  busy = true; syncButton();
  try {
    const result = await rpc('tmv_submit_vote', {p_session:sessionId, p_device:device, p_rating:rating, p_section:$('section').value, p_comment:$('comment').value.trim()});
    if (result === 'closed') { await refresh(); message('Жаңа дауыс беру басталды. Бағаңызды қайта таңдаңыз.'); return; }
    try { localStorage.setItem('til_mura_voted_' + sessionId, '1'); } catch (_) {}
    message(result === 'duplicate' ? 'Осы дауыс беруге қатысып қойдыңыз.' : 'Рақмет! Дауысыңыз қабылданды.');
  } catch (e) { message('Дауыс жіберілмеді: ' + e.message); }
  finally { busy = false; syncButton(); }
};
$('login').onsubmit = async e => {
  e.preventDefault(); const button = $('login').querySelector('button'); button.disabled = true;
  try {
    const auth = await request('/auth/v1/token?grant_type=password', {email:$('email').value.trim(), password:$('password').value});
    token = auth.access_token;
    await archive();
    $('password').value = ''; $('login').hidden = true; $('controls').hidden = false; message('Ұйымдастырушы ретінде кірдіңіз.');
  } catch (e) { token = null; message('Кіру орындалмады: ' + e.message); }
  finally { button.disabled = false; }
};
$('logout').onclick = () => { token = null; $('controls').hidden = true; $('login').hidden = false; $('archive').replaceChildren(); message('Кабинет жабылды.'); };
$('restart').onclick = async () => {
  if (!confirm('Жаңа дауыс беруді бастайсыз ба? Бұрынғы нәтижелер сақталады.')) return;
  $('restart').disabled = true;
  try { await rpc('tmv_start_round', {p_title:$('title').value.trim() || 'Жаңа дауыс беру'}, true); await refresh(); await archive(); message('Жаңа дауыс беру басталды. QR-код өзгермейді.'); }
  catch (e) { message('Жаңа дауыс беру басталмады: ' + e.message); }
  finally { $('restart').disabled = false; }
};
if (!SUPABASE_URL.startsWith('https://') || SUPABASE_ANON_KEY.includes('YOUR_')) {
  message('Алдымен app.js файлына Supabase қосылымын енгізіп, SQL нұсқаулығын орындаңыз.');
} else { refresh(); setInterval(refresh, 3000); }
