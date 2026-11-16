(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'syCropFuncionarios.v1';
  const money = n => new Intl.NumberFormat('es-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const monthISO = () => todayISO().slice(0, 7);
  const monthName = m => {
    if (!m) return '';
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  };

  function loadState() {
    try {
      const x = JSON.parse(localStorage.getItem(STORE_KEY));
      if (x && Array.isArray(x.funcionarios)) {
        if (!Array.isArray(x.jobs)) x.jobs = [];
        if (!Array.isArray(x.vales)) x.vales = [];
        if (!Array.isArray(x.providers)) x.providers = [];
        if (!x.rates) x.rates = { prenda: 1.4, recta: 1.0, over: 0.4 };
        return x;
      }
    } catch (e) {}
    return {
      funcionarios: [],
      providers: [],
      jobs: [],
      vales: [],
      rates: { prenda: 1.4, recta: 1.0, over: 0.4 },
      theme: 'light'
    };
  }

  let state = loadState();
  let jobPhoto = '';
  let pendingConfirm = null;
  let toastTimer;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      showToast('No se pudo guardar. La foto puede ser muy grande.');
      return false;
    }
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function getRates() {
    if (!state.rates) state.rates = { prenda: 1.4, recta: 1.0, over: 0.4 };
    return state.rates;
  }

  function readRatesFromForm(persist) {
    const r = getRates();
    r.prenda = Number($('ratePrenda')?.value);
    if (Number.isNaN(r.prenda)) r.prenda = 1.4;
    r.recta = Number($('rateRecta')?.value);
    if (Number.isNaN(r.recta)) r.recta = 1.0;
    r.over = Number($('rateOver')?.value);
    if (Number.isNaN(r.over)) r.over = 0.4;
    state.rates = { ...r };
    if (persist) save();
    return state.rates;
  }

  function fillRatesForm() {
    const r = getRates();
    if ($('ratePrenda')) $('ratePrenda').value = r.prenda;
    if ($('rateRecta')) $('rateRecta').value = r.recta;
    if ($('rateOver')) $('rateOver').value = r.over;
  }

  function getFunc(id) {
    return state.funcionarios.find(f => f.id === id);
  }

  function getProvider(id) {
    return (state.providers || []).find(p => p.id === id);
  }

  function monthJobs() {
    const m = $('monthFilter').value;
    return state.jobs.filter(j => (j.date || '').startsWith(m));
  }

  function setTab(tab) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ['funcs', 'providers', 'jobs', 'vales', 'reports', 'rates'].forEach(t => {
      const el = $(t + 'Panel');
      if (el) el.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'rates') fillRatesForm();
    if (tab === 'vales') renderVales();
    if (tab === 'jobs') renderJobs();
    if (tab === 'funcs') renderFuncs();
    if (tab === 'providers') renderProviders();
    if (tab === 'reports') renderReports();
  }

  function renderStats() {
    const jobs = monthJobs();
    const produced = jobs.reduce((s, j) => s + (Number(j.totalPay) || 0), 0);
    const m = $('monthFilter').value;
    const valesSum = state.vales
      .filter(v => (v.date || '').startsWith(m))
      .reduce((s, v) => s + (Number(v.amount) || 0), 0);
    $('statFuncs').textContent = state.funcionarios.length;
    $('statJobs').textContent = jobs.length;
    $('statPay').textContent = money(produced - valesSum);
  }

  function renderFuncs() {
    renderStats();
    const list = $('funcsList');
    const fs = state.funcionarios.slice().sort((a, b) => a.name.localeCompare(b.name));
    const m = $('monthFilter').value;
    list.innerHTML = fs.map(f => {
      const earned = monthJobs().reduce((s, j) => {
        const w = (j.workers || []).find(x => x.funcionarioId === f.id);
        return s + (Number(w?.pay) || 0);
      }, 0);
      const valeSum = state.vales
        .filter(v => v.funcionarioId === f.id && (v.date || '').startsWith(m))
        .reduce((s, v) => s + Number(v.amount || 0), 0);
      return `<article class="provider-card"><div class="provider-icon">👤</div><div class="provider-main"><h3>${escapeHTML(f.name)}</h3><p>Mes: ${money(earned)} · Vales ${money(valeSum)} · Neto ${money(earned - valeSum)}</p></div><div class="provider-actions"><button class="mini-btn" data-func-del="${f.id}">Eliminar</button></div></article>`;
    }).join('');
    $('emptyFuncs').classList.toggle('hidden', fs.length > 0);
    list.classList.toggle('hidden', fs.length === 0);
  }


  function renderProviders() {
    renderStats();
    const list = $('providersList');
    if (!list) return;
    const ps = (state.providers || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const m = $('monthFilter').value;
    list.innerHTML = ps.map(p => {
      const n = state.jobs.filter(j => j.providerId === p.id && (j.date || '').startsWith(m)).length;
      return `<article class="provider-card"><div class="provider-icon">♧</div><div class="provider-main"><h3>${escapeHTML(p.name)}</h3><p>${n} trabajo(s) este mes</p></div><div class="provider-actions"><button class="mini-btn" data-prov-del="${p.id}">Eliminar</button></div></article>`;
    }).join('');
    $('emptyProviders')?.classList.toggle('hidden', ps.length > 0);
    list.classList.toggle('hidden', ps.length === 0);
  }

  function fillJobProviderSelect(selected) {
    const sel = $('jobProvider');
    if (!sel) return;
    const opts = (state.providers || []).slice().sort((a, b) => a.name.localeCompare(b.name))
      .map(p => `<option value="${p.id}" ${selected === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('');
    sel.innerHTML = '<option value="">Seleccionar proveedor…</option>' + opts;
    if (selected) sel.value = selected;
  }

  function renderJobs() {
    renderStats();
    const el = $('jobsList');
    const jobs = monthJobs().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    el.innerHTML = jobs.map(j => {
      const names = (j.workers || []).map(w => {
        const f = getFunc(w.funcionarioId);
        const extra = w.machine ? ` (${w.machine})` : '';
        return `${escapeHTML(f?.name || '?')}${extra} ${money(w.pay || 0)}`;
      }).join(' · ');
      const thumb = j.photo
        ? `<img src="${j.photo}" alt="">`
        : '✂';
      const prov = getProvider(j.providerId);
      return `<article class="cut-card"><div class="cut-thumb">${thumb}</div><div class="cut-info"><h3>${escapeHTML(j.title)}</h3><div class="cut-meta"><span>♧ ${escapeHTML(prov?.name || 'Sin proveedor')}</span><span>${j.pieces} prendas</span><span>${escapeHTML(j.date)}</span><span>${j.payMode === 'por_maquina' ? 'Por máquina' : 'Completo'}</span></div><p class="muted" style="margin:6px 0 0;font-size:12px">${names}</p></div><div class="cut-money"><div><strong>${money(j.totalPay)}</strong><small>a pagar</small></div><div class="cut-actions"><button class="mini-btn" data-job-edit="${j.id}">Editar</button><button class="mini-btn" data-job-del="${j.id}">Eliminar</button></div></div></article>`;
    }).join('');
    $('emptyJobs').classList.toggle('hidden', jobs.length > 0);
    el.classList.toggle('hidden', jobs.length === 0);
  }

  function renderVales() {
    renderStats();
    const el = $('valesList');
    const m = $('monthFilter').value;
    const fid = $('valeFilter')?.value || '';
    const list = state.vales
      .filter(v => (v.date || '').startsWith(m) && (!fid || v.funcionarioId === fid))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    el.innerHTML = list.map(v => {
      const f = getFunc(v.funcionarioId);
      return `<article class="cut-card vale-card"><div class="cut-thumb vale-thumb">$</div><div class="cut-info"><h3>${money(v.amount)}</h3><div class="cut-meta"><span>${escapeHTML(f?.name || '?')}</span><span>${escapeHTML(v.date)}</span>${v.note ? `<span>${escapeHTML(v.note)}</span>` : ''}</div></div><div class="cut-money"><div class="cut-actions"><button class="mini-btn" data-vale-del="${v.id}">Eliminar</button></div></div></article>`;
    }).join('');
    $('emptyVales').classList.toggle('hidden', list.length > 0);
    el.classList.toggle('hidden', list.length === 0);
    const sel = $('valeFilter');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">Todos</option>' +
        state.funcionarios.map(f => `<option value="${f.id}">${escapeHTML(f.name)}</option>`).join('');
      sel.value = cur;
    }
  }


  function jobsForFuncionario(funcId, month) {
    return state.jobs
      .filter(j => (j.date || '').startsWith(month) && (j.workers || []).some(w => w.funcionarioId === funcId))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  function payForFuncionarioInJob(job, funcId) {
    const w = (job.workers || []).find(x => x.funcionarioId === funcId);
    return Number(w?.pay) || 0;
  }

  function valesForFuncionario(funcId, month) {
    return state.vales.filter(v => v.funcionarioId === funcId && (v.date || '').startsWith(month));
  }

  function renderReports() {
    const list = $('reportsList');
    if (!list) return;
    const m = $('monthFilter').value;
    const fs = state.funcionarios.slice().sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = fs.map(f => {
      const jobs = jobsForFuncionario(f.id, m);
      const totalPay = jobs.reduce((s, j) => s + payForFuncionarioInJob(j, f.id), 0);
      const valesSum = valesForFuncionario(f.id, m).reduce((s, v) => s + Number(v.amount || 0), 0);
      const neto = totalPay - valesSum;
      const hasData = jobs.length > 0 || valesSum > 0;
      return `<article class="report-card"><div class="provider-icon">▧</div><div class="provider-main"><h3>${escapeHTML(f.name)}</h3><p>${jobs.length} corte(s) · Ganado ${money(totalPay)} · Vales ${money(valesSum)}<br><strong>Neto: ${money(neto)}</strong></p></div><button class="primary" data-pdf="${f.id}" ${hasData ? '' : 'disabled'}>Compartir PDF ↗</button></article>`;
    }).join('');
    $('emptyReports')?.classList.toggle('hidden', fs.length > 0);
    if (!fs.length) list.innerHTML = '';
  }

  async function exportFuncPDF(funcId) {
    const f = getFunc(funcId);
    const m = $('monthFilter').value;
    if (!f) return;
    const jobs = jobsForFuncionario(funcId, m);
    const vales = valesForFuncionario(funcId, m);
    const totalPay = jobs.reduce((s, j) => s + payForFuncionarioInJob(j, f.id), 0);
    const valesSum = vales.reduce((s, v) => s + Number(v.amount || 0), 0);
    const neto = totalPay - valesSum;

    if (!jobs.length && !vales.length) {
      showToast('Este funcionario no tiene movimientos en el mes.');
      return;
    }
    if (!window.jspdf?.jsPDF) {
      showToast('No se pudo cargar el generador de PDF. Revisá la conexión.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 10;
    let y = 12;

    // Header
    doc.setFillColor(25, 59, 50);
    doc.roundedRect(margin, y, pageW - margin * 2, 22, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('INFORME DE FUNCIONARIO', margin + 5, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Funcionario: ${f.name}`, margin + 5, y + 15);
    doc.text(`Mes: ${monthName(m)}`, pageW - margin - 5, y + 15, { align: 'right' });
    y += 28;

    // Column headers for jobs
    doc.setTextColor(45, 65, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FECHA', margin + 2, y);
    doc.text('MODELO / PROVEEDOR', margin + 28, y);
    doc.text('PAGO', pageW - margin - 2, y, { align: 'right' });
    y += 4;
    doc.setDrawColor(200, 210, 205);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    if (!jobs.length) {
      doc.setTextColor(120, 130, 123);
      doc.text('Sin cortes registrados este mes.', margin + 2, y);
      y += 8;
    } else {
      for (const j of jobs) {
        if (y > pageH - 45) {
          doc.addPage();
          y = 15;
        }
        const pay = payForFuncionarioInJob(j, f.id);
        const prov = getProvider(j.providerId);
        const w = (j.workers || []).find(x => x.funcionarioId === f.id);
        const detail = w?.machine
          ? (w.pieces ? `${w.pieces} pzas · ${w.machine}` : w.machine)
          : (j.payMode === 'por_maquina' ? 'por máquina' : 'pago completo');

        doc.setTextColor(35, 54, 44);
        doc.setFont('helvetica', 'normal');
        doc.text(j.date || '', margin + 2, y);
        doc.setFont('helvetica', 'bold');
        const titleLines = doc.splitTextToSize(j.title || '', 100);
        doc.text(titleLines.slice(0, 2), margin + 28, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 110, 105);
        doc.text(`${prov?.name || '—'} · ${detail}`, margin + 28, y + 4);
        doc.setFontSize(8);
        doc.setTextColor(35, 54, 44);
        doc.setFont('helvetica', 'bold');
        doc.text(money(pay), pageW - margin - 2, y, { align: 'right' });
        y += Math.max(10, titleLines.slice(0, 2).length * 4 + 6);
      }
    }

    // Vales section
    y += 4;
    if (y > pageH - 50) { doc.addPage(); y = 15; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(45, 65, 55);
    doc.text('VALES DEL MES', margin + 2, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (!vales.length) {
      doc.setTextColor(120, 130, 123);
      doc.text('Sin vales este mes.', margin + 2, y);
      y += 8;
    } else {
      for (const v of vales) {
        if (y > pageH - 40) { doc.addPage(); y = 15; }
        doc.setTextColor(35, 54, 44);
        doc.text(v.date || '', margin + 2, y);
        doc.text(v.note || 'Vale', margin + 28, y);
        doc.setTextColor(150, 70, 50);
        doc.text(`− ${money(v.amount)}`, pageW - margin - 2, y, { align: 'right' });
        y += 6;
      }
    }

    // Totals box
    y += 6;
    if (y > pageH - 35) { doc.addPage(); y = 15; }
    const boxH = 28;
    doc.setFillColor(232, 242, 236);
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 2, 2, 'F');
    doc.setTextColor(45, 105, 85);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Total ganado (cortes): ${money(totalPay)}`, margin + 5, y + 8);
    doc.setTextColor(150, 70, 50);
    doc.text(`Total vales: ${money(valesSum)}`, margin + 5, y + 15);
    doc.setTextColor(25, 59, 50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`PAGO NETO: ${money(neto)}`, pageW - margin - 5, y + 18, { align: 'right' });

    doc.setTextColor(120, 130, 123);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('Generado desde SY CROP Funcionarios · Valores en reales (BRL)', pageW / 2, pageH - 6, { align: 'center' });

    const safe = f.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `informe-${safe}-${m}.pdf`;

    try {
      const blob = doc.output('blob');
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Informe ${f.name} — ${monthName(m)}`,
          text: `Informe SY CROP Funcionarios — ${f.name}`
        });
        showToast('PDF compartido.');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        showToast('Compartir cancelado.');
        return;
      }
    }
    doc.save(filename);
    showToast('PDF generado para ' + f.name + '.');
  }

  function renderAll() {
    fillRatesForm();
    renderFuncs();
    renderProviders();
    renderJobs();
    renderVales();
    renderReports();
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 900;
          const scale = Math.min(1, max / img.width);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function askConfirm(title, text, yes) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    pendingConfirm = yes;
    $('confirmModal').classList.remove('hidden');
  }
  function closeConfirm() {
    $('confirmModal').classList.add('hidden');
    pendingConfirm = null;
  }

  function buildWorkerChecks() {
    const box = $('workersCheck');
    box.innerHTML = state.funcionarios.map(f =>
      `<label><input type="checkbox" value="${f.id}"> ${escapeHTML(f.name)}</label>`
    ).join('') || '<p class="muted">Añadí funcionarios en Equipo.</p>';
    box.querySelectorAll('input').forEach(i => i.addEventListener('change', calcCompleto));
  }

  function addMachineRow() {
    const wrap = $('machineRows');
    const row = document.createElement('div');
    row.className = 'machine-row';
    const opts = state.funcionarios.map(f => `<option value="${f.id}">${escapeHTML(f.name)}</option>`).join('');
    row.innerHTML = `
      <label>Persona<select class="fj-person"><option value="">—</option>${opts}</select></label>
      <label>Máquina<select class="fj-machine"><option value="recta">Recta</option><option value="over">Over</option></select></label>
      <label>Por prenda (R$)<input type="number" class="fj-pay" min="0" step="0.01" placeholder="0,00"></label>`;
    wrap.appendChild(row);
    row.querySelectorAll('input,select').forEach(el => el.addEventListener('input', calcMachine));
    calcMachine();
  }

  function calcMachine() {
    const pieces = Number($('jobPieces')?.value) || 0;
    let total = 0;
    document.querySelectorAll('#machineRows .machine-row').forEach(row => {
      const unit = Number(row.querySelector('.fj-pay')?.value) || 0;
      total += pieces * unit;
    });
    $('machineTotal').textContent = money(total);
    const detail = $('machineDetail');
    if (detail) {
      detail.textContent = pieces
        ? `(${pieces} prendas × montos por prenda)`
        : '';
    }
    return total;
  }

  function calcCompleto() {
    const pieces = Number($('jobPieces').value) || 0;
    let unit = Number($('jobUnitPrice')?.value);
    if (Number.isNaN(unit) || unit < 0) unit = getRates().prenda;
    const total = pieces * unit;
    const n = document.querySelectorAll('#workersCheck input:checked').length;
    if ($('completoTotal')) $('completoTotal').textContent = money(total);
    if ($('completoDetail')) {
      $('completoDetail').textContent = n
        ? `(${pieces} × ${money(unit)} · ${n} pers. → ${money(total / n)} c/u)`
        : `(${pieces} × ${money(unit)})`;
    }
    return total;
  }

  function togglePayMode() {
    const mode = $('jobPayMode').value;
    $('completoBox').classList.toggle('hidden', mode !== 'completo');
    $('maquinaBox').classList.toggle('hidden', mode !== 'por_maquina');
    if (mode === 'por_maquina' && !$('machineRows').children.length) addMachineRow();
  }

  function openJob(job = null) {
    if (!state.funcionarios.length) {
      showToast('Primero añadí funcionarios en Equipo.');
      setTab('funcs');
      return;
    }
    if (!(state.providers || []).length) {
      showToast('Primero registrá un proveedor.');
      setTab('providers');
      return;
    }
    $('jobForm').reset();
    $('jobId').value = job?.id || '';
    const modalTitle = document.querySelector('#jobModal h2');
    if (modalTitle) modalTitle.textContent = job ? 'Editar trabajo' : 'Registrar trabajo';
    $('jobDate').value = job?.date || todayISO();
    $('jobPieces').value = job?.pieces ?? '';
    $('jobTitle').value = job?.title || '';
    $('jobNote').value = job?.note || '';
    jobPhoto = job?.photo || '';
    if (jobPhoto) {
      $('jobPhotoPreview').src = jobPhoto;
      $('jobPhotoWrap').classList.remove('hidden');
    } else {
      $('jobPhotoWrap').classList.add('hidden');
    }
    $('machineRows').innerHTML = '';
    fillJobProviderSelect(job?.providerId);
    buildWorkerChecks();
    // pre-check workers for completo
    if (job && job.payMode === 'completo') {
      (job.workers || []).forEach(w => {
        const cb = document.querySelector(`#workersCheck input[value="${w.funcionarioId}"]`);
        if (cb) cb.checked = true;
      });
    }
    const unit = job?.rates?.prenda ?? job?.workers?.[0]?.rate ?? getRates().prenda;
    if ($('jobUnitPrice')) $('jobUnitPrice').value = unit;
    $('jobPayMode').value = job?.payMode || 'completo';
    togglePayMode();
    if (job && job.payMode === 'por_maquina') {
      $('machineRows').innerHTML = '';
      (job.workers || []).forEach(w => {
        addMachineRow();
        const row = $('machineRows').lastElementChild;
        if (!row) return;
        if (row.querySelector('.fj-person')) row.querySelector('.fj-person').value = w.funcionarioId || '';
        if (row.querySelector('.fj-machine')) row.querySelector('.fj-machine').value = w.machine || 'recta';
        if (row.querySelector('.fj-pay')) row.querySelector('.fj-pay').value = w.rate ?? (w.pieces ? (w.pay / w.pieces) : w.pay) ?? '';
      });
      if (!(job.workers || []).length) addMachineRow();
    }
    calcCompleto();
    calcMachine();
    $('jobModal').classList.remove('hidden');
  }

  function closeJob() {
    $('jobModal').classList.add('hidden');
  }

  // Events
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('monthFilter').value = monthISO();
  $('monthFilter').addEventListener('change', renderAll);

  $('addFuncBtn').addEventListener('click', () => {
    $('funcForm').classList.remove('hidden');
    $('funcName').focus();
  });
  $('cancelFunc').addEventListener('click', () => {
    $('funcForm').classList.add('hidden');
    $('funcForm').reset();
  });
  $('funcForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('funcName').value.trim();
    if (!name) return;
    if (state.funcionarios.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      showToast('Ya existe ese nombre.');
      return;
    }
    state.funcionarios.push({ id: crypto.randomUUID(), name });
    save();
    $('funcForm').reset();
    $('funcForm').classList.add('hidden');
    renderAll();
    showToast('Funcionario añadido.');
  });
  $('funcsList').addEventListener('click', e => {
    const del = e.target.closest('[data-func-del]');
    if (!del) return;
    const f = getFunc(del.dataset.funcDel);
    if (!f) return;
    askConfirm('Eliminar', `¿Eliminar a ${f.name}?`, () => {
      state.funcionarios = state.funcionarios.filter(x => x.id !== f.id);
      save();
      renderAll();
      showToast('Eliminado.');
    });
  });


  // Proveedores
  $('addProviderBtn')?.addEventListener('click', () => {
    $('providerForm')?.classList.remove('hidden');
    $('providerName')?.focus();
  });
  $('cancelProvider')?.addEventListener('click', () => {
    $('providerForm')?.classList.add('hidden');
    $('providerForm')?.reset();
  });
  $('providerForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('providerName').value.trim();
    if (!name) return;
    if (!state.providers) state.providers = [];
    if (state.providers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Ya existe ese proveedor.');
      return;
    }
    state.providers.push({ id: crypto.randomUUID(), name });
    save();
    $('providerForm').reset();
    $('providerForm').classList.add('hidden');
    renderAll();
    showToast('Proveedor añadido.');
  });
  $('providersList')?.addEventListener('click', e => {
    const del = e.target.closest('[data-prov-del]');
    if (!del) return;
    const p = getProvider(del.dataset.provDel);
    if (!p) return;
    const used = state.jobs.some(j => j.providerId === p.id);
    askConfirm('Eliminar proveedor', used
      ? `¿Eliminar “${p.name}”? Los trabajos ya guardados conservarán el id, pero no el nombre.`
      : `¿Eliminar “${p.name}”?`, () => {
      state.providers = state.providers.filter(x => x.id !== p.id);
      save();
      renderAll();
      showToast('Proveedor eliminado.');
    });
  });

  $('addJobBtn').addEventListener('click', openJob);
  $('closeJob').addEventListener('click', closeJob);
  $('cancelJob').addEventListener('click', closeJob);
  $('jobPayMode').addEventListener('change', () => { togglePayMode(); calcCompleto(); calcMachine(); });
  $('jobPieces').addEventListener('input', () => { calcCompleto(); calcMachine(); });
  $('jobUnitPrice')?.addEventListener('input', calcCompleto);
  $('addMachineRow').addEventListener('click', addMachineRow);
  $('jobPhoto').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      jobPhoto = await compressImage(file);
      $('jobPhotoPreview').src = jobPhoto;
      $('jobPhotoWrap').classList.remove('hidden');
    } catch {
      showToast('No se pudo leer la foto');
    }
  });
  $('jobRemovePhoto').addEventListener('click', () => {
    jobPhoto = '';
    $('jobPhoto').value = '';
    $('jobPhotoWrap').classList.add('hidden');
  });
  $('jobForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('jobTitle').value.trim();
    const date = $('jobDate').value;
    const pieces = Number($('jobPieces').value);
    const payMode = $('jobPayMode').value;
    const providerId = $('jobProvider')?.value || '';
    if (!providerId) {
      showToast('Seleccioná el proveedor de este trabajo.');
      return;
    }
    if (!title || !date || !(pieces > 0)) {
      showToast('Completá fecha, prenda y cantidad.');
      return;
    }
    const rates = readRatesFromForm(true);
    let unitPrice = Number($('jobUnitPrice')?.value);
    if (Number.isNaN(unitPrice) || unitPrice < 0) unitPrice = rates.prenda;
    rates.prenda = unitPrice; // snapshot del precio usado en este trabajo
    let workers = [];
    let totalPay = 0;
    if (payMode === 'completo') {
      totalPay = pieces * unitPrice;
      const checked = [...document.querySelectorAll('#workersCheck input:checked')].map(i => i.value);
      if (!checked.length) {
        showToast('Marcá quiénes participaron.');
        return;
      }
      const share = totalPay / checked.length;
      workers = checked.map(id => ({ funcionarioId: id, pay: share, rate: unitPrice }));
    } else {
      document.querySelectorAll('#machineRows .machine-row').forEach(row => {
        const funcionarioId = row.querySelector('.fj-person')?.value;
        const machine = row.querySelector('.fj-machine')?.value;
        const unit = Number(row.querySelector('.fj-pay')?.value) || 0;
        if (!funcionarioId || unit <= 0) return;
        const pay = pieces * unit;
        workers.push({ funcionarioId, machine, pieces, rate: unit, pay });
        totalPay += pay;
      });
      if (!workers.length) {
        showToast('Añadí al menos una persona con el monto por prenda.');
        return;
      }
    }
    const existingId = $('jobId')?.value || '';
    const payload = {
      id: existingId || crypto.randomUUID(),
      date,
      title,
      providerId,
      pieces,
      photo: jobPhoto || '',
      payMode,
      workers,
      totalPay,
      rates: { ...rates },
      note: $('jobNote').value.trim(),
      createdAt: existingId
        ? (state.jobs.find(j => j.id === existingId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const ix = state.jobs.findIndex(j => j.id === payload.id);
    if (ix >= 0) state.jobs[ix] = payload;
    else state.jobs.push(payload);
    save();
    closeJob();
    renderAll();
    showToast(ix >= 0 ? 'Trabajo actualizado.' : 'Trabajo guardado.');
    setTab('jobs');
  });
  $('jobsList').addEventListener('click', e => {
    const edit = e.target.closest('[data-job-edit]');
    if (edit) {
      const job = state.jobs.find(j => j.id === edit.dataset.jobEdit);
      if (job) openJob(job);
      return;
    }
    const del = e.target.closest('[data-job-del]');
    if (!del) return;
    askConfirm('Eliminar trabajo', '¿Eliminar este registro?', () => {
      state.jobs = state.jobs.filter(j => j.id !== del.dataset.jobDel);
      save();
      renderAll();
      showToast('Eliminado.');
    });
  });

  $('addValeBtn').addEventListener('click', () => {
    if (!state.funcionarios.length) {
      showToast('Primero añadí funcionarios.');
      setTab('funcs');
      return;
    }
    $('valeFunc').innerHTML = '<option value="">Seleccionar…</option>' +
      state.funcionarios.map(f => `<option value="${f.id}">${escapeHTML(f.name)}</option>`).join('');
    $('valeForm').reset();
    $('valeDate').value = todayISO();
    $('valeModal').classList.remove('hidden');
  });
  $('closeVale').addEventListener('click', () => $('valeModal').classList.add('hidden'));
  $('cancelVale').addEventListener('click', () => $('valeModal').classList.add('hidden'));
  $('valeFilter').addEventListener('change', renderVales);
  $('valeForm').addEventListener('submit', e => {
    e.preventDefault();
    const funcionarioId = $('valeFunc').value;
    const amount = Number($('valeAmount').value);
    const date = $('valeDate').value;
    if (!funcionarioId || !(amount > 0) || !date) {
      showToast('Completá los datos.');
      return;
    }
    state.vales.push({
      id: crypto.randomUUID(),
      funcionarioId,
      amount,
      date,
      note: $('valeNote').value.trim()
    });
    save();
    $('valeModal').classList.add('hidden');
    renderAll();
    showToast('Vale registrado.');
  });
  $('valesList').addEventListener('click', e => {
    const del = e.target.closest('[data-vale-del]');
    if (!del) return;
    askConfirm('Eliminar vale', '¿Eliminar este vale?', () => {
      state.vales = state.vales.filter(v => v.id !== del.dataset.valeDel);
      save();
      renderAll();
      showToast('Vale eliminado.');
    });
  });

    document.body.addEventListener('click', e => {
    const b = e.target.closest('[data-pdf]');
    if (b && b.dataset.pdf) exportFuncPDF(b.dataset.pdf);
  });

  $('saveRatesBtn').addEventListener('click', () => {
    readRatesFromForm(true);
    showToast('Tarifas guardadas.');
  });
  $('ratePrenda').addEventListener('input', () => { readRatesFromForm(true); calcCompleto(); });
  $('rateRecta').addEventListener('input', () => { readRatesFromForm(true); calcMachine(); });
  $('rateOver').addEventListener('input', () => { readRatesFromForm(true); calcMachine(); });

  $('closeConfirm').addEventListener('click', closeConfirm);
  $('confirmNo').addEventListener('click', closeConfirm);
  $('confirmYes').addEventListener('click', () => {
    const fn = pendingConfirm;
    closeConfirm();
    if (fn) fn();
  });

  $('themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('dark', state.theme === 'dark');
    $('themeBtn').textContent = state.theme === 'dark' ? '☾' : '☼';
    save();
  });
  document.body.classList.toggle('dark', state.theme === 'dark');
  $('themeBtn').textContent = state.theme === 'dark' ? '☾' : '☼';

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeJob();
      closeConfirm();
      $('valeModal').classList.add('hidden');
    }
  });

  let deferredPrompt = null;
  const installBtn = $('installBtn');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn?.classList.remove('hidden');
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) {
      showToast('Ya está instalada o el navegador no permite instalar.');
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  renderAll();
})();
