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
const viewVendorDashboard = document.getElementById('viewVendorDashboard');
const prTableBody = document.getElementById('prTableBody');
const prMobileList = document.getElementById('prMobileList');
const prDetailTableBody = document.getElementById('prDetailTableBody');
const prDetailMobileList = document.getElementById('prDetailMobileList');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const poStateFilter = document.getElementById('poStateFilter');
const vendorGroupFilter = document.getElementById('vendorGroupFilter');
const prDisplayCount = document.getElementById('prDisplayCount');
const btnNavOverview = document.getElementById('btnNavOverview');
const btnNavVendorDashboard = document.getElementById('btnNavVendorDashboard');
const btnManualUpdatedPrs = document.getElementById('btnManualUpdatedPrs');
const manualPrBadge = document.getElementById('manualPrBadge');
const vendorMatrixGrid = document.getElementById('vendorMatrixGrid');
const btnVendorMatrixManualOnly = document.getElementById('btnVendorMatrixManualOnly');
const btnBackToOverviewFromMatrix = document.getElementById('btnBackToOverviewFromMatrix');

// Pending Lines View Elements
const viewPendingLines = document.getElementById('viewPendingLines');
const btnNavPendingLines = document.getElementById('btnNavPendingLines');
const navPendingLinesBadge = document.getElementById('navPendingLinesBadge');
const cardKpiPendingPo = document.getElementById('cardKpiPendingPo');
const pendingLinesSearchInput = document.getElementById('pendingLinesSearchInput');
const pendingLinesBuyerFilter = document.getElementById('pendingLinesBuyerFilter');
const pendingLinesStatusFilter = document.getElementById('pendingLinesStatusFilter');
const pendingLinesSortFilter = document.getElementById('pendingLinesSortFilter');
const pendingLinesTableBody = document.getElementById('pendingLinesTableBody');
const pendingLinesMobileList = document.getElementById('pendingLinesMobileList');
const pendingLinesDisplayCount = document.getElementById('pendingLinesDisplayCount');
const statPendingTotal = document.getElementById('statPendingTotal');
const statPendingUnassigned = document.getElementById('statPendingUnassigned');
const statPendingAssigned = document.getElementById('statPendingAssigned');
const pendingLinesBulkBar = document.getElementById('pendingLinesBulkBar');
const pendingSelectedCountText = document.getElementById('pendingSelectedCountText');
const selectAllPendingLinesCheckbox = document.getElementById('selectAllPendingLinesCheckbox');
const pendingBulkBuyerSelect = document.getElementById('pendingBulkBuyerSelect');
const btnApplyPendingBulkAssign = document.getElementById('btnApplyPendingBulkAssign');
const btnClearPendingSelection = document.getElementById('btnClearPendingSelection');
const btnExportPendingLinesCsv = document.getElementById('btnExportPendingLinesCsv');

let selectedPendingLineIds = new Set();
let pendingLinesData = [];

const PURCHASERS_CONFIG = [
  { code: 'SAR', name: 'Sarfraz Ahmad' },
  { code: 'MAG', name: 'Maghfoor Ahmad' },
  { code: 'NOU', name: 'Nouman Khan' },
  { code: 'ADI', name: 'Adil Mahmood' },
  { code: 'MUD', name: 'Mudassir Ghauri' },
  { code: 'TAL', name: 'Talha Baig' },
  { code: 'MAS', name: 'Mashhood' },
  { code: 'ZAI', name: 'Muhammad Zain' }
];

// Cash in Hand & Settlements Elements
const btnNavCashSettlement = document.getElementById('btnNavCashSettlement');
const navCashInHandBadge = document.getElementById('navCashInHandBadge');
const btnSyncGDrive = document.getElementById('btnSyncGDrive');
const btnManualSyncGDrive = document.getElementById('btnManualSyncGDrive');
const viewCashSettlement = document.getElementById('viewCashSettlement');
const syncStatusText = document.getElementById('syncStatusText');
const kpiCashInHand = document.getElementById('kpiCashInHand');
const kpiUnsettledPosCount = document.getElementById('kpiUnsettledPosCount');
const kpiTotalCashIssued = document.getElementById('kpiTotalCashIssued');
const kpiTotalInvoiceReceived = document.getElementById('kpiTotalInvoiceReceived');
const kpiInvoiceClearPct = document.getElementById('kpiInvoiceClearPct');
const kpiTotalCashReturned = document.getElementById('kpiTotalCashReturned');
const purchaserCashGrid = document.getElementById('purchaserCashGrid');
const cashSearchInput = document.getElementById('cashSearchInput');
const cashPurchaserFilter = document.getElementById('cashPurchaserFilter');
const cashStatusFilter = document.getElementById('cashStatusFilter');
const cashDisplayCount = document.getElementById('cashDisplayCount');
const cashTableBody = document.getElementById('cashTableBody');
const cashMobileList = document.getElementById('cashMobileList');

let selectedCashPurchaser = 'ALL';

// Detail Page Elements
const detailPrBreadcrumb = document.getElementById('detailPrBreadcrumb');
const detailPlant = document.getElementById('detailPlant');
const detailPrNumber = document.getElementById('detailPrNumber');
const detailPoNumber = document.getElementById('detailPoNumber');
const detailOverallStatus = document.getElementById('detailOverallStatus');
const detailLineCount = document.getElementById('detailLineCount');

// Authentication & Role State
let currentUser = null;
let authToken = localStorage.getItem('pr_tracker_auth_token') || null;

// Central Authenticated API Fetch wrapper
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    clearAuthSession();
    showLoginOverlay();
    throw new Error('Authentication required');
  }
  return res;
}

function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'flex';
  const errMsg = document.getElementById('loginErrorMsg');
  if (errMsg) errMsg.style.display = 'none';
  const pwdInput = document.getElementById('loginPasswordInput');
  if (pwdInput) pwdInput.value = '';
}

function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
}

function clearAuthSession() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('pr_tracker_auth_token');
  localStorage.removeItem('pr_tracker_auth_user');
  document.body.classList.remove('is-viewer');
  updateUserBadge(null);
}

const ROLE_DESCRIPTIONS = {
  admin: 'Lead Developer & Procurement Engineer - Full administrative oversight, analytics and system configuration',
  mas: 'Deputy Manager Procurement - Unrestricted co-management and administrative oversight',
  executive: 'Executive Leadership - Macro overview, automated risk alerts, and strategic guidance',
  sar: 'Dedicated Purchaser (SAR) - Sarfraz Ahmad: Assigned PR lines, cash settlements & transfers',
  mag: 'Dedicated Purchaser (MAG) - Maghfoor Ahmad: Assigned PR lines, cash settlements & transfers',
  nou: 'Dedicated Purchaser (NOU) - Nouman Khan: Assigned PR lines, cash settlements & transfers',
  adi: 'Dedicated Purchaser (ADI) - Adil Mahmood: Assigned PR lines, cash settlements & transfers',
  mud: 'Dedicated Purchaser (MUD) - Mudassir Ghauri: Assigned PR lines, cash settlements & transfers',
  tal: 'Dedicated Purchaser (TAL) - Talha Baig: Assigned PR lines, cash settlements & transfers',
  zai: 'Dedicated Purchaser (ZAI) - Muhammad Zain: Assigned PR lines, cash settlements & transfers',
  finance: 'Finance Office - Full cash settlement oversight, Google Drive sync, and financial notes',
  audit: 'Internal Audit Office - Cross-plant requisitions oversight, risk alerts & immutable audit trail',
  enduser_cepl: 'Plant End-User (CEPL) - Requisition status and line tracking for CEPL plant only',
  enduser_sppl: 'Plant End-User (SPPL) - Requisition status and line tracking for SPPL plant only'
};

function updateRoleDescription() {
  const select = document.getElementById('loginRoleSelect');
  const descEl = document.getElementById('loginRoleDesc');
  if (select && descEl) {
    descEl.textContent = ROLE_DESCRIPTIONS[select.value] || 'Role description';
  }
}

function updateUserBadge(user) {
  const userBadge = document.getElementById('userBadge');
  const userBadgeIcon = document.getElementById('userBadgeIcon');
  const userBadgeName = document.getElementById('userBadgeName');
  const drawerUserName = document.getElementById('drawerUserName');
  const drawerUserBadgePill = document.getElementById('drawerUserBadgePill');
  const drawerRoleDesc = document.getElementById('drawerRoleDesc');
  if (!userBadge || !userBadgeName) return;

  userBadge.className = 'user-role-badge';

  if (!user) {
    userBadgeName.textContent = 'Not Signed In';
    userBadgeIcon.textContent = '👤';
    if (drawerUserName) drawerUserName.textContent = 'Not Signed In';
    return;
  }

  if (drawerUserName) drawerUserName.textContent = user.name || 'User';

  if (user.username === 'admin') {
    userBadge.classList.add('role-manager');
    userBadgeIcon.textContent = '🛡️';
    userBadgeName.textContent = 'Developer / Engineer';
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = 'Developer & Engineer'; drawerUserBadgePill.className = 'role-pill pill-manager'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = 'Total Access & System Engineering';
  } else if (user.username === 'mas') {
    userBadge.classList.add('role-manager');
    userBadgeIcon.textContent = '🌟';
    userBadgeName.textContent = 'Mashhood (Lead)';
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = 'Deputy Manager'; drawerUserBadgePill.className = 'role-pill pill-manager'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = 'Total Management Oversight';
  } else if (user.role === 'purchaser') {
    userBadge.classList.add('role-engineer');
    userBadgeIcon.textContent = '👤';
    userBadgeName.textContent = `${user.name} (${user.buyerCode})`;
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = `Purchaser (${user.buyerCode})`; drawerUserBadgePill.className = 'role-pill pill-engineer'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = 'Assigned Lines & Cash Settlements';
  } else if (user.role === 'finance') {
    userBadge.classList.add('role-engineer');
    userBadgeIcon.textContent = '💵';
    userBadgeName.textContent = 'Finance Office';
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = 'Finance'; drawerUserBadgePill.className = 'role-pill pill-engineer'; drawerUserBadgePill.style.background = '#dcfce7'; drawerUserBadgePill.style.color = '#15803d'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = 'Cash Settlements & GDrive Sync';
  } else if (user.role === 'audit') {
    userBadge.classList.add('role-executive');
    userBadgeIcon.textContent = '📜';
    userBadgeName.textContent = 'Audit Office';
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = 'Internal Audit'; drawerUserBadgePill.className = 'role-pill pill-engineer'; drawerUserBadgePill.style.background = '#fef3c7'; drawerUserBadgePill.style.color = '#b45309'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = 'Cross-Plant Audit & Alerts';
  } else if (user.role === 'plant_enduser') {
    userBadge.classList.add('role-engineer');
    userBadgeIcon.textContent = '🏭';
    userBadgeName.textContent = `End-User (${user.plant})`;
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = `Plant End-User (${user.plant})`; drawerUserBadgePill.className = 'role-pill pill-viewer'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = `${user.plant} Requisitions Only`;
  } else if (user.role === 'executive') {
    userBadge.classList.add('role-executive');
    userBadgeIcon.textContent = '👔';
    userBadgeName.textContent = 'Executive Leadership';
    if (drawerUserBadgePill) { drawerUserBadgePill.textContent = 'Executive'; drawerUserBadgePill.className = 'role-pill pill-engineer'; drawerUserBadgePill.style.background = '#ede9fe'; drawerUserBadgePill.style.color = '#6b21a8'; }
    if (drawerRoleDesc) drawerRoleDesc.textContent = 'Macro Overview & Oversight';
  } else {
    userBadge.classList.add('role-viewer');
    userBadgeIcon.textContent = '👤';
    userBadgeName.textContent = user.name || 'User';
  }
}

function applyRolePermissions(user) {
  if (!user) return;
  currentUser = user;
  updateUserBadge(user);

  document.body.classList.remove('role-admin', 'role-executive', 'role-purchaser', 'role-finance', 'role-audit', 'role-plant-enduser');
  document.body.classList.add(`role-${user.role.replace('_', '-')}`);

  // Drawer Admin & System Tools Group
  const adminGroup = document.getElementById('drawerAdminGroup');
  if (adminGroup) {
    adminGroup.style.display = (user.permissions?.fullAccess || user.permissions?.canManagePasswords) ? 'block' : 'none';
  }

  // Financial Tracking Navigation Tab & Drawer Item Visibility (Hidden for plant end users and audit)
  const canViewCash = Boolean(user.permissions?.canViewCash);
  if (btnNavCashSettlement) {
    btnNavCashSettlement.style.display = canViewCash ? 'inline-flex' : 'none';
  }
  const drawerNavCash = document.getElementById('drawerNavFinancialTracking');
  if (drawerNavCash) {
    drawerNavCash.style.display = canViewCash ? 'flex' : 'none';
  }

  // Plant Selector Tabs: For plant_enduser, lock to their plant only
  const isPlantUser = user.role === 'plant_enduser' && user.plant;
  const tabPlantAll = document.getElementById('tabPlantAll');
  const tabPlantCEPL = document.getElementById('tabPlantCEPL');
  const tabPlantSPPL = document.getElementById('tabPlantSPPL');

  if (isPlantUser) {
    selectedPlant = user.plant;
    if (tabPlantAll) tabPlantAll.style.display = 'none';
    if (tabPlantCEPL) {
      tabPlantCEPL.style.display = user.plant === 'CEPL' ? '' : 'none';
      tabPlantCEPL.classList.toggle('active', user.plant === 'CEPL');
    }
    if (tabPlantSPPL) {
      tabPlantSPPL.style.display = user.plant === 'SPPL' ? '' : 'none';
      tabPlantSPPL.classList.toggle('active', user.plant === 'SPPL');
    }
  } else {
    if (tabPlantAll) tabPlantAll.style.display = '';
    if (tabPlantCEPL) tabPlantCEPL.style.display = '';
    if (tabPlantSPPL) tabPlantSPPL.style.display = '';
  }

  // Executive Risk Alert Banner
  if (user.permissions?.canViewAlerts) {
    loadExecutiveAlerts();
  } else {
    const alertSec = document.getElementById('executiveAlertSection');
    if (alertSec) alertSec.style.display = 'none';
  }

  // Check incoming transfers for purchasers or managers
  if (user.permissions?.isPurchaser || user.permissions?.fullAccess) {
    checkPendingTransfers();
  } else {
    const transferSec = document.getElementById('transfersAlertSection');
    if (transferSec) transferSec.style.display = 'none';
  }

  const statusChangedBy = document.getElementById('statusChangedBy');
  if (statusChangedBy && user.name) statusChangedBy.value = user.name;
  const bulkChangedBy = document.getElementById('bulkChangedBy');
  if (bulkChangedBy && user.name) bulkChangedBy.value = user.name;
}

async function checkAuthSession() {
  if (!authToken) {
    showLoginOverlay();
    return false;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success && data.authenticated && data.user) {
      applyRolePermissions(data.user);
      hideLoginOverlay();
      return true;
    } else {
      clearAuthSession();
      showLoginOverlay();
      return false;
    }
  } catch (err) {
    console.error('Session check error:', err);
    clearAuthSession();
    showLoginOverlay();
    return false;
  }
}

async function loginAs(username, password = '', errorElementId = 'loginErrorMsg') {
  const errMsg = document.getElementById(errorElementId);
  const generalErrMsg = document.getElementById('loginErrorMsg');
  if (generalErrMsg) generalErrMsg.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem('pr_tracker_auth_token', authToken);
      localStorage.setItem('pr_tracker_auth_user', JSON.stringify(data.user));

      applyRolePermissions(data.user);
      hideLoginOverlay();
      showToast(`Welcome, ${data.user.name}!`, 'success');

      // Load portal data
      loadKpis();
      loadPrOverview();
    } else {
      if (errMsg) {
        errMsg.textContent = data.error || 'Authentication failed. Please check credentials.';
        errMsg.style.display = 'block';
      }
    }
  } catch (err) {
    if (errMsg) {
      errMsg.textContent = 'Failed to connect to server. Please try again.';
      errMsg.style.display = 'block';
    }
  }
}

async function handleEditorLogin() {
  const roleSelect = document.getElementById('loginRoleSelect');
  const passwordInput = document.getElementById('loginPasswordInput');
  const username = roleSelect ? roleSelect.value : 'admin';
  const password = passwordInput ? passwordInput.value : '';

  await loginAs(username, password);
}

async function handleLogout() {
  if (!confirm('Are you sure you want to sign out?')) return;

  try {
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  } catch (e) {
    // Ignore error
  } finally {
    clearAuthSession();
    showLoginOverlay();
    showToast('Signed out successfully', 'info');
  }
}

function togglePasswordVisibility() {
  const pwdInput = document.getElementById('loginPasswordInput');
  const btn = document.getElementById('btnTogglePassword');
  if (!pwdInput) return;
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    pwdInput.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
}

// ----------------------------------------------------
// USER PROFILES & PASSWORD MANAGEMENT DASHBOARD
// ----------------------------------------------------
let cachedUserAccounts = [];

async function openUserManagementModal() {
  openModal('modalUserManagement');
  const tbody = document.getElementById('userAccountsTbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--slate-400);">Loading user profiles...</td></tr>`;
  }

  try {
    const res = await authFetch('/api/admin/users');
    const data = await res.json();
    if (data.success && data.users) {
      cachedUserAccounts = data.users;
      const countEl = document.getElementById('userMgmtCount');
      if (countEl) countEl.textContent = cachedUserAccounts.length;
      renderUserAccountsTable(cachedUserAccounts);
    } else {
      showToast(data.error || 'Failed to load user profiles', 'error');
    }
  } catch (e) {
    showToast('Network error loading user profiles', 'error');
  }
}

function renderUserAccountsTable(users) {
  const tbody = document.getElementById('userAccountsTbody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--slate-400);">No user profiles found.</td></tr>`;
    return;
  }

  let html = '';
  for (const u of users) {
    let roleBadge = '';
    if (u.role === 'admin') roleBadge = `<span class="role-pill pill-manager">Management</span>`;
    else if (u.role === 'purchaser') roleBadge = `<span class="role-pill pill-engineer">Purchaser</span>`;
    else if (u.role === 'finance') roleBadge = `<span class="role-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">Finance</span>`;
    else if (u.role === 'audit') roleBadge = `<span class="role-pill" style="background:#fef3c7; color:#b45309; font-weight:700;">Audit</span>`;
    else if (u.role === 'plant_enduser') roleBadge = `<span class="role-pill pill-viewer">End-User</span>`;
    else roleBadge = `<span class="role-pill pill-viewer">${escapeHtml(u.role)}</span>`;

    html += `
      <tr>
        <td style="font-family: monospace; font-weight: 700; color: #1e293b;">${escapeHtml(u.username)}</td>
        <td style="font-weight: 600; color: var(--slate-900);">${escapeHtml(u.name)}</td>
        <td>${roleBadge}</td>
        <td style="text-align: center; font-weight: 700; color: #2563eb;">${escapeHtml(u.buyer_code || '—')}</td>
        <td style="text-align: center; font-weight: 600; color: #0284c7;">${escapeHtml(u.plant || 'All')}</td>
        <td style="color: var(--slate-600); font-size: 11px;">${escapeHtml(u.description || '')}</td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openAdminPasswordModal('${escapeHtml(u.username)}', '${escapeHtml(u.name)}')" style="padding: 3px 8px; font-size: 11px; background: #eef2ff; color: #4338ca; border-color: #c7d2fe;">
            🔑 Change Password
          </button>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function handleUserMgmtSearch() {
  const input = document.getElementById('userMgmtSearch');
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  if (!q) {
    renderUserAccountsTable(cachedUserAccounts);
    return;
  }
  const filtered = cachedUserAccounts.filter(u =>
    u.username.toLowerCase().includes(q) ||
    u.name.toLowerCase().includes(q) ||
    u.role.toLowerCase().includes(q) ||
    (u.buyer_code && u.buyer_code.toLowerCase().includes(q)) ||
    (u.plant && u.plant.toLowerCase().includes(q)) ||
    (u.description && u.description.toLowerCase().includes(q))
  );
  renderUserAccountsTable(filtered);
}

function openAdminPasswordModal(username, name) {
  document.getElementById('pwdTargetUsername').value = username;
  document.getElementById('pwdTargetAccountName').textContent = `${name} (${username})`;
  document.getElementById('pwdModalSubtitle').textContent = `Set a new password for account "${username}"`;
  document.getElementById('pwdNewInput').value = '';
  const errMsg = document.getElementById('pwdChangeErrorMsg');
  if (errMsg) errMsg.style.display = 'none';
  openModal('modalChangePassword');
}

async function handleAdminPasswordSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('pwdTargetUsername').value;
  const newPassword = document.getElementById('pwdNewInput').value;
  const errMsg = document.getElementById('pwdChangeErrorMsg');
  if (errMsg) errMsg.style.display = 'none';

  if (!newPassword || newPassword.trim().length < 4) {
    if (errMsg) {
      errMsg.textContent = 'Password must be at least 4 characters.';
      errMsg.style.display = 'block';
    }
    return;
  }

  try {
    const res = await authFetch(`/api/admin/users/${encodeURIComponent(username)}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalChangePassword');
      showToast(data.message || `Password for ${username} updated successfully!`, 'success');
    } else {
      if (errMsg) {
        errMsg.textContent = data.error || 'Failed to update password';
        errMsg.style.display = 'block';
      }
    }
  } catch (err) {
    if (errMsg) {
      errMsg.textContent = 'Network error updating password';
      errMsg.style.display = 'block';
    }
  }
}

// ----------------------------------------------------
// LINE REASSIGNMENT WORKFLOW (PROPOSAL & ACCEPTANCE)
// ----------------------------------------------------
let cachedIncomingTransfers = [];

async function checkPendingTransfers() {
  try {
    const res = await authFetch('/api/transfers/pending');
    const data = await res.json();
    if (data.success) {
      cachedIncomingTransfers = data.incoming || [];
      const banner = document.getElementById('transfersAlertSection');
      const badge = document.getElementById('pendingTransfersBadge');
      if (cachedIncomingTransfers.length > 0) {
        if (badge) badge.textContent = `${cachedIncomingTransfers.length} Incoming`;
        if (banner) banner.style.display = 'block';
      } else {
        if (banner) banner.style.display = 'none';
      }
    }
  } catch (e) {
    // Ignore error
  }
}

function openIncomingTransfersModal() {
  const tbody = document.getElementById('incomingTransfersTbody');
  if (!tbody) return;

  if (cachedIncomingTransfers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: var(--slate-400);">No incoming transfer requests right now.</td></tr>`;
  } else {
    let html = '';
    for (const t of cachedIncomingTransfers) {
      html += `
        <tr>
          <td style="text-align: center;"><span class="badge badge-neutral">${escapeHtml(t.plant)}</span></td>
          <td style="font-weight: 700; color: var(--brand-primary);">${escapeHtml(t.pr_number)}</td>
          <td style="text-align: center; font-weight: 700;">${t.line_number}</td>
          <td style="font-weight: 600; color: var(--slate-900);">${escapeHtml(t.item_name)}</td>
          <td style="text-align: right; font-weight: 700;">${formatNumber(t.purch_qty)} ${escapeHtml(t.unit || '')}</td>
          <td style="font-weight: 600; color: #2563eb;">${escapeHtml(t.transfer_requested_by || 'Colleague')}</td>
          <td style="font-size: 11px; color: var(--slate-500);">${escapeHtml(t.transfer_requested_at || '')}</td>
          <td style="font-size: 12px; color: var(--slate-700);"><em>${escapeHtml(t.status_remarks || 'Reassignment requested')}</em></td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 4px; justify-content: center;">
              <button type="button" class="btn btn-primary btn-sm" onclick="handleRespondTransfer('${escapeHtml(t.id)}', 'accept')" style="background: #16a34a; padding: 4px 10px; font-size: 11px;">
                ✓ Accept
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="handleRespondTransfer('${escapeHtml(t.id)}', 'decline')" style="color: #dc2626; padding: 4px 10px; font-size: 11px;">
                ✕ Decline
              </button>
            </div>
          </td>
        </tr>
      `;
    }
    tbody.innerHTML = html;
  }

  openModal('modalIncomingTransfers');
}

async function handleRespondTransfer(lineId, action) {
  const actionText = action === 'accept' ? 'accept' : 'decline';
  if (!confirm(`Are you sure you want to ${actionText} this line transfer?`)) return;

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/respond-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || `Transfer ${actionText}ed successfully!`, 'success');
      await checkPendingTransfers();
      openIncomingTransfersModal();
      loadKpis();
      if (currentView === 'pending_lines') {
        loadPendingLines();
      } else if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else {
        loadPrOverview();
      }
    } else {
      showToast(data.error || `Failed to ${actionText} transfer`, 'error');
    }
  } catch (e) {
    showToast('Network error processing transfer response', 'error');
  }
}

function openProposeTransferModal(lineId, prNumber, itemName, currentBuyer) {
  const line = (currentPrLines || []).find(l => l.id === lineId) || (pendingLinesData || []).find(l => l.id === lineId);
  const pr = prNumber || line?.pr_number || '';
  const item = itemName || line?.item_name || 'Line item';

  document.getElementById('transferTargetLineId').value = lineId;
  document.getElementById('transferLinePrBadge').textContent = `Requisition: ${pr}`;
  document.getElementById('transferLineItemName').textContent = item;
  document.getElementById('transferReasonNotes').value = '';

  const select = document.getElementById('transferTargetBuyerSelect');
  if (select) {
    select.value = '';
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      if (currentUser?.buyerCode && opt.value === currentUser.buyerCode) {
        opt.disabled = true;
      } else {
        opt.disabled = false;
      }
    }
  }

  openModal('modalProposeTransfer');
}

async function handleTransferProposalSubmit(e) {
  e.preventDefault();
  const lineId = document.getElementById('transferTargetLineId').value;
  const targetBuyer = document.getElementById('transferTargetBuyerSelect').value;
  const reasonNotes = document.getElementById('transferReasonNotes').value;

  if (!targetBuyer) {
    showToast('Please select a target purchaser.', 'warning');
    return;
  }

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/propose-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_purchaser: targetBuyer,
        reason_notes: reasonNotes
      })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalProposeTransfer');
      showToast(data.message || 'Transfer proposed successfully!', 'success');
      if (currentView === 'pending_lines') {
        loadPendingLines();
      } else if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else {
        loadPrOverview();
      }
    } else {
      showToast(data.error || 'Failed to submit transfer proposal', 'error');
    }
  } catch (err) {
    showToast('Network error proposing transfer', 'error');
  }
}

// ----------------------------------------------------
// PR LINE URGENCY & EXPECTED DELIVERY DATE WORKFLOW
// ----------------------------------------------------

function getUrgencyBadge(urgency, lineId = null, canSetUrgency = false) {
  const u = (urgency || 'Normal').trim();
  const isInteractive = Boolean(canSetUrgency && lineId);
  const clickAttrs = isInteractive 
    ? `data-action="open-urgency" data-line-id="${escapeHtml(lineId)}" onclick="openAssignUrgencyModal('${escapeHtml(lineId)}')" title="Click to assign urgency level"` 
    : '';
  const interactiveCls = isInteractive ? 'urgency-badge-interactive' : '';

  if (u === 'Critical') {
    return `<span class="badge ${interactiveCls}" ${clickAttrs} style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; ${isInteractive ? 'cursor: pointer;' : ''}">🔴 Critical</span>`;
  }
  if (u === 'Urgent') {
    return `<span class="badge ${interactiveCls}" ${clickAttrs} style="background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; font-weight: 700; font-size: 11px; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; ${isInteractive ? 'cursor: pointer;' : ''}">🟡 Urgent</span>`;
  }
  return `<span class="badge ${interactiveCls}" ${clickAttrs} style="background: #f1f5f9; color: #475569; font-weight: 600; font-size: 11px; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; ${isInteractive ? 'cursor: pointer;' : ''}">🟢 Normal</span>`;
}

function openAssignUrgencyModal(lineId) {
  let line = (currentPrLines || []).find(l => l.id === lineId) || (pendingLinesData || []).find(l => l.id === lineId);
  if (!line && currentPrLines && currentPrLines.length > 0) {
    line = currentPrLines.find(l => String(l.id) === String(lineId));
  }
  if (!line && pendingLinesData && pendingLinesData.length > 0) {
    line = pendingLinesData.find(l => String(l.id) === String(lineId));
  }
  if (!line) {
    console.warn('openAssignUrgencyModal: Line not found for id:', lineId);
    showToast('Unable to locate line item details', 'warning');
    return;
  }

  const elId = document.getElementById('urgencyLineId');
  const elBadge = document.getElementById('urgencyLinePrBadge');
  const elName = document.getElementById('urgencyLineItemName');
  const elNotes = document.getElementById('urgencyReasonNotes');

  if (elId) elId.value = line.id;
  if (elBadge) elBadge.textContent = `Requisition: ${line.pr_number || ''} • Line #${line.line_number || ''}`;
  if (elName) elName.textContent = line.item_name || 'Line Item';
  if (elNotes) elNotes.value = '';

  const currentUrgency = line.urgency_level || 'Normal';
  selectUrgencyOption(currentUrgency);

  openModal('modalAssignUrgency');
}

function selectUrgencyOption(level) {
  const targetLevel = (level || 'Normal').toLowerCase();
  const options = ['Normal', 'Urgent', 'Critical'];
  for (const opt of options) {
    const card = document.getElementById(`labelUrgency${opt}`);
    const radio = card ? card.querySelector('input[type="radio"]') : null;
    if (card && radio) {
      if (opt.toLowerCase() === targetLevel) {
        radio.checked = true;
        card.classList.add('active');
        if (opt === 'Normal') {
          card.style.borderColor = '#16a34a';
          card.style.background = '#f0fdf4';
        } else if (opt === 'Urgent') {
          card.style.borderColor = '#d97706';
          card.style.background = '#fffbeb';
        } else if (opt === 'Critical') {
          card.style.borderColor = '#dc2626';
          card.style.background = '#fef2f2';
        }
      } else {
        radio.checked = false;
        card.classList.remove('active');
        card.style.borderColor = '#cbd5e1';
        card.style.background = '#ffffff';
      }
    }
  }
}

async function handleUrgencySubmit(e) {
  e.preventDefault();
  const lineId = document.getElementById('urgencyLineId').value;
  const selectedRadio = document.querySelector('input[name="urgencyRadio"]:checked');
  const urgency_level = selectedRadio ? selectedRadio.value : 'Normal';
  const notes = document.getElementById('urgencyReasonNotes').value;

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/urgency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urgency_level, notes })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalAssignUrgency');
      showToast(data.message || `Urgency set to "${urgency_level}"!`, 'success');
      if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else if (currentView === 'pending_lines') {
        loadPendingLines();
      } else {
        loadPrOverview();
      }
    } else {
      showToast(data.error || 'Failed to update urgency', 'error');
    }
  } catch (err) {
    showToast('Network error updating urgency', 'error');
  }
}

function openEditDeliveryDateModal(lineId) {
  const line = (currentPrLines || []).find(l => l.id === lineId) || (pendingLinesData || []).find(l => l.id === lineId);
  if (!line) return;

  document.getElementById('eddLineId').value = line.id;
  document.getElementById('eddLinePrBadge').textContent = `Requisition: ${line.pr_number || ''} • Line #${line.line_number}`;
  document.getElementById('eddLineItemName').textContent = line.item_name || 'Line Item';
  document.getElementById('inputExpectedDlvDate').value = line.expected_dlv_date || '';
  document.getElementById('inputEddReason').value = '';

  openModal('modalEditDeliveryDate');
}

function setQuickDeliveryDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  const dateStr = d.toISOString().split('T')[0];
  const input = document.getElementById('inputExpectedDlvDate');
  if (input) input.value = dateStr;
}

async function handleDeliveryDateSubmit(e) {
  e.preventDefault();
  const lineId = document.getElementById('eddLineId').value;
  const expected_dlv_date = document.getElementById('inputExpectedDlvDate').value;
  const reason = document.getElementById('inputEddReason').value;

  if (!expected_dlv_date) {
    showToast('Please enter an expected delivery date.', 'warning');
    return;
  }

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/expected-delivery-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_dlv_date, reason })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalEditDeliveryDate');
      showToast(data.message || `Expected delivery date updated to ${expected_dlv_date}!`, 'success');
      if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else if (currentView === 'pending_lines') {
        loadPendingLines();
      } else {
        loadPrOverview();
      }
    } else {
      showToast(data.error || 'Failed to update expected delivery date', 'error');
    }
  } catch (err) {
    showToast('Network error updating expected delivery date', 'error');
  }
}

// Search and filter inside PR line items detail view
function handleLineItemSearch() {
  const input = document.getElementById('lineItemSearchInput');
  const btnClear = document.getElementById('btnClearLineSearch');
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  if (btnClear) btnClear.style.display = q ? 'inline-flex' : 'none';

  if (!q) {
    renderPrLines(currentPrLines);
    return;
  }

  const filtered = (currentPrLines || []).filter(l =>
    (l.item_name && l.item_name.toLowerCase().includes(q)) ||
    (l.item_id && l.item_id.toLowerCase().includes(q)) ||
    String(l.line_number).includes(q) ||
    (l.po_number && l.po_number.toLowerCase().includes(q)) ||
    (l.status_remarks && l.status_remarks.toLowerCase().includes(q)) ||
    (l.urgency_level && l.urgency_level.toLowerCase().includes(q))
  );
  renderPrLines(filtered);
}

function clearLineItemSearch() {
  const input = document.getElementById('lineItemSearchInput');
  const btnClear = document.getElementById('btnClearLineSearch');
  if (input) input.value = '';
  if (btnClear) btnClear.style.display = 'none';
  renderPrLines(currentPrLines);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupColumnToggles();
  updateRoleDescription();
  const isAuth = await checkAuthSession();
  if (isAuth) {
    loadKpis();
    loadPrOverview();
  }
});

// Setup event listeners
function setupEventListeners() {
  // Navigation Tabs Switcher
  if (btnNavOverview) btnNavOverview.addEventListener('click', navigateToOverview);
  if (btnNavPendingLines) btnNavPendingLines.addEventListener('click', navigateToPendingLines);
  if (btnNavVendorDashboard) btnNavVendorDashboard.addEventListener('click', navigateToVendorDashboard);
  if (btnNavCashSettlement) btnNavCashSettlement.addEventListener('click', navigateToCashSettlement);
  if (btnManualUpdatedPrs) btnManualUpdatedPrs.addEventListener('click', filterByManualUpdates);
  if (btnVendorMatrixManualOnly) btnVendorMatrixManualOnly.addEventListener('click', filterByManualUpdates);
  if (btnBackToOverviewFromMatrix) btnBackToOverviewFromMatrix.addEventListener('click', navigateToOverview);
  if (cardKpiPendingPo) cardKpiPendingPo.addEventListener('click', navigateToPendingLines);

  // Google Drive Cash Settlement Sync Listeners
  if (btnSyncGDrive) btnSyncGDrive.addEventListener('click', handleSyncGoogleDrive);
  if (btnManualSyncGDrive) btnManualSyncGDrive.addEventListener('click', handleSyncGoogleDrive);

  // Cash Settlements Search & Filters
  if (cashSearchInput) cashSearchInput.addEventListener('input', debounce(loadCashSettlements, 250));
  if (cashPurchaserFilter) {
    cashPurchaserFilter.addEventListener('change', () => {
      selectedCashPurchaser = cashPurchaserFilter.value;
      loadCashSettlements();
    });
  }
  if (cashStatusFilter) cashStatusFilter.addEventListener('change', loadCashSettlements);

  // Plant Selector Tabs
  document.querySelectorAll('.plant-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.plant-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedPlant = tab.dataset.plant;
      loadKpis();
      loadExecutiveAlerts();
      if (currentView === 'vendor_dashboard') {
        loadVendorDashboard();
      } else if (currentView === 'pending_lines') {
        loadPendingLines();
      } else if (currentView === 'cash_settlement') {
        loadCashSettlements();
      } else if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else {
        loadPrOverview();
      }
    });
  });

  // Search and filters for Overview
  const btnClearSearch = document.getElementById('btnClearSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (btnClearSearch) {
        btnClearSearch.style.display = searchInput.value.trim().length > 0 ? 'inline-flex' : 'none';
      }
    });
    searchInput.addEventListener('input', debounce(loadPrOverview, 250));
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      btnClearSearch.style.display = 'none';
      loadPrOverview();
    });
  }

  statusFilter.addEventListener('change', loadPrOverview);
  poStateFilter.addEventListener('change', loadPrOverview);
  if (vendorGroupFilter) vendorGroupFilter.addEventListener('change', loadPrOverview);

  // Pending Lines Filter & Search Listeners
  if (pendingLinesSearchInput) pendingLinesSearchInput.addEventListener('input', debounce(loadPendingLines, 250));
  if (pendingLinesBuyerFilter) pendingLinesBuyerFilter.addEventListener('change', loadPendingLines);
  if (pendingLinesStatusFilter) pendingLinesStatusFilter.addEventListener('change', loadPendingLines);
  if (pendingLinesSortFilter) pendingLinesSortFilter.addEventListener('change', loadPendingLines);
  if (selectAllPendingLinesCheckbox) selectAllPendingLinesCheckbox.addEventListener('change', handleSelectAllPendingLines);
  if (btnApplyPendingBulkAssign) btnApplyPendingBulkAssign.addEventListener('click', handlePendingBulkAssign);
  if (btnClearPendingSelection) btnClearPendingSelection.addEventListener('click', clearPendingLinesSelection);
  if (btnExportPendingLinesCsv) {
    btnExportPendingLinesCsv.addEventListener('click', () => {
      window.location.href = `/api/export/csv?type=pending_lines&plant=${encodeURIComponent(selectedPlant)}&auth_token=${encodeURIComponent(authToken || '')}`;
    });
  }

  // Safe Refresh View Button
  const btnRefresh = document.getElementById('btnRefreshView');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      showToast('Refreshing view...', 'info');
      loadKpis();
      if (currentView === 'vendor_dashboard') {
        loadVendorDashboard();
      } else if (currentView === 'pending_lines') {
        loadPendingLines();
      } else if (currentView === 'cash_settlement') {
        loadCashSettlements();
      } else if (currentView === 'detail' && selectedPrNumber) {
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

  // Auth & Login Event Listeners
  const viewerForm = document.getElementById('viewerLoginForm');
  if (viewerForm) {
    viewerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pw = document.getElementById('viewerPasswordInput')?.value || '';
      loginAs('viewer', pw, 'viewerLoginErrorMsg');
    });
  }

  const btnToggleViewerPw = document.getElementById('btnToggleViewerPw');
  if (btnToggleViewerPw) {
    btnToggleViewerPw.addEventListener('click', () => {
      const input = document.getElementById('viewerPasswordInput');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  }

  const editorForm = document.getElementById('editorLoginForm');
  if (editorForm) {
    editorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleEditorLogin();
    });
  }

  const btnTogglePw = document.getElementById('btnTogglePassword');
  if (btnTogglePw) {
    btnTogglePw.addEventListener('click', togglePasswordVisibility);
  }

  const btnSignOut = document.getElementById('btnSignOut');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', handleLogout);
  }

  // Profile Selector Change Listener (Updates description dynamically)
  const loginRoleSelect = document.getElementById('loginRoleSelect');
  if (loginRoleSelect) {
    loginRoleSelect.addEventListener('change', updateRoleDescription);
  }

  // User Management & Password Dashboard Listeners
  const drawerBtnUserMgmt = document.getElementById('drawerBtnUserManagement');
  if (drawerBtnUserMgmt) {
    drawerBtnUserMgmt.addEventListener('click', () => {
      openUserManagementModal();
      closeDrawer();
    });
  }

  const userMgmtSearch = document.getElementById('userMgmtSearch');
  if (userMgmtSearch) {
    userMgmtSearch.addEventListener('input', debounce(handleUserMgmtSearch, 200));
  }

  const formAdminChangePassword = document.getElementById('formAdminChangePassword');
  if (formAdminChangePassword) {
    formAdminChangePassword.addEventListener('submit', handleAdminPasswordSubmit);
  }

  const btnToggleAdminPw = document.getElementById('btnToggleAdminPw');
  if (btnToggleAdminPw) {
    btnToggleAdminPw.addEventListener('click', () => {
      const input = document.getElementById('pwdNewInput');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  }

  // Line Reassignment Workflow Listeners
  const btnReviewTransfers = document.getElementById('btnReviewTransfers');
  if (btnReviewTransfers) {
    btnReviewTransfers.addEventListener('click', openIncomingTransfersModal);
  }

  const formProposeTransfer = document.getElementById('formProposeTransfer');
  if (formProposeTransfer) {
    formProposeTransfer.addEventListener('submit', handleTransferProposalSubmit);
  }

  // Urgency & Delivery Date Modal Listeners
  const formAssignUrgency = document.getElementById('formAssignUrgency');
  if (formAssignUrgency) {
    formAssignUrgency.addEventListener('submit', handleUrgencySubmit);
  }

  const formEditDeliveryDate = document.getElementById('formEditDeliveryDate');
  if (formEditDeliveryDate) {
    formEditDeliveryDate.addEventListener('submit', handleDeliveryDateSubmit);
  }

  // PR Line Item Search in Details View
  const lineItemSearchInput = document.getElementById('lineItemSearchInput');
  if (lineItemSearchInput) {
    lineItemSearchInput.addEventListener('input', debounce(handleLineItemSearch, 150));
  }

  const btnClearLineSearch = document.getElementById('btnClearLineSearch');
  if (btnClearLineSearch) {
    btnClearLineSearch.addEventListener('click', clearLineItemSearch);
  }

  // Hamburger Drawer Controls
  const btnHamburgerToggle = document.getElementById('btnHamburgerToggle');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const hamburgerDrawer = document.getElementById('hamburgerDrawer');

  function openDrawer() {
    if (hamburgerDrawer) hamburgerDrawer.classList.add('open');
    if (drawerBackdrop) {
      drawerBackdrop.style.display = 'block';
      setTimeout(() => drawerBackdrop.classList.add('active'), 10);
    }
  }

  function closeDrawer() {
    if (hamburgerDrawer) hamburgerDrawer.classList.remove('open');
    if (drawerBackdrop) {
      drawerBackdrop.classList.remove('active');
      setTimeout(() => { drawerBackdrop.style.display = 'none'; }, 280);
    }
  }

  if (btnHamburgerToggle) btnHamburgerToggle.addEventListener('click', openDrawer);
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  // Drawer Navigation Items
  document.getElementById('drawerNavOverview')?.addEventListener('click', () => { navigateToOverview(); closeDrawer(); });
  document.getElementById('drawerNavPendingLines')?.addEventListener('click', () => { navigateToPendingLines(); closeDrawer(); });
  document.getElementById('drawerNavFinancialTracking')?.addEventListener('click', () => { navigateToCashSettlement(); closeDrawer(); });
  document.getElementById('drawerNavVendorDashboard')?.addEventListener('click', () => { navigateToVendorDashboard(); closeDrawer(); });
  document.getElementById('drawerBtnAuditTrail')?.addEventListener('click', () => { openAuditTrailModal(); closeDrawer(); });

  // Drawer Sync Buttons
  document.getElementById('drawerBtnSyncGDrive')?.addEventListener('click', () => { handleSyncGoogleDrive(); closeDrawer(); });
  document.getElementById('drawerBtnSyncExcel')?.addEventListener('click', () => { handleSyncExcel(); closeDrawer(); });
  document.getElementById('drawerBtnExternalSql')?.addEventListener('click', () => { openSqlModal(); closeDrawer(); });

  // Drawer Export Buttons
  document.getElementById('drawerBtnExportOverview')?.addEventListener('click', () => { exportOverviewCsv(); closeDrawer(); });
  document.getElementById('drawerBtnExportLines')?.addEventListener('click', () => { exportLinesCsv(); closeDrawer(); });
  document.getElementById('drawerBtnExportPending')?.addEventListener('click', () => { exportPendingLinesCsv(); closeDrawer(); });
  document.getElementById('drawerBtnSignOut')?.addEventListener('click', () => { handleLogout(); closeDrawer(); });

  // Header Export Buttons (if present)
  document.getElementById('btnExportOverview')?.addEventListener('click', exportOverviewCsv);
  document.getElementById('btnExportDetailCsv')?.addEventListener('click', exportLinesCsv);

  // External SQL Settings
  document.getElementById('btnExternalSql')?.addEventListener('click', openSqlModal);
  document.getElementById('sqlConfigForm')?.addEventListener('submit', handleSqlSave);
  document.getElementById('btnTestSqlConnection')?.addEventListener('click', handleSqlTest);

  // Status Update Form Submit
  document.getElementById('statusUpdateForm')?.addEventListener('submit', handleStatusSubmit);

  // Bulk Multi-Select & Bulk Status Update
  const selectAllCb = document.getElementById('selectAllLinesCheckbox');
  if (selectAllCb) selectAllCb.addEventListener('change', handleSelectAllLines);
  document.getElementById('btnOpenBulkModal')?.addEventListener('click', openBulkStatusModal);
  document.getElementById('btnClearBulkSelection')?.addEventListener('click', clearBulkSelection);
  document.getElementById('bulkStatusUpdateForm')?.addEventListener('submit', handleBulkStatusSubmit);

  // PR Timeline View
  document.getElementById('btnViewPrTimeline')?.addEventListener('click', () => {
    if (selectedPrNumber) openPrTimeline(selectedPrNumber);
  });

  // Executive Alert Banner Chips Click-Through (Intelligent Anomaly Modal)
  document.getElementById('btnAlertOverdue')?.addEventListener('click', () => {
    openExecutiveAlertsModal('overdue');
  });

  document.getElementById('btnAlertUnassigned')?.addEventListener('click', () => {
    openExecutiveAlertsModal('unassigned');
  });

  document.getElementById('btnAlertVariance')?.addEventListener('click', () => {
    openExecutiveAlertsModal('variance');
  });

  document.getElementById('execAlertBadge')?.addEventListener('click', () => {
    openExecutiveAlertsModal('overdue');
  });

  // Executive Comments Form Submit Listener
  document.getElementById('formAddComment')?.addEventListener('submit', handleCommentSubmit);

  // Status Audit Trail Filter Listener
  document.getElementById('auditFilterInput')?.addEventListener('input', handleAuditFilterInput);

  // Global Event Delegation for Interactive Buttons & Badges (100% resilient across dynamic tables & DataTables)
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');
    const lineId = actionEl.getAttribute('data-line-id');
    const prNumber = actionEl.getAttribute('data-pr');

    if (action === 'open-urgency' && lineId) {
      e.preventDefault();
      e.stopPropagation();
      openAssignUrgencyModal(lineId);
    } else if (action === 'open-line-history' && lineId) {
      e.preventDefault();
      e.stopPropagation();
      openLineHistory(lineId);
    } else if (action === 'open-edd' && lineId) {
      e.preventDefault();
      e.stopPropagation();
      openEditDeliveryDateModal(lineId);
    } else if (action === 'open-status' && lineId) {
      e.preventDefault();
      e.stopPropagation();
      openStatusModal(lineId);
    } else if (action === 'open-transfer' && lineId) {
      e.preventDefault();
      e.stopPropagation();
      openProposeTransferModal(lineId);
    } else if (action === 'open-comments') {
      e.preventDefault();
      e.stopPropagation();
      openCommentsModal(prNumber, lineId);
    } else if (action === 'open-pr-timeline' && prNumber) {
      e.preventDefault();
      e.stopPropagation();
      openPrTimeline(prNumber);
    } else if (action === 'open-pr-detail' && prNumber) {
      e.preventDefault();
      e.stopPropagation();
      navigateToDetail(prNumber);
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

function updateNavTabs() {
  if (btnNavOverview) btnNavOverview.classList.toggle('active', currentView === 'overview');
  if (btnNavPendingLines) btnNavPendingLines.classList.toggle('active', currentView === 'pending_lines');
  if (btnNavVendorDashboard) btnNavVendorDashboard.classList.toggle('active', currentView === 'vendor_dashboard');
  if (btnNavCashSettlement) btnNavCashSettlement.classList.toggle('active', currentView === 'cash_settlement');
}

function navigateToOverview() {
  currentView = 'overview';
  selectedPrNumber = null;
  clearBulkSelection();
  clearPendingLinesSelection();
  viewPrOverview.style.display = 'block';
  viewPrDetail.style.display = 'none';
  if (viewPendingLines) viewPendingLines.style.display = 'none';
  if (viewVendorDashboard) viewVendorDashboard.style.display = 'none';
  if (viewCashSettlement) viewCashSettlement.style.display = 'none';
  updateNavTabs();
  loadKpis();
  loadPrOverview();
}

function navigateToDetail(prNumber) {
  currentView = 'detail';
  selectedPrNumber = prNumber;
  clearBulkSelection();
  clearPendingLinesSelection();
  viewPrOverview.style.display = 'none';
  viewPrDetail.style.display = 'block';
  if (viewPendingLines) viewPendingLines.style.display = 'none';
  if (viewVendorDashboard) viewVendorDashboard.style.display = 'none';
  if (viewCashSettlement) viewCashSettlement.style.display = 'none';
  updateNavTabs();
  loadPrDetails(prNumber);
}

function navigateToVendorDashboard() {
  currentView = 'vendor_dashboard';
  selectedPrNumber = null;
  clearBulkSelection();
  clearPendingLinesSelection();
  viewPrOverview.style.display = 'none';
  viewPrDetail.style.display = 'none';
  if (viewPendingLines) viewPendingLines.style.display = 'none';
  if (viewVendorDashboard) viewVendorDashboard.style.display = 'block';
  if (viewCashSettlement) viewCashSettlement.style.display = 'none';
  updateNavTabs();
  loadKpis();
  loadVendorDashboard();
}

function navigateToPendingLines() {
  currentView = 'pending_lines';
  selectedPrNumber = null;
  clearBulkSelection();
  clearPendingLinesSelection();
  viewPrOverview.style.display = 'none';
  viewPrDetail.style.display = 'none';
  if (viewVendorDashboard) viewVendorDashboard.style.display = 'none';
  if (viewPendingLines) viewPendingLines.style.display = 'block';
  if (viewCashSettlement) viewCashSettlement.style.display = 'none';
  updateNavTabs();
  loadKpis();
  loadPendingLines();
}

function navigateToCashSettlement() {
  currentView = 'cash_settlement';
  selectedPrNumber = null;
  clearBulkSelection();
  clearPendingLinesSelection();
  if (viewPrOverview) viewPrOverview.style.display = 'none';
  if (viewPrDetail) viewPrDetail.style.display = 'none';
  if (viewVendorDashboard) viewVendorDashboard.style.display = 'none';
  if (viewPendingLines) viewPendingLines.style.display = 'none';
  if (viewCashSettlement) viewCashSettlement.style.display = 'block';
  updateNavTabs();
  loadKpis();
  loadCashSettlements();
}

function filterByManualUpdates() {
  if (statusFilter) statusFilter.value = 'ManualUpdates';
  if (vendorGroupFilter) vendorGroupFilter.value = 'All';
  navigateToOverview();
}

function filterByVendorGroup(vendorCode) {
  if (vendorGroupFilter) vendorGroupFilter.value = vendorCode;
  if (statusFilter) statusFilter.value = 'All';
  navigateToOverview();
}

// ----------------------------------------------------
// Data Loading & API Calls
// ----------------------------------------------------

async function loadKpis() {
  try {
    const params = new URLSearchParams();
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);

    const res = await authFetch(`/api/kpis?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('kpiTotalPrs').textContent = data.total_active_prs || 0;
      document.getElementById('kpiTotalLines').textContent = `${data.active_line_items || 0} Active Line Items`;

      document.getElementById('kpiLinesWithPo').textContent = data.lines_with_po || 0;
      const elPoMeta = document.getElementById('kpiLinesWithPoMeta');
      if (elPoMeta) elPoMeta.textContent = 'Converted to Purchase Order';

      document.getElementById('kpiLinesWithoutPo').textContent = data.lines_without_po || 0;
      const elNoPoMeta = document.getElementById('kpiLinesWithoutPoMeta');
      if (elNoPoMeta) elNoPoMeta.textContent = 'Awaiting PO Issuance';

      if (navPendingLinesBadge) {
        navPendingLinesBadge.textContent = data.lines_without_po || 0;
      }

      document.getElementById('kpiFullyDelivered').textContent = data.fully_delivered_lines || 0;
      const elFullMeta = document.getElementById('kpiFullyDeliveredMeta');
      if (elFullMeta) {
        elFullMeta.textContent = `100% Demand (+${data.delivered_within_5pct || 0} within ±5%)`;
      }

      document.getElementById('kpiPartiallyDelivered').textContent = data.partially_delivered_lines || 0;
      const elPartMeta = document.getElementById('kpiPartiallyDeliveredMeta');
      if (elPartMeta) {
        elPartMeta.textContent = `>5% Shortage (${data.over_delivered_lines || 0} Over-delivered >5%)`;
      }

      document.getElementById('kpiOverdueLines').textContent = data.overdue_lines || 0;
      const elOverdueMeta = document.getElementById('kpiOverdueMeta');
      if (elOverdueMeta) elOverdueMeta.textContent = 'Active POs Past Due Date';

      if (manualPrBadge) {
        manualPrBadge.textContent = data.total_manual_prs || 0;
      }

      // Keep Cash in Hand Navigation Badge Updated
      if (navCashInHandBadge) {
        try {
          const cParams = (selectedPlant && selectedPlant !== 'All') ? `?plant=${encodeURIComponent(selectedPlant)}` : '';
          const cashRes = await authFetch(`/api/gdrive/cash-settlements${cParams}`);
          const cashData = await cashRes.json();
          if (cashData.success && cashData.totals) {
            navCashInHandBadge.textContent = formatPkrCompact(cashData.totals.total_cash_in_hand);
          }
        } catch (e) {
          // ignore badge background refresh error
        }
      }
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
    const vendorGroup = vendorGroupFilter ? vendorGroupFilter.value : 'All';

    const params = new URLSearchParams();
    if (q) params.append('search', q);
    if (status && status !== 'All') params.append('status', status);
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);
    if (poFilter && poFilter !== 'All') params.append('po_filter', poFilter);
    if (vendorGroup && vendorGroup !== 'All') params.append('vendor_group', vendorGroup);

    const res = await authFetch(`/api/prs?${params.toString()}`);
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
    const res = await authFetch(`/api/prs/${encodeURIComponent(prNumber)}`);
    const data = await res.json();

    if (data.success) {
      currentPrLines = data.lines;
      detailPrBreadcrumb.textContent = `${prNumber}`;
      detailPrNumber.textContent = prNumber;
      detailPlant.textContent = data.plant || 'CEPL';
      detailLineCount.textContent = currentPrLines.length;

      const displayedLineCount = document.getElementById('displayedLineCount');
      if (displayedLineCount) displayedLineCount.textContent = currentPrLines.length;

      const lineSearchInput = document.getElementById('lineItemSearchInput');
      if (lineSearchInput) lineSearchInput.value = '';

      const btnClearLineSearch = document.getElementById('btnClearLineSearch');
      if (btnClearLineSearch) btnClearLineSearch.style.display = 'none';

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
  if (currentUser && !currentUser.canEdit) {
    showToast('Permission denied: Viewer role is read-only', 'warning');
    return;
  }

  if (!confirm('Sync latest ERP data from Excel files?\n\n(All your custom tracking statuses, remarks, and assigned vendors will be safely preserved).')) {
    return;
  }

  const btn = document.getElementById('btnSyncExcel');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Syncing...';
  btn.disabled = true;

  try {
    const res = await authFetch('/api/excel/re-import', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Excel files synced! Your tracking statuses & remarks are preserved.', 'success');
      loadKpis();
      if (currentView === 'vendor_dashboard') {
        loadVendorDashboard();
      } else if (currentView === 'detail' && selectedPrNumber) {
        loadPrDetails(selectedPrNumber);
      } else {
        loadPrOverview();
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
  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#prOverviewTable')) {
    $('#prOverviewTable').DataTable().destroy();
  }

  const isPlantEndUser = currentUser && currentUser.role === 'plant_enduser';
  const theadEl = document.getElementById('prOverviewThead');
  if (theadEl) {
    if (isPlantEndUser) {
      theadEl.innerHTML = `
        <tr class="column-header-row">
          <th style="width: 150px;">PR NUMBER</th>
          <th style="width: 190px;">GENERAL STATUS</th>
          <th style="width: 230px;">DELIVERY PROGRESS</th>
          <th style="width: 150px;">PO CREATE DATE</th>
          <th style="text-align: right; width: 150px;">ACTIONS</th>
        </tr>
      `;
    } else {
      theadEl.innerHTML = `
        <tr class="column-header-row">
          <th style="width: 70px;">PLANT</th>
          <th style="width: 120px;">PR NUMBER</th>
          <th>PURPOSE / REQUISITION REMARKS</th>
          <th>GENERAL STATUS</th>
          <th style="text-align: center;">TOTAL LINES</th>
          <th style="text-align: center;">FULLY DELIVERED</th>
          <th style="text-align: center;">PARTIALLY DELIVERED</th>
          <th style="text-align: center;">PENDING / OPEN</th>
          <th>DELIVERY PROGRESS</th>
          <th>PO CREATE DATE</th>
          <th>EXPECTED DLV DATE</th>
          <th style="text-align: right;">ACTIONS</th>
        </tr>
      `;
    }
  }

  if (!prs || prs.length === 0) {
    prTableBody.innerHTML = `
      <tr>
        <td colspan="${isPlantEndUser ? 5 : 12}" class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No Purchase Requisitions Found</div>
          <div>Try adjusting your search query or plant selection.</div>
        </td>
      </tr>
    `;
    if (prMobileList) {
      prMobileList.innerHTML = `
        <div class="empty-state-mobile">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No Requisitions Found</div>
          <div>Try adjusting your search query or plant selection.</div>
        </div>
      `;
    }
    return;
  }

  let html = '';
  let mobileHtml = '';
  for (const pr of prs) {
    const statusBadge = getStatusBadge(pr.general_status);
    const progressColor = pr.delivery_completion_pct === 100 ? 'progress-green' : pr.delivery_completion_pct > 0 ? 'progress-blue' : 'progress-amber';

    const overdueTag = pr.is_overdue
      ? `<span class="badge badge-cancelled" style="font-size: 10px; margin-left: 4px;">OVERDUE</span>`
      : '';

    const plantBadge = `<span class="badge ${pr.plant === 'SPPL' ? 'badge-partial' : 'badge-neutral'}" style="font-weight: 700;">${pr.plant}</span>`;

    const manualBadge = pr.has_manual_updates
      ? `<span class="badge-manual" title="Has manual status, remarks, or purchaser updates">✍️ Manual</span>`
      : '';

    const purchaserBadge = pr.primary_vendor_group && !['OTHER_VENDORS', 'UNASSIGNED'].includes(pr.primary_vendor_group)
      ? `<span style="font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;" title="Assigned Purchaser: ${escapeHtml(pr.primary_vendor_group)}">${escapeHtml(pr.primary_vendor_group)}</span>`
      : '';

    if (isPlantEndUser) {
      // 1. Plant End-User Simplified Desktop Row: PR Number (with Approval Date subtext), General Status, Delivery Progress, PO Date, Actions
      const approveSubtext = pr.pr_approve_date
        ? `<div class="pr-approval-subtext" style="font-size: 11px; color: #047857; font-weight: 600; margin-top: 2px; display: inline-flex; align-items: center; gap: 3px;" title="PR Approved on ${escapeHtml(pr.pr_approve_date)}"><span style="font-size: 10px;">📅</span> Approved: ${escapeHtml(pr.pr_approve_date)}</div>`
        : `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Pending Approval</div>`;

      html += `
        <tr>
          <td data-order="${escapeHtml((pr.pr_approve_date || pr.po_create_date || '0000-00-00') + '_' + pr.pr_number)}">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <a href="javascript:void(0)" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')" style="font-weight: 800; color: var(--brand-primary); text-decoration: none; font-size: 14px;">
                ${escapeHtml(pr.pr_number)}
              </a>
              ${approveSubtext}
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              ${getLifecycleBadge(pr.lifecycle_stage)}
              <div style="font-size: 11px;">${statusBadge}</div>
            </div>
          </td>
          <td>
            <div class="progress-bar-container" title="${pr.delivery_completion_pct}% of lines delivered">
              <div class="progress-bar-fill ${progressColor}" style="width: ${pr.delivery_completion_pct}%;"></div>
            </div>
            <span style="font-size: 11px; font-weight: 600; color: #64748b;">${pr.delivery_completion_pct}% delivered</span>
          </td>
          <td style="font-size: 12px; color: #475569; font-weight: 600;">${pr.po_create_date || '-'}</td>
          <td style="text-align: right;">
            <button class="btn btn-primary btn-sm" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')">
              Open Lines ➔
            </button>
          </td>
        </tr>
      `;

      // 2. Plant End-User Simplified Mobile Card
      mobileHtml += `
        <div class="mobile-pr-card" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')">
          <div class="mobile-card-row-top">
            <div>
              <span class="mobile-card-pr-title" style="font-size: 15px; font-weight: 800; color: var(--brand-primary);">PR #${escapeHtml(pr.pr_number)}</span>
              ${pr.pr_approve_date ? `<div style="font-size: 11px; color: #047857; font-weight: 600; margin-top: 1px;">📅 Approved: ${escapeHtml(pr.pr_approve_date)}</div>` : ''}
            </div>
            <div class="mobile-card-status" style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
              ${getLifecycleBadge(pr.lifecycle_stage)}
              ${statusBadge}
            </div>
          </div>

          <div class="mobile-card-progress-wrap" style="margin-top: 8px;">
            <div class="mobile-progress-label-row">
              <span class="mobile-progress-title">Delivery Progress</span>
              <span class="mobile-progress-stat"><strong>${pr.delivery_completion_pct}%</strong></span>
            </div>
            <div class="mobile-progress-bar-track">
              <div class="progress-bar-fill ${progressColor}" style="width: ${pr.delivery_completion_pct}%;"></div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; color: var(--slate-600);">
            <span>PO Date: <strong>${escapeHtml(pr.po_create_date || '-')}</strong></span>
            <button class="btn btn-primary btn-sm" style="padding: 4px 12px; font-size: 12px;" onclick="event.stopPropagation(); navigateToDetail('${escapeHtml(pr.pr_number)}')">
              Open Lines ➔
            </button>
          </div>
        </div>
      `;
    } else {
      // Standard Desktop Table Row (12 columns for Management, Purchasers, Finance, Audit)
      const approveSubtext = pr.pr_approve_date
        ? `<div class="pr-approval-subtext" style="font-size: 11px; color: #047857; font-weight: 600; margin-top: 2px; display: inline-flex; align-items: center; gap: 3px;" title="PR Approved on ${escapeHtml(pr.pr_approve_date)}"><span style="font-size: 10px;">📅</span> Approved: ${escapeHtml(pr.pr_approve_date)}</div>`
        : `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Pending Approval</div>`;

      html += `
        <tr>
          <td style="text-align: center;">${plantBadge}</td>
          <td data-order="${escapeHtml((pr.pr_approve_date || pr.po_create_date || '0000-00-00') + '_' + pr.pr_number)}">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <a href="javascript:void(0)" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')" style="font-weight: 700; color: var(--brand-primary); text-decoration: none; font-size: 14px;">
                  ${escapeHtml(pr.pr_number)}
                </a>
                ${purchaserBadge}
                ${manualBadge}
              </div>
              ${approveSubtext}
            </div>
          </td>
          <td style="color: #475569; max-width: 320px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(pr.remarks || '')}">
            ${escapeHtml(pr.remarks || '-')}
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              ${getLifecycleBadge(pr.lifecycle_stage)}
              <div style="font-size: 11px;">${statusBadge}</div>
            </div>
          </td>
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
            <div style="display: inline-flex; gap: 5px; align-items: center;">
              <button class="btn btn-secondary btn-sm" data-action="open-comments" data-pr="${escapeHtml(pr.pr_number)}" onclick="openCommentsModal('${escapeHtml(pr.pr_number)}')" title="Executive & Lead Notes">
                💬
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-pr-timeline" data-pr="${escapeHtml(pr.pr_number)}" onclick="openPrTimeline('${escapeHtml(pr.pr_number)}')" title="View Timeline of Status Changes">
                🕒 History
              </button>
              <button class="btn btn-primary btn-sm" data-action="open-pr-detail" data-pr="${escapeHtml(pr.pr_number)}" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')">
                Open Lines (${pr.total_lines}) ➔
              </button>
            </div>
          </td>
        </tr>
      `;

      // Standard Mobile Essential Card
      const mobileDlvDate = pr.expected_dlv_date
        ? `<span class="mobile-dlv-date ${pr.is_overdue ? 'text-overdue' : ''}">📅 Exp: ${escapeHtml(pr.expected_dlv_date)} ${overdueTag}</span>`
        : '';

      mobileHtml += `
        <div class="mobile-pr-card" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')">
          <div class="mobile-card-row-top">
            <div class="mobile-card-title-wrap">
              ${plantBadge}
              <div>
                <span class="mobile-card-pr-title">PR #${escapeHtml(pr.pr_number)}</span>
                ${pr.pr_approve_date ? `<div style="font-size: 11px; color: #047857; font-weight: 600; margin-top: 1px;">📅 Approved: ${escapeHtml(pr.pr_approve_date)}</div>` : ''}
              </div>
              ${purchaserBadge}
              ${manualBadge}
            </div>
            <div class="mobile-card-status" style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
              ${getLifecycleBadge(pr.lifecycle_stage)}
              ${statusBadge}
            </div>
          </div>

          ${mobileDlvDate ? `
          <div class="mobile-card-row-meta" style="margin-top: 2px;">
            <div class="mobile-meta-date">${mobileDlvDate}</div>
          </div>` : ''}

          <div class="mobile-card-progress-wrap">
            <div class="mobile-progress-label-row">
              <span class="mobile-progress-title">Delivery Progress</span>
              <span class="mobile-progress-stat"><strong>${pr.delivery_completion_pct}%</strong> (${pr.fully_delivered_lines}/${pr.total_lines} delivered)</span>
            </div>
            <div class="mobile-progress-bar-track">
              <div class="progress-bar-fill ${progressColor}" style="width: ${pr.delivery_completion_pct}%;"></div>
            </div>
          </div>

          <div class="mobile-card-row-actions" onclick="event.stopPropagation();">
            <button class="btn btn-secondary btn-sm mobile-btn-history" data-action="open-comments" data-pr="${escapeHtml(pr.pr_number)}" onclick="openCommentsModal('${escapeHtml(pr.pr_number)}')" title="Executive & Lead Notes">
              💬 Notes
            </button>
            <button class="btn btn-secondary btn-sm mobile-btn-history" data-action="open-pr-timeline" data-pr="${escapeHtml(pr.pr_number)}" onclick="openPrTimeline('${escapeHtml(pr.pr_number)}')" title="Audit History Timeline">
              🕒 History
            </button>
            <button class="btn btn-primary btn-sm mobile-btn-drill" data-action="open-pr-detail" data-pr="${escapeHtml(pr.pr_number)}" onclick="navigateToDetail('${escapeHtml(pr.pr_number)}')">
              Open Lines (${pr.total_lines}) ➔
            </button>
          </div>
        </div>
      `;
    }
  }

  prTableBody.innerHTML = html;
  if (prMobileList) {
    prMobileList.innerHTML = mobileHtml;
  }

  // Initialize DataTables on the desktop PR overview table
  if (window.$ && $.fn && $.fn.DataTable) {
    if (isPlantEndUser) {
      initOrUpdateDataTable('#prOverviewTable', {
        order: [[0, 'desc']], // sort by PR number
        columnDefs: [
          { orderable: false, targets: [4] } // Actions column
        ]
      });
    } else {
      initOrUpdateDataTable('#prOverviewTable', {
        order: [[1, 'desc']], // sort by PR number
        columnDefs: [
          { orderable: false, targets: [11] } // Actions column
        ]
      });
    }
  }
}

// ----------------------------------------------------
// Vendor Matrix Dashboard View
// ----------------------------------------------------

async function loadVendorDashboard() {
  if (!vendorMatrixGrid) return;

  vendorMatrixGrid.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--slate-400);">
      ⏳ Loading Vendor Matrix...
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);

    const res = await authFetch(`/api/dashboard/vendor-matrix?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      vendorMatrixGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #ef4444;">
          ⚠️ Failed to load Vendor Matrix: ${escapeHtml(data.error || 'Unknown error')}
        </div>
      `;
      return;
    }

    if (manualPrBadge) {
      manualPrBadge.textContent = data.total_manual_prs || 0;
    }

    const groups = data.vendor_groups || [];
    if (groups.length === 0) {
      vendorMatrixGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--slate-400);">
          No vendor data available.
        </div>
      `;
      return;
    }

    let html = '';
    for (const g of groups) {
      const isExternal = g.code === 'OTHER_VENDORS';
      const isUnassigned = g.code === 'UNASSIGNED';
      const avatarText = isExternal ? '🏢' : isUnassigned ? '⏳' : g.code;
      const progressColor = g.completion_pct === 100 ? '#16a34a' : g.completion_pct > 0 ? '#2563eb' : '#f59e0b';

      const overdueBadge = g.overdue_lines > 0
        ? `<span class="badge badge-cancelled" style="font-size: 10px; margin-left: 4px;">⚠️ ${g.overdue_lines} Overdue</span>`
        : '';

      html += `
        <div class="vendor-card">
          <div>
            <!-- Card Header -->
            <div class="vendor-card-header">
              <div class="vendor-card-avatar" style="background: ${g.bg}; color: ${g.color}; border: 1px solid ${g.color}33;">
                ${avatarText}
              </div>
              <div class="vendor-card-identity">
                <div class="vendor-card-name">${escapeHtml(g.name)}</div>
                <div class="vendor-card-role" style="color: ${g.color}; font-weight: 700;">
                  ${escapeHtml(g.role)} • <span style="letter-spacing: 0;">Code: <strong>${escapeHtml(g.code)}</strong></span>
                </div>
              </div>
            </div>

            <!-- Company Breakdown (CEPL vs SPPL) -->
            <div class="vendor-company-breakdown">
              <span class="vendor-company-pill" title="Requisitions in CEPL">🏭 CEPL: <strong>${g.cepl_prs}</strong> PRs</span>
              <span class="vendor-company-pill" title="Requisitions in SPPL">🏭 SPPL: <strong>${g.sppl_prs}</strong> PRs</span>
              <span style="margin-left: auto; font-size: 11px; font-weight: 700; color: #16a34a;">
                ${g.active_prs} Active
              </span>
            </div>

            <!-- Stats Grid -->
            <div class="vendor-card-stats">
              <div>
                <div class="vendor-stat-num">${g.total_prs}</div>
                <div class="vendor-stat-label">Total PRs</div>
              </div>
              <div>
                <div class="vendor-stat-num" style="color: #2563eb;">${g.total_lines}</div>
                <div class="vendor-stat-label">Lines</div>
              </div>
              <div>
                <div class="vendor-stat-num" style="color: #16a34a;">${g.fully_delivered_lines}</div>
                <div class="vendor-stat-label">Delivered</div>
              </div>
            </div>

            <!-- Line status breakdown details -->
            <div style="font-size: 11px; color: var(--slate-600); margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between;">
              <span>⚡ Partial: <strong>${g.partially_delivered_lines}</strong></span>
              <span>⏳ Pending: <strong>${g.pending_lines}</strong></span>
              ${overdueBadge ? `<span>${overdueBadge}</span>` : ''}
            </div>

            <!-- Delivery Progress Bar -->
            <div class="vendor-card-progress">
              <div class="vendor-progress-label">
                <span>Line Delivery Rate</span>
                <span>${g.completion_pct}%</span>
              </div>
              <div class="vendor-progress-track">
                <div class="vendor-progress-fill" style="width: ${g.completion_pct}%; background: ${progressColor};"></div>
              </div>
            </div>
          </div>

          <!-- Card Footer Action -->
          <div class="vendor-card-footer">
            <button type="button" class="vendor-card-btn" onclick="filterByVendorGroup('${escapeHtml(g.code)}')">
              <span>View Requisitions (${g.total_prs})</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      `;
    }

    vendorMatrixGrid.innerHTML = html;
  } catch (err) {
    console.error('Error loading vendor dashboard:', err);
    vendorMatrixGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #ef4444;">
        ⚠️ Network error loading Vendor Matrix.
      </div>
    `;
  }
}

function renderPrLines(lines) {
  const lineSearchInput = document.getElementById('lineItemSearchInput');
  const searchFilter = lineSearchInput ? lineSearchInput.value.trim().toLowerCase() : '';
  let filteredLines = lines || [];
  if (searchFilter) {
    filteredLines = filteredLines.filter(l =>
      (l.item_name && l.item_name.toLowerCase().includes(searchFilter)) ||
      (l.item_id && l.item_id.toLowerCase().includes(searchFilter)) ||
      String(l.line_number).includes(searchFilter) ||
      (l.po_number && l.po_number.toLowerCase().includes(searchFilter)) ||
      (l.status_remarks && l.status_remarks.toLowerCase().includes(searchFilter)) ||
      (l.urgency_level && l.urgency_level.toLowerCase().includes(searchFilter))
    );
  }

  const displayedLineCount = document.getElementById('displayedLineCount');
  if (displayedLineCount) displayedLineCount.textContent = filteredLines.length;

  if (!filteredLines || filteredLines.length === 0) {
    prDetailTableBody.innerHTML = `
      <tr>
        <td colspan="23" class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-title">No Line Items Found</div>
          <div>${searchFilter ? 'Try clearing or modifying your item search query.' : 'No line items registered for this requisition.'}</div>
        </td>
      </tr>
    `;
    if (prDetailMobileList) {
      prDetailMobileList.innerHTML = `
        <div class="empty-state-mobile">
          <div class="empty-icon">📦</div>
          <div class="empty-title">No Line Items Found</div>
        </div>
      `;
    }
    updateBulkActionBar();
    return;
  }

  let html = '';
  let mobileHtml = '';
  for (const line of filteredLines) {
    const isSelected = selectedLineIds.has(line.id);
    const erpStatusBadge = getStatusBadge(line.po_status);
    const trackingStatusBadge = getStatusBadge(line.tracking_status || line.po_status);
    const historyCount = line.history_count || 0;

    // Permissions for Urgency & Expected Delivery Date
    const canSetUrgency = currentUser && ((currentUser.role === 'plant_enduser' && (!line.plant || currentUser.plant === line.plant)) || currentUser.permissions?.fullAccess);
    const canEditEdd = currentUser && ((currentUser.role === 'purchaser' && currentUser.buyerCode && currentUser.buyerCode === line.assigned_vendor) || currentUser.permissions?.fullAccess);
    const urgencyBadge = getUrgencyBadge(line.urgency_level, line.id, canSetUrgency);

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

    const eddDisplay = line.expected_dlv_date ? escapeHtml(line.expected_dlv_date) : '<span style="color: #94a3b8; font-style: italic; font-size: 11px;">Not set</span>';

    // Desktop Table Row
    html += `
      <tr id="row-${escapeHtml(line.id)}" class="${isSelected ? 'selected-row' : ''}">
        <!-- Row Selection Checkbox -->
        <td class="select-col">
          <input type="checkbox" class="line-select-cb" data-line-id="${escapeHtml(line.id)}" ${isSelected ? 'checked' : ''} onchange="handleLineSelectionChange('${escapeHtml(line.id)}', this.checked)">
        </td>

        <!-- Requisition Base -->
        <td style="font-weight: 700; color: var(--brand-primary);">${escapeHtml(line.pr_number)}</td>
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
              <div style="margin-bottom: 3px;">${getLifecycleBadge(line.lifecycle_stage)}</div>
              ${trackingStatusBadge}
              ${line.transfer_status === 'pending' ? `
                <div style="font-size: 10px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-top: 3px; display: inline-flex; align-items: center; gap: 4px;">
                  🔄 Transfer Pending: ${escapeHtml(line.proposed_vendor || '')}
                </div>
              ` : ''}
              ${remarksSnippet}
            </div>
            <div style="display: inline-flex; gap: 4px; flex-shrink: 0; align-items: center;">
              ${currentUser && currentUser.permissions?.canUpdateStatus ? `
                <button class="btn btn-primary btn-sm btn-line-update editor-only" data-action="open-status" data-line-id="${escapeHtml(line.id)}" onclick="openStatusModal('${escapeHtml(line.id)}')" style="padding: 3px 8px; font-size: 11px;" title="Update Status & Add Remarks">
                  ✏️ Update
                </button>
              ` : ''}
              ${(currentUser && (currentUser.permissions?.fullAccess || (currentUser.role === 'purchaser' && (!line.assigned_vendor || line.assigned_vendor === currentUser.buyerCode)))) ? `
                <button class="btn btn-secondary btn-sm" data-action="open-transfer" data-line-id="${escapeHtml(line.id)}" onclick="openProposeTransferModal('${escapeHtml(line.id)}')" style="padding: 3px 7px; font-size: 11px; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;" title="Reassign this line to another purchaser">
                  🔄
                </button>
              ` : ''}
              <button class="btn btn-secondary btn-sm" data-action="open-comments" data-pr="${escapeHtml(line.pr_number)}" data-line-id="${escapeHtml(line.id)}" onclick="openCommentsModal('${escapeHtml(line.pr_number)}', '${escapeHtml(line.id)}')" style="padding: 3px 7px; font-size: 11px;" title="Executive Comments & Notes">
                💬
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-line-history" data-line-id="${escapeHtml(line.id)}" onclick="openLineHistory('${escapeHtml(line.id)}')" style="padding: 3px 7px; font-size: 11px;" title="View Timeline of Status Changes (${historyCount})">
                🕒 (${historyCount})
              </button>
            </div>
          </div>
        </td>

        <!-- Urgency Level Column (Plant End-User & Management Editable) -->
        <td style="text-align: center; vertical-align: middle; background-color: #fffaf5;">
          <div>${urgencyBadge}</div>
          ${canSetUrgency ? `
            <button type="button" class="btn btn-secondary btn-sm" data-action="open-urgency" data-line-id="${escapeHtml(line.id)}" onclick="openAssignUrgencyModal('${escapeHtml(line.id)}')" style="margin-top: 4px; padding: 2px 7px; font-size: 10px; background: #fff7ed; color: #c2410c; border-color: #fed7aa; font-weight: 600;" title="Assign Urgency Level">
              ⚡ Urgency
            </button>
          ` : ''}
        </td>

        <!-- Quantities: Demand Qty, Received Qty, Invoiced Qty -->
        <td style="text-align: right; font-weight: 700; color: #0f172a;">${formatNumber(line.purch_qty)}</td>
        <td style="text-align: right; font-weight: 700; color: #15803d;">${formatNumber(line.received_qty)}</td>
        <td style="text-align: right; color: #0369a1;">${formatNumber(line.invoiced_qty)}</td>

        <!-- Expected Delivery Date Column (Visible Primary Column, Editable by Assigned Purchaser & Management) -->
        <td style="text-align: center; vertical-align: middle; background-color: #f0fdf4;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
            <span style="font-family: monospace; font-size: 12px; font-weight: 700; color: ${line.expected_dlv_date ? '#166534' : '#94a3b8'};">
              ${eddDisplay}
            </span>
            ${canEditEdd ? `
              <button type="button" class="btn btn-secondary btn-sm" data-action="open-edd" data-line-id="${escapeHtml(line.id)}" onclick="openEditDeliveryDateModal('${escapeHtml(line.id)}')" style="padding: 1px 5px; font-size: 11px; color: #166534; background: #dcfce7; border-color: #bbf7d0;" title="Edit Expected Delivery Date">
                ✏️
              </button>
            ` : ''}
          </div>
        </td>

        <!-- Toggleable Columns (Tucked in) -->
        <td class="col-extra col-remarks" style="display: none; color: #64748b; max-width: 220px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(line.remarks || '')}">
          ${escapeHtml(line.remarks || '')}
        </td>
        <td class="col-extra col-sitewh" style="display: none; color: #475569;">${escapeHtml(line.site)}</td>
        <td class="col-extra col-sitewh" style="display: none; color: #475569;">${escapeHtml(line.warehouse)}</td>
        <td class="col-extra col-vendor" style="display: none; font-weight: 600; color: #1e293b;">${vendorDisplay}</td>
        <td class="col-extra col-assigned" style="display: none; text-align: center;">
          ${currentUser && currentUser.permissions?.canAssignPurchaser ? `
            <select class="assigned-vendor-select" onchange="handleInlineAssignedVendorChange('${escapeHtml(line.id)}', this.value)" title="Assigned: SAR (Sarfraz), MAG (Maghfoor), NOU (Nouman), ADI (Adil), MUD (Mudassir), TAL (Talha), MAS (Mashhood), ZAI (Zain)" style="padding: 2px 6px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #eff6ff; color: #1e40af; cursor: pointer;">
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
          ` : `
            <span style="padding: 2px 6px; font-size: 11px; font-weight: 700; border-radius: 4px; background: #f1f5f9; color: #475569;">
              ${escapeHtml(line.assigned_vendor || '---')}
            </span>
          `}
        </td>
        <td class="col-extra col-cancelled" style="display: none; text-align: right; color: #64748b;">${formatNumber(line.cancelled_qty)}</td>
        <td class="col-extra col-price" style="display: none; text-align: right; font-family: monospace; font-weight: 600; color: #854d0e;">
          ${priceDisplay}
        </td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #475569;">${poCreateDateDisplay}</td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #166534; font-weight: 600;">${lastGrnDisplay}</td>
        <td class="col-extra col-milestones" style="display: none; font-size: 12px; color: #15803d; font-weight: 600;">${lastInvoiceDisplay}</td>
      </tr>
    `;

    // Mobile Line Essential Card
    const mobileLineRemarks = line.status_remarks
      ? `<div class="mobile-line-remarks">💬 <em>${escapeHtml(line.status_remarks)}</em></div>`
      : '';

    const isFullyReceived = line.received_qty >= line.purch_qty && line.purch_qty > 0;
    const isPartialReceived = line.received_qty > 0 && !isFullyReceived;

    mobileHtml += `
      <div class="mobile-line-card" id="mobile-line-${escapeHtml(line.id)}">
        <div class="mobile-line-card-header">
          <div class="mobile-line-badge-group">
            <span class="mobile-line-num">Line #${line.line_number}</span>
            ${line.item_id ? `<span class="mobile-line-item-id">${escapeHtml(line.item_id)}</span>` : ''}
            ${urgencyBadge}
          </div>
          <div class="mobile-line-status-wrap" style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
            ${getLifecycleBadge(line.lifecycle_stage)}
            ${trackingStatusBadge}
            ${line.transfer_status === 'pending' ? `
              <span class="badge" style="background:#fef3c7; color:#b45309; font-size:10px; padding: 2px 6px;">
                🔄 Pending (${escapeHtml(line.proposed_vendor || '')})
              </span>
            ` : ''}
          </div>
        </div>

        <div class="mobile-line-item-title">
          ${escapeHtml(line.item_name)}
        </div>

        <div class="mobile-line-qty-row">
          <div class="mobile-qty-chip">
            <span class="mobile-qty-chip-label">Demand</span>
            <span class="mobile-qty-chip-val">${formatNumber(line.purch_qty)} <span class="mobile-qty-unit">${escapeHtml(line.unit || '')}</span></span>
          </div>
          <div class="mobile-qty-chip ${isFullyReceived ? 'qty-received-full' : isPartialReceived ? 'qty-received-part' : ''}">
            <span class="mobile-qty-chip-label">Received</span>
            <span class="mobile-qty-chip-val">${formatNumber(line.received_qty)} <span class="mobile-qty-unit">${escapeHtml(line.unit || '')}</span></span>
          </div>
          <div class="mobile-qty-chip">
            <span class="mobile-qty-chip-label">Invoiced</span>
            <span class="mobile-qty-chip-val">${formatNumber(line.invoiced_qty)}</span>
          </div>
        </div>

        <!-- Mobile Expected Delivery Date Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-bottom: 8px; background: #f0fdf4; padding: 6px 10px; border-radius: 6px; border: 1px solid #dcfce7;">
          <span style="color: #166534; font-weight: 600;">📅 Expected Delivery:</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <strong style="color: #15803d; font-family: monospace;">${line.expected_dlv_date || 'Not set'}</strong>
            ${canEditEdd ? `
              <button type="button" class="btn btn-secondary btn-sm" data-action="open-edd" data-line-id="${escapeHtml(line.id)}" onclick="openEditDeliveryDateModal('${escapeHtml(line.id)}')" style="padding: 1px 5px; font-size: 10px; color: #166534; background: #dcfce7; border-color: #bbf7d0;">✏️</button>
            ` : ''}
          </div>
        </div>

        ${mobileLineRemarks}

        <div class="mobile-line-footer">
          <button class="btn btn-secondary btn-sm mobile-line-btn" data-action="open-line-history" data-line-id="${escapeHtml(line.id)}" onclick="openLineHistory('${escapeHtml(line.id)}')" title="Audit Timeline">
            🕒 Timeline (${historyCount})
          </button>
          <button class="btn btn-secondary btn-sm mobile-line-btn" data-action="open-comments" data-pr="${escapeHtml(line.pr_number)}" data-line-id="${escapeHtml(line.id)}" onclick="openCommentsModal('${escapeHtml(line.pr_number)}', '${escapeHtml(line.id)}')" title="Comments & Notes">
            💬 Notes
          </button>
          ${canSetUrgency ? `
            <button class="btn btn-secondary btn-sm mobile-line-btn" data-action="open-urgency" data-line-id="${escapeHtml(line.id)}" onclick="openAssignUrgencyModal('${escapeHtml(line.id)}')" title="Assign Urgency Level" style="background: #fff7ed; color: #c2410c; border-color: #fed7aa;">
              ⚡ Urgency
            </button>
          ` : ''}
          ${(currentUser && (currentUser.permissions?.fullAccess || (currentUser.role === 'purchaser' && (!line.assigned_vendor || line.assigned_vendor === currentUser.buyerCode)))) ? `
            <button class="btn btn-secondary btn-sm mobile-line-btn" data-action="open-transfer" data-line-id="${escapeHtml(line.id)}" onclick="openProposeTransferModal('${escapeHtml(line.id)}')" title="Reassign Line" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">
              🔄 Transfer
            </button>
          ` : ''}
          ${currentUser && currentUser.permissions?.canUpdateStatus ? `
            <button class="btn btn-primary btn-sm mobile-line-btn btn-line-update editor-only" data-action="open-status" data-line-id="${escapeHtml(line.id)}" onclick="openStatusModal('${escapeHtml(line.id)}')" title="Update Tracking Status">
              ✏️ Update
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  prDetailTableBody.innerHTML = html;
  if (prDetailMobileList) {
    prDetailMobileList.innerHTML = mobileHtml;
  }
  updateBulkActionBar();
}

// ----------------------------------------------------
// Status Evolution & History Modal
// ----------------------------------------------------

async function openLineHistory(lineId) {
  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/history`);
    const data = await res.json();

    if (data.success && data.line) {
      const titleEl = document.getElementById('historyModalTitle');
      const subEl = document.getElementById('historyModalSubtitle');
      if (titleEl) titleEl.textContent = `Line #${data.line.line_number || ''} Status Evolution`;
      if (subEl) subEl.textContent = `${data.line.pr_number || ''} (${data.line.plant || ''}) • ${data.line.item_name || ''}`;
      renderTimeline(data.history || []);
      openModal('historyModal');
    } else {
      showToast(data.error || 'Failed to load status history', 'error');
    }
  } catch (err) {
    console.error('Error opening line history:', err);
    showToast('Failed to load status history', 'error');
  }
}

async function openPrTimeline(prNumber) {
  try {
    const res = await authFetch(`/api/prs/${encodeURIComponent(prNumber)}/history`);
    const data = await res.json();

    if (data.success) {
      const titleEl = document.getElementById('historyModalTitle');
      const subEl = document.getElementById('historyModalSubtitle');
      if (titleEl) titleEl.textContent = `Requisition ${prNumber} Evolution History`;
      if (subEl) subEl.textContent = `Chronological lifecycle timeline of all status updates for this PR`;
      renderTimeline(data.history || []);
      openModal('historyModal');
    } else {
      showToast(data.error || 'Failed to load PR history', 'error');
    }
  } catch (err) {
    console.error('Error opening PR history:', err);
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
          <span>👤 ${escapeHtml(ev.changed_by || 'Purchasing Officer')}</span>
        </div>
        ${ev.reason_notes ? `<div class="timeline-notes">“${escapeHtml(ev.reason_notes)}”</div>` : ''}
      </div>
    `;
  }

  container.innerHTML = html;
}

// ----------------------------------------------------
// Status Update Modal
// ----------------------------------------------------

function openStatusModal(lineId) {
  if (currentUser && !currentUser.canEdit) {
    showToast('Viewer role is read-only. Editing is disabled.', 'warning');
    return;
  }

  const line = currentPrLines.find(l => l.id === lineId);
  if (!line) return;

  document.getElementById('statusModalLineId').value = line.id;
  document.getElementById('statusModalItemName').textContent = `${line.item_name} (Line #${line.line_number})`;
  document.getElementById('statusModalPoStatus').innerHTML = getStatusBadge(line.po_status);

  // Set current status in dropdown
  const select = document.getElementById('newStatusSelect');
  const currentStatus = line.tracking_status || line.po_status || 'Open order';
  let optionFound = false;
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value === currentStatus) {
      select.selectedIndex = i;
      optionFound = true;
      break;
    }
  }
  if (!optionFound) {
    const customOpt = document.createElement('option');
    customOpt.value = currentStatus;
    customOpt.textContent = currentStatus;
    select.appendChild(customOpt);
    select.value = currentStatus;
  }

  document.getElementById('statusReasonNotes').value = line.status_remarks || '';
  const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  const vendorSelect = document.getElementById('statusModalAssignedVendor');
  if (vendorSelect) {
    vendorSelect.value = line.assigned_vendor || '';
    vendorSelect.disabled = !canAssign;
    vendorSelect.title = canAssign ? 'Assign purchaser' : 'Purchaser assignment restricted to Admin / Lead';
  }
  openModal('statusModal');
}

async function handleStatusSubmit(e) {
  e.preventDefault();
  const canUpdate = currentUser && (currentUser.permissions?.canUpdateStatus || currentUser.role === 'admin' || currentUser.role === 'status_updater');
  if (!canUpdate) {
    showToast('Permission denied: Status updates are restricted.', 'warning');
    return;
  }

  const lineId = document.getElementById('statusModalLineId').value;
  const newStatus = document.getElementById('newStatusSelect').value;
  const assignedVendor = document.getElementById('statusModalAssignedVendor').value;
  const reasonNotes = document.getElementById('statusReasonNotes').value;
  const changedBy = document.getElementById('statusChangedBy').value;

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/status`, {
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
      // Also update assigned vendor if changed and user has permission
      const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
      if (canAssign) {
        const currentLine = currentPrLines.find(l => l.id === lineId);
        if (currentLine && currentLine.assigned_vendor !== assignedVendor) {
          await authFetch(`/api/lines/${encodeURIComponent(lineId)}/assigned-vendor`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_vendor: assignedVendor })
          });
          currentLine.assigned_vendor = assignedVendor;
        }
      }

      closeModal('statusModal');
      showToast(`✓ Status updated to "${newStatus}" and recorded in immutable history!`, 'success');

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
  const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  if (!canAssign) {
    showToast('Permission denied. Only Admin / Lead can assign purchasers.', 'warning');
    return;
  }

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/assigned-vendor`, {
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
  if (currentUser && !currentUser.canEdit) {
    showToast('Viewer role is read-only. Bulk updates are disabled.', 'warning');
    return;
  }

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
    const res = await authFetch('/api/lines/bulk-status', {
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
  if (currentUser && !currentUser.canEdit) {
    showToast('Viewer role is read-only. SQL configuration is disabled.', 'warning');
    return;
  }

  try {
    const res = await authFetch('/api/external-sql/config');
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
  if (currentUser && !currentUser.canEdit) {
    showToast('Viewer role is read-only. SQL configuration is disabled.', 'warning');
    return;
  }

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
    const res = await authFetch('/api/external-sql/config', {
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
  if (currentUser && !currentUser.canEdit) {
    showToast('Viewer role is read-only.', 'warning');
    return;
  }

  const payload = {
    engine: document.getElementById('sqlEngine').value,
    host: document.getElementById('sqlHost').value,
    port: document.getElementById('sqlPort').value,
    database_name: document.getElementById('sqlDatabase').value
  };

  try {
    const res = await authFetch('/api/external-sql/test', {
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
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
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
  if (s.includes('draft')) {
    return `<span class="badge badge-neutral" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">📝 Draft</span>`;
  }
  if (s.includes('review')) {
    return `<span class="badge badge-open" style="background:#fef3c7; color:#92400e; border-color:#fcd34d;">🔍 In Review</span>`;
  }
  if (s.includes('cancel')) {
    return `<span class="badge badge-cancelled">✕ Cancelled</span>`;
  }
  return `<span class="badge badge-neutral">● ${escapeHtml(status)}</span>`;
}

function getLifecycleBadge(stage) {
  if (!stage) return `<span class="badge badge-neutral">Unknown</span>`;
  switch (stage) {
    case 'Requisitioned':
      return `<span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-weight:700;">📝 Requisitioned</span>`;
    case 'Approved':
      return `<span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700;">✓ Approved</span>`;
    case 'PO Issued':
      return `<span class="badge" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; font-weight:700;">🏷️ PO Issued</span>`;
    case 'Partially Received':
      return `<span class="badge badge-partial" style="font-weight:700;">⚡ Partially Received</span>`;
    case 'Fully Received':
      return `<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700;">📦 Fully Received</span>`;
    case 'Invoiced & Closed':
      return `<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-weight:700;">💰 Invoiced & Closed</span>`;
    case 'Cancelled':
      return `<span class="badge badge-cancelled" style="font-weight:700;">✕ Cancelled</span>`;
    case 'Rejected':
      return `<span class="badge badge-cancelled" style="font-weight:700;">✕ Rejected</span>`;
    default:
      return `<span class="badge badge-neutral">${escapeHtml(stage)}</span>`;
  }
}

function exportOverviewCsv() {
  window.location.href = `/api/export/csv?type=overview&plant=${encodeURIComponent(selectedPlant)}&auth_token=${encodeURIComponent(authToken || '')}`;
}

function exportLinesCsv() {
  window.location.href = `/api/export/csv?type=detailed_lines&plant=${encodeURIComponent(selectedPlant)}&auth_token=${encodeURIComponent(authToken || '')}`;
}

function exportPendingLinesCsv() {
  window.location.href = `/api/export/csv?type=pending_lines&plant=${encodeURIComponent(selectedPlant)}&auth_token=${encodeURIComponent(authToken || '')}`;
}

// ----------------------------------------------------
// Executive Oversight, Risk Alerts & Comments
// ----------------------------------------------------

let executiveAlertsCache = null;
let activeExecAlertTab = 'overdue';

async function loadExecutiveAlerts() {
  const alertSection = document.getElementById('executiveAlertSection');
  if (!alertSection) return;

  const canViewAlerts = currentUser && (currentUser.role === 'admin' || currentUser.role === 'executive' || currentUser.permissions?.canViewAlerts);
  if (!canViewAlerts) {
    alertSection.style.display = 'none';
    return;
  }

  try {
    const params = new URLSearchParams();
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);

    const res = await authFetch(`/api/executive/alerts?${params.toString()}`);
    const data = await res.json();
    if (data.success && data.summary) {
      alertSection.style.display = 'block';
      executiveAlertsCache = data;
      const badge = document.getElementById('execAlertBadge');
      const overdue = document.getElementById('alertOverdueCount');
      const unassigned = document.getElementById('alertUnassignedCount');
      const variance = document.getElementById('alertVarianceCount');

      if (badge) badge.textContent = `${Number(data.summary.total_alerts || 0).toLocaleString()} Flagged Items`;
      if (overdue) overdue.textContent = Number(data.summary.severely_overdue_count || 0).toLocaleString();
      if (unassigned) unassigned.textContent = Number(data.summary.stale_unassigned_count || 0).toLocaleString();
      if (variance) variance.textContent = Number(data.summary.price_variance_count || 0).toLocaleString();

      const modal = document.getElementById('modalExecutiveAlerts');
      if (modal && modal.classList.contains('active')) {
        updateExecutiveAlertsModalUI();
      }
    }
  } catch (err) {
    console.warn('Unable to load executive alerts:', err);
  }
}

async function openExecutiveAlertsModal(initialTab = 'overdue') {
  if (!executiveAlertsCache) {
    await loadExecutiveAlerts();
  }
  updateExecutiveAlertsModalUI();
  switchExecAlertTab(initialTab);
  openModal('modalExecutiveAlerts');
}

function updateExecutiveAlertsModalUI() {
  if (!executiveAlertsCache || !executiveAlertsCache.summary) return;
  const s = executiveAlertsCache.summary;

  const modalBadge = document.getElementById('modalExecTotalBadge');
  const overdueCount = document.getElementById('tabOverdueCount');
  const unassignedCount = document.getElementById('tabUnassignedCount');
  const varianceCount = document.getElementById('tabVarianceCount');
  const subtitle = document.getElementById('modalExecSubtitle');

  if (modalBadge) modalBadge.textContent = `${Number(s.total_alerts || 0).toLocaleString()} Anomalies`;
  if (overdueCount) overdueCount.textContent = Number(s.severely_overdue_count || 0).toLocaleString();
  if (unassignedCount) unassignedCount.textContent = Number(s.stale_unassigned_count || 0).toLocaleString();
  if (varianceCount) varianceCount.textContent = Number(s.price_variance_count || 0).toLocaleString();
  if (subtitle) {
    subtitle.textContent = `100% server-verified threshold anomalies for Plant: ${escapeHtml(selectedPlant || 'All')}`;
  }
}

function switchExecAlertTab(tabName) {
  activeExecAlertTab = tabName;

  const btnOverdue = document.getElementById('tabBtnOverdue');
  const btnUnassigned = document.getElementById('tabBtnUnassigned');
  const btnVariance = document.getElementById('tabBtnVariance');

  if (btnOverdue) btnOverdue.classList.toggle('active', tabName === 'overdue');
  if (btnUnassigned) btnUnassigned.classList.toggle('active', tabName === 'unassigned');
  if (btnVariance) btnVariance.classList.toggle('active', tabName === 'variance');

  const contentOverdue = document.getElementById('execTabContentOverdue');
  const contentUnassigned = document.getElementById('execTabContentUnassigned');
  const contentVariance = document.getElementById('execTabContentVariance');

  if (contentOverdue) contentOverdue.style.display = (tabName === 'overdue' ? 'block' : 'none');
  if (contentUnassigned) contentUnassigned.style.display = (tabName === 'unassigned' ? 'block' : 'none');
  if (contentVariance) contentVariance.style.display = (tabName === 'variance' ? 'block' : 'none');

  if (tabName === 'overdue') renderExecOverdueTable();
  else if (tabName === 'unassigned') renderExecUnassignedTable();
  else if (tabName === 'variance') renderExecVarianceTable();
}

function renderExecOverdueTable() {
  const tbody = document.getElementById('execOverdueTbody');
  if (!tbody) return;

  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#execOverdueTable')) {
    $('#execOverdueTable').DataTable().destroy();
  }

  const items = executiveAlertsCache?.severely_overdue || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--slate-400);">✓ No severely overdue deliveries found</td></tr>`;
    return;
  }

  let html = '';
  for (const item of items) {
    const plantClass = item.plant === 'SPPL' ? 'badge-sppl' : 'badge-cepl';
    const remainingQty = Number(item.remaining_qty || (item.purch_qty - item.received_qty) || 0).toLocaleString();
    const daysOverdue = Number(item.days_overdue || 0);

    html += `
      <tr>
        <td><span class="badge ${plantClass}">${escapeHtml(item.plant || 'CEPL')}</span></td>
        <td><a href="javascript:void(0)" class="pr-link" onclick="openPrFromAlert('${escapeHtml(item.pr_number)}')">${escapeHtml(item.pr_number)}</a></td>
        <td><span style="font-family: monospace; font-weight: 600; color: var(--brand-primary);">${escapeHtml(item.po_number || '-')}</span></td>
        <td><div style="font-weight: 600; color: var(--slate-900); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.item_name_raw || item.item_name || '')}">${escapeHtml(item.item_name_raw || item.item_name || '-')}</div></td>
        <td><div style="font-size: 11px; color: var(--slate-700); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.supplier || '-')}">${escapeHtml(item.supplier || '-')}</div></td>
        <td><span style="font-size: 11px; color: var(--slate-600);">${escapeHtml(item.expected_dlv_date || '-')}</span></td>
        <td style="text-align: center;"><span class="badge" style="background: #fee2e2; color: #991b1b; font-weight: 700;">+${daysOverdue}d Overdue</span></td>
        <td style="text-align: right;"><strong style="font-size: 12px; color: #b91c1c;">${remainingQty}</strong> <span style="font-size: 10px; color: var(--slate-500);">${escapeHtml(item.unit || '')}</span></td>
        <td style="text-align: center;"><button type="button" class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 11px;" onclick="openPrFromAlert('${escapeHtml(item.pr_number)}')">Open PR ➔</button></td>
      </tr>
    `;
  }
  tbody.innerHTML = html;

  if (window.$ && $.fn && $.fn.DataTable) {
    initOrUpdateDataTable('#execOverdueTable', {
      pageLength: 15,
      order: [[6, 'desc']],
      columnDefs: [{ orderable: false, targets: [8] }]
    });
  }
}

function renderExecUnassignedTable() {
  const tbody = document.getElementById('execUnassignedTbody');
  if (!tbody) return;

  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#execUnassignedTable')) {
    $('#execUnassignedTable').DataTable().destroy();
  }

  const items = executiveAlertsCache?.stale_unassigned || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--slate-400);">✓ No stale unassigned requisition lines found</td></tr>`;
    return;
  }

  const canAssignPurchaser = currentUser && (currentUser.role === 'admin' || currentUser.permissions?.canAssignPurchaser);

  let html = '';
  for (const item of items) {
    const plantClass = item.plant === 'SPPL' ? 'badge-sppl' : 'badge-cepl';
    const demandQty = Number(item.purch_qty || item.demand_qty || 0).toLocaleString();
    const daysUnassigned = Number(item.days_unassigned || 0);
    const dateCreated = escapeHtml(item.expected_dlv_date || item.created_at?.split('T')[0] || '-');
    const assignedCode = item.assigned_vendor || '';

    const purchaserOptions = PURCHASERS_CONFIG.map(p => `
      <option value="${p.code}" ${assignedCode === p.code ? 'selected' : ''}>
        ${p.code} (${p.name})
      </option>
    `).join('');

    const assignSelectHtml = canAssignPurchaser ? `
      <select class="pending-buyer-select ${assignedCode ? 'assigned' : 'unassigned'}" data-line-id="${escapeHtml(item.id)}" data-original="${escapeHtml(assignedCode)}" onchange="handleAlertBuyerChange(this)" style="font-size: 11px; padding: 3px 6px;">
        <option value="" ${!assignedCode ? 'selected' : ''}>⏳ -- Unassigned --</option>
        ${purchaserOptions}
      </select>
    ` : `<span class="badge badge-neutral">⏳ Unassigned</span>`;

    html += `
      <tr id="alert-unassigned-row-${escapeHtml(item.id)}">
        <td><span class="badge ${plantClass}">${escapeHtml(item.plant || 'CEPL')}</span></td>
        <td><a href="javascript:void(0)" class="pr-link" onclick="openPrFromAlert('${escapeHtml(item.pr_number)}')">${escapeHtml(item.pr_number)}</a></td>
        <td style="text-align: center; font-weight: 600; color: var(--slate-600);">${item.line_number || '-'}</td>
        <td><div style="font-weight: 600; color: var(--slate-900); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.item_name_raw || item.item_name || '')}">${escapeHtml(item.item_name_raw || item.item_name || '-')}</div></td>
        <td style="text-align: right;"><strong style="font-size: 12px;">${demandQty}</strong> <span style="font-size: 10px; color: var(--slate-500);">${escapeHtml(item.unit || '')}</span></td>
        <td><span style="font-size: 11px; color: var(--slate-600);">${dateCreated}</span></td>
        <td style="text-align: center;"><span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 700;">${daysUnassigned}d Stale</span></td>
        <td>${assignSelectHtml}</td>
      </tr>
    `;
  }
  tbody.innerHTML = html;

  if (window.$ && $.fn && $.fn.DataTable) {
    initOrUpdateDataTable('#execUnassignedTable', {
      pageLength: 15,
      order: [[6, 'desc']],
      columnDefs: [{ orderable: false, targets: [7] }]
    });
  }
}

function renderExecVarianceTable() {
  const tbody = document.getElementById('execVarianceTbody');
  if (!tbody) return;

  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#execVarianceTable')) {
    $('#execVarianceTable').DataTable().destroy();
  }

  const items = executiveAlertsCache?.price_variance || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--slate-400);">✓ No price variances >10% found</td></tr>`;
    return;
  }

  let html = '';
  for (const item of items) {
    const plantClass = item.plant === 'SPPL' ? 'badge-sppl' : 'badge-cepl';
    const poPrice = Number(item.purchase_price || 0).toLocaleString();
    const minPrice = Number(item.min_price || 0).toLocaleString();
    const variancePct = Number(item.variance_pct || 0);

    html += `
      <tr>
        <td><span class="badge ${plantClass}">${escapeHtml(item.plant || 'CEPL')}</span></td>
        <td><span style="font-family: monospace; font-weight: 600; color: var(--brand-primary);">${escapeHtml(item.po_number || '-')}</span></td>
        <td><span style="font-family: monospace; font-size: 11px; color: var(--slate-600);">${escapeHtml(item.item_id || '-')}</span></td>
        <td><div style="font-weight: 600; color: var(--slate-900); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.item_name_raw || item.item_name || '')}">${escapeHtml(item.item_name_raw || item.item_name || '-')}</div></td>
        <td style="text-align: right;"><strong style="font-size: 12px; color: #b91c1c;">Rs. ${poPrice}</strong></td>
        <td style="text-align: right;"><span style="font-size: 12px; color: #15803d; font-weight: 600;">Rs. ${minPrice}</span></td>
        <td style="text-align: center;"><span class="badge" style="background: #ede9fe; color: #6b21a8; font-weight: 700; font-size: 12px;">+${variancePct}%</span></td>
        <td style="text-align: center;"><button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 11px;" onclick="openCommentsModal('${escapeHtml(item.pr_number)}', '${escapeHtml(item.id)}')" title="View / Add Executive Notes">💬 Notes</button></td>
      </tr>
    `;
  }
  tbody.innerHTML = html;

  if (window.$ && $.fn && $.fn.DataTable) {
    initOrUpdateDataTable('#execVarianceTable', {
      pageLength: 15,
      order: [[6, 'desc']],
      columnDefs: [{ orderable: false, targets: [7] }]
    });
  }
}

function openPrFromAlert(prNumber) {
  closeModal('modalExecutiveAlerts');
  navigateToDetail(prNumber);
}

async function handleAlertBuyerChange(selectEl) {
  const lineId = selectEl.dataset.lineId;
  const newVendor = selectEl.value;
  const originalVendor = selectEl.dataset.original || '';

  const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  if (!canAssign) {
    showToast('Permission denied. Only Admin / Lead can assign purchasers.', 'error');
    selectEl.value = originalVendor;
    return;
  }

  selectEl.disabled = true;

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/assigned-vendor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_vendor: newVendor })
    });
    const data = await res.json();

    if (data.success) {
      selectEl.dataset.original = newVendor;
      if (newVendor) {
        selectEl.classList.remove('unassigned');
        selectEl.classList.add('assigned');
      } else {
        selectEl.classList.remove('assigned');
        selectEl.classList.add('unassigned');
      }

      const buyerName = PURCHASERS_CONFIG.find(p => p.code === newVendor)?.name || newVendor;
      showToast(newVendor ? `✓ Assigned line to ${newVendor} (${buyerName})` : '✓ Line set to Unassigned', 'success');

      loadExecutiveAlerts();
    } else {
      selectEl.value = originalVendor;
      showToast(data.error || 'Failed to assign purchaser', 'error');
    }
  } catch (err) {
    selectEl.value = originalVendor;
    showToast('Network error while assigning purchaser', 'error');
  } finally {
    selectEl.disabled = false;
  }
}

async function openCommentsModal(targetPr, targetLine = null) {
  const targetPrInput = document.getElementById('commentTargetPr');
  const targetLineInput = document.getElementById('commentTargetLine');
  const subtitle = document.getElementById('commentsModalSubtitle');
  const textArea = document.getElementById('commentInputText');
  const submitBtn = document.getElementById('btnSubmitComment');
  const restrictedNotice = document.getElementById('commentRestrictedNotice');

  if (targetPrInput) targetPrInput.value = targetPr || '';
  if (targetLineInput) targetLineInput.value = targetLine || '';
  if (textArea) textArea.value = '';

  if (subtitle) {
    subtitle.textContent = targetLine
      ? `Requisition: ${targetPr} • Line Item #${targetLine}`
      : `Requisition: ${targetPr} (PR-level)`;
  }

  const canComment = currentUser && (currentUser.permissions?.canComment || currentUser.role === 'admin' || currentUser.role === 'executive');
  if (restrictedNotice) restrictedNotice.style.display = canComment ? 'none' : 'block';
  if (submitBtn) submitBtn.style.display = canComment ? 'inline-flex' : 'none';
  if (textArea) textArea.disabled = !canComment;

  await reloadComments(targetPr, targetLine);
  openModal('modalComments');
}

async function reloadComments(targetPr, targetLine = null) {
  const timeline = document.getElementById('commentsTimeline');
  if (!timeline) return;

  timeline.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--slate-400);">Loading notes...</div>`;

  try {
    let url = '/api/comments?';
    if (targetLine) url += `line_id=${encodeURIComponent(targetLine)}`;
    else if (targetPr) url += `pr_number=${encodeURIComponent(targetPr)}`;

    const res = await authFetch(url);
    const data = await res.json();

    if (data.success && data.comments && data.comments.length > 0) {
      timeline.innerHTML = data.comments.map(c => `
        <div style="background: #ffffff; border: 1px solid var(--slate-200); border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; border-left: 3px solid #6366f1;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px;">
            <div style="font-weight: 700; color: #1e293b;">
              <span>👔</span> ${escapeHtml(c.author_name || 'Executive')} 
              <span class="role-pill" style="background:#ede9fe; color:#6b21a8; font-size: 10px; margin-left: 4px;">${escapeHtml(c.author_role || 'Executive')}</span>
            </div>
            <div style="color: var(--slate-400); font-family: monospace;">
              ${escapeHtml(c.created_at_utc ? c.created_at_utc.replace('T', ' ').substring(0, 16) + ' UTC' : (c.created_at_local || ''))}
            </div>
          </div>
          <div style="font-size: 13px; color: var(--slate-800); white-space: pre-wrap; line-height: 1.4;">${escapeHtml(c.comment_text)}</div>
        </div>
      `).join('');
    } else {
      timeline.innerHTML = `<div style="text-align: center; padding: 24px 0; color: var(--slate-400); font-size: 12px;">No comments logged yet. Executive leadership & admin can leave instructions above.</div>`;
    }
  } catch (err) {
    timeline.innerHTML = `<div style="color: #dc2626; text-align: center; padding: 10px;">Failed to load comments</div>`;
  }
}

async function handleCommentSubmit(e) {
  e.preventDefault();
  const canComment = currentUser && (currentUser.permissions?.canComment || currentUser.role === 'admin' || currentUser.role === 'executive');
  if (!canComment) {
    showToast('Commenting restricted to Executive Leadership and Admin', 'error');
    return;
  }

  const prNumber = document.getElementById('commentTargetPr').value;
  const lineId = document.getElementById('commentTargetLine').value;
  const commentText = document.getElementById('commentInputText').value.trim();

  if (!commentText) {
    showToast('Please enter a comment', 'warning');
    return;
  }

  try {
    const res = await authFetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: lineId ? 'Line' : 'PR',
        pr_number: prNumber || undefined,
        line_id: lineId || undefined,
        comment_text: commentText
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Comment posted successfully', 'success');
      document.getElementById('commentInputText').value = '';
      await reloadComments(prNumber, lineId);
    } else {
      showToast(data.error || 'Failed to post comment', 'error');
    }
  } catch (err) {
    showToast('Network error posting comment', 'error');
  }
}

// ----------------------------------------------------
// Immutable Status Audit Trail Modal
// ----------------------------------------------------

let allAuditHistory = [];

async function openAuditTrailModal(prNumber = null, lineId = null) {
  const tbody = document.getElementById('auditTrailTbody');
  const subtitle = document.getElementById('auditModalSubtitle');
  const filterInput = document.getElementById('auditFilterInput');

  if (filterInput) filterInput.value = '';
  if (subtitle) {
    subtitle.textContent = prNumber 
      ? `Server-verified append-only log with UTC timestamps for PR #${prNumber}`
      : `Server-verified append-only log with UTC timestamps`;
  }

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 30px; color: var(--slate-400);">Loading immutable audit records...</td></tr>`;
  }

  openModal('modalAuditTrail');

  try {
    let url = '/api/audit-trail?limit=300';
    if (lineId) url += `&line_id=${encodeURIComponent(lineId)}`;
    else if (prNumber) url += `&pr_number=${encodeURIComponent(prNumber)}`;

    const res = await authFetch(url);
    const data = await res.json();

    if (data.success && data.history) {
      allAuditHistory = data.history;
      renderAuditTrailTable(allAuditHistory);
    } else {
      if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #dc2626;">Error loading audit trail</td></tr>`;
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #dc2626;">Failed to connect to audit server</td></tr>`;
  }
}

function renderAuditTrailTable(historyItems) {
  const tbody = document.getElementById('auditTrailTbody');
  const countBadge = document.getElementById('auditDisplayCount');
  if (countBadge) countBadge.textContent = historyItems.length;

  if (!tbody) return;

  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#auditTrailTable')) {
    $('#auditTrailTable').DataTable().destroy();
  }

  if (historyItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 30px; color: var(--slate-400);">No historical audit entries found.</td></tr>`;
    return;
  }

  tbody.innerHTML = historyItems.map(h => {
    const timeDisplay = h.timestamp_utc 
      ? h.timestamp_utc.replace('T', ' ').substring(0, 19) + ' UTC' 
      : (h.changed_at || '-');
    const roleBadge = h.user_role === 'admin' 
      ? `<span class="role-pill pill-manager" style="font-size:10px;">Admin</span>`
      : h.user_role === 'executive'
      ? `<span class="role-pill" style="background:#ede9fe; color:#6b21a8; font-size:10px;">Executive</span>`
      : `<span class="role-pill pill-engineer" style="font-size:10px;">${escapeHtml(h.user_role || 'Updater')}</span>`;

    return `
      <tr>
        <td style="font-family: monospace; font-size: 11px; color: #475569; white-space: nowrap;">${escapeHtml(timeDisplay)}</td>
        <td><span class="badge ${h.plant === 'SPPL' ? 'badge-sppl' : 'badge-cepl'}">${escapeHtml(h.plant || 'CEPL')}</span></td>
        <td style="font-weight: 700; color: #1e40af;">${escapeHtml(h.pr_number || '-')}</td>
        <td style="text-align: center; font-weight: 600;">${h.line_number || '-'}</td>
        <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(h.item_name || '')}">${escapeHtml(h.item_name || '-')}</td>
        <td>${getStatusBadge(h.previous_status || 'Open Order')}</td>
        <td>${getStatusBadge(h.new_status)}</td>
        <td style="font-weight: 600; color: var(--slate-900);">${escapeHtml(h.user_id || h.changed_by || 'System')}</td>
        <td>${roleBadge}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; font-style: italic; color: var(--slate-600);" title="${escapeHtml(h.reason_notes || '')}">${escapeHtml(h.reason_notes || '-')}</td>
      </tr>
    `;
  }).join('');

  if (window.$ && $.fn && $.fn.DataTable && historyItems.length > 0) {
    initOrUpdateDataTable('#auditTrailTable', {
      order: [[0, 'desc']],
      pageLength: 25
    });
  }
}

function handleAuditFilterInput() {
  const filterInput = document.getElementById('auditFilterInput');
  if (!filterInput) return;
  const q = filterInput.value.toLowerCase().trim();
  if (!q) {
    renderAuditTrailTable(allAuditHistory);
  } else {
    const filtered = allAuditHistory.filter(h => 
      (h.pr_number && h.pr_number.toLowerCase().includes(q)) ||
      (h.item_name && h.item_name.toLowerCase().includes(q)) ||
      (h.changed_by && h.changed_by.toLowerCase().includes(q)) ||
      (h.user_id && h.user_id.toLowerCase().includes(q)) ||
      (h.new_status && h.new_status.toLowerCase().includes(q)) ||
      (h.reason_notes && h.reason_notes.toLowerCase().includes(q))
    );
    renderAuditTrailTable(filtered);
  }
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

// ----------------------------------------------------
// DataTables Helper Function (Corporate Navy Integration)
// ----------------------------------------------------

function initOrUpdateDataTable(tableSelector, options = {}) {
  if (typeof $ === 'undefined' || !$.fn || !$.fn.DataTable) {
    return null;
  }

  try {
    if ($.fn.DataTable.isDataTable(tableSelector)) {
      $(tableSelector).DataTable().destroy();
    }

    const defaultOptions = {
      paging: true,
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      searching: false, // Dataset search handled by dedicated toolbar inputs
      ordering: true,
      info: true,
      responsive: false,
      autoWidth: false,
      language: {
        lengthMenu: 'Show _MENU_ entries',
        info: 'Showing _START_ to _END_ of _TOTAL_ entries',
        infoEmpty: 'Showing 0 to 0 of 0 entries',
        infoFiltered: '(filtered from _MAX_ total)',
        paginate: {
          first: '«',
          previous: '‹',
          next: '›',
          last: '»'
        }
      }
    };

    return $(tableSelector).DataTable(Object.assign({}, defaultOptions, options));
  } catch (err) {
    console.warn('DataTables init notice for', tableSelector, err);
    return null;
  }
}

// ----------------------------------------------------
// Pending Lines View & Inline Purchaser Assignment
// ----------------------------------------------------

async function loadPendingLines() {
  try {
    const q = pendingLinesSearchInput ? pendingLinesSearchInput.value.trim() : '';
    const buyer = pendingLinesBuyerFilter ? pendingLinesBuyerFilter.value : 'ALL';
    const status = pendingLinesStatusFilter ? pendingLinesStatusFilter.value : 'active';
    const sort = pendingLinesSortFilter ? pendingLinesSortFilter.value : 'oldest';

    const params = new URLSearchParams();
    if (q) params.append('search', q);
    if (buyer && buyer !== 'ALL') params.append('buyer', buyer);
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);

    if (pendingLinesTableBody) {
      pendingLinesTableBody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align: center; padding: 40px; color: var(--slate-500);">
            <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
            Loading pending PR lines...
          </td>
        </tr>
      `;
    }

    const res = await authFetch(`/api/lines/pending-po?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      pendingLinesData = data.lines || [];
      if (pendingLinesDisplayCount) pendingLinesDisplayCount.textContent = data.counts.filtered || 0;
      if (statPendingTotal) statPendingTotal.textContent = data.counts.total || 0;
      if (statPendingUnassigned) statPendingUnassigned.textContent = data.counts.unassigned || 0;
      if (statPendingAssigned) statPendingAssigned.textContent = data.counts.assigned || 0;
      if (navPendingLinesBadge) navPendingLinesBadge.textContent = data.counts.unassigned || data.counts.total || 0;

      renderPendingLines(pendingLinesData);
    } else {
      showToast(data.error || 'Failed to load pending PR lines', 'error');
    }
  } catch (err) {
    console.error('Error in loadPendingLines:', err);
    showToast('Failed to connect to server', 'error');
  }
}

function renderPendingLines(lines) {
  if (!pendingLinesTableBody) return;

  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#pendingLinesTable')) {
    $('#pendingLinesTable').DataTable().destroy();
  }

  if (!lines || lines.length === 0) {
    pendingLinesTableBody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 40px; color: var(--slate-500);">
          <div style="font-size: 28px; margin-bottom: 10px;">🔍</div>
          <div style="font-weight: 700; color: var(--slate-700); margin-bottom: 4px;">No Pending PR Lines Found</div>
          <div style="font-size: 13px;">Try adjusting your search keywords, plant selection, or purchaser filters.</div>
        </td>
      </tr>
    `;
    if (pendingLinesMobileList) {
      pendingLinesMobileList.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--slate-500);">
          No pending PR lines match current filter criteria.
        </div>
      `;
    }
    return;
  }

  const canAssignPurchaser = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  let tableHtml = '';
  let mobileHtml = '';
  const now = new Date().getTime();

  for (const line of lines) {
    const isSelected = selectedPendingLineIds.has(line.id);
    const assignedCode = (line.assigned_vendor || '').trim().toUpperCase();
    const selectClass = assignedCode ? 'assigned' : 'unassigned';

    // Date & Aging calculation
    let dateHtml = '-';
    let agingBadge = '';
    if (line.expected_dlv_date) {
      const prDate = new Date(line.expected_dlv_date);
      const diffTime = now - prDate.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      let badgeCls = 'normal';
      if (diffDays > 60) badgeCls = 'urgent';
      else if (diffDays > 30) badgeCls = 'warning';

      agingBadge = `<span class="aging-badge ${badgeCls}">${diffDays}d ago</span>`;
      dateHtml = `
        <div class="pr-date-cell">
          <span class="pr-date-val">${escapeHtml(line.expected_dlv_date)}</span>
          ${agingBadge}
        </div>
      `;
    }

    // Inline purchaser dropdown (SAR, MAG, NOU, ADI, MUD, TAL, MAS, ZAI)
    const purchaserOptions = PURCHASERS_CONFIG.map(p => `
      <option value="${p.code}" ${assignedCode === p.code ? 'selected' : ''}>
        ${p.code} (${p.name})
      </option>
    `).join('');

    const selectHtml = canAssignPurchaser ? `
      <select class="pending-buyer-select ${selectClass}" data-line-id="${escapeHtml(line.id)}" data-original="${escapeHtml(assignedCode)}" onchange="handlePendingLineBuyerChange(this)">
        <option value="" ${!assignedCode ? 'selected' : ''}>⏳ -- Unassigned --</option>
        ${purchaserOptions}
      </select>
    ` : `
      <span class="badge ${assignedCode ? 'badge-cepl' : 'badge-neutral'}" style="font-weight: 700;">
        ${assignedCode ? escapeHtml(assignedCode) : '⏳ Unassigned'}
      </span>
    `;

    // 1. Desktop Table Row
    tableHtml += `
      <tr id="pending-row-${escapeHtml(line.id)}" class="${isSelected ? 'selected-row' : ''}">
        <td style="text-align: center;">
          ${canAssignPurchaser ? `
            <input type="checkbox" class="pending-line-checkbox" data-line-id="${escapeHtml(line.id)}" ${isSelected ? 'checked' : ''} onchange="handlePendingLineCheck('${escapeHtml(line.id)}', this.checked)">
          ` : `
            <span style="color: var(--slate-300); font-size: 11px;">-</span>
          `}
        </td>
        <td>
          <span class="badge ${line.plant === 'SPPL' ? 'badge-sppl' : 'badge-cepl'}">${escapeHtml(line.plant || 'CEPL')}</span>
        </td>
        <td>
          <a href="javascript:void(0)" class="pr-link" onclick="navigateToDetail('${escapeHtml(line.pr_number)}')">${escapeHtml(line.pr_number)}</a>
        </td>
        <td style="text-align: center; font-weight: 600; color: var(--slate-600);">${line.line_number}</td>
        <td>${dateHtml}</td>
        <td>
          <div style="font-weight: 600; color: var(--slate-900);">${escapeHtml(line.item_name)}</div>
          ${line.item_id ? `<div style="font-size: 11px; color: var(--slate-500); font-family: monospace;">${escapeHtml(line.item_id)}</div>` : ''}
        </td>
        <td style="text-align: right;">
          <strong style="font-size: 13px; color: var(--slate-900);">${Number(line.purch_qty).toLocaleString()}</strong>
          <span style="font-size: 11px; color: var(--slate-500); margin-left: 2px;">${escapeHtml(line.unit || '')}</span>
        </td>
        <td>
          ${getStatusBadge(line.prl_status || 'Approved')}
        </td>
        <td>
          ${selectHtml}
          ${line.transfer_status === 'pending' ? `
            <div style="font-size: 10px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 5px; border-radius: 4px; font-weight: 700; margin-top: 3px; display: inline-flex; align-items: center; gap: 3px;">
              🔄 Pending: ${escapeHtml(line.proposed_vendor || '')}
            </div>
          ` : ''}
        </td>
        <td>
          <div style="font-size: 12px; color: var(--slate-600); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(line.status_remarks || line.remarks || '')}">
            ${escapeHtml(line.status_remarks || line.remarks || '-')}
          </div>
        </td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 4px;">
            ${(currentUser && (currentUser.permissions?.fullAccess || (currentUser.role === 'purchaser' && (!assignedCode || assignedCode === currentUser.buyerCode)))) ? `
              <button class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 11px; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;" onclick="openProposeTransferModal('${escapeHtml(line.id)}')" title="Reassign line to another purchaser">🔄</button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 11px;" onclick="openCommentsModal('${escapeHtml(line.pr_number)}', '${escapeHtml(line.id)}')" title="Comments & Notes">💬</button>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 11px;" onclick="openLineHistory('${escapeHtml(line.id)}')" title="Audit Status Evolution History">🕒</button>
          </div>
        </td>
      </tr>
    `;

    // 2. Mobile Card
    mobileHtml += `
      <div class="mobile-pr-card" style="margin-bottom: 10px; border-left: 4px solid ${assignedCode ? '#3b82f6' : '#f59e0b'};">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge ${line.plant === 'SPPL' ? 'badge-sppl' : 'badge-cepl'}">${escapeHtml(line.plant || 'CEPL')}</span>
            <a href="javascript:void(0)" class="pr-link" style="font-weight: 700; font-size: 14px;" onclick="navigateToDetail('${escapeHtml(line.pr_number)}')">${escapeHtml(line.pr_number)}</a>
            <span style="font-size: 12px; color: var(--slate-500);">Line #${line.line_number}</span>
          </div>
          ${agingBadge}
        </div>

        <div style="font-size: 13px; font-weight: 600; color: var(--slate-900); margin-bottom: 6px;">
          ${escapeHtml(line.item_name)}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
          <span>Qty: <strong>${Number(line.purch_qty).toLocaleString()} ${escapeHtml(line.unit || '')}</strong></span>
          <span>Date: <strong>${escapeHtml(line.expected_dlv_date || 'N/A')}</strong></span>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--slate-600); white-space: nowrap;">Assign:</label>
          <div style="flex: 1;">
            ${selectHtml}
            ${line.transfer_status === 'pending' ? `
              <div style="font-size: 10px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 5px; border-radius: 4px; font-weight: 700; margin-top: 3px;">
                🔄 Pending: ${escapeHtml(line.proposed_vendor || '')}
              </div>
            ` : ''}
          </div>
        </div>

        <div style="display: flex; gap: 6px; margin-top: 8px;">
          ${(currentUser && (currentUser.permissions?.fullAccess || (currentUser.role === 'purchaser' && (!assignedCode || assignedCode === currentUser.buyerCode)))) ? `
            <button class="btn btn-secondary btn-sm" style="flex: 1; padding: 4px; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;" onclick="openProposeTransferModal('${escapeHtml(line.id)}')" title="Reassign Line">🔄 Transfer</button>
          ` : ''}
          <button class="btn btn-secondary btn-sm" style="flex: 1; padding: 4px;" onclick="openCommentsModal('${escapeHtml(line.pr_number)}', '${escapeHtml(line.id)}')" title="Comments & Notes">💬 Notes</button>
          <button class="btn btn-secondary btn-sm" style="flex: 1; padding: 4px;" onclick="openLineHistory('${escapeHtml(line.id)}')" title="Audit Timeline">🕒 History</button>
        </div>
      </div>
    `;
  }

  pendingLinesTableBody.innerHTML = tableHtml;
  if (pendingLinesMobileList) {
    pendingLinesMobileList.innerHTML = mobileHtml;
  }

  if (window.$ && $.fn && $.fn.DataTable) {
    initOrUpdateDataTable('#pendingLinesTable', {
      order: [[2, 'desc']], // sort by PR number descending
      columnDefs: [
        { orderable: false, targets: [0, 10] } // Select checkbox & Audit action buttons
      ]
    });
  }

  updatePendingBulkBar();
}

// Inline Buyer Change Handler
async function handlePendingLineBuyerChange(selectEl) {
  const lineId = selectEl.dataset.lineId;
  const newVendor = selectEl.value; // e.g. "SAR" or ""
  const originalVendor = selectEl.dataset.original || '';

  const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  if (!canAssign) {
    showToast('Permission denied. Only Admin / Lead can assign purchasers.', 'error');
    selectEl.value = originalVendor;
    return;
  }

  selectEl.disabled = true;
  selectEl.classList.add('updating');

  try {
    const res = await authFetch(`/api/lines/${encodeURIComponent(lineId)}/assigned-vendor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_vendor: newVendor })
    });
    const data = await res.json();

    if (data.success) {
      selectEl.dataset.original = newVendor;
      if (newVendor) {
        selectEl.classList.remove('unassigned');
        selectEl.classList.add('assigned');
      } else {
        selectEl.classList.remove('assigned');
        selectEl.classList.add('unassigned');
      }

      const buyerName = PURCHASERS_CONFIG.find(p => p.code === newVendor)?.name || newVendor;
      showToast(newVendor ? `✓ Assigned to ${newVendor} (${buyerName})` : '✓ Line set to Unassigned', 'success');

      // Update counter pills without full table reload
      updatePendingStatsLocal(originalVendor, newVendor);
    } else {
      selectEl.value = originalVendor;
      showToast(data.error || 'Failed to update assigned purchaser', 'error');
    }
  } catch (err) {
    selectEl.value = originalVendor;
    showToast('Network error while assigning purchaser', 'error');
  } finally {
    selectEl.disabled = false;
    selectEl.classList.remove('updating');
  }
}

// Real-time counter adjustments
function updatePendingStatsLocal(oldCode, newCode) {
  const wasAssigned = Boolean(oldCode && oldCode.trim());
  const isAssigned = Boolean(newCode && newCode.trim());

  if (!wasAssigned && isAssigned) {
    // Moved from unassigned to assigned
    if (statPendingUnassigned) {
      const cur = parseInt(statPendingUnassigned.textContent, 10) || 0;
      statPendingUnassigned.textContent = Math.max(0, cur - 1);
    }
    if (statPendingAssigned) {
      const cur = parseInt(statPendingAssigned.textContent, 10) || 0;
      statPendingAssigned.textContent = cur + 1;
    }
  } else if (wasAssigned && !isAssigned) {
    // Moved from assigned to unassigned
    if (statPendingUnassigned) {
      const cur = parseInt(statPendingUnassigned.textContent, 10) || 0;
      statPendingUnassigned.textContent = cur + 1;
    }
    if (statPendingAssigned) {
      const cur = parseInt(statPendingAssigned.textContent, 10) || 0;
      statPendingAssigned.textContent = Math.max(0, cur - 1);
    }
  }
}

// Bulk Selection Handlers for Pending Lines
function handlePendingLineCheck(lineId, isChecked) {
  if (isChecked) {
    selectedPendingLineIds.add(lineId);
    document.getElementById(`pending-row-${lineId}`)?.classList.add('selected-row');
  } else {
    selectedPendingLineIds.delete(lineId);
    document.getElementById(`pending-row-${lineId}`)?.classList.remove('selected-row');
  }
  updatePendingBulkBar();
}

function handleSelectAllPendingLines(e) {
  const isChecked = e.target.checked;
  selectedPendingLineIds.clear();

  if (isChecked && pendingLinesData && pendingLinesData.length > 0) {
    pendingLinesData.forEach(line => {
      selectedPendingLineIds.add(line.id);
      document.getElementById(`pending-row-${line.id}`)?.classList.add('selected-row');
    });
    document.querySelectorAll('.pending-line-checkbox').forEach(cb => cb.checked = true);
  } else {
    document.querySelectorAll('.pending-line-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('#pendingLinesTableBody tr').forEach(r => r.classList.remove('selected-row'));
  }

  updatePendingBulkBar();
}

function clearPendingLinesSelection() {
  selectedPendingLineIds.clear();
  if (selectAllPendingLinesCheckbox) selectAllPendingLinesCheckbox.checked = false;
  document.querySelectorAll('.pending-line-checkbox').forEach(cb => cb.checked = false);
  document.querySelectorAll('#pendingLinesTableBody tr').forEach(r => r.classList.remove('selected-row'));
  updatePendingBulkBar();
}

function updatePendingBulkBar() {
  if (!pendingLinesBulkBar) return;
  const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  if (!canAssign) {
    pendingLinesBulkBar.style.display = 'none';
    return;
  }
  const count = selectedPendingLineIds.size;
  if (count > 0) {
    pendingLinesBulkBar.style.display = 'flex';
    if (pendingSelectedCountText) pendingSelectedCountText.textContent = count;
  } else {
    pendingLinesBulkBar.style.display = 'none';
  }
}

async function handlePendingBulkAssign() {
  if (selectedPendingLineIds.size === 0) {
    showToast('Please select at least one line item first', 'info');
    return;
  }

  const canAssign = currentUser && (currentUser.permissions?.canAssignPurchaser || currentUser.role === 'admin');
  if (!canAssign) {
    showToast('Permission denied. Only Admin / Lead can assign purchasers.', 'error');
    return;
  }

  const buyerCode = pendingBulkBuyerSelect ? pendingBulkBuyerSelect.value : '';
  if (!buyerCode) {
    showToast('Please select a purchaser to assign to the selected lines', 'info');
    return;
  }

  const lineIds = Array.from(selectedPendingLineIds);
  const buyerName = PURCHASERS_CONFIG.find(p => p.code === buyerCode)?.name || buyerCode;
  const actionLabel = buyerCode === '__UNASSIGN__' ? 'unassign' : `assign to ${buyerCode} (${buyerName})`;

  if (!confirm(`Are you sure you want to ${actionLabel} for ${lineIds.length} selected lines?`)) {
    return;
  }

  try {
    const res = await authFetch('/api/lines/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_ids: lineIds,
        assigned_vendor: buyerCode,
        changed_by: currentUser?.name || 'Procurement Manager'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Successfully updated ${data.updated_count || lineIds.length} line item(s)!`, 'success');
      clearPendingLinesSelection();
      loadPendingLines();
      loadKpis();
    } else {
      showToast(data.error || 'Failed to bulk assign purchaser', 'error');
    }
  } catch (err) {
    showToast('Error performing bulk assignment', 'error');
  }
}

// Expose globally for inline DOM event attributes
window.handlePendingLineBuyerChange = handlePendingLineBuyerChange;
window.handlePendingLineCheck = handlePendingLineCheck;
window.navigateToDetail = navigateToDetail;
window.openLineHistory = openLineHistory;

// ----------------------------------------------------
// Cash in Hand & Settlements Controller (Google Drive)
// ----------------------------------------------------

function formatPkr(num) {
  if (num === null || num === undefined || isNaN(num)) return 'PKR 0';
  return 'PKR ' + Math.round(Number(num)).toLocaleString('en-US');
}

function formatPkrCompact(num) {
  const n = Number(num) || 0;
  if (n >= 1000000) {
    return `PKR ${(n / 1000000).toFixed(2)}M`;
  } else if (n >= 1000) {
    return `PKR ${(n / 1000).toFixed(0)}K`;
  }
  return `PKR ${n}`;
}

async function loadCashSettlements() {
  try {
    const params = new URLSearchParams();
    if (selectedPlant && selectedPlant !== 'All') params.append('plant', selectedPlant);
    if (selectedCashPurchaser && selectedCashPurchaser !== 'ALL') params.append('purchaser', selectedCashPurchaser);
    if (cashStatusFilter && cashStatusFilter.value) params.append('status', cashStatusFilter.value);
    if (cashSearchInput && cashSearchInput.value.trim()) params.append('search', cashSearchInput.value.trim());

    const res = await authFetch(`/api/gdrive/cash-settlements?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      renderCashSettlements(data);
    } else {
      showToast(data.error || 'Failed to load cash settlements', 'error');
    }
  } catch (err) {
    console.error('Error loading cash settlements:', err);
    showToast(`Error loading cash settlements: ${err.message || 'Network error'}`, 'error');
  }
}

function renderCashSettlements(data) {
  const totals = data.totals || {};
  const purchasers = data.purchasers || [];
  const lines = data.lines || [];

  // 1. Sync Status
  if (syncStatusText) {
    if (data.last_sync) {
      const syncDate = new Date(data.last_sync);
      const timeStr = !isNaN(syncDate.getTime()) ? syncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : data.last_sync;
      syncStatusText.textContent = `Synced: Today at ${timeStr}`;
    } else {
      syncStatusText.textContent = 'Synced: Active (Every 15m)';
    }
  }

  // 2. Financial KPIs
  if (kpiCashInHand) kpiCashInHand.textContent = formatPkr(totals.total_cash_in_hand);
  if (kpiUnsettledPosCount) {
    kpiUnsettledPosCount.textContent = `${totals.unsettled_pos_count || 0} Open POs (${totals.overspent_pos_count || 0} Overspent)`;
  }
  if (kpiTotalCashIssued) kpiTotalCashIssued.textContent = formatPkr(totals.total_cash_issued);
  if (kpiTotalInvoiceReceived) kpiTotalInvoiceReceived.textContent = formatPkr(totals.total_invoice_received);
  if (kpiTotalCashReturned) kpiTotalCashReturned.textContent = formatPkr(totals.total_cash_returned);

  const kpiEmergency = document.getElementById('kpiEmergencyAdvances');
  if (kpiEmergency) kpiEmergency.textContent = formatPkr(totals.total_emergency_advances || 0);

  const clearPct = (totals.total_cash_issued && totals.total_cash_issued > 0)
    ? Math.round((totals.total_invoice_received / totals.total_cash_issued) * 100)
    : 0;
  if (kpiInvoiceClearPct) kpiInvoiceClearPct.textContent = `${clearPct}% Invoiced`;

  // Update header badge
  if (navCashInHandBadge) {
    navCashInHandBadge.textContent = formatPkrCompact(totals.total_cash_in_hand);
  }

  // 3. Purchaser Dropdown Filter
  if (cashPurchaserFilter) {
    const curVal = selectedCashPurchaser;
    let optsHtml = `<option value="ALL">All Purchasers (${purchasers.length})</option>`;
    for (const p of purchasers) {
      const cashStr = p.current_cash_in_hand > 0 ? ` [${formatPkrCompact(p.current_cash_in_hand)}]` : (p.current_cash_in_hand < 0 ? ` [-${formatPkrCompact(Math.abs(p.current_cash_in_hand))}]` : ' [Cleared]');
      optsHtml += `<option value="${p.purchaser_code}" ${curVal === p.purchaser_code ? 'selected' : ''}>${p.purchaser_name} (${p.purchaser_code})${cashStr}</option>`;
    }
    cashPurchaserFilter.innerHTML = optsHtml;
    cashPurchaserFilter.value = curVal;
  }

  // 4. Purchaser Cards Grid
  if (purchaserCashGrid) {
    let gridHtml = '';
    const isAllActive = (selectedCashPurchaser === 'ALL');
    gridHtml += `
      <div class="purchaser-card ${isAllActive ? 'active' : ''}" onclick="selectPurchaserCashFilter('ALL')">
        <div class="purchaser-card-header">
          <div>
            <div class="purchaser-card-name">👥 All Purchasers</div>
            <div class="purchaser-card-role">${purchasers.length} Active Buyers • CEPL & SPPL</div>
          </div>
          <span class="badge ${totals.total_cash_in_hand > 0 ? 'badge-amber' : 'badge-green'}">
            ${totals.unsettled_pos_count} Open Orders
          </span>
        </div>
        <div class="purchaser-card-body">
          <div class="cash-stat-row">
            <span class="cash-stat-label">Net Cash in Hand</span>
            <span class="cash-stat-value cash-highlight">${formatPkr(totals.total_cash_in_hand)}</span>
          </div>
          <div class="cash-stat-row">
            <span class="cash-stat-label">Total Purchases Made</span>
            <span class="cash-stat-value" style="color: var(--emerald-600); font-weight: 700;">${formatPkr(totals.total_invoice_received)}</span>
          </div>
          <div class="cash-stat-row">
            <span class="cash-stat-label">Total Returns</span>
            <span class="cash-stat-value" style="color: var(--blue-600); font-weight: 700;">${formatPkr(totals.total_cash_returned || 0)}</span>
          </div>
          <div class="cash-stat-row">
            <span class="cash-stat-label">Net Amount Spent</span>
            <span class="cash-stat-value" style="color: var(--slate-800); font-weight: 700;">${formatPkr(Math.max(0, (totals.total_cash_issued || 0) - (totals.total_cash_returned || 0)))}</span>
          </div>
          <div class="cash-stat-row" style="font-size: 11px;">
            <span class="cash-stat-label">Total Advanced (Issued)</span>
            <span class="cash-stat-value">${formatPkr(totals.total_cash_issued)}</span>
          </div>
          ${totals.total_overspent > 0 ? `
            <div class="cash-stat-row" style="font-size: 11px;">
              <span class="cash-stat-label">Total Overspent (Credit)</span>
              <span class="cash-stat-value" style="color: #dc2626;">-PKR ${Number(totals.total_overspent).toLocaleString()}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    for (const p of purchasers) {
      const isActive = (selectedCashPurchaser === p.purchaser_code);
      const hasBalance = (p.current_cash_in_hand > 0);
      const isOverspent = (p.current_cash_in_hand < 0);
      const badgeCls = hasBalance ? 'badge-amber' : isOverspent ? 'badge-red' : 'badge-green';
      const badgeText = hasBalance ? `${p.unsettled_pos_count} Open` : isOverspent ? `${p.overspent_pos_count} Overspent` : '✓ Cleared';
      const netSpent = Math.max(0, (p.total_cash_issued || 0) - (p.total_cash_returned || 0));

      gridHtml += `
        <div class="purchaser-card ${isActive ? 'active' : ''} ${hasBalance ? 'has-outstanding' : isOverspent ? 'is-overspent' : 'settled'}" onclick="selectPurchaserCashFilter('${escapeHtml(p.purchaser_code)}')">
          <div class="purchaser-card-header">
            <div>
              <div class="purchaser-card-name">${escapeHtml(p.purchaser_name)}</div>
              <div class="purchaser-card-role">Buyer Code: ${escapeHtml(p.purchaser_code)} • ${p.total_pos} POs</div>
            </div>
            <span class="badge ${badgeCls}">
              ${badgeText}
            </span>
          </div>
          <div class="purchaser-card-body">
            <div class="cash-stat-row">
              <span class="cash-stat-label">Net Cash in Hand</span>
              <span class="cash-stat-value ${hasBalance ? 'cash-highlight' : ''}" style="${!hasBalance && !isOverspent ? 'color: var(--emerald-600);' : isOverspent ? 'color: #dc2626;' : ''}">
                ${formatPkr(p.current_cash_in_hand)}
              </span>
            </div>
            <div class="cash-stat-row">
              <span class="cash-stat-label">Total Purchases Made</span>
              <span class="cash-stat-value" style="color: var(--emerald-600); font-weight: 700;">${formatPkr(p.total_invoice_received)}</span>
            </div>
            <div class="cash-stat-row">
              <span class="cash-stat-label">Total Returns</span>
              <span class="cash-stat-value" style="color: var(--blue-600); font-weight: 700;">${formatPkr(p.total_cash_returned || 0)}</span>
            </div>
            <div class="cash-stat-row">
              <span class="cash-stat-label">Net Amount Spent</span>
              <span class="cash-stat-value" style="color: var(--slate-800); font-weight: 700;">${formatPkr(netSpent)}</span>
            </div>
            <div class="cash-stat-row" style="font-size: 11px;">
              <span class="cash-stat-label">Total Advanced (Issued)</span>
              <span class="cash-stat-value">${formatPkr(p.total_cash_issued)}</span>
            </div>
            ${p.gross_cash_in_hand > 0 && p.overspent > 0 ? `
              <div class="cash-stat-row" style="font-size: 11px;">
                <span class="cash-stat-label">Cash Held (Open)</span>
                <span class="cash-stat-value" style="color: #b45309;">${formatPkr(p.gross_cash_in_hand)}</span>
              </div>
              <div class="cash-stat-row" style="font-size: 11px;">
                <span class="cash-stat-label">Overspent (Credit)</span>
                <span class="cash-stat-value" style="color: #dc2626;">-PKR ${Number(p.overspent).toLocaleString()}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
    purchaserCashGrid.innerHTML = gridHtml;
  }

  // 5. Detailed Table & Mobile List
  if (cashDisplayCount) cashDisplayCount.textContent = lines.length;

  if (window.$ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#cashTable')) {
    $('#cashTable').DataTable().destroy();
  }

  if (lines.length === 0) {
    if (cashTableBody) {
      cashTableBody.innerHTML = `
        <tr>
          <td colspan="11" class="empty-state">
            <div class="empty-icon">💵</div>
            <div class="empty-title">No Settlement Records Found</div>
            <div>No purchase orders match your filter criteria.</div>
          </td>
        </tr>
      `;
    }
    if (cashMobileList) {
      cashMobileList.innerHTML = `
        <div class="empty-state-mobile">
          <div class="empty-icon">💵</div>
          <div class="empty-title">No Records Found</div>
          <div>Try adjusting your filters or purchaser selection.</div>
        </div>
      `;
    }
    return;
  }

  let tableHtml = '';
  let mobileHtml = '';

  for (const line of lines) {
    const isCEPL = (line.plant === 'CEPL');
    const cashVal = Number(line.cash_in_hand) || 0;
    const hasCashInHand = (cashVal > 0);
    let balanceClass = 'badge-cash-settled';
    let balanceText = '✓ Settled';
    if (cashVal > 0) {
      balanceClass = 'badge-cash-outstanding';
      balanceText = formatPkr(cashVal);
    } else if (cashVal < 0) {
      balanceClass = 'badge-cash-overspent';
      balanceText = `-PKR ${Math.abs(cashVal).toLocaleString()} (Overspent)`;
    }

    // Desktop Row
    tableHtml += `
      <tr class="${cashVal > 0 ? 'outstanding-po-row' : (cashVal < 0 ? 'overspent-po-row' : '')}">
        <td>
          <span class="badge ${isCEPL ? 'badge-cepl' : 'badge-sppl'}">${escapeHtml(line.plant || 'CEPL')}</span>
        </td>
        <td>
          <strong style="font-family: monospace; font-size: 13px; color: var(--slate-900);">${escapeHtml(line.po_number)}</strong>
        </td>
        <td>
          ${line.pr_number ? `<a href="javascript:void(0)" class="pr-link" onclick="navigateToDetail('${escapeHtml(line.pr_number)}')">${escapeHtml(line.pr_number)}</a>` : '<span style="color:var(--slate-400);">-</span>'}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--slate-800); font-size: 13px;">${escapeHtml(line.purchaser_name)}</div>
          <div style="font-size: 11px; color: var(--slate-500); font-family: monospace;">${escapeHtml(line.purchaser_code)}</div>
        </td>
        <td>
          <div style="font-size: 13px; color: var(--slate-800); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(line.description || '')}">
            ${escapeHtml(line.description || '-')}
          </div>
          ${line.settlement_date ? `<div style="font-size: 11px; color: var(--slate-400);">Issued: ${escapeHtml(line.settlement_date)}</div>` : ''}
        </td>
        <td style="text-align: right; font-weight: 600; color: var(--slate-800);">
          ${Number(line.cash_issued || 0).toLocaleString()}
        </td>
        <td style="text-align: right; color: var(--emerald-600); font-weight: 600;">
          ${Number(line.invoice_received || 0).toLocaleString()}
        </td>
        <td style="text-align: right; color: var(--blue-600);">
          ${Number(line.cash_returned || 0) > 0 ? Number(line.cash_returned).toLocaleString() : '-'}
        </td>
        <td style="text-align: right;">
          <span class="${balanceClass}">
            ${balanceText}
          </span>
        </td>
        <td>
          <div style="font-size: 12px; color: var(--slate-600); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(line.remarks || '')}">
            ${escapeHtml(line.remarks || '-')}
          </div>
        </td>
        <td style="text-align: center;">
          <span class="badge ${line.grn_status && line.grn_status.toLowerCase().includes('received') ? 'badge-green' : 'badge-grey'}">
            ${escapeHtml(line.grn_status || 'Pending')}
          </span>
        </td>
      </tr>
    `;

    // Mobile Card
    mobileHtml += `
      <div class="mobile-pr-card" style="margin-bottom: 12px; border-left: 4px solid ${hasCashInHand ? '#dc2626' : '#10b981'};">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge ${isCEPL ? 'badge-cepl' : 'badge-sppl'}">${escapeHtml(line.plant || 'CEPL')}</span>
            <strong style="font-size: 14px; font-family: monospace;">${escapeHtml(line.po_number)}</strong>
          </div>
          <span class="${balanceClass}">${balanceText}</span>
        </div>

        <div style="font-size: 13px; font-weight: 600; color: var(--slate-800); margin-bottom: 4px;">
          ${escapeHtml(line.purchaser_name)} (${escapeHtml(line.purchaser_code)})
        </div>

        <div style="font-size: 12px; color: var(--slate-600); margin-bottom: 8px;">
          ${escapeHtml(line.description || '-')}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; background: #f8fafc; padding: 6px 10px; border-radius: 6px;">
          <span>Issued: <strong>PKR ${Number(line.cash_issued || 0).toLocaleString()}</strong></span>
          <span>Invoiced: <strong style="color: var(--emerald-600);">PKR ${Number(line.invoice_received || 0).toLocaleString()}</strong></span>
        </div>
      </div>
    `;
  }

  if (cashTableBody) cashTableBody.innerHTML = tableHtml;
  if (cashMobileList) cashMobileList.innerHTML = mobileHtml;

  if (window.$ && $.fn && $.fn.DataTable && lines.length > 0) {
    initOrUpdateDataTable('#cashTable', {
      order: [[1, 'desc']] // sort by PO number descending
    });
  }
}

function selectPurchaserCashFilter(buyerCode) {
  if (selectedCashPurchaser === buyerCode && buyerCode !== 'ALL') {
    selectedCashPurchaser = 'ALL';
  } else {
    selectedCashPurchaser = buyerCode;
  }
  if (cashPurchaserFilter) cashPurchaserFilter.value = selectedCashPurchaser;
  loadCashSettlements();
}

async function handleSyncGoogleDrive() {
  if (currentUser && currentUser.role === 'viewer') {
    showToast('Permission denied: Viewer role is read-only', 'warning');
    return;
  }

  const syncBtns = [btnSyncGDrive, btnManualSyncGDrive].filter(Boolean);
  syncBtns.forEach(btn => {
    btn.disabled = true;
    btn.classList.add('loading');
  });

  const syncIcon = document.getElementById('gdriveSyncIcon');
  if (syncIcon) syncIcon.textContent = '⏳';

  showToast('🔄 Connecting to Google Drive & reading CASH SETTLEMENT.xlsx...', 'info');

  try {
    const res = await authFetch('/api/gdrive/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Google Drive sync complete! Pulled ${data.totalRecords} records.`, 'success');
      if (syncStatusText) {
        syncStatusText.textContent = `Synced: Just now`;
      }
      loadCashSettlements();
      loadKpis();
    } else {
      showToast(data.error || 'Failed to sync with Google Drive', 'error');
    }
  } catch (err) {
    console.error('GDrive sync error:', err);
    showToast('Error syncing with Google Drive: ' + err.message, 'error');
  } finally {
    syncBtns.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('loading');
    });
    if (syncIcon) syncIcon.textContent = '🔄';
  }
}

// Expose globally for inline DOM event attributes
window.selectPurchaserCashFilter = selectPurchaserCashFilter;
window.handleSyncGoogleDrive = handleSyncGoogleDrive;
window.navigateToOverview = navigateToOverview;
window.navigateToDetail = navigateToDetail;
window.navigateToPendingLines = navigateToPendingLines;
window.navigateToVendorDashboard = navigateToVendorDashboard;
window.navigateToCashSettlement = navigateToCashSettlement;
window.filterByVendorGroup = filterByVendorGroup;
window.openExecutiveAlertsModal = openExecutiveAlertsModal;
window.switchExecAlertTab = switchExecAlertTab;
window.openPrFromAlert = openPrFromAlert;
window.handleAlertBuyerChange = handleAlertBuyerChange;
window.openUserManagementModal = openUserManagementModal;
window.openAdminPasswordModal = openAdminPasswordModal;
window.openIncomingTransfersModal = openIncomingTransfersModal;
window.handleRespondTransfer = handleRespondTransfer;
window.openProposeTransferModal = openProposeTransferModal;
window.handleTransferProposalSubmit = handleTransferProposalSubmit;
window.openAssignUrgencyModal = openAssignUrgencyModal;
window.selectUrgencyOption = selectUrgencyOption;
window.handleUrgencySubmit = handleUrgencySubmit;
window.openEditDeliveryDateModal = openEditDeliveryDateModal;
window.setQuickDeliveryDate = setQuickDeliveryDate;
window.handleDeliveryDateSubmit = handleDeliveryDateSubmit;
window.handleLineItemSearch = handleLineItemSearch;
window.clearLineItemSearch = clearLineItemSearch;
window.openLineHistory = openLineHistory;
window.openPrTimeline = openPrTimeline;
window.openCommentsModal = openCommentsModal;
window.openStatusModal = openStatusModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.loginAs = loginAs;
window.handleEditorLogin = handleEditorLogin;




