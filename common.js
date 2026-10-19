// Hàm dùng chung cho giaoviec.html và viec.html (nạp sau các thư viện Firebase).
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDqlIXfZRBiKG2egYbNqTpGUfiauaowMN0",
  authDomain: "so-cong-tac-cuong.firebaseapp.com",
  projectId: "so-cong-tac-cuong",
  storageBucket: "so-cong-tac-cuong.firebasestorage.app",
  messagingSenderId: "811896483915",
  appId: "1:811896483915:web:b7c178c22484b2923c5dce"
};
const OWNER_ID = 'owner';
// Chủ sổ luôn có trong danh sách người nhận việc (việc đó hiện trên sổ nhacviec.html).
const OWNER_PERSON = { id: OWNER_ID, name: 'Cường', title: 'Chủ sổ', owner: true };

let db = null;
try{
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
}catch(e){ db = null; }

const $ = id => document.getElementById(id);
function escapeHtml(str){ return String(str ?? '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
function escapeAttr(str){ return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function pad(n){ return String(n).padStart(2,'0'); }
function dateStr(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function todayStr(){ return dateStr(new Date()); }
function formatDateVN(s){ const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function addDays(s, n){ const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return dateStr(d); }
function daysBetween(s){ return Math.round((new Date(s + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000); }
function getStored(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function setStored(k, v){ try{ v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }
function nameKey(n){ return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function cleanName(n){ return String(n || '').trim().replace(/\s+/g, ' '); }
const WEEKDAY_LONG = ['Chủ nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
const WEEKDAY_SHORT = ['CN','T2','T3','T4','T5','T6','T7'];

async function kvGet(key){
  const snap = await db.collection('kv').doc(key).get();
  return snap.exists ? JSON.parse(snap.data().value) : null;
}

// Danh sách mọi người: chủ sổ + những người anh thêm trong sổ (kv 'people'; cũ là 'commanders').
async function loadPeople(){
  let list = null;
  try{ list = await kvGet('people'); }catch(e){}
  if(!Array.isArray(list)){
    try{ list = await kvGet('commanders'); }catch(e){}
  }
  list = Array.isArray(list) ? list.filter(p => p && p.id && p.name && p.id !== OWNER_ID) : [];
  return [OWNER_PERSON, ...list];
}

// ----- Mức bận -----
const LOAD_MEDIUM_AT = 5, LOAD_HEAVY_AT = 10;
function loadLevel(openTasks){
  const today = todayStr();
  const n = openTasks.length;
  const overdue = openTasks.filter(t => t.due && t.due < today).length;
  const level = (n >= LOAD_HEAVY_AT || overdue >= 3) ? 'heavy' : (n >= LOAD_MEDIUM_AT || overdue >= 1) ? 'mid' : 'light';
  return { level, n, overdue, today: openTasks.filter(t => t.due === today).length };
}
function dueText(t){
  if(!t.due) return 'Chưa có hạn';
  const d = daysBetween(t.due);
  if(d < 0) return `Quá hạn ${-d} ngày`;
  if(d === 0) return 'Hạn hôm nay';
  if(d === 1) return 'Hạn ngày mai';
  return `Còn ${d} ngày`;
}
function duePill(t){
  if(!t.due) return '<span class="pill">Chưa có hạn</span>';
  const d = daysBetween(t.due);
  const cls = d < 0 ? ' over' : d === 0 ? ' today' : d <= 2 ? ' soon' : '';
  if(d > 90) return `<span class="pill">Hạn ${formatDateVN(t.due)}</span>`;
  return `<span class="pill${cls}">${dueText(t)} · ${formatDateVN(t.due).slice(0,5)}</span>`;
}

// ----- Thông báo -----
function canNotify(){ return typeof Notification !== 'undefined'; }
function notifyState(){ return canNotify() ? Notification.permission : 'unsupported'; }
async function askNotify(){
  if(!canNotify()) return 'unsupported';
  try{ return await Notification.requestPermission(); }catch(e){ return Notification.permission; }
}
// Thông báo của hệ điều hành (hiện ở góc màn hình khi trang đang mở, kể cả ở tab nền).
function desktopNotify(title, body, tag){
  if(!canNotify() || Notification.permission !== 'granted') return;
  try{
    const n = new Notification(title, { body, tag: tag || undefined, requireInteraction: false });
    n.onclick = () => { try{ window.focus(); }catch(e){} n.close(); };
  }catch(e){}
}
function beep(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.frequency.value = 1175; }, 120);
    setTimeout(() => { o.stop(); ctx.close(); }, 260);
  }catch(e){}
}
let baseTitle = document.title;
function setTitleBadge(n){ document.title = n > 0 ? `(${n}) ${baseTitle}` : baseTitle; }

function statusBadge(a){
  if(a._pending) return '<span class="st st-sent">Đang gửi…</span>';
  if(a.status === 'sent') return '<span class="st st-sent">Chờ nhận</span>';
  if(a.status === 'received') return `<span class="st st-received">Đang làm — ${a.progress || 0}%</span>`;
  if(a.status === 'done') return `<span class="st st-done">Đã xong${a.completedAt ? ' ' + formatDateVN(a.completedAt) : ''}</span>`;
  if(a.status === 'removed') return '<span class="st st-gone">Đã gỡ khỏi sổ</span>';
  if(a.status === 'cancelled') return '<span class="st st-gone">Đã thu hồi</span>';
  return '';
}
// Việc cũ (chưa có người nhận) mặc định là của chủ sổ.
function toIdOf(a){ return a.toId || OWNER_ID; }
function curDue(a){ return a.dueNow !== undefined && a.dueNow !== null ? a.dueNow : a.due; }
function isOpen(a){ return a.status === 'sent' || a.status === 'received'; }
