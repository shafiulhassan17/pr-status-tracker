// PR Status Tracker - Frontend Controller
let currentView = 'overview';
let selectedPrNumber = null;
let selectedPlant = 'All';
let allPrs = [];
let currentPrLines = [];
let selectedLineIds = new Set();

// Column visibility states
const columnVisibility = {
  remarks: false,
  siteWh: false,
  vendor: false,
  assigned: false,
  cancelled: false,
  price: false,
  milestones: false
};

// DOM Elements
const viewPrOverview = document.getElementById('viewPrOverview');
const viewPrDetail = document.getElementById('viewPrDetail');
const prTableBody = document.getElementById('prTableBody');
const prDetailTableBody = document.getElementById('prDetailTableBody');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const poStateFilter = document.getElementById('poStateFilter');
const prDisplayCount = document.getElementById('prDisplayCount');

// Detail Page Elements
const detailPrBreadcrumb = document.getElementById('detailPrBreadcrumb');
const detailPlant = document.getElementById('detailPlant');
const detailPrNumber = document.getElementById('detailPrNumber');
const detailPoNumber = document.getElementById('detailPoNumber');
const detailOverallStatus = document.getElementById('detailOverallStatus');
const detailLineCount = document.getElementById('detailLineCount');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupColumnToggles();
  loadKpis();
  loadPrOverview();
});

// Setup event listeners
function setupEventListeners() {
  // Plant Selector Tabs
  document.querySelectorAll('.plant-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.plant-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedPlant = tab.dataset.plant;
      loadKpis();
      loadPrOverview();
    });
  });

  // Search and filters
  searchInput.addEventListener('input', debounce(loadPrOverview, 250));
  statusFilter.addEventListener('change', loadPrOverview);
  poStateFilter.addEventListener('change', loadPrOverview);

  // Safe Refresh View Button
  const btnRefresh = document.getElementById('btnRefreshView');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      showToast('Refreshing view...', 'info');
      loadKpis();
      if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else {
        loadPrOverview();
      }
    });
  }

  // Sync Excel Button (with confirmation)
  const btnSync = document.getElementById('btnSyncExcel');
  if (btnSync) {
    btnSync.addEventListener('click', handleSyncExcel);
  }

  // Back button in detail view
  document.getElementById('btnBackToOverview').addEventListener('click', () => {
    navigateToOverview();
  });

  // Export buttons
  document.getElementById('btnExportOverview').addEventListener('click', () => {
    window.location.href = `/api/export/csv?type=prs&plant=${encodeURIComponent(selectedPlant)}`;
  });

  document.getElementById('btnExportDetailCsv').addEventListener('click', () => {
    window.location.href = `/api/export/csv?type=lines&plant=${encodeURIComponent(selectedPlant)}`;
  });

  // External SQL Settings
  document.getElementById('btnExternalSql').addEventListener('click', openSqlModal);
  document.getElementById('sqlConfigForm').addEventListener('submit', handleSqlSave);
  document.getElementById('btnTestSqlConnection').addEventListener('click', handleSqlTest);

  // Status Update Form Submit
  document.getElementById('statusUpdateForm').addEventListener('submit', handleStatusSubmit);

  // Bulk Multi-Select & Bulk Status Update
  const selectAllCb = document.getElementById('selectAllLinesCheckbox');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', handleSelectAllLines);
  }
  document.getElementById('btnOpenBulkModal').addEventListener('click', openBulkStatusModal);
  document.getElementById('btnClearBulkSelection').addEventListener('click', clearBulkSelection);
  document.getElementById('bulkStatusUpdateForm').addEventListener('submit', handleBulkStatusSubmit);

  // PR Timeline View
  document.getElementById('btnViewPrTimeline').addEventListener('click', () => {
    if (selectedPrNumber) {
      openPrTimeline(selectedPrNumber);
    }
  });
}

// Setup Column Visibility Toggles
function setupColumnToggles() {
  const toggleMap = [
    { id: 'toggleRemarks', key: 'remarks', cls: 'col-remarks' },
    { id: 'toggleSiteWh', key: 'siteWh', cls: 'col-sitewh' },
    { id: 'toggleVendor', key: 'vendor', cls: 'col-vendor' },
    { id: 'toggleAssignedVendor', key: 'assigned', cls: 'col-assigned' },
    { id: 'toggleCancelled', key: 'cancelled', cls: 'col-cancelled' },
    { id: 'togglePrice', key: 'price', cls: 'col-price' },
    { id: 'toggleMilestones', key: 'milestones', cls: 'col-milestones' }
  ];

  toggleMap.forEach(({ id, key, cls }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = columnVisibility[key];
    el.addEventListener('change', () => {
      columnVisibility[key] = el.checked;
      applyColumnVisibility();
    });
  });
}

function applyColumnVisibility() {
  const map = {
    remarks: 'col-remarks',
    siteWh: 'col-sitewh',
    vendor: 'col-vendor',
    assigned: 'col-assigned',
    cancelled: 'col-cancelled',
    price: 'col-price',
    milestones: 'col-milestones'
  };

  for (const [key, cls] of Object.entries(map)) {
    const isVisible = columnVisibility[key];
    document.querySelectorAll(`.${cls}`).forEach(el => {
      el.style.display = isVisible ? '' : 'none';
    });
  }
}

// ----------------------------------------------------
// Navigation & Routing
// ----------------------------------------------------

function navigateToOverview() {
  currentView = 'overview';
  selectedPrNumber = null;
  clearBulkSelection();
  viewPrOverview.style.display = 'block';
  viewPrDetail.style.display = 'none';
  loadKpis();
  loadPrOverview();
}

function navigateToDetail(prNumber) {
  currentView = 'detail';
  selectedPrNumber = prNumber;
  clearBulkSelection();
  viewPrOverview.style.display = 'none';
  viewPrDetail.style.display = 'block';
  loadPrDetails(prNumber);
}

// ----------------------------------------------------
// Data Loading & API Calls
// ----------------------------------------------------

async function loadKpis() {
  try {
    const params = new URLSearchParams();
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);

    const res = await fetch(`/api/kpis?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('kpiTotalPrs').textContent = data.total_prs || 0;
      document.getElementById('kpiTotalLines').textContent = `${data.total_lines || 0} Total Line Items`;
      document.getElementById('kpiLinesWithPo').textContent = data.lines_with_po || 0;
      document.getElementById('kpiLinesWithoutPo').textContent = data.lines_without_po || 0;
      document.getElementById('kpiFullyDelivered').textContent = data.fully_delivered_lines || 0;
      document.getElementById('kpiPartiallyDelivered').textContent = data.partially_delivered_lines || 0;
      document.getElementById('kpiOverdueLines').textContent = data.overdue_lines || 0;
    }
  } catch (err) {
    console.error('Failed to load KPIs:', err);
  }
}

async function loadPrOverview() {
  try {
    const q = searchInput.value.trim();
    const status = statusFilter.value;
    const poFilter = poStateFilter.value;

    const params = new URLSearchParams();
    if (q) params.append('search', q);
    if (status && status !== 'All') params.append('status', status);
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);
    if (poFilter && poFilter !== 'All') params.append('po_filter', poFilter);

    const res = await fetch(`/api/prs?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      allPrs = data.data;
      prDisplayCount.textContent = allPrs.length;
      renderPrOverview(allPrs);
    }
  } catch (err) {
    console.error('Failed to load PR overview:', err);
    showToast('Failed to load PR overview', 'error');
  }
}

async function loadPrDetails(prNumber) {
  try {
    const res = await fetch(`/api/prs/${encodeURIComponent(prNumber)}`);
    const data = await res.json();

    if (data.success) {
      currentPrLines = data.lines;
      detailPrBreadcrumb.textContent = `${prNumber}`;
      detailPrNumber.textContent = prNumber;
      detailPlant.textContent = data.plant || 'CEPL';
      detailLineCount.textContent = currentPrLines.length;

      const firstLineWithPo = currentPrLines.find(l => l.po_number && l.po_number.trim() !== '') || currentPrLines[0] || {};
      detailPoNumber.textContent = firstLineWithPo.po_number ? firstLineWithPo.po_number : 'Pending PO Creation';
      detailOverallStatus.innerHTML = getStatusBadge(data.general_status);

      renderPrLines(currentPrLines);
      applyColumnVisibility();
    } else {
      showToast(data.error || 'Failed to load PR details', 'error');
    }
  } catch (err) {
    console.error('Failed to load PR details:', err);
    showToast('Network error loading PR lines', 'error');
  }
}

async function handleSyncExcel() {
  if (!confirm('Sync latest ERP data from Excel files?\n\n(All your custom tracking statuses, remarks, and assigned vendors will be safely preserved).')) {
    return;
  }

  const btn = document.getElementById('btnSyncExcel');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Syncing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/excel/re-import', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Excel files synced! Your tracking statuses & remarks are preserved.', 'success');
      loadKpis();
      loadPrOverview();
      if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      }
    } else {
      showToast(data.error || 'Failed to sync Excel', 'error');
    }
  } catch (err) {
    showToast('Error connecting to server for Excel sync', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ----------------------------------------------------
// Rendering Functions
// ----------------------------------------------------

function renderPrOverview(prs) {
  if (!prs || prs.length === 0) {
    prTableBody.innerHTML = `
      <tr>
        <td colspan="13" class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No Purchase Requisitions Found</div>
          <div>Try adjusting your search query or plant selection.</div>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  for (const pr of prs) {
    const statusBadge = getStatusBadge(pr.general_status);
    const progressColor = pr.delivery_completion_pct === 100 ? 'progress-green' : pr.delivery_completion_pct > 0 ? 'progress-blue' : 'progress-amber';

    const overdueTag = pr.is_overdue
      ? `<span class="badge badge-cancelled" style="font-size: 10px; margin-left: 4px;">OVERDUE</span>`
      : '';

    const poDisplay = pr.po_number
      ? `<span style="font-weight: 600; color: #334155;">${escapeHtml(pr.po_number)}</span>`
      : `<span class="badge badge-open" style="font-size: 11px;">⏳ Pending PO</span>`;

    const plantBadge = `<span class="badge ${pr.plant === 'SPPL' ? 'badge-partial' : 'badge-neutral'}" style="font-weight: 700;">${pr.plant}</span>`;

    html += `
      <tr>
        <td style="text-align: center;">${plantBadge}</td>
        <td class="sticky-col">
          <a href="javascript:void(0)" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')" style="font-weight: 700; color: #2563eb; text-decoration: none; font-size: 14px;">
            ${escapeHtml(pr.pr_number)}
          </a>
        </td>
        <td>${poDisplay}</td>
        <td style="color: #475569; max-width: 320px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(pr.remarks || '')}">
          ${escapeHtml(pr.remarks || '-')}
        </td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">
          <span class="badge badge-neutral" style="font-weight: 700;">${pr.total_lines} ${pr.total_lines === 1 ? 'Line' : 'Lines'}</span>
        </td>
        <td style="text-align: center;">
          ${pr.fully_delivered_lines > 0 ? `<span class="badge badge-invoiced" style="font-weight: 700;">✓ ${pr.fully_delivered_lines} Delivered</span>` : `<span style="color: #94a3b8;">0</span>`}
        </td>
        <td style="text-align: center;">
          ${pr.partially_delivered_lines > 0 ? `<span class="badge badge-partial" style="font-weight: 700;">⚡ ${pr.partially_delivered_lines} Partial</span>` : `<span style="color: #94a3b8;">0</span>`}
        </td>
        <td style="text-align: center;">
          ${pr.pending_lines > 0 ? `<span class="badge badge-open" style="font-weight: 700;">⏳ ${pr.pending_lines} Open</span>` : `<span style="color: #94a3b8;">0</span>`}
        </td>
        <td>
          <div class="progress-bar-container" title="${pr.delivery_completion_pct}% of lines delivered">
            <div class="progress-bar-fill ${progressColor}" style="width: ${pr.delivery_completion_pct}%;"></div>
          </div>
          <span style="font-size: 11px; font-weight: 600; color: #64748b;">${pr.delivery_completion_pct}%</span>
        </td>
        <td style="font-size: 12px; color: #64748b;">${pr.po_create_date || '-'}</td>
        <td style="font-size: 12px; color: #64748b;">
          ${pr.expected_dlv_date || '-'} ${overdueTag}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openPrTimeline('${escapeHtml(pr.pr_number)}')" title="View Timeline of Status Changes">
              🕒 History
            </button>
            <button class="btn btn-primary btn-sm" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')">
              Open Lines (${pr.total_lines}) ➔
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  prTableBody.innerHTML = html;
}

function renderPrLines(lines) {
  if (!lines || lines.length === 0) {
    prDetailTableBody.innerHTML = `
      <tr>
        <td colspan="21" class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-title">No Line Items Registered</div>
        </td>
      </tr>
    `;
    updateBulkActionBar();
    return;
  }

  let html = '';
  for (const line of lines) {
    const isSelected = selectedLineIds.has(line.id);
    const erpStatusBadge = getStatusBadge(line.po_status);
    const trackingStatusBadge = getStatusBadge(line.tracking_status || line.po_status);
    const historyCount = line.history_count || 0;

    const hasPo = line.po_number && line.po_number.trim() !== '';
    const poNumberDisplay = hasPo ? escapeHtml(line.po_number) : '';
    const vendorDisplay = line.vendor_name ? escapeHtml(line.vendor_name) : '';
    const priceDisplay = hasPo && line.purchase_price > 0 ? formatCurrency(line.purchase_price) : '';
    const poCreateDateDisplay = hasPo ? (line.po_create_date || '') : '';
    const lastGrnDisplay = hasPo ? (line.last_grn_date || '') : '';
    const lastInvoiceDisplay = hasPo ? (line.last_invoice_date || '') : '';

    // Status remarks snippet
    const remarksSnippet = line.status_remarks
      ? `<div style="font-size: 11px; color: #475569; margin-top: 3px; font-style: italic;">“${escapeHtml(line.status_remarks)}”</div>`
      : '';

    html += `
      <tr id="row-${escapeHtml(line.id)}" class="${isSelected ? 'selected-row' : ''}">
        <!-- Row Selection Checkbox -->
        <td class="select-col">
          <input type="checkbox" class="line-select-cb" data-line-id="${escapeHtml(line.id)}" ${isSelected ? 'checked' : ''} onchange="handleLineSelectionChange('${escapeHtml(line.id)}', this.checked)">
        </td>

        <!-- Requisition Base -->
        <td class="sticky-col" style="font-weight: 700; color: #1e40af;">${escapeHtml(line.pr_number)}</td>
        <td style="font-weight: 600; color: #334155;">${poNumberDisplay}</td>

        <!-- Item Core -->
        <td style="text-align: center; font-weight: 700;">${line.line_number}</td>
        <td style="font-family: monospace; font-size: 12px; color: #475569;">${escapeHtml(line.item_id || '')}</td>
        <td style="font-weight: 600; color: #0f172a; max-width: 280px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(line.item_name)}">
          ${escapeHtml(line.item_name)}
        </td>
        <td style="color: #475569;">${escapeHtml(line.unit)}</td>

        <!-- PO Status (ERP - Read Only) -->
        <td>${erpStatusBadge}</td>

        <!-- Status & Remarks (The Editable Tracking Column!) -->
        <td style="background-color: #f8fafc; border-left: 2px solid #3b82f6;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div>
              ${trackingStatusBadge}
              ${remarksSnippet}
            </div>
            <div style="display: inline-flex; gap: 4px; flex-shrink: 0;">
              <button class="btn btn-primary btn-sm" onclick="openStatusModal('${escapeHtml(line.id)}')" style="padding: 3px 8px; font-size: 11px;" title="Update Status & Add Remarks">
                ✏️ Update
              </button>
              <button class="btn btn-secondary btn-sm" onclick="openLineHistory('${escapeHtml(line.id)}')" style="padding: 3px 7px; font-size: 11px;" title="View Timeline of Status Changes (${historyCount})">
                🕒 (${historyCount})
              </button>
            </div>
          </div>
        </td>

        <!-- Quantities: Demand Qty, Received Qty, Invoiced Qty -->
        <td style="text-align: right; font-weight: 700; color: #0f172a;">${formatNumber(line.purch_qty)}</td>
        <td style="text-align: right; font-weight: 700; color: #15803d;">${formatNumber(line.received_qty)}</td>
        <td style="text-align: right; color: #0369a1;">${formatNumber(line.invoiced_qty)}</td>

        <!-- Toggleable Columns (Tucked in) -->
        <td class="col-extra col-remarks" style="display: none; color: #64748b; max-width: 220px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(line.remarks || '')}">
          ${escapeHtml(line.remarks || '')}
        </td>
        <td class="col-extra col-sitewh" style="display: none; color: #475569;">${escapeHtml(line.site)}</td>
        <td class="col-extra col-sitewh" style="display: none; color: #475569;">${escapeHtml(line.warehouse)}</td>
        <td class="col-extra col-vendor" style="display: none; font-weight: 600; color: #1e293b;">${vendorDisplay}</td>
        <td class="col-extra col-assigned" style="display: none; text-align: center;">
          <select onchange="handleInlineAssignedVendorChange('${escapeHtml(line.id)}', this.value)" title="Assigned: SAR (Sarfraz), MAG (Maghfoor), NOU (Nouman), ADI (Adil), MUD (Mudassir), TAL (Talha), MAS (Mashhood), ZAI (Zain)" style="padding: 2px 6px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #eff6ff; color: #1e40af; cursor: pointer;">
            <option value="" ${!line.assigned_vendor ? 'selected' : ''}>---</option>
            <option value="SAR" ${line.assigned_vendor === 'SAR' ? 'selected' : ''}>SAR</option>
            <option value="MAG" ${line.assigned_vendor === 'MAG' ? 'selected' : ''}>MAG</option>
            <option value="NOU" ${line.assigned_vendor === 'NOU' ? 'selected' : ''}>NOU</option>
            <option value="ADI" ${line.assigned_vendor === 'ADI' ? 'selected' : ''}>ADI</option>
            <option value="MUD" ${line.assigned_vendor === 'MUD' ? 'selected' : ''}>MUD</option>
            <option value="TAL" ${line.assigned_vendor === 'TAL' ? 'selected' : ''}>TAL</option>
            <option value="MAS" ${line.assigned_vendor === 'MAS' ? 'selected' : ''}>MAS</option>
            <option value="ZAI" ${line.assigned_vendor === 'ZAI' ? 'selected' : ''}>ZAI</option>
          </select>
        </td>
        <td class="col-extra col-cancelled" style="display: none; text-align: right; color: #64748b;">${formatNumber(line.cancelled_qty)}</td>
        <td class="col-extra col-price" style="display: none; text-align: right; font-family: monospace; font-weight: 600; color: #854d0e;">
          ${priceDisplay}
        </td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #475569;">${poCreateDateDisplay}</td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #475569;">${line.expected_dlv_date || ''}</td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #166534; font-weight: 600;">${lastGrnDisplay}</td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #15803d; font-weight: 600;">${lastInvoiceDisplay}</td>
      </tr>
    `;
  }

  prDetailTableBody.innerHTML = html;
  updateBulkActionBar();
}

// ----------------------------------------------------
// Status Evolution & History Modal
// ----------------------------------------------------

async function openLineHistory(lineId) {
  try {
    const res = await fetch(`/api/lines/${encodeURIComponent(lineId)}/history`);
    const data = await res.json();

    if (data.success) {
      document.getElementById('historyModalTitle').textContent = `Line ${data.line.line_number} Status Evolution`;
      document.getElementById('historyModalSubtitle').textContent = `${data.line.pr_number} (${data.line.plant}) • ${data.line.item_name}`;
      renderTimeline(data.history);
      openModal('historyModal');
    }
  } catch (err) {
    showToast('Failed to load status history', 'error');
  }
}

async function openPrTimeline(prNumber) {
  try {
    const res = await fetch(`/api/prs/${encodeURIComponent(prNumber)}/history`);
    const data = await res.json();

    if (data.success) {
      document.getElementById('historyModalTitle').textContent = `Requisition ${prNumber} Evolution History`;
      document.getElementById('historyModalSubtitle').textContent = `Chronological lifecycle timeline of all status updates for this PR`;
      renderTimeline(data.history);
      openModal('historyModal');
    }
  } catch (err) {
    showToast('Failed to load PR history', 'error');
  }
}

function renderTimeline(events) {
  const container = document.getElementById('historyTimelineContainer');
  if (!events || events.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #94a3b8;">
        No status history recorded yet.
      </div>
    `;
    return;
  }

  let html = '';
  for (const ev of events) {
    const transitionText = ev.previous_status
      ? `<span>${escapeHtml(ev.previous_status)}</span> ➔ <strong style="color: #2563eb;">${escapeHtml(ev.new_status)}</strong>`
      : `<strong>${escapeHtml(ev.new_status)}</strong> (Initial Status)`;

    html += `
      <div class="timeline-item">
        <div class="timeline-dot">●</div>
        <div class="timeline-header">
          <div class="timeline-status">${transitionText}</div>
          <div class="timeline-time">${escapeHtml(ev.changed_at)}</div>
        </div>
        <div class="timeline-author">
          Updated by: <strong>${escapeHtml(ev.changed_by || 'Purchasing Officer')}</strong>
          ${ev.line_number ? `• Line #${ev.line_number}` : ''}
          ${ev.item_name ? `• ${escapeHtml(ev.item_name)}` : ''}
        </div>
        ${ev.reason_notes ? `<div class="timeline-notes">${escapeHtml(ev.reason_notes)}</div>` : ''}
      </div>
    `;
  }

  container.innerHTML = html;
}

// ----------------------------------------------------
// Quick Status & Remarks Updater (The ONLY editable action!)
// ----------------------------------------------------

function openStatusModal(lineId) {
  const line = currentPrLines.find(l => l.id === lineId);
  if (!line) return;

  document.getElementById('statusModalLineId').value = line.id;
  document.getElementById('statusModalItemName').textContent = `Line #${line.line_number}: ${line.item_name} (${line.pr_number})`;
  
  const currentStatus = line.tracking_status || line.po_status;
  document.getElementById('statusModalCurrentStatus').innerHTML = getStatusBadge(currentStatus);
  
  // Set dropdown to current status if matched, or custom
  const select = document.getElementById('newStatusSelect');
  let optionExists = Array.from(select.options).some(o => o.value.toLowerCase() === currentStatus.toLowerCase());
  if (optionExists) {
    select.value = currentStatus;
  } else {
    // Add custom option if needed
    const customOpt = document.createElement('option');
    customOpt.value = currentStatus;
    customOpt.textContent = currentStatus;
    select.appendChild(customOpt);
    select.value = currentStatus;
  }

  document.getElementById('statusReasonNotes').value = line.status_remarks || '';
  document.getElementById('statusModalAssignedVendor').value = line.assigned_vendor || '';
  openModal('statusModal');
}

async function handleStatusSubmit(e) {
  e.preventDefault();
  const lineId = document.getElementById('statusModalLineId').value;
  const newStatus = document.getElementById('newStatusSelect').value;
  const assignedVendor = document.getElementById('statusModalAssignedVendor').value;
  const reasonNotes = document.getElementById('statusReasonNotes').value;
  const changedBy = document.getElementById('statusChangedBy').value;

  try {
    const res = await fetch(`/api/lines/${encodeURIComponent(lineId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_status: newStatus,
        reason_notes: reasonNotes,
        changed_by: changedBy
      })
    });

    const data = await res.json();
    if (data.success) {
      // Also update assigned vendor if changed
      const currentLine = currentPrLines.find(l => l.id === lineId);
      if (currentLine && currentLine.assigned_vendor !== assignedVendor) {
        await fetch(`/api/lines/${encodeURIComponent(lineId)}/assigned-vendor`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_vendor: assignedVendor })
        });
        currentLine.assigned_vendor = assignedVendor;
      }

      closeModal('statusModal');
      showToast(`✓ Status updated to "${newStatus}" and recorded in evolution history!`, 'success');

      if (selectedPrNumber) {
        await loadPrDetails(selectedPrNumber);
      }
      loadKpis();
    } else {
      showToast(data.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

async function handleInlineAssignedVendorChange(lineId, newVendor) {
  try {
    const res = await fetch(`/api/lines/${encodeURIComponent(lineId)}/assigned-vendor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_vendor: newVendor })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Assigned vendor set to: ${newVendor || 'Unassigned'}`, 'success');
      const line = currentPrLines.find(l => l.id === lineId);
      if (line) line.assigned_vendor = newVendor;
    } else {
      showToast(data.error || 'Failed to update assigned vendor', 'error');
    }
  } catch (err) {
    showToast('Error updating assigned vendor', 'error');
  }
}

// ----------------------------------------------------
// Bulk Status & Multi-Line Selection Handlers
// ----------------------------------------------------

function handleLineSelectionChange(lineId, isChecked) {
  if (isChecked) {
    selectedLineIds.add(lineId);
    document.getElementById(`row-${lineId}`)?.classList.add('selected-row');
  } else {
    selectedLineIds.delete(lineId);
    document.getElementById(`row-${lineId}`)?.classList.remove('selected-row');
  }
  updateBulkActionBar();
}

function handleSelectAllLines(e) {
  const isChecked = e.target.checked;
  selectedLineIds.clear();
  if (isChecked && currentPrLines && currentPrLines.length > 0) {
    currentPrLines.forEach(l => {
      selectedLineIds.add(l.id);
      document.getElementById(`row-${l.id}`)?.classList.add('selected-row');
    });
  } else if (currentPrLines) {
    currentPrLines.forEach(l => {
      document.getElementById(`row-${l.id}`)?.classList.remove('selected-row');
    });
  }
  document.querySelectorAll('.line-select-cb').forEach(cb => {
    cb.checked = isChecked;
  });
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  const countBadge = document.getElementById('bulkSelectedCount');
  if (!bar || !countBadge) return;

  const count = selectedLineIds.size;
  if (count > 0) {
    bar.style.display = 'flex';
    countBadge.textContent = `${count} ${count === 1 ? 'line' : 'lines'} selected`;
  } else {
    bar.style.display = 'none';
  }

  // Sync selectAll checkbox state
  const selectAllCb = document.getElementById('selectAllLinesCheckbox');
  if (selectAllCb && currentPrLines && currentPrLines.length > 0) {
    selectAllCb.checked = (selectedLineIds.size === currentPrLines.length);
    selectAllCb.indeterminate = (selectedLineIds.size > 0 && selectedLineIds.size < currentPrLines.length);
  } else if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  }
}

function clearBulkSelection() {
  selectedLineIds.clear();
  document.querySelectorAll('.line-select-cb').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('#prDetailTableBody tr').forEach(tr => { tr.classList.remove('selected-row'); });
  const selectAllCb = document.getElementById('selectAllLinesCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  }
  updateBulkActionBar();
}

function openBulkStatusModal() {
  if (selectedLineIds.size === 0) {
    showToast('Please select at least one line item first', 'info');
    return;
  }

  const count = selectedLineIds.size;
  document.getElementById('bulkModalCountBadge').textContent = `${count} line item${count === 1 ? '' : 's'}`;
  document.getElementById('bulkModalPrBadge').textContent = `Requisition: ${selectedPrNumber || 'Selected PR'}`;
  document.getElementById('bulkNewStatusSelect').value = '';
  document.getElementById('bulkAssignedVendorSelect').value = '';
  document.getElementById('bulkReasonNotes').value = '';

  openModal('bulkStatusModal');
}

async function handleBulkStatusSubmit(e) {
  e.preventDefault();
  if (selectedLineIds.size === 0) {
    showToast('No line items selected', 'error');
    return;
  }

  const lineIds = Array.from(selectedLineIds);
  const newStatus = document.getElementById('bulkNewStatusSelect').value;
  const assignedVendor = document.getElementById('bulkAssignedVendorSelect').value;
  const reasonNotes = document.getElementById('bulkReasonNotes').value;
  const changedBy = document.getElementById('bulkChangedBy').value;

  if (!newStatus && !assignedVendor && !reasonNotes.trim()) {
    showToast('Please select a new status, assigned vendor, or enter remarks', 'error');
    return;
  }

  try {
    const res = await fetch('/api/lines/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_ids: lineIds,
        new_status: newStatus,
        assigned_vendor: assignedVendor,
        reason_notes: reasonNotes,
        changed_by: changedBy
      })
    });

    const data = await res.json();
    if (data.success) {
      closeModal('bulkStatusModal');
      showToast(`✓ ${data.message}`, 'success');
      clearBulkSelection();
      if (selectedPrNumber) {
        await loadPrDetails(selectedPrNumber);
      }
      loadKpis();
    } else {
      showToast(data.error || 'Failed to update selected lines', 'error');
    }
  } catch (err) {
    showToast('Error performing bulk update', 'error');
  }
}

// ----------------------------------------------------
// External SQL Configuration
// ----------------------------------------------------

async function openSqlModal() {
  try {
    const res = await fetch('/api/external-sql/config');
    const data = await res.json();
    if (data.success && data.config) {
      const c = data.config;
      document.getElementById('sqlEngine').value = c.engine || 'mssql';
      document.getElementById('sqlHost').value = c.host || '127.0.0.1';
      document.getElementById('sqlPort').value = c.port || 1433;
      document.getElementById('sqlDatabase').value = c.database_name || 'SupplyChainDB';
      document.getElementById('sqlUsername').value = c.username || 'sa';
      document.getElementById('sqlPassword').value = c.password || '';
      document.getElementById('sqlQuery').value = c.query_or_view || 'vw_PrPoTracking';
    }
    openModal('sqlConfigModal');
  } catch (err) {
    showToast('Failed to load SQL config', 'error');
  }
}

async function handleSqlSave(e) {
  e.preventDefault();
  const payload = {
    engine: document.getElementById('sqlEngine').value,
    host: document.getElementById('sqlHost').value,
    port: document.getElementById('sqlPort').value,
    database_name: document.getElementById('sqlDatabase').value,
    username: document.getElementById('sqlUsername').value,
    password: document.getElementById('sqlPassword').value,
    query_or_view: document.getElementById('sqlQuery').value
  };

  try {
    const res = await fetch('/api/external-sql/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('sqlConfigModal');
    } else {
      showToast(data.error || 'Failed to save SQL configuration', 'error');
    }
  } catch (err) {
    showToast('Network error saving SQL configuration', 'error');
  }
}

async function handleSqlTest() {
  const payload = {
    engine: document.getElementById('sqlEngine').value,
    host: document.getElementById('sqlHost').value,
    port: document.getElementById('sqlPort').value,
    database_name: document.getElementById('sqlDatabase').value
  };

  try {
    const res = await fetch('/api/external-sql/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`Connection Test Successful!\n\n${data.message}`);
    } else {
      alert(`Connection Test Failed:\n${data.error}`);
    }
  } catch (err) {
    alert('Failed to contact server for connection test.');
  }
}

// ----------------------------------------------------
// UI Helpers & Utilities
// ----------------------------------------------------

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function getStatusBadge(status) {
  if (!status) return `<span class="badge badge-neutral">Unknown</span>`;
  const s = status.toLowerCase();
  if (s.includes('invoice')) {
    return `<span class="badge badge-invoiced">● Invoiced</span>`;
  }
  if (s === 'received' || s === 'fully received') {
    return `<span class="badge badge-received">● Received</span>`;
  }
  if (s.includes('partial')) {
    return `<span class="badge badge-partial">⚡ Partial</span>`;
  }
  if (s.includes('open')) {
    return `<span class="badge badge-open">● Open Order</span>`;
  }
  if (s.includes('reject')) {
    return `<span class="badge badge-cancelled">✕ Rejected</span>`;
  }
  if (s.includes('pending po')) {
    return `<span class="badge badge-open" style="background:#fffbeb; color:#b45309; border-color:#fde68a;">⏳ Pending PO</span>`;
  }
  if (s.includes('transit') || s.includes('dispatch')) {
    return `<span class="badge badge-partial" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">🚚 In Transit</span>`;
  }
  if (s.includes('cancel')) {
    return `<span class="badge badge-cancelled">✕ Cancelled</span>`;
  }
  return `<span class="badge badge-neutral">● ${escapeHtml(status)}</span>`;
}

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount) || Number(amount) === 0) return '';
  return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
