'use strict';

/* ============================================================
   حافلاتي — البيانات الثابتة (وهمية بالكامل)
   ============================================================ */

const AREAS = ['حلة القلعة', 'حلة البوسعيد', 'حلة الحويمي', 'سور الحديد', 'حلة الشريجة',
  'حلة آل يوسف', 'حلة الشرادي', 'حلة وادي اللوامي', 'حلة الشخر', 'حلة الصبارة',
  'حلة البنود', 'وادي اللوامي الساحل بجانب الخيالة', 'حلة وادي اللوامي بجانب مكتب الوالي'];

const BUSES = [
  { driver: 'عبدالله محمد ناصر الكحالي', plate: '6521', capacity: 66, type: 'كبيرة' },
  { driver: 'أيمن خلفان سالم الوهيبي', plate: '6743', capacity: 54, type: 'كبيرة' },
  { driver: 'محمد راشد جمعة الربيعي', plate: '2948', capacity: 66, type: 'كبيرة' },
  { driver: 'سعيد ناصر صالح الحديدي', plate: '8565', capacity: 29, type: 'متوسطة' },
  { driver: 'عبدالله عبيد هاشل الدوحاني', plate: '531', capacity: 63, type: 'كبيرة' },
  { driver: 'أمين شاه مراد صومار الزدجالي', plate: '7141', capacity: 67, type: 'كبيرة' },
  { driver: 'عامر علي عامر العمري', plate: '436', capacity: 66, type: 'كبيرة' },
  { driver: 'ماجد حمود سعيد السابقي', plate: '5030', capacity: 29, type: 'متوسطة' },
  { driver: 'غسان محمد غسان المزروعي', plate: '5790', capacity: 29, type: 'متوسطة' },
  { driver: 'محمد يوسف سليمان الحمداني', plate: '6735', capacity: 25, type: 'متوسطة' }
];

const GRADES = ['الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع'];

const GRADE_PLAN = [
  ['الخامس', 1, 37], ['الخامس', 2, 36], ['الخامس', 3, 35], ['الخامس', 4, 35], ['الخامس', 5, 35],
  ['السادس', 1, 40], ['السادس', 2, 40], ['السادس', 3, 40], ['السادس', 4, 40],
  ['السابع', 1, 40], ['السابع', 2, 40], ['السابع', 3, 40], ['السابع', 4, 40],
  ['الثامن', 1, 36], ['الثامن', 2, 35], ['الثامن', 3, 36], ['الثامن', 4, 35], ['الثامن', 5, 34],
  ['التاسع', 1, 37], ['التاسع', 2, 38], ['التاسع', 3, 37], ['التاسع', 4, 38]
];

const MODE_LABELS = { government: 'نقل حكومي', private: 'نقل خاص', walk: 'مشيًا', pending: 'غير محدد' };
const MODES = ['government', 'private', 'walk', 'pending'];

// نسبة التحميل المستهدفة لكل حافلة (لإبقاء هامش أمان)
const BUS_TARGET_RATIO = 0.87;

const VISIBLE_STEP = 40;
const STORAGE_KEY = 'hawafilati-demo';

/* ============================================================
   الحالة العامة
   ============================================================ */

const state = {
  students: [],
  visible: VISIBLE_STEP,
  tracking: false,
  watchId: null
};

/* ============================================================
   أدوات مساعدة
   ============================================================ */

function $(selector, root) {
  try {
    return (root || document).querySelector(selector);
  } catch (e) {
    console.warn('اختيار غير صالح:', selector, e);
    return null;
  }
}

function $all(selector, root) {
  try {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  } catch (e) {
    console.warn('اختيار غير صالح:', selector, e);
    return [];
  }
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 2300);
}

function pad(value, length) {
  return String(value).padStart(length, '0');
}

/* ============================================================
   بناء البيانات التجريبية
   ============================================================ */

function buildStudents() {
  const list = [];
  let serial = 0;

  for (const [grade, section, count] of GRADE_PLAN) {
    for (let n = 0; n < count; n++) {
      serial++;
      let mode;
      if (serial <= 430) mode = 'government';
      else if (serial <= 660) mode = 'private';
      else if (serial <= 760) mode = 'walk';
      else mode = 'pending';

      list.push({
        id: 'STU' + pad(serial, 4),
        name: 'طالب تجريبي ' + pad(serial, 3),
        grade,
        section,
        mode,
        bus: mode === 'government' ? assignBus(serial - 1) : null,
        area: AREAS[(serial * 7) % AREAS.length]
      });
    }
  }
  return list;
}

/**
 * يعيّن حافلة بترتيب المدخلات. تُملأ الحافلات تباعًا حتى نسبتها المستهدفة،
 * ويُوزع الفائض (إن وُجد) دائريًا على حافلات لم تمتلئ بعد، مع احترام السعة
 * الكاملة كحد أقصى. يعيد أقرب حافلة متاحة أو null عند العجز الكامل.
 */
function assignBus(index) {
  const targets = BUSES.map(b => Math.floor(b.capacity * BUS_TARGET_RATIO));

  let cursor = 0;
  for (let i = 0; i < BUSES.length; i++) {
    if (index >= cursor && index < cursor + targets[i]) return BUSES[i];
    cursor += targets[i];
  }

  // الفائض عن النسب المستهدفة: وزّع دائريًا على حافلة لا تزال بسعة متاحة،
  // مع الالتزام دائمًا بألا تتجاوز السعة الكاملة للحافلة.
  const leftover = index - cursor;
  for (let step = 0; step < BUSES.length; step++) {
    const candidate = (leftover + step) % BUSES.length;
    if (targets[candidate] < BUSES[candidate].capacity) {
      targets[candidate]++;
      return BUSES[candidate];
    }
  }
  throw new Error('لا توجد سعة متاحة في أسطول الحافلات');
}

/* ============================================================
   الحسابات المجمّعة (تُنفذ مرة واحدة لكل تحديث)
   ============================================================ */

function totalBusCapacity() {
  return BUSES.reduce((sum, b) => sum + b.capacity, 0);
}

function computeStatistics() {
  const modeCounts = {};
  MODES.forEach(m => (modeCounts[m] = 0));
  state.students.forEach(s => (modeCounts[s.mode] = (modeCounts[s.mode] || 0) + 1));

  const busCounts = {};
  BUSES.forEach(b => (busCounts[b.plate] = 0));
  state.students.forEach(s => {
    if (s.bus) busCounts[s.bus.plate] = (busCounts[s.bus.plate] || 0) + 1;
  });

  const gradeTotals = {};
  state.students.forEach(s => {
    gradeTotals[s.grade] = (gradeTotals[s.grade] || 0) + 1;
  });

  return { modeCounts, busCounts, gradeTotals, total: state.students.length };
}

function findStudent(id) {
  return state.students.find(s => s.id === id) || null;
}

/* ============================================================
   العرض: لوحة الإدارة
   ============================================================ */

function renderDashboard() {
  const statsEl = $('#stats');
  const occEl = $('#occupancy');
  const gradeEl = $('#gradeBars');
  if (!statsEl || !occEl || !gradeEl) return;

  const { modeCounts, busCounts, gradeTotals } = computeStatistics();

  const stats = [
    ['إجمالي الطلاب', state.students.length, GRADE_PLAN.length + ' شعبة'],
    ['نقل حكومي', modeCounts.government, 'من أصل ' + totalBusCapacity() + ' مقعدًا'],
    ['نقل خاص', modeCounts.private, 'بيانات يقدمها ولي الأمر'],
    ['مشيًا / غير محدد', modeCounts.walk + modeCounts.pending, 'تحتاج متابعة']
  ];

  statsEl.innerHTML = stats.map(([label, value, hint]) =>
    '<article class="stat-card"><small>' + label + '</small><b>' + value +
    '</b><span>' + hint + '</span></article>'
  ).join('');

  occEl.innerHTML = BUSES.map(b => {
    const used = busCounts[b.plate] || 0;
    const pct = Math.round(used / b.capacity * 100);
    return '<div class="progress-row"><b>حافلة ' + b.plate + '</b>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<span>' + used + '/' + b.capacity + '</span></div>';
  }).join('');

  const gradeEntries = GRADES
    .filter(g => gradeTotals[g] != null)
    .map(g => '<div class="grade-bar"><b>' + gradeTotals[g] + '</b><span>طلاب الصف ' + g + '</span></div>');
  gradeEl.innerHTML = gradeEntries.join('');
}

/* ============================================================
   العرض: جدول الطلاب
   ============================================================ */

function getFilteredStudents() {
  const input = $('#studentSearch');
  const filter = $('#modeFilter');
  const query = input ? input.value.trim().toUpperCase() : '';
  const mode = filter ? filter.value : 'all';

  return state.students.filter(s =>
    (!query || s.id.includes(query) || s.name.toUpperCase().includes(query)) &&
    (mode === 'all' || s.mode === mode)
  );
}

function renderStudents() {
  const body = $('#studentsBody');
  const loadMore = $('#loadMore');
  if (!body || !loadMore) return;

  const list = getFilteredStudents();
  const rows = list.slice(0, state.visible).map(s => {
    let assignment;
    if (s.bus) assignment = 'حافلة ' + s.bus.plate;
    else if (s.mode === 'private') assignment = 'بانتظار بيانات الحافلة الخاصة';
    else assignment = '—';

    return '<tr><td><b>' + s.id + '</b></td><td>' + s.name + '</td>' +
      '<td>' + s.grade + ' / ' + s.section + '</td>' +
      '<td><span class="mode mode-' + s.mode + '">' + MODE_LABELS[s.mode] + '</span></td>' +
      '<td>' + assignment + '</td></tr>';
  });

  body.innerHTML = rows.join('') ||
    '<tr><td colspan="5">لا توجد نتائج مطابقة.</td></tr>';
  loadMore.hidden = state.visible >= list.length;
}

/* ============================================================
   العرض: بطاقات الحافلات
   ============================================================ */

function renderBuses() {
  const grid = $('#busGrid');
  if (!grid) return;

  const { busCounts } = computeStatistics();

  grid.innerHTML = BUSES.map(b => {
    const used = busCounts[b.plate] || 0;
    const pct = Math.round(used / b.capacity * 100);
    return '<article class="bus-card"><div class="bus-card-head">' +
      '<div><small>' + b.type + '</small><h3>' + b.driver + '</h3></div>' +
      '<span class="bus-number">' + b.plate + '</span></div>' +
      '<p>' + used + ' طالبًا من أصل ' + b.capacity + ' مقعدًا</p>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<small>' + pct + '% إشغال تجريبي</small></article>';
  }).join('');
}

/* ============================================================
   العرض: التنقل بين الأقسام
   ============================================================ */

function setView(id) {
  $all('.view').forEach(v => v.classList.remove('active'));
  $all('.tab').forEach(t => t.classList.remove('active'));

  const view = $('#' + id);
  const tab = $('.tab[data-view="' + id + '"]');
  if (view) view.classList.add('active');
  if (tab) tab.classList.add('active');
}

/* ============================================================
   بوابة ولي الأمر
   ============================================================ */

function renderChildCard(student) {
  const card = $('#childCard');
  if (!card) return;
  card.innerHTML = '<div class="child-card"><div><b>' + student.name + '</b><br>' +
    '<small>' + student.id + ' • الصف ' + student.grade + '/' + student.section + '</small></div>' +
    '<span class="mode mode-' + student.mode + '">' + MODE_LABELS[student.mode] + '</span></div>';
}

function updateAssignmentPreview(area) {
  const preview = $('#assignmentPreview');
  if (!preview) return;

  const bus = BUSES[AREAS.indexOf(area) % BUSES.length];
  preview.innerHTML = '<b>التعيين المقترح</b><p>سيعين النظام الحافلة <strong>' +
    bus.plate + '</strong> بعد اعتماد مشرف النقل وتوفر السعة.</p>';
}

function handleParentLogin(event) {
  if (event) event.preventDefault();

  const idInput = $('#schoolId');
  const message = $('#loginMessage');
  const workspace = $('#parentWorkspace');
  if (!idInput || !message || !workspace) return;

  const id = idInput.value.trim().toUpperCase();
  const student = findStudent(id);

  if (!student) {
    message.textContent = 'الرقم غير موجود في البيانات التجريبية.';
    return;
  }

  message.textContent = '';
  workspace.classList.remove('hidden');

  const stored = readStoredChoice(id);
  const area = stored && stored.area ? stored.area : student.area;

  renderChildCard(student);
  const areaSelect = $('#areaSelect');
  if (areaSelect) areaSelect.value = area;
  updateAssignmentPreview(area);
}

function readStoredChoice(id) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data[id] ? data[id] : null;
  } catch (e) {
    console.warn('تعذر قراءة بيانات التجربة المحفوظة:', e);
    return null;
  }
}

function saveStoredChoice(id, choice) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[id] = choice;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('تعذر حفظ بيانات التجربة:', e);
  }
}

function handleSaveChoice() {
  const idInput = $('#schoolId');
  const areaSelect = $('#areaSelect');
  if (!idInput || !areaSelect) return;

  const id = idInput.value.trim().toUpperCase();
  const student = findStudent(id);
  if (!student) return;

  saveStoredChoice(id, {
    area: areaSelect.value,
    stop: $('#stopSelect') ? $('#stopSelect').value : '',
    savedAt: new Date().toISOString()
  });

  toast('تم حفظ الطلب التجريبي وإرساله للمشرف');
}

function handleAddStop() {
  toast('سُجل اقتراح نقطة وبانتظار اعتماد المشرف');
}

/* ============================================================
   واجهة السائق: مشاركة الموقع
   ============================================================ */

function handleToggleTracking() {
  const card = $('.tracking');
  const status = $('#tripStatus');
  const btn = $('#trackBtn');
  const share = $('#shareBtn');
  const locationText = $('#locationText');
  if (!card || !status || !btn || !share || !locationText) return;

  state.tracking = !state.tracking;

  if (state.tracking) {
    card.classList.add('active');
    status.textContent = 'الموقع مباشر';
    status.className = 'status ok';
    btn.textContent = 'إيقاف مشاركة الموقع';
    share.disabled = false;
    locationText.textContent = 'جارٍ طلب الموقع…';

    if (navigator.geolocation) {
      state.watchId = navigator.geolocation.watchPosition(
        p => {
          locationText.textContent = 'آخر تحديث: ' + p.coords.latitude.toFixed(5) +
            '، ' + p.coords.longitude.toFixed(5);
        },
        () => { locationText.textContent = 'تعذر الوصول للموقع — تحقق من الإذن'; }
      );
    } else {
      locationText.textContent = 'الموقع غير مدعوم في هذا المتصفح';
    }
  } else {
    card.classList.remove('active');
    status.textContent = 'انتهت المشاركة';
    status.className = 'status idle';
    btn.textContent = 'بدء مشاركة الموقع';
    share.disabled = true;
    locationText.textContent = 'الموقع غير مشارك';
    if (state.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
  }
}

function handleShareTrip() {
  const text = encodeURIComponent('تابع رحلة الحافلة التجريبية عبر رابط حافلاتي المؤقت');
  window.open('https://wa.me/?text=' + text, '_blank');
}

/* ============================================================
   إعادة ضبط التجربة
   ============================================================ */

function openDialog() {
  const dialog = $('#resetDialog');
  if (dialog) dialog.showModal();
}

function handleConfirmReset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('تعذر مسح البيانات المحفوظة:', e);
  }
  state.students = buildStudents();
  state.visible = VISIBLE_STEP;
  renderAll();
  toast('تمت إعادة البيانات التجريبية');
}

/* ============================================================
   تهيئة التطبيق
   ============================================================ */

function renderAll() {
  renderDashboard();
  renderStudents();
  renderBuses();
}

function initAreaSelect() {
  const select = $('#areaSelect');
  if (!select) return;
  select.innerHTML = AREAS.map(a => '<option>' + a + '</option>').join('');
}

function bindEvents() {
  $all('.tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

  const search = $('#studentSearch');
  const filter = $('#modeFilter');
  const loadMore = $('#loadMore');
  if (search) search.addEventListener('input', () => { state.visible = VISIBLE_STEP; renderStudents(); });
  if (filter) filter.addEventListener('change', () => { state.visible = VISIBLE_STEP; renderStudents(); });
  if (loadMore) loadMore.addEventListener('click', () => { state.visible += VISIBLE_STEP; renderStudents(); });

  const resetBtn = $('#resetBtn');
  const confirmReset = $('#confirmReset');
  if (resetBtn) resetBtn.addEventListener('click', openDialog);
  if (confirmReset) confirmReset.addEventListener('click', handleConfirmReset);

  const parentLogin = $('#parentLogin');
  const areaSelect = $('#areaSelect');
  const saveChoice = $('#saveChoice');
  if (parentLogin) parentLogin.addEventListener('submit', handleParentLogin);
  if (areaSelect) areaSelect.addEventListener('change', () => updateAssignmentPreview(areaSelect.value));
  if (saveChoice) saveChoice.addEventListener('click', handleSaveChoice);

  const addStop = $('#addStop');
  const trackBtn = $('#trackBtn');
  const shareBtn = $('#shareBtn');
  if (addStop) addStop.addEventListener('click', handleAddStop);
  if (trackBtn) trackBtn.addEventListener('click', handleToggleTracking);
  if (shareBtn) shareBtn.addEventListener('click', handleShareTrip);
}

function init() {
  state.students = buildStudents();
  initAreaSelect();
  bindEvents();
  renderAll();
}

init();
