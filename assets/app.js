'use strict';

/* ============================================================
   حافلاتي — لوحة إدارة النقل المدرسي (تطبيق محلي، المدير يتحكم بكل شيء)
   البيانات محفوظة في localStorage على هذا الجهاز، مع نسخ احتياطي JSON.
   ============================================================ */

/* ---------- ثوابت ---------- */
const STORAGE_KEY = 'hawafilati-data-v1';
const GRADES = ['الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع'];
const MODE_LABELS = { government: 'نقل حكومي', private: 'نقل خاص', walk: 'مشيًا', pending: 'غير محدد' };
const MODES = ['government', 'private', 'walk', 'pending'];
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE = 150;

/* ---------- الحالة ---------- */
const state = {
  students: [],
  buses: [],
  studentSearch: '',
  modeFilter: 'all',
  assignFilter: 'all',
  editStudentId: null,
  editBusId: null,
  visibleStudents: PAGE_SIZE
};

/* ---------- أدوات مساعدة ---------- */
function $(selector, root) {
  try { return (root || document).querySelector(selector); } catch (e) { return null; }
}

function $all(selector, root) {
  try { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); } catch (e) { return []; }
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 2300);
}

function newId() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function findStudent(id) { return state.students.find(s => s.id === id) || null; }
function findBus(id) { return state.buses.find(b => b.id === id) || null; }
function busCount(busId) { return state.students.filter(s => s.busId === busId).length; }
function totalCapacity() { return state.buses.reduce((sum, b) => sum + b.capacity, 0); }
function enumAreas() { return Array.from(new Set(state.students.map(s => s.area).filter(Boolean))).sort(); }

/* ---------- طبقة التخزين ---------- */
function defaultData() {
  return { version: 1, students: [], buses: [] };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || 1,
      students: Array.isArray(parsed.students) ? parsed.students : [],
      buses: Array.isArray(parsed.buses) ? parsed.buses : []
    };
  } catch (e) {
    console.warn('تعذر قراءة البيانات المحفوظة:', e);
    return defaultData();
  }
}

function persist() {
  const data = { version: 1, students: state.students, buses: state.buses };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('تعذر حفظ البيانات:', e);
    toast('تحذير: تعذر حفظ البيانات (ملء التخزين الممتلئ)');
  }
}

/* ---------- تصفية الطلاب ---------- */
function getFilteredStudents() {
  const q = state.studentSearch.trim().toLowerCase();
  return state.students.filter(s => {
    const matchText = !q ||
      s.name.toLowerCase().includes(q) ||
      s.schoolId.toLowerCase().includes(q);
    const matchMode = state.modeFilter === 'all' || s.mode === state.modeFilter;
    const matchAssign = state.assignFilter === 'all' ||
      (state.assignFilter === 'assigned' ? !!s.busId : !s.busId);
    return matchText && matchMode && matchAssign;
  });
}

/* ---------- العرض: لوحة الإدارة ---------- */
function renderDashboard() {
  const total = state.students.length;
  const gov = state.students.filter(s => s.mode === 'government').length;
  const pending = state.students.filter(s => s.mode === 'pending').length;
  const assignedGov = state.students.filter(s => s.mode === 'government' && s.busId).length;
  const unassignedGov = state.students.filter(s => s.mode === 'government' && !s.busId).length;
  const usedSeats = state.students.filter(s => s.busId).length;

  const heroBus = $('#heroBusCount');
  if (heroBus) heroBus.textContent = state.buses.length + (state.buses.length === 1 ? ' حافلة' : ' حافلات');

  const statsEl = $('#stats');
  if (statsEl) {
    const cards = [
      ['إجمالي الطلاب', total, state.buses.length + ' حافلة'],
      ['نقل حكومي', gov, assignedGov + ' معيّن حاليًا'],
      ['مقاعد مستخدمة', usedSeats, 'من أصل ' + totalCapacity() + ' مقعد'],
      ['غير محدد', pending, 'يحتاج متابعة']
    ];
    statsEl.innerHTML = cards.map(([label, value, hint]) =>
      '<article class="stat-card"><small>' + label + '</small><b>' + value +
      '</b><span>' + hint + '</span></article>').join('');
  }

  const occEl = $('#occupancy');
  if (occEl) {
    occEl.innerHTML = state.buses.length
      ? state.buses.map(b => {
          const used = busCount(b.id);
          const pct = Math.round(used / b.capacity * 100);
          const over = used > b.capacity;
          return '<div class="progress-row"><b>حافلة ' + escapeHtml(b.plate) + '</b>' +
            '<div class="progress"><i class="' + (over ? 'over' : '') + '" style="width:' +
            Math.min(pct, 100) + '%"></i></div>' +
            '<span>' + used + '/' + b.capacity + '</span></div>';
        }).join('')
      : '<div class="empty-mini">أضف حافلات أولًا من تبويب «الحافلات».</div>';
  }

  const alertsEl = $('#alerts');
  if (alertsEl) {
    const alerts = [];
    if (pending > 0) alerts.push({ cls: 'warn', b: pending + ' طالب', s: 'لم يحددوا وسيلة النقل بعد' });
    if (unassignedGov > 0) alerts.push({ cls: 'warn', b: unassignedGov + ' طالب', s: 'بلا حافلة (نقل حكومي)' });
    const overfull = state.buses.filter(b => busCount(b.id) > b.capacity);
    if (overfull.length) alerts.push({ cls: 'info', b: overfull.length + ' حافلة', s: 'تجاوزت السعة المسموحة' });
    if (!alerts.length) alerts.push({ cls: 'safe', b: 'لا شيء', s: 'كل شيء تحت السيطرة' });
    alertsEl.innerHTML = alerts.map(a =>
      '<div class="alert ' + a.cls + '"><b>' + a.b + '</b><span>' + a.s + '</span></div>').join('');
  }

  const gradeEl = $('#gradeBars');
  if (gradeEl) {
    const totals = {};
    state.students.forEach(s => (totals[s.grade] = (totals[s.grade] || 0) + 1));
    gradeEl.innerHTML = GRADES.map(g =>
      '<div class="grade-bar"><b>' + (totals[g] || 0) + '</b><span>طلاب الصف ' + g + '</span></div>').join('');
  }
}

/* ---------- العرض: قائمة الطلاب ---------- */
function renderStudentsTable() {
  const body = $('#studentsBody');
  const empty = $('#studentsEmpty');
  const foot = $('#studentsFoot');
  if (!body || !empty) return;

  const list = getFilteredStudents();
  const pageCount = state.visibleStudents;
  const visible = list.slice(0, pageCount);
  const hasStudents = state.students.length > 0;

  empty.classList.toggle('hidden', hasStudents);

  body.innerHTML = hasStudents
    ? (visible.length
        ? visible.map(s => {
            const bus = findBus(s.busId);
            const hasBusOptions = !!state.buses.length;
            return '<tr>' +
              '<td><b>' + escapeHtml(s.schoolId) + '</b></td>' +
              '<td>' + escapeHtml(s.name) + '</td>' +
              '<td>' + escapeHtml(s.grade) + ' / ' + (s.section || '') + '</td>' +
              '<td>' + escapeHtml(s.area || '—') + '</td>' +
              '<td><span class="mode mode-' + s.mode + '">' + MODE_LABELS[s.mode] + '</span></td>' +
              '<td>' + (bus ? 'حافلة ' + escapeHtml(bus.plate) : '—') + '</td>' +
              '<td class="row-actions">' +
                (hasBusOptions && !s.busId ? '<button type="button" class="mini primary" data-assign="' + s.id + '">تعيين</button>' : '') +
                '<button type="button" class="mini" data-edit-student="' + s.id + '">تعديل</button>' +
                '<button type="button" class="mini danger" data-delete-student="' + s.id + '">حذف</button>' +
              '</td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="7" class="row-empty">لا توجد نتائج مطابقة للفلترة.</td></tr>')
    : '';

  if (foot) {
    const loaded = visible.length;
    const total = list.length;
    foot.innerHTML = total > pageCount
      ? '<button type="button" class="ghost wide" data-load-more>عرض المزيد (' + loaded + ' من ' + total + ')</button>'
      : (hasStudents ? '<span class="count-note">' + total + ' طالبًا</span>' : '');
  }
}

/* ---------- العرض: الحافلات ---------- */
function renderBusesGrid() {
  const grid = $('#busGrid');
  if (!grid) return;

  grid.innerHTML = state.buses.length ? state.buses.map(b => {
    const used = busCount(b.id);
    const pct = Math.round(used / b.capacity * 100);
    const over = used > b.capacity;
    return '<article class="bus-card">' +
      '<div class="bus-card-head"><div><small>' + escapeHtml(b.type) + '</small>' +
      '<h3>' + escapeHtml(b.driverName) + '</h3></div>' +
      '<span class="bus-number">' + escapeHtml(b.plate) + '</span></div>' +
      '<p>' + used + ' طالبًا من أصل ' + b.capacity + ' مقعدًا</p>' +
      '<div class="progress"><i class="' + (over ? 'over' : '') + '" style="width:' + Math.min(pct, 100) + '%"></i></div>' +
      '<small class="' + (over ? 'over-text' : '') + '">' + pct + '% إشغال</small>' +
      '<div class="card-actions">' +
        '<button type="button" class="mini" data-edit-bus="' + b.id + '">تعديل</button>' +
        '<button type="button" class="mini danger" data-delete-bus="' + b.id + '">حذف</button>' +
      '</div>' +
    '</article>';
  }).join('') : '<div class="empty-state"><b>لا توجد حافلات</b><span>ابدأ بإضافة حافلة وسائقها من الزر أعلاه.</span></div>';
}

/* ---------- العرض: التعيينات ---------- */
function renderAssignments() {
  const awaiting = state.students.filter(s => !s.busId && s.mode !== 'private' && s.mode !== 'walk');
  const countEl = $('#awaitingCount');
  const awaitList = $('#awaitingList');
  const awaitEmpty = $('#awaitingEmpty');
  const table = $('#assignTable');
  if (!countEl || !awaitList || !awaitEmpty || !table) return;

  const activeBuses = state.buses;

  countEl.textContent = awaiting.length;
  awaitEmpty.classList.toggle('hidden', awaiting.length > 0);

  awaitList.innerHTML = awaiting.length
    ? awaiting.map(s => {
        const options = activeBuses.map(b => {
          const used = busCount(b.id);
          const free = b.capacity - used;
          const disabled = free <= 0 ? ' disabled' : '';
          return '<option value="' + b.id + '"' + disabled + '>' + escapeHtml(b.plate) +
            ' (' + (free > 0 ? free + ' متاح' : 'ممتلئ') + ' من ' + b.capacity + ')</option>';
        }).join('');
        return '<div class="await-row">' +
          '<div><b>' + escapeHtml(s.name) + '</b><small>' + escapeHtml(s.schoolId) + ' • ' +
            escapeHtml(s.grade) + '/' + (s.section || '') + (s.area ? ' • ' + escapeHtml(s.area) : '') + '</small></div>' +
          (activeBuses.length
            ? '<span class="await-controls"><select data-assign-select="' + s.id + '">' + options + '</select>' +
              '<button type="button" class="mini primary" data-assign-to="' + s.id + '">عيّن</button></span>'
            : '<span class="await-controls note-inline">أضف حافلات أولًا</span>') +
        '</div>';
      }).join('')
    : '';

  const assigned = state.students
    .filter(s => s.busId)
    .sort((a, b) => (findBus(a.busId).plate > findBus(b.busId).plate ? 1 : -1));

  table.innerHTML = assigned.map(s => {
    const bus = findBus(s.busId);
    const used = busCount(bus.id);
    return '<tr>' +
      '<td><b>' + escapeHtml(s.name) + '</b><br><small>' + escapeHtml(s.schoolId) + '</small></td>' +
      '<td>حافلة ' + escapeHtml(bus.plate) + '<br><small>' + escapeHtml(bus.driverName) + '</small></td>' +
      '<td>' + used + '/' + bus.capacity + '</td>' +
      '<td class="row-actions"><button type="button" class="mini danger" data-unassign="' + s.id + '">إلغاء التعيين</button></td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="4" class="row-empty">لا توجد تعيينات بعد.</td></tr>';
}

/* ---------- العرض العام ---------- */
function renderAll() {
  renderDashboard();
  renderStudentsTable();
  renderBusesGrid();
  renderAssignments();
}

/* ---------- إدارة الطلاب ---------- */
function fillAreasDatalist() {
  const dl = $('#areasList');
  if (dl) dl.innerHTML = enumAreas().map(a => '<option value="' + escapeHtml(a) + '">').join('');
}

function fillBusSelect(selectedBusId) {
  const sel = $('#sBus');
  if (!sel) return;
  sel.innerHTML = '<option value="">— بلا حافلة —</option>' +
    state.buses.map(b => '<option value="' + b.id + '"' + (b.id === selectedBusId ? ' selected' : '') + '>' +
      escapeHtml(b.plate) + ' (' + escapeHtml(b.driverName) + ')</option>').join('');
}

function openStudentDialog(student) {
  const dialog = $('#studentDialog');
  if (!dialog) return;
  state.editStudentId = student ? student.id : null;

  $('#studentDialogTitle').textContent = student ? 'تعديل طالب' : 'إضافة طالب';
  $('#sSchoolId').value = student ? student.schoolId : '';
  $('#sName').value = student ? student.name : '';
  $('#sGrade').value = student ? student.grade : 'الخامس';
  $('#sSection').value = student ? (student.section || 1) : 1;
  $('#sArea').value = student ? (student.area || '') : '';
  $('#sMode').value = student ? student.mode : 'pending';
  fillAreasDatalist();
  fillBusSelect(student ? student.busId : '');
  dialog.showModal();
}

function saveStudentFromForm() {
  const schoolId = $('#sSchoolId').value.trim();
  const name = $('#sName').value.trim();
  const grade = $('#sGrade').value;
  const section = parseInt($('#sSection').value, 10) || 1;
  const area = $('#sArea').value.trim();
  const mode = $('#sMode').value;
  const busId = $('#sBus').value || null;

  if (!schoolId || !name) { toast('أدخل الرقم المدرسي والاسم'); return; }

  const duplicate = state.students.find(s =>
    s.schoolId.toLowerCase() === schoolId.toLowerCase() &&
    s.id !== state.editStudentId);
  if (duplicate) { toast('رقم مدرسي مكرر: ' + schoolId); return; }

  const bus = findBus(busId);
  if (bus && busCount(bus.id) >= bus.capacity && !state.students.find(s => s.id === state.editStudentId && s.busId === busId)) {
    toast('سعة الحافلة ممتلئة: ' + bus.plate);
    return;
  }

  if (state.editStudentId) {
    const student = findStudent(state.editStudentId);
    if (student) {
      student.schoolId = schoolId;
      student.name = name;
      student.grade = grade;
      student.section = section;
      student.area = area;
      student.mode = mode;
      student.busId = busId;
    }
  } else {
    state.students.push({
      id: newId(), schoolId, name, grade, section, area, mode, busId
    });
  }

  sortStudents();
  persist();
  renderAll();
  $('#studentDialog').close();
  toast(state.editStudentId ? 'تم حفظ تعديلات الطالب' : 'تمت إضافة الطالب');
}

function deleteStudent(id) {
  state.students = state.students.filter(s => s.id !== id);
  persist();
  renderAll();
  toast('تم حذف الطالب');
}

/* ---------- إدارة الحافلات ---------- */
function openBusDialog(bus) {
  const dialog = $('#busDialog');
  if (!dialog) return;
  state.editBusId = bus ? bus.id : null;

  $('#busDialogTitle').textContent = bus ? 'تعديل حافلة' : 'إضافة حافلة';
  $('#bPlate').value = bus ? bus.plate : '';
  $('#bDriver').value = bus ? bus.driverName : '';
  $('#bCapacity').value = bus ? bus.capacity : 1;
  $('#bType').value = bus ? bus.type : 'كبيرة';
  dialog.showModal();
}

function saveBusFromForm() {
  const plate = $('#bPlate').value.trim();
  const driverName = $('#bDriver').value.trim();
  const capacity = parseInt($('#bCapacity').value, 10) || 1;
  const type = $('#bType').value;

  if (!plate || !driverName) { toast('أدخل رقم اللوحة واسم السائق'); return; }

  const duplicate = state.buses.find(b =>
    b.plate.toLowerCase() === plate.toLowerCase() && b.id !== state.editBusId);
  if (duplicate) { toast('لوحة مكررة: ' + plate); return; }

  if (state.editBusId) {
    const bus = findBus(state.editBusId);
    if (bus) {
      const assignedCount = busCount(bus.id);
      if (capacity < assignedCount) {
        toast('السعة أدنى من عدد الطلاب المعيّنين حاليًا (' + assignedCount + ')');
        return;
      }
      bus.plate = plate;
      bus.driverName = driverName;
      bus.capacity = capacity;
      bus.type = type;
    }
  } else {
    state.buses.push({ id: newId(), plate, driverName, capacity, type });
  }

  state.buses.sort((a, b) => (a.plate > b.plate ? 1 : -1));
  state.students.sort((a, b) => (a.schoolId > b.schoolId ? 1 : -1));
  state.visibleStudents = PAGE_SIZE;
  persist();
  renderAll();
  $('#busDialog').close();
  toast(state.editBusId ? 'تم حفظ تعديلات الحافلة' : 'تمت إضافة الحافلة');
}

function deleteBus(id) {
  const count = busCount(id);
  if (count > 0) {
    state.students.forEach(s => { if (s.busId === id) s.busId = null; });
  }
  state.buses = state.buses.filter(b => b.id !== id);
  persist();
  renderAll();
  toast(count > 0 ? 'حُذفت الحافلة وأُلغي تعيين ' + count + ' طالب' : 'تم حذف الحافلة');
}

/* ---------- التعيين ---------- */
function assignStudentToBus(studentId, busId) {
  const student = findStudent(studentId);
  const bus = findBus(busId);
  if (!student || !bus) return;
  if (busCount(bus.id) >= bus.capacity) { toast('سعة الحافلة ممتلئة: ' + bus.plate); return; }
  student.busId = bus.id;
  if (student.mode === 'pending') student.mode = 'government';
  persist();
  renderAll();
  toast('تم تعيين الطالب على حافلة ' + bus.plate);
}

function unassignStudent(studentId) {
  const student = findStudent(studentId);
  if (!student) return;
  const bus = findBus(student.busId);
  student.busId = null;
  persist();
  renderAll();
  toast(bus ? 'أُلغي تعيين الطالب من حافلة ' + bus.plate : 'أُلغي التعيين');
}

function selectBusForStudent(studentId, selectEl) {
  const student = findStudent(studentId);
  if (!student || !selectEl) return;
  const bus = findBus(selectEl.value);
  if (!bus) return;
  const free = bus.capacity - busCount(bus.id);
  if (free <= 0) { toast('سعة الحافلة ممتلئة: ' + bus.plate); return; }
  assignStudentToBus(studentId, bus.id);
}

function pickBestBus() {
  let best = null;
  state.buses.forEach(b => {
    const free = b.capacity - busCount(b.id);
    if (free > 0 && (!best || free > best.capacity - busCount(best.id))) best = b;
  });
  return best;
}

/* تعيين تلقائي: كل طالب بلا حافلة (حكومي/غير محدد) يُسند لأفضل حافلة متاحة */
function autoAssignAll() {
  const candidates = state.students.filter(s => !s.busId && s.mode !== 'private' && s.mode !== 'walk');
  if (!candidates.length) { toast('لا يوجد طلاب بانتظار التعيين'); return; }
  if (!state.buses.length) { toast('أضف حافلات أولًا'); return; }

  let assigned = 0;
  let failed = 0;
  candidates.forEach(s => {
    const bus = pickBestBus();
    if (bus) {
      s.busId = bus.id;
      if (s.mode === 'pending') s.mode = 'government';
      assigned++;
    } else {
      failed++;
    }
  });

  persist();
  renderAll();
  toast(assigned > 0
    ? 'حُسّن التوزيع: عُيّن ' + assigned + (failed ? ' طالبًا، ولم يتسع لـ ' + failed : ' طالبًا')
    : 'لا توجد مقاعد متاحة (لم يُعيّن أحد)');
}

/* ---------- النسخ الاحتياطي ---------- */
function exportBackup() {
  const payload = {
    app: 'hawafilati',
    version: 1,
    exportedAt: new Date().toISOString(),
    students: state.students,
    buses: state.buses
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = 'hawafilati-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('تم تنزيل النسخة الاحتياطية');
}

function validateBackup(data) {
  return data &&
    typeof data === 'object' &&
    Array.isArray(data.students) &&
    Array.isArray(data.buses);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!validateBackup(data)) { toast('ملف غير صالح'); return; }

      const students = data.students.map(s => ({
        id: s.id || newId(),
        schoolId: String(s.schoolId || ''),
        name: String(s.name || ''),
        grade: String(s.grade || ''),
        section: s.section || 1,
        area: s.area || '',
        mode: MODES.includes(s.mode) ? s.mode : 'pending',
        busId: s.busId || null
      }));
      const buses = data.buses.map(b => ({
        id: b.id || newId(),
        plate: String(b.plate || ''),
        driverName: String(b.driverName || ''),
        capacity: b.capacity || 1,
        type: String(b.type || '')
      }));

      const busIds = new Set(buses.map(b => b.id));
      students.forEach(s => { if (s.busId && !busIds.has(s.busId)) s.busId = null; });

      state.students = students;
      state.buses = buses;
      state.visibleStudents = PAGE_SIZE;
      sortStudents();
      persist();
      renderAll();
      toast('تم الاستيراد: ' + students.length + ' طالب و' + buses.length + ' حافلة');
    } catch (e) {
      console.error(e);
      toast('تعذر قراءة الملف');
    }
    $('#importFile').value = '';
  };
  reader.readAsText(file);
}

function resetAllData() {
  state.students = [];
  state.buses = [];
  state.visibleStudents = PAGE_SIZE;
  persist();
  renderAll();
  $('#resetDialog').close();
  toast('حُذفت كل البيانات');
}

/* ---------- الاستيراد الجماعي (نسخ ولصق) ---------- */
const MODE_CODE_MAP = {
  '': 'pending',
  government: 'government', 'نقل حكومي': 'government',
  private: 'private', 'نقل خاص': 'private',
  walk: 'walk', 'مشيًا': 'walk', 'مشيا': 'walk',
  pending: 'pending', 'غير محدد': 'pending'
};

function parseCsvLines(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(line => line.split(/[,;\t]/).map(c => c.trim()));
}

function handleCsvImport() {
  const txt = $('#csvInput');
  if (!txt) return;
  const rows = parseCsvLines(txt.value);
  if (!rows.length) { toast('الصق البيانات أولًا'); return; }

  // تخطي سطر العناوين إن وُجد
  const first = rows[0];
  const isHeader = first.length >= 2 &&
    (/^(school|رقم|الرقم|id)/i.test(first[0]) && /^(name|اسم|الاسم)/i.test(first[1]));

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const existing = new Set(state.students.map(s => s.schoolId.toLowerCase()));

  rows.forEach((cells, idx) => {
    if (idx === 0 && isHeader) return;
    const schoolId = cells[0] || '';
    const name = cells[1] || '';
    if (!schoolId || !name) { failed++; return; }
    if (existing.has(schoolId.toLowerCase())) { skipped++; return; }

    const grade = GRADES.includes(cells[2]) ? cells[2] : GRADES[0];
    const section = parseInt(cells[3], 10) || 1;
    const area = cells[4] || '';
    const mode = MODE_CODE_MAP[(cells[5] || '').trim()] || 'pending';

    state.students.push({ id: newId(), schoolId, name, grade, section, area, mode, busId: null });
    existing.add(schoolId.toLowerCase());
    added++;
  });

  if (!added) {
    toast('لم تُضف صفوف (مكررة أو بيانات ناقصة) — أُضيف ' + skipped + ' مكرر و' + failed + ' ناقص');
    return;
  }

  sortStudents();
  persist();
  renderAll();
  toast('استيراد: أُضيف ' + added + (skipped ? '، تخطى ' + skipped + ' مكرر' : '') + (failed ? '، ' + failed + ' ناقص' : ''));
}

function sortStudents() {
  state.students.sort((a, b) => (a.schoolId > b.schoolId ? 1 : -1));
  state.buses.sort((a, b) => (a.plate > b.plate ? 1 : -1));
}

/* ---------- الأحداث ---------- */
function bindEvents() {
  $all('.tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

  $all('[data-action="export"]').forEach(btn => btn.addEventListener('click', exportBackup));

  const importBtn = $('#importBtn');
  const importFile = $('#importFile');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => {
      if (!state.students.length && !state.buses.length) importFile.click();
      else if (confirm('سيستبدل الاستيراد البيانات الحالية. متابعة؟')) importFile.click();
    });
    importFile.addEventListener('change', () => {
      if (importFile.files && importFile.files[0]) importBackup(importFile.files[0]);
    });
  }

  const resetBtn = $('#resetBtn');
  const resetDialog = $('#resetDialog');
  const confirmReset = $('#confirmReset');
  if (resetBtn && resetDialog) resetBtn.addEventListener('click', () => resetDialog.showModal());
  if (confirmReset) confirmReset.addEventListener('click', resetAllData);

  const search = $('#studentSearch');
  if (search) search.addEventListener('input', () => {
    clearTimeout(search._timer);
    search._timer = setTimeout(() => {
      state.studentSearch = search.value;
      state.visibleStudents = PAGE_SIZE;
      renderStudentsTable();
    }, SEARCH_DEBOUNCE);
  });

  const modeFilter = $('#modeFilter');
  if (modeFilter) modeFilter.addEventListener('change', () => {
    state.modeFilter = modeFilter.value;
    state.visibleStudents = PAGE_SIZE;
    renderStudentsTable();
  });

  const assignFilter = $('#assignFilter');
  if (assignFilter) assignFilter.addEventListener('change', () => {
    state.assignFilter = assignFilter.value;
    state.visibleStudents = PAGE_SIZE;
    renderStudentsTable();
  });

  const csvImportBtn = $('#csvImportBtn');
  if (csvImportBtn) csvImportBtn.addEventListener('click', handleCsvImport);

  const autoAssignBtn = $('#autoAssignBtn');
  if (autoAssignBtn) autoAssignBtn.addEventListener('click', autoAssignAll);

  const addStudentBtn = $('#addStudentBtn');
  if (addStudentBtn) addStudentBtn.addEventListener('click', () => openStudentDialog(null));

  const addBusBtn = $('#addBusBtn');
  if (addBusBtn) addBusBtn.addEventListener('click', () => openBusDialog(null));

  const studentForm = $('#studentForm');
  if (studentForm) studentForm.addEventListener('submit', e => { e.preventDefault(); saveStudentFromForm(); });

  const busForm = $('#busForm');
  if (busForm) busForm.addEventListener('submit', e => { e.preventDefault(); saveBusFromForm(); });

  $all('[data-dialog-cancel]').forEach(btn => btn.addEventListener('click', () => {
    const dialog = btn.closest('dialog');
    if (dialog) dialog.close();
  }));

  document.addEventListener('click', e => {
    const assignBtn = e.target.closest('[data-assign]');
    if (assignBtn) {
      const best = pickBestBus();
      if (best) assignStudentToBus(assignBtn.dataset.assign, best.id);
      else toast('لا توجد مقاعد متاحة في أي حافلة');
      return;
    }

    const editStudent = e.target.closest('[data-edit-student]');
    if (editStudent) { openStudentDialog(findStudent(editStudent.dataset.editStudent)); return; }

    const delStudent = e.target.closest('[data-delete-student]');
    if (delStudent) {
      const student = findStudent(delStudent.dataset.deleteStudent);
      if (student && confirm('حذف الطالب: ' + student.name + '؟')) deleteStudent(student.id);
      return;
    }

    const editBus = e.target.closest('[data-edit-bus]');
    if (editBus) { openBusDialog(findBus(editBus.dataset.editBus)); return; }

    const delBus = e.target.closest('[data-delete-bus]');
    if (delBus) {
      const bus = findBus(delBus.dataset.deleteBus);
      if (bus && confirm('حذف الحافلة ' + bus.plate + '؟ سيُلغي تعيين طلابها.')) deleteBus(bus.id);
      return;
    }

    const assignTo = e.target.closest('[data-assign-to]');
    if (assignTo) {
      const studentId = assignTo.dataset.assignTo;
      const select = $('[data-assign-select="' + studentId + '"]');
      if (select && select.value) selectBusForStudent(studentId, select);
      return;
    }

    const loadMore = e.target.closest('[data-load-more]');
    if (loadMore) {
      state.visibleStudents += PAGE_SIZE;
      renderStudentsTable();
      return;
    }

    const unassign = e.target.closest('[data-unassign]');
    if (unassign) {
      const student = findStudent(unassign.dataset.unassign);
      if (student && confirm('إلغاء تعيين: ' + student.name + '؟')) unassignStudent(student.id);
    }
  });
}

function setView(id) {
  $all('.view').forEach(v => v.classList.remove('active'));
  $all('.tab').forEach(t => t.classList.remove('active'));
  const view = $('#' + id);
  const tab = $('.tab[data-view="' + id + '"]');
  if (view) view.classList.add('active');
  if (tab) tab.classList.add('active');
  if (id === 'students') renderStudentsTable();
  if (id === 'assignments') renderAssignments();
}

/* ---------- الإقلاع ---------- */
function init() {
  const data = loadData();
  state.students = data.students;
  state.buses = data.buses;
  sortStudents();
  bindEvents();
  renderAll();
}

init();