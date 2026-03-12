/* ============================================================
   DocView - app.js
   ============================================================ */

'use strict';

// PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const App = (() => {

  /* ──────────────────────────────────────────
     State
  ────────────────────────────────────────── */
  let state = {
    theme: localStorage.getItem('theme') || 'light',
    view: localStorage.getItem('view') || 'grid',
    currentPage: 'home',
    searchQuery: '',
    viewer: {
      open: false,
      docId: null,
      type: null,
      pdfDoc: null,
      pdfPage: 1,
      pdfZoom: 1.0,
      pdfTotal: 1,
      excelWorkbook: null,
      currentSheet: 0,
    }
  };

  /* ──────────────────────────────────────────
     Init
  ────────────────────────────────────────── */
  function init() {
    applyTheme(state.theme);
    applyView(state.view);
    setupUploadZone();
    setupKeyboard();
    navigate('home');
    updateDocCount();
  }

  /* ──────────────────────────────────────────
     Navigation
  ────────────────────────────────────────── */
  function navigate(page) {
    state.currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.add('active');
    const nav = document.querySelector(`[data-page="${page}"]`);
    if (nav) nav.classList.add('active');

    closeSidebar();

    if (page === 'home') loadRecentDocs();
    if (page === 'documents') loadDocuments();
  }

  /* ──────────────────────────────────────────
     Theme
  ────────────────────────────────────────── */
  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    applyTheme(state.theme);
  }

  function applyTheme(theme) {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(`${theme}-mode`);

    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    if (theme === 'dark') {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    } else {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
    }
  }

  /* ──────────────────────────────────────────
     View Toggle
  ────────────────────────────────────────── */
  function setView(v) {
    state.view = v;
    localStorage.setItem('view', v);
    applyView(v);
    loadDocuments();
  }

  function applyView(v) {
    document.getElementById('gridViewBtn').classList.toggle('active', v === 'grid');
    document.getElementById('listViewBtn').classList.toggle('active', v === 'list');
  }

  /* ──────────────────────────────────────────
     Sidebar
  ────────────────────────────────────────── */
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  }

  /* ──────────────────────────────────────────
     Search
  ────────────────────────────────────────── */
  function search(q) {
    state.searchQuery = q;
    if (state.currentPage === 'documents') loadDocuments();
    else navigate('documents');
  }

  /* ──────────────────────────────────────────
     Upload Zone
  ────────────────────────────────────────── */
  function setupUploadZone() {
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('fileInput');

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    });

    input.addEventListener('change', () => {
      handleFiles(Array.from(input.files));
      input.value = '';
    });
  }

  function handleFiles(files) {
    const allowed = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'];

    const valid = files.filter(f => allowed.includes(f.type));
    if (!valid.length) {
      showToast('Please upload PDF, Word, or Excel files only.', 'error');
      return;
    }

    const queue = document.getElementById('uploadQueue');
    queue.classList.remove('hidden');

    valid.forEach(file => uploadFile(file));
  }

  function uploadFile(file) {
    const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const queue = document.getElementById('uploadQueue');

    const icon = getFileIcon(file.type);
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.id = id;
    item.innerHTML = `
      <div class="upload-item-icon">${icon}</div>
      <div class="upload-item-info">
        <div class="upload-item-name">${escapeHtml(file.name)}</div>
        <div class="upload-progress"><div class="upload-progress-bar" style="width:0%"></div></div>
        <div class="upload-status">Uploading…</div>
      </div>`;
    queue.appendChild(item);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100);
        item.querySelector('.upload-progress-bar').style.width = pct + '%';
        item.querySelector('.upload-status').textContent = `Uploading… ${pct}%`;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        item.querySelector('.upload-progress-bar').style.width = '100%';
        item.querySelector('.upload-status').textContent = '✓ Upload complete';
        item.querySelector('.upload-status').classList.add('success');
        showToast(`${file.name} uploaded!`, 'success');
        updateDocCount();
        setTimeout(() => item.remove(), 3000);
      } else {
        item.querySelector('.upload-status').textContent = '✗ Upload failed';
        item.querySelector('.upload-status').classList.add('error');
      }
    });

    xhr.addEventListener('error', () => {
      item.querySelector('.upload-status').textContent = '✗ Network error';
      item.querySelector('.upload-status').classList.add('error');
    });

    xhr.send(formData);
  }

  /* ──────────────────────────────────────────
     Document Loading
  ────────────────────────────────────────── */
  async function loadDocuments() {
    const grid = document.getElementById('documentsGrid');
    const empty = document.getElementById('emptyState');

    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Loading…</div>';

    try {
      const type = document.getElementById('filterType')?.value || 'all';
      const sort = document.getElementById('sortBy')?.value || 'date';
      const q = encodeURIComponent(state.searchQuery);

      const res = await fetch(`/api/documents?type=${type}&sort=${sort}&search=${q}`);
      const docs = await res.json();

      grid.innerHTML = '';

      if (!docs.length) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');

      if (state.view === 'list') {
        grid.classList.add('list-view');
      } else {
        grid.classList.remove('list-view');
      }

      docs.forEach(doc => {
        grid.appendChild(createDocCard(doc));
      });

    } catch (err) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--pdf-color);">Error loading documents</div>';
    }
  }

  async function loadRecentDocs() {
    const grid = document.getElementById('recentDocs');
    grid.innerHTML = '';

    try {
      const res = await fetch('/api/documents?sort=date');
      const docs = await res.json();
      const recent = docs.slice(0, 6);

      if (!recent.length) {
        grid.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:14px;">No documents yet. <button onclick="App.navigate(\'upload\')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-weight:600;">Upload one →</button></div>';
        return;
      }

      recent.forEach(doc => grid.appendChild(createDocCard(doc)));
    } catch {}
  }

  async function updateDocCount() {
    try {
      const res = await fetch('/api/documents');
      const docs = await res.json();
      document.getElementById('docCount').textContent = docs.length;
    } catch {}
  }

  /* ──────────────────────────────────────────
     Document Card
  ────────────────────────────────────────── */
  function createDocCard(doc) {
    const card = document.createElement('div');
    card.className = `doc-card ${doc.type}`;

    const icon = getFileIcon(doc.mimetype);
    const date = new Date(doc.uploadedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    card.innerHTML = `
      <div class="doc-card-thumb">
        <div class="doc-card-actions">
          <button class="doc-action-btn" onclick="event.stopPropagation();downloadDoc('${doc.id}')" title="Download">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="doc-action-btn delete" onclick="event.stopPropagation();deleteDoc('${doc.id}',this)" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
        ${icon}
      </div>
      <div class="doc-card-body">
        <div class="doc-card-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
        <div class="doc-card-meta">${doc.sizeFormatted} · ${date}</div>
      </div>`;

    card.addEventListener('click', () => openViewer(doc));
    return card;
  }

  /* ──────────────────────────────────────────
     Viewer
  ────────────────────────────────────────── */
  async function openViewer(doc) {
    state.viewer.open = true;
    state.viewer.docId = doc.id;
    state.viewer.type = doc.type;

    document.getElementById('viewerModal').classList.remove('hidden');
    document.getElementById('viewerFilename').textContent = doc.name;
    document.getElementById('viewerMeta').textContent = `${doc.sizeFormatted} · ${doc.type.toUpperCase()}`;

    const fileIcon = document.getElementById('viewerFileIcon');
    fileIcon.innerHTML = getFileIcon(doc.mimetype);
    fileIcon.className = `viewer-file-icon`;
    if (doc.type === 'pdf') fileIcon.style.background = 'var(--pdf-bg)';
    else if (doc.type === 'docx') fileIcon.style.background = 'var(--word-bg)';
    else fileIcon.style.background = 'var(--excel-bg)';

    document.getElementById('viewerContent').innerHTML = '';
    document.getElementById('viewerLoading').style.display = 'flex';
    document.getElementById('pdfControls').classList.add('hidden');
    document.getElementById('excelTabs').classList.add('hidden');

    document.body.style.overflow = 'hidden';

    const url = `/api/view/${doc.id}`;

    try {
      if (doc.type === 'pdf') {
        await renderPDF(url, doc);
      } else if (doc.type === 'docx') {
        await renderWord(url, doc);
      } else if (doc.type === 'xlsx') {
        await renderExcel(url, doc);
      }
    } catch (err) {
      document.getElementById('viewerLoading').style.display = 'none';
      document.getElementById('viewerContent').innerHTML =
        `<div style="text-align:center;padding:60px;color:var(--pdf-color);">
          <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
          <div style="font-weight:600;margin-bottom:8px;">Could not load document</div>
          <div style="font-size:13px;color:var(--text-muted)">${err.message}</div>
        </div>`;
    }
  }

  /* PDF Rendering */
  async function renderPDF(url, doc) {
    const pdfDoc = await pdfjsLib.getDocument(url).promise;
    state.viewer.pdfDoc = pdfDoc;
    state.viewer.pdfPage = 1;
    state.viewer.pdfTotal = pdfDoc.numPages;
    state.viewer.pdfZoom = 1.0;

    document.getElementById('pdfControls').classList.remove('hidden');

    document.getElementById('viewerLoading').style.display = 'none';
    await renderPDFPages();
  }

  async function renderPDFPages() {
    const container = document.getElementById('viewerContent');
    container.innerHTML = '';

    const { pdfDoc, pdfPage, pdfZoom } = state.viewer;
    const page = await pdfDoc.getPage(pdfPage);
    const viewport = page.getViewport({ scale: pdfZoom * (window.devicePixelRatio || 1.5) });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = (viewport.width / (window.devicePixelRatio || 1.5)) + 'px';
    canvas.style.height = (viewport.height / (window.devicePixelRatio || 1.5)) + 'px';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    document.getElementById('pdfPageInfo').textContent =
      `${pdfPage} / ${state.viewer.pdfTotal}`;
    document.getElementById('pdfZoomLevel').textContent =
      Math.round(state.viewer.pdfZoom * 100) + '%';
  }

  function pdfPrevPage() {
    if (state.viewer.pdfPage > 1) {
      state.viewer.pdfPage--;
      renderPDFPages();
    }
  }

  function pdfNextPage() {
    if (state.viewer.pdfPage < state.viewer.pdfTotal) {
      state.viewer.pdfPage++;
      renderPDFPages();
    }
  }

  function pdfZoomIn() {
    state.viewer.pdfZoom = Math.min(3, state.viewer.pdfZoom + 0.2);
    renderPDFPages();
  }

  function pdfZoomOut() {
    state.viewer.pdfZoom = Math.max(0.4, state.viewer.pdfZoom - 0.2);
    renderPDFPages();
  }

  /* Word Rendering */
  async function renderWord(url, doc) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();

    const result = await mammoth.convertToHtml({ arrayBuffer });

    document.getElementById('viewerLoading').style.display = 'none';
    const container = document.getElementById('viewerContent');
    container.innerHTML = `<div class="word-content">${result.value}</div>`;
  }

  /* Excel Rendering */
  async function renderExcel(url, doc) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    state.viewer.excelWorkbook = workbook;
    state.viewer.currentSheet = 0;

    // Render sheet tabs
    const tabsEl = document.getElementById('excelTabs');
    tabsEl.classList.remove('hidden');
    tabsEl.innerHTML = '';

    workbook.SheetNames.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.className = 'sheet-tab' + (i === 0 ? ' active' : '');
      btn.textContent = name;
      btn.onclick = () => {
        state.viewer.currentSheet = i;
        document.querySelectorAll('.sheet-tab').forEach((t, j) => {
          t.classList.toggle('active', j === i);
        });
        renderExcelSheet(workbook, i);
      };
      tabsEl.appendChild(btn);
    });

    document.getElementById('viewerLoading').style.display = 'none';
    renderExcelSheet(workbook, 0);
  }

  function renderExcelSheet(workbook, sheetIndex) {
    const sheetName = workbook.SheetNames[sheetIndex];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const container = document.getElementById('viewerContent');

    if (!data.length) {
      container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);">Empty sheet</div>';
      return;
    }

    const maxCols = Math.max(...data.map(r => r.length));
    const cols = Array.from({ length: maxCols }, (_, i) => colLetter(i));

    let html = '<div class="excel-container"><table class="excel-table"><thead><tr><th>#</th>';
    cols.forEach(c => html += `<th>${c}</th>`);
    html += '</tr></thead><tbody>';

    data.forEach((row, ri) => {
      html += `<tr><td>${ri + 1}</td>`;
      for (let ci = 0; ci < maxCols; ci++) {
        const val = row[ci] != null ? escapeHtml(String(row[ci])) : '';
        html += `<td>${val}</td>`;
      }
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function colLetter(n) {
    let s = '';
    n++;
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  /* Close Viewer */
  function closeViewer() {
    document.getElementById('viewerModal').classList.add('hidden');
    document.getElementById('viewerContent').innerHTML = '';
    document.body.style.overflow = '';
    state.viewer = { ...state.viewer, open: false, docId: null, pdfDoc: null };
  }

  /* Download current */
  function downloadCurrent() {
    if (state.viewer.docId) {
      window.location.href = `/api/download/${state.viewer.docId}`;
    }
  }

  /* ──────────────────────────────────────────
     Document Actions (global)
  ────────────────────────────────────────── */
  window.downloadDoc = function(id) {
    window.location.href = `/api/download/${id}`;
  };

  window.deleteDoc = async function(id, btn) {
    if (!confirm('Delete this document?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        btn.closest('.doc-card').remove();
        showToast('Document deleted', 'success');
        updateDocCount();
      }
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  /* ──────────────────────────────────────────
     Keyboard Shortcuts
  ────────────────────────────────────────── */
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (state.viewer.open) closeViewer();
        else closeSidebar();
      }
      if (state.viewer.open && state.viewer.type === 'pdf') {
        if (e.key === 'ArrowLeft') pdfPrevPage();
        if (e.key === 'ArrowRight') pdfNextPage();
        if (e.key === '+') pdfZoomIn();
        if (e.key === '-') pdfZoomOut();
      }
    });
  }

  /* ──────────────────────────────────────────
     Utilities
  ────────────────────────────────────────── */
  function getFileIcon(mimetype) {
    if (mimetype === 'application/pdf' || (typeof mimetype === 'string' && mimetype.includes('pdf'))) {
      return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    }
    if (typeof mimetype === 'string' && mimetype.includes('word')) {
      return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
    }
    if (typeof mimetype === 'string' && (mimetype.includes('sheet') || mimetype.includes('excel'))) {
      return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`;
    }
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  let toastTimer;
  function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
  }

  /* ──────────────────────────────────────────
     Public API
  ────────────────────────────────────────── */
  return {
    init,
    navigate,
    toggleTheme,
    setView,
    toggleSidebar,
    closeSidebar,
    search,
    loadDocuments,
    pdfPrevPage,
    pdfNextPage,
    pdfZoomIn,
    pdfZoomOut,
    closeViewer,
    downloadCurrent,
  };

})();

document.addEventListener('DOMContentLoaded', App.init);
