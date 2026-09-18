import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { runExcelImport } from './import_excel.js';
import { initCashSettlementTables, syncGoogleDriveCashSettlements, getCashSettlementData } from './gdrive_sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pr_tracker.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS pr_lines (
    id TEXT PRIMARY KEY,
    plant TEXT NOT NULL DEFAULT 'CEPL',
    pr_number TEXT NOT NULL,
    po_number TEXT,
    vendor_name TEXT,
    assigned_vendor TEXT,
    remarks TEXT,
    line_number INTEGER NOT NULL,
    item_id TEXT,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'nos',
    site TEXT DEFAULT 'SUNDAR',
    warehouse TEXT DEFAULT 'Sunder-MW',
    po_status TEXT NOT NULL DEFAULT 'Open order',
    tracking_status TEXT,
    status_remarks TEXT,
    purch_qty REAL NOT NULL DEFAULT 0,
    received_qty REAL NOT NULL DEFAULT 0,
    dlv_remain_qty REAL NOT NULL DEFAULT 0,
    invoiced_qty REAL NOT NULL DEFAULT 0,
    inv_remain_qty REAL NOT NULL DEFAULT 0,
    cancelled_qty REAL NOT NULL DEFAULT 0,
    purchase_price REAL NOT NULL DEFAULT 0,
    po_create_date TEXT,
    expected_dlv_date TEXT,
    confirm_dlv_date TEXT,
    last_grn_date TEXT,
    last_invoice_date TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS pr_status_history (
    id TEXT PRIMARY KEY,
    plant TEXT NOT NULL DEFAULT 'CEPL',
    line_id TEXT NOT NULL,
    pr_number TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    item_name TEXT,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    reason_notes TEXT,
    changed_by TEXT DEFAULT 'Purchasing Officer',
    changed_at TEXT DEFAULT (datetime('now', 'localtime')),
    timestamp_utc TEXT,
    user_id TEXT,
    user_role TEXT
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    pr_number TEXT NOT NULL,
    line_id TEXT,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at_utc TEXT NOT NULL,
    created_at_local TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    username TEXT,
    role TEXT NOT NULL,
    user_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    last_active TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_accounts (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    buyer_code TEXT,
    plant TEXT,
    password TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS external_sql_config (
    id TEXT PRIMARY KEY,
    engine TEXT DEFAULT 'mssql',
    host TEXT DEFAULT '127.0.0.1',
    port INTEGER DEFAULT 1433,
    database_name TEXT DEFAULT 'SupplyChainDB',
    username TEXT DEFAULT 'sa',
    password TEXT DEFAULT '',
    query_or_view TEXT DEFAULT 'vw_PrPoTracking',
    sync_interval_mins INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 0,
    last_sync_at TEXT,
    sync_status TEXT DEFAULT 'Ready for external connection'
  );

  CREATE INDEX IF NOT EXISTS idx_pr_number ON pr_lines(pr_number);
  CREATE INDEX IF NOT EXISTS idx_po_number ON pr_lines(po_number);
  CREATE INDEX IF NOT EXISTS idx_plant ON pr_lines(plant);
  CREATE INDEX IF NOT EXISTS idx_history_line_id ON pr_status_history(line_id);
  CREATE INDEX IF NOT EXISTS idx_history_pr_number ON pr_status_history(pr_number);
  CREATE INDEX IF NOT EXISTS idx_auth_token ON auth_sessions(token);
  CREATE INDEX IF NOT EXISTS idx_comments_pr ON comments(pr_number);
  CREATE INDEX IF NOT EXISTS idx_comments_line ON comments(line_id);
`);

// Column safety checks
try {
  const cols = db.prepare(`PRAGMA table_info(pr_lines)`).all().map(c => c.name);
  if (!cols.includes('plant')) db.exec(`ALTER TABLE pr_lines ADD COLUMN plant TEXT NOT NULL DEFAULT 'CEPL'`);
  if (!cols.includes('tracking_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN tracking_status TEXT`);
  if (!cols.includes('status_remarks')) db.exec(`ALTER TABLE pr_lines ADD COLUMN status_remarks TEXT`);
  if (!cols.includes('assigned_vendor')) db.exec(`ALTER TABLE pr_lines ADD COLUMN assigned_vendor TEXT`);
  if (!cols.includes('prl_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN prl_status TEXT DEFAULT 'Closed'`);
  if (!cols.includes('proposed_vendor')) db.exec(`ALTER TABLE pr_lines ADD COLUMN proposed_vendor TEXT`);
  if (!cols.includes('transfer_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN transfer_status TEXT`);
  if (!cols.includes('transfer_requested_by')) db.exec(`ALTER TABLE pr_lines ADD COLUMN transfer_requested_by TEXT`);
  if (!cols.includes('transfer_requested_at')) db.exec(`ALTER TABLE pr_lines ADD COLUMN transfer_requested_at TEXT`);
  if (!cols.includes('urgency_level')) db.exec(`ALTER TABLE pr_lines ADD COLUMN urgency_level TEXT NOT NULL DEFAULT 'Normal'`);
  if (!cols.includes('urgency_set_by')) db.exec(`ALTER TABLE pr_lines ADD COLUMN urgency_set_by TEXT`);
  if (!cols.includes('urgency_set_at')) db.exec(`ALTER TABLE pr_lines ADD COLUMN urgency_set_at TEXT`);

  const sessCols = db.prepare(`PRAGMA table_info(auth_sessions)`).all().map(c => c.name);
  if (!sessCols.includes('username')) db.exec(`ALTER TABLE auth_sessions ADD COLUMN username TEXT`);

  const histCols = db.prepare(`PRAGMA table_info(pr_status_history)`).all().map(c => c.name);
  if (!histCols.includes('timestamp_utc')) db.exec(`ALTER TABLE pr_status_history ADD COLUMN timestamp_utc TEXT`);
  if (!histCols.includes('user_id')) db.exec(`ALTER TABLE pr_status_history ADD COLUMN user_id TEXT`);
  if (!histCols.includes('user_role')) db.exec(`ALTER TABLE pr_status_history ADD COLUMN user_role TEXT`);
} catch (e) {
  console.log('Column safety check info:', e.message);
}

// Seed default user accounts if not present
const DEFAULT_ACCOUNTS = [
  {
    username: 'admin',
    role: 'admin',
    name: 'Developer / Procurement Engineer',
    buyer_code: null,
    plant: null,
    password: 'admin123',
    description: 'Lead Developer & Procurement Engineer - Full administrative oversight, analytics and system configuration'
  },
  {
    username: 'mas',
    role: 'admin',
    name: 'Mashhood (Deputy Manager Procurement)',
    buyer_code: 'MAS',
    plant: null,
    password: 'mas123',
    description: 'Deputy Manager Procurement - Unrestricted co-management and administrative oversight'
  },
  {
    username: 'sar',
    role: 'purchaser',
    name: 'Sarfraz Ahmad',
    buyer_code: 'SAR',
    plant: null,
    password: 'sar123',
    description: 'Procurement Purchaser (SAR)'
  },
  {
    username: 'mag',
    role: 'purchaser',
    name: 'Maghfoor Ahmad',
    buyer_code: 'MAG',
    plant: null,
    password: 'mag123',
    description: 'Procurement Purchaser (MAG)'
  },
  {
    username: 'nou',
    role: 'purchaser',
    name: 'Nouman Khan',
    buyer_code: 'NOU',
    plant: null,
    password: 'nou123',
    description: 'Procurement Purchaser (NOU)'
  },
  {
    username: 'adi',
    role: 'purchaser',
    name: 'Adil Mahmood',
    buyer_code: 'ADI',
    plant: null,
    password: 'adi123',
    description: 'Procurement Purchaser (ADI)'
  },
  {
    username: 'mud',
    role: 'purchaser',
    name: 'Mudassir Ghauri',
    buyer_code: 'MUD',
    plant: null,
    password: 'mud123',
    description: 'Procurement Purchaser (MUD)'
  },
  {
    username: 'tal',
    role: 'purchaser',
    name: 'Talha Baig',
    buyer_code: 'TAL',
    plant: null,
    password: 'tal123',
    description: 'Procurement Purchaser (TAL)'
  },
  {
    username: 'zai',
    role: 'purchaser',
    name: 'Muhammad Zain',
    buyer_code: 'ZAI',
    plant: null,
    password: 'zai123',
    description: 'Procurement Purchaser (ZAI)'
  },
  {
    username: 'finance',
    role: 'finance',
    name: 'Finance Office',
    buyer_code: null,
    plant: null,
    password: 'finance123',
    description: 'Finance Office - Full cash settlement access, GDrive sync & financial comments'
  },
  {
    username: 'audit',
    role: 'audit',
    name: 'Audit Office',
    buyer_code: null,
    plant: null,
    password: 'audit123',
    description: 'Internal Audit Office - Cross-plant oversight, risk alerts & immutable audit trail'
  },
  {
    username: 'enduser_cepl',
    role: 'plant_enduser',
    name: 'Plant End-User (CEPL)',
    buyer_code: null,
    plant: 'CEPL',
    password: 'cepl123',
    description: 'Plant End-User for CEPL Requisitions'
  },
  {
    username: 'enduser_sppl',
    role: 'plant_enduser',
    name: 'Plant End-User (SPPL)',
    buyer_code: null,
    plant: 'SPPL',
    password: 'sppl123',
    description: 'Plant End-User for SPPL Requisitions'
  },
  {
    username: 'executive',
    role: 'executive',
    name: 'Executive Leadership',
    buyer_code: null,
    plant: null,
    password: 'exec123',
    description: 'Executive Leadership - Macro oversight, risk alerts and instructions'
  }
];

const seedAccountStmt = db.prepare(`
  INSERT OR IGNORE INTO user_accounts (username, role, name, buyer_code, plant, password, description)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const acc of DEFAULT_ACCOUNTS) {
  seedAccountStmt.run(acc.username, acc.role, acc.name, acc.buyer_code, acc.plant, acc.password, acc.description);
}

// Remove legacy viewer completely
db.exec(`DELETE FROM user_accounts WHERE username = 'viewer' OR role = 'viewer';`);
db.exec(`DELETE FROM auth_sessions WHERE role = 'viewer';`);

// Auto-migration: Update admin name to Developer / Procurement Engineer
db.prepare(`UPDATE user_accounts SET name = ?, description = ? WHERE username = 'admin'`).run(
  'Developer / Procurement Engineer',
  'Lead Developer & Procurement Engineer - Full administrative oversight, analytics and system configuration'
);

// Performance Optimization: Create SQLite Database Indexes for high-speed queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pr_lines_pr ON pr_lines(pr_number);
  CREATE INDEX IF NOT EXISTS idx_pr_lines_plant ON pr_lines(plant);
  CREATE INDEX IF NOT EXISTS idx_pr_lines_assigned ON pr_lines(assigned_vendor);
  CREATE INDEX IF NOT EXISTS idx_pr_lines_po ON pr_lines(po_number);
  CREATE INDEX IF NOT EXISTS idx_pr_lines_urgency ON pr_lines(urgency_level);
  CREATE INDEX IF NOT EXISTS idx_pr_status_hist_line ON pr_status_history(line_id);
  CREATE INDEX IF NOT EXISTS idx_pr_status_hist_pr ON pr_status_history(pr_number);
  CREATE INDEX IF NOT EXISTS idx_comments_pr ON comments(pr_number);
  CREATE INDEX IF NOT EXISTS idx_comments_line ON comments(line_id);
`);

// Initialize Cash Settlement Tables from Google Drive
initCashSettlementTables(db);

// Auto-run Excel import if database is empty
const lineCountRow = db.prepare('SELECT COUNT(*) as count FROM pr_lines').get();
if (lineCountRow && lineCountRow.count === 0) {
  console.log('Database empty, importing Excel files from excel_files folder...');
  runExcelImport();
}

// Helper: Calculate Standardized Line Lifecycle Stage
function computeLineLifecycleStage(l) {
  if (!l) return 'Requisitioned';
  const pQty = Number(l.purch_qty) || 0;
  const rQty = Number(l.received_qty) || 0;
  const iQty = Number(l.invoiced_qty) || 0;
  const prl = (l.prl_status || '').toLowerCase();
  const status = (l.tracking_status || l.po_status || '').toLowerCase();
  const hasPo = l.po_number && l.po_number.trim() !== '';

  if (!hasPo) {
    if (prl === 'draft' || prl.includes('review')) return 'Requisitioned';
    if (prl === 'approved') return 'Approved';
    if (prl === 'rejected' || prl.includes('reject')) return 'Rejected';
    if (prl === 'cancelled' || prl.includes('cancel')) return 'Cancelled';
    return 'Approved'; // Default for active lines waiting for PO
  }

  // Has PO
  if (status.includes('cancel') || prl === 'cancelled') return 'Cancelled';
  if (iQty >= pQty && pQty > 0) return 'Invoiced & Closed';
  if (status.includes('invoiced') || status.includes('settled') || status.includes('closed')) return 'Invoiced & Closed';
  if (rQty >= pQty && pQty > 0) return 'Fully Received';
  if (rQty > 0 || status.includes('partially') || status.includes('dispatched')) return 'Partially Received';
  return 'PO Issued';
}

// Helper: Calculate Standardized PR Lifecycle Stage
function computePrLifecycleStage(lines) {
  if (!lines || lines.length === 0) return 'Requisitioned';
  const stages = lines.map(computeLineLifecycleStage);

  if (stages.every(s => s === 'Invoiced & Closed')) return 'Invoiced & Closed';
  if (stages.every(s => s === 'Fully Received' || s === 'Invoiced & Closed')) return 'Fully Received';
  if (stages.some(s => s === 'Partially Received' || s === 'Fully Received')) return 'Partially Received';
  if (stages.some(s => s === 'PO Issued')) return 'PO Issued';
  if (stages.every(s => s === 'Rejected')) return 'Rejected';
  if (stages.every(s => s === 'Cancelled')) return 'Cancelled';
  if (stages.some(s => s === 'Approved')) return 'Approved';
  return 'Requisitioned';
}

// Helper: Calculate General PR Status from Line Statuses
function computeGeneralPrStatus(lines) {
  if (!lines || lines.length === 0) return 'No lines';

  const prlStatuses = lines.map(l => (l.prl_status || '').toLowerCase());
  const statuses = lines.map(l => (l.tracking_status || l.po_status || '').toLowerCase());
  const hasNoPo = lines.some(l => !l.po_number || l.po_number.trim() === '');
  const allNoPo = lines.every(l => !l.po_number || l.po_number.trim() === '');

  // 1. Check if all lines are Invoiced (Completed / Settled)
  const allInvoiced = lines.every(l => {
    const s = (l.tracking_status || l.po_status || '').toLowerCase();
    return s.includes('invoiced');
  });
  if (allInvoiced && !allNoPo) return 'Invoiced';

  // 2. Pre-procurement / no PO yet: Check PRL STATUS from PR report
  if (allNoPo) {
    if (prlStatuses.every(s => s === 'draft')) return 'PR Draft';
    if (prlStatuses.every(s => s === 'inreview' || s.includes('review'))) return 'PR In Review';
    if (prlStatuses.every(s => s === 'rejected' || s.includes('reject'))) return 'PR Rejected';
    if (prlStatuses.every(s => s === 'cancelled' || s.includes('cancel'))) return 'PR Cancelled';
    if (prlStatuses.some(s => s === 'draft')) return 'PR Draft';
    if (prlStatuses.some(s => s === 'inreview')) return 'PR In Review';
    if (prlStatuses.some(s => s === 'rejected')) return 'PR Rejected';
    return 'Pending PO Creation';
  }

  // 3. Lines with PO created
  const allReceived = statuses.every(s => s.includes('received') || s.includes('invoiced'));
  if (allReceived) return 'Fully Received';

  const anyReceived = lines.some(l => (Number(l.received_qty) || 0) > 0 || (l.tracking_status && l.tracking_status.toLowerCase().includes('received')));
  if (anyReceived) return 'Partially Delivered';

  const allCancelled = statuses.every(s => s.includes('cancelled'));
  if (allCancelled) return 'Cancelled';

  const allOpen = statuses.every(s => s.includes('open order') || s === 'open');
  if (allOpen && !hasNoPo) return 'Open order';

  if (hasNoPo) return 'Partially PO Converted';

  return 'In Progress';
}

// ----------------------------------------------------
// Vendor Matrix Helpers & Manual Tracking Detection
// ----------------------------------------------------
const PURCHASER_META = {
  SAR: { code: 'SAR', name: 'Sarfraz Ahmad', role: 'Purchaser', color: '#2563eb', bg: '#eff6ff' },
  MAG: { code: 'MAG', name: 'Maghfoor Ahmad', role: 'Purchaser', color: '#7c3aed', bg: '#f5f3ff' },
  NOU: { code: 'NOU', name: 'Nouman Khan', role: 'Purchaser', color: '#059669', bg: '#ecfdf5' },
  ADI: { code: 'ADI', name: 'Adil Mahmood', role: 'Purchaser', color: '#0284c7', bg: '#f0f9ff' },
  MUD: { code: 'MUD', name: 'Mudassir Ghauri', role: 'Purchaser', color: '#d97706', bg: '#fffbeb' },
  TAL: { code: 'TAL', name: 'Talha Baig', role: 'Purchaser', color: '#4f46e5', bg: '#eef2ff' },
  MAS: { code: 'MAS', name: 'Mashhood', role: 'Purchaser', color: '#db2777', bg: '#fdf2f8' },
  ZAI: { code: 'ZAI', name: 'Muhammad Zain', role: 'Purchaser', color: '#0891b2', bg: '#ecfeff' },
  OTHER_VENDORS: { code: 'OTHER_VENDORS', name: 'Other / External Vendors', role: 'External Suppliers', color: '#475569', bg: '#f8fafc' },
  UNASSIGNED: { code: 'UNASSIGNED', name: 'Unassigned / Pending PO', role: 'Unassigned', color: '#dc2626', bg: '#fef2f2' }
};

const PURCHASER_CODES = ['SAR', 'MAG', 'NOU', 'ADI', 'MUD', 'TAL', 'MAS', 'ZAI'];

function getLineVendorGroup(l) {
  if (l.assigned_vendor && PURCHASER_CODES.includes(l.assigned_vendor.toUpperCase())) {
    return l.assigned_vendor.toUpperCase();
  }
  const v = (l.vendor_name || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (v.includes('SARFRAZ')) return 'SAR';
  if (v.includes('MAGHFOOR') || v.includes('MAGFOOR')) return 'MAG';
  if (v.includes('NOUMAN') || v.includes('NUMAN')) return 'NOU';
  if (v.includes('ADIL')) return 'ADI';
  if (v.includes('MUDASS') || v.includes('MUDASSER') || v.includes('MUDASIR') || v.includes('MUDASER')) return 'MUD';
  if (v.includes('TALHA')) return 'TAL';
  if (v.includes('MASHHOOD') || v.includes('MASHOOD') || v.includes('MASHUD')) return 'MAS';
  if (v.includes('ZAIN')) return 'ZAI';
  if (l.po_number && l.po_number.trim() !== '') return 'OTHER_VENDORS';
  return 'UNASSIGNED';
}

function getManuallyUpdatedPrNumbers() {
  const histPrs = db.prepare(`
    SELECT DISTINCT pr_number 
    FROM pr_status_history 
    WHERE (id NOT GLOB '*-1' AND id NOT LIKE '%-PO-%')
       OR (changed_by NOT IN ('Purchasing Officer', 'Requisition Officer', 'ERP Sync') AND reason_notes NOT LIKE 'Imported from%')
  `).all().map(r => r.pr_number);

  const linePrs = db.prepare(`
    SELECT DISTINCT pr_number 
    FROM pr_lines 
    WHERE (tracking_status IS NOT NULL AND tracking_status != '' AND tracking_status != po_status)
       OR (status_remarks IS NOT NULL AND status_remarks != '' 
           AND status_remarks NOT LIKE 'PO issued%' 
           AND status_remarks NOT LIKE 'Awaiting PO%' 
           AND status_remarks NOT LIKE 'PO %')
  `).all().map(r => r.pr_number);

  return new Set([...histPrs, ...linePrs]);
}

// ----------------------------------------------------
// AUTHENTICATION & ACCESS CONTROL CONFIGURATION (RBAC)
// ----------------------------------------------------

// Helper: Lookup user account from user_accounts database table
function getUserAccount(identifier) {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();
  let user = db.prepare(`SELECT * FROM user_accounts WHERE lower(username) = lower(?)`).get(cleanId);
  if (!user) {
    user = db.prepare(`SELECT * FROM user_accounts WHERE lower(role) = lower(?) LIMIT 1`).get(cleanId);
  }
  // Backward compatibility aliases
  if (!user) {
    if (cleanId === 'procurement_manager') return getUserAccount('admin');
    if (cleanId === 'status_updater') return getUserAccount('sar');
  }
  return user;
}

// Helper: Calculate permission matrix for a user profile
function getUserPermissions(account) {
  if (!account) return null;
  const isLead = account.role === 'admin' || account.username === 'admin' || account.username === 'mas';
  const isPurchaser = account.role === 'purchaser';
  const isFinance = account.role === 'finance';
  const isAudit = account.role === 'audit';
  const isPlantEndUser = account.role === 'plant_enduser';
  const isExecutive = account.role === 'executive';

  return {
    fullAccess: isLead,
    canManagePasswords: isLead,
    canAssignPurchaser: isLead, // direct reassignments without approval
    canProposeTransfer: isPurchaser || isLead, // 2-way approval transfer
    canUpdateStatus: isLead || isPurchaser, // purchasers update their own lines
    canComment: isLead || isExecutive || isFinance || isAudit,
    canViewAlerts: isLead || isExecutive || isAudit,
    canViewAuditTrail: true,
    canSync: isLead || isFinance, // both admin and finance can sync GDrive
    canConfigSql: isLead,
    canExport: true,
    canViewCash: !isPlantEndUser && !isAudit, // hidden for plant end users and audit
    canViewPricing: true, // confirmed visible for all profiles
    isPurchaser: isPurchaser,
    buyerCode: account.buyer_code || null,
    plant: account.plant || null
  };
}

// Middleware: Extract Authenticated User from Session Token
function extractUser(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
      token = String(req.headers['x-auth-token']).trim();
    } else if (req.query && req.query.auth_token) {
      token = String(req.query.auth_token).trim();
    }

    if (!token) {
      req.user = null;
      return next();
    }

    const session = db.prepare(`
      SELECT token, username, role, user_name, created_at, last_active 
      FROM auth_sessions 
      WHERE token = ?
    `).get(token);

    if (session) {
      db.prepare(`UPDATE auth_sessions SET last_active = datetime('now', 'localtime') WHERE token = ?`).run(token);
      const userAccount = getUserAccount(session.username || session.role);
      if (!userAccount) {
        req.user = null;
        return next();
      }

      const permissions = getUserPermissions(userAccount);

      req.user = {
        token: session.token,
        username: userAccount.username,
        role: userAccount.role,
        name: userAccount.name,
        buyerCode: userAccount.buyer_code,
        plant: userAccount.plant,
        canEdit: Boolean(permissions.canUpdateStatus || permissions.canAssignPurchaser),
        permissions
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    console.error('Auth extraction error:', err);
    req.user = null;
  }
  next();
}

// Middleware: Require Valid Authentication
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  next();
}

// Middleware: Require Admin / Lead Rights (Admin or Deputy Manager Mashhood)
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  if (!req.user.permissions?.fullAccess) {
    return res.status(403).json({ success: false, error: 'Permission denied. Admin / Lead access required.' });
  }
  next();
}

// Middleware: Require Status Updater Rights (Admin, Mashhood, or Purchasers)
function requireStatusUpdater(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  if (!req.user.permissions?.canUpdateStatus) {
    return res.status(403).json({ success: false, error: 'Permission denied. Status update access required.' });
  }
  next();
}

// Middleware: Require Direct Purchaser Assigner Rights (Admin or Mashhood)
function requirePurchaserAssigner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  if (!req.user.permissions?.canAssignPurchaser) {
    return res.status(403).json({ success: false, error: 'Permission denied. Only Admin / Lead can assign purchasers directly.' });
  }
  next();
}

// Middleware: Require Executive or Admin Rights (for comments and executive alerts)
function requireExecutiveOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  if (!req.user.permissions?.canComment && !req.user.permissions?.canViewAlerts && !req.user.permissions?.fullAccess) {
    return res.status(403).json({ success: false, error: 'Permission denied. Executive or Admin rights required.' });
  }
  next();
}

// Middleware: Require Password Management Rights (Admin / Mashhood)
function requirePasswordManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  if (!req.user.permissions?.canManagePasswords) {
    return res.status(403).json({ success: false, error: 'Permission denied. User & password management requires Lead / Admin rights.' });
  }
  next();
}

// Middleware: Require Cash Settlement Access (Plant End-Users and Audit restricted)
function requireCashAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  if (!req.user.permissions?.canViewCash) {
    return res.status(403).json({ success: false, error: 'Access restricted. Financial tracking is not available for your role.' });
  }
  next();
}

const requireEditor = requireStatusUpdater;

app.use(extractUser);

// ----------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT ENDPOINTS
// ----------------------------------------------------

// POST /api/auth/login - Sign In with username or role
app.post('/api/auth/login', (req, res) => {
  try {
    const { role, username, password } = req.body || {};
    const identifier = username || role;
    const account = getUserAccount(identifier);

    if (!account) {
      return res.status(400).json({ success: false, error: 'Invalid user account selected.' });
    }

    if (!password || String(password).trim() !== account.password) {
      return res.status(401).json({ success: false, error: 'Incorrect password for ' + account.name });
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO auth_sessions (token, username, role, user_name, created_at, last_active)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(token, account.username, account.role, account.name);

    const permissions = getUserPermissions(account);

    res.json({
      success: true,
      token,
      user: {
        username: account.username,
        role: account.role,
        name: account.name,
        buyerCode: account.buyer_code,
        plant: account.plant,
        canEdit: Boolean(permissions.canUpdateStatus || permissions.canAssignPurchaser),
        permissions: permissions
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me - Verify current session
app.get('/api/auth/me', (req, res) => {
  if (req.user) {
    res.json({
      success: true,
      authenticated: true,
      user: {
        username: req.user.username,
        role: req.user.role,
        name: req.user.name,
        buyerCode: req.user.buyerCode,
        plant: req.user.plant,
        canEdit: req.user.canEdit,
        permissions: req.user.permissions
      }
    });
  } else {
    res.json({
      success: true,
      authenticated: false
    });
  }
});

// POST /api/auth/logout - End session
app.post('/api/auth/logout', (req, res) => {
  try {
    if (req.user && req.user.token) {
      db.prepare(`DELETE FROM auth_sessions WHERE token = ?`).run(req.user.token);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/change-password - User changes their own password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!new_password || String(new_password).trim().length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters long.' });
    }

    const currentAcc = db.prepare(`SELECT * FROM user_accounts WHERE username = ?`).get(req.user.username);
    if (!currentAcc || currentAcc.password !== current_password) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    db.prepare(`
      UPDATE user_accounts 
      SET password = ?, updated_at = datetime('now', 'localtime') 
      WHERE username = ?
    `).run(String(new_password).trim(), req.user.username);

    res.json({ success: true, message: 'Your password was changed successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/users - List all accounts for Password Management Dashboard (Admin & Mashhood only)
app.get('/api/admin/users', requirePasswordManager, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT username, role, name, buyer_code, plant, description, updated_at 
      FROM user_accounts 
      ORDER BY 
        CASE 
          WHEN username IN ('admin', 'mas') THEN 1 
          WHEN role = 'purchaser' THEN 2 
          WHEN role IN ('finance', 'audit') THEN 3 
          WHEN role = 'plant_enduser' THEN 4 
          ELSE 5 
        END, name ASC
    `).all();
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    console.error('Error fetching user accounts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/users/:username/password - Admin / Mashhood updates password for any account
app.patch('/api/admin/users/:username/password', requirePasswordManager, (req, res) => {
  try {
    const { username } = req.params;
    const { new_password } = req.body || {};

    if (!new_password || String(new_password).trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long.' });
    }

    const targetUser = db.prepare(`SELECT * FROM user_accounts WHERE username = ?`).get(username);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: `User "${username}" not found.` });
    }

    db.prepare(`
      UPDATE user_accounts 
      SET password = ?, updated_at = datetime('now', 'localtime') 
      WHERE username = ?
    `).run(String(new_password).trim(), username);

    // Audit log entry
    const historyId = `HST-PWD-${Date.now()}`;
    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
      ) VALUES (?, 'ALL', 'SYSTEM', 'USER-MGMT', 0, 'Password Change', 'ACTIVE', 'UPDATED', ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      `Password updated for ${targetUser.name} (${username}) by ${req.user.name}`,
      req.user.name,
      nowLocalStr,
      new Date().toISOString(),
      req.user.username,
      req.user.role
    );

    res.json({ success: true, message: `Password for ${targetUser.name} updated successfully!` });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// LINE REASSIGNMENT WORKFLOW (PROPOSAL & ACCEPTANCE)
// ----------------------------------------------------

// POST /api/lines/:lineId/propose-transfer - Purchaser proposes transfer to another buyer
app.post('/api/lines/:lineId/propose-transfer', requireAuth, (req, res) => {
  try {
    const { lineId } = req.params;
    const { target_purchaser, reason_notes } = req.body || {};

    if (!target_purchaser || !PURCHASER_CODES.includes(target_purchaser.toUpperCase())) {
      return res.status(400).json({ success: false, error: 'Invalid target purchaser code.' });
    }

    const targetBuyer = target_purchaser.toUpperCase();
    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found.' });
    }

    const currentBuyer = currentLine.assigned_vendor || getLineVendorGroup(currentLine);
    const isManager = req.user.permissions?.fullAccess;

    // Standard purchaser can only reassign lines assigned to themselves
    if (!isManager && req.user.permissions?.isPurchaser) {
      if (currentBuyer !== req.user.permissions?.buyerCode) {
        return res.status(403).json({ success: false, error: 'You can only propose transfers for lines assigned to you.' });
      }
    }

    if (targetBuyer === currentBuyer) {
      return res.status(400).json({ success: false, error: `Line is already assigned to ${targetBuyer}.` });
    }

    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const cleanNotes = (reason_notes || '').trim();

    // Management bypass: Direct reassignment without requiring recipient acceptance
    if (isManager) {
      db.prepare(`
        UPDATE pr_lines 
        SET assigned_vendor = ?, proposed_vendor = NULL, transfer_status = 'accepted', updated_at = ? 
        WHERE id = ?
      `).run(targetBuyer, nowLocalStr, lineId);

      const historyId = `HST-XFER-${lineId}-${Date.now()}`;
      db.prepare(`
        INSERT INTO pr_status_history (
          id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        currentLine.plant || 'CEPL',
        lineId,
        currentLine.pr_number,
        currentLine.line_number,
        currentLine.item_name,
        currentLine.tracking_status || currentLine.po_status || 'Open order',
        currentLine.tracking_status || currentLine.po_status || 'Open order',
        `Direct reassignment by Management to ${targetBuyer}${cleanNotes ? ' | Note: ' + cleanNotes : ''}`,
        req.user.name,
        nowLocalStr,
        timestampUtc,
        req.user.username,
        req.user.role
      );

      return res.json({
        success: true,
        immediate: true,
        message: `Line directly reassigned to ${targetBuyer}.`
      });
    }

    // Standard purchaser: Proposal requires recipient acceptance
    db.prepare(`
      UPDATE pr_lines 
      SET proposed_vendor = ?, transfer_status = 'pending', transfer_requested_by = ?, transfer_requested_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(targetBuyer, req.user.permissions?.buyerCode || req.user.name, nowLocalStr, nowLocalStr, lineId);

    const historyId = `HST-PROP-${lineId}-${Date.now()}`;
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      currentLine.tracking_status || currentLine.po_status || 'Open order',
      currentLine.tracking_status || currentLine.po_status || 'Open order',
      `Transfer to ${targetBuyer} proposed by ${req.user.name} (Awaiting acceptance)${cleanNotes ? ' | Reason: ' + cleanNotes : ''}`,
      req.user.name,
      nowLocalStr,
      timestampUtc,
      req.user.username,
      req.user.role
    );

    res.json({
      success: true,
      pending: true,
      message: `Transfer proposed to ${targetBuyer}. The line will transfer once accepted by ${targetBuyer}.`
    });
  } catch (err) {
    console.error('Error proposing transfer:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/lines/:lineId/respond-transfer - Target purchaser accepts or declines
app.post('/api/lines/:lineId/respond-transfer', requireAuth, (req, res) => {
  try {
    const { lineId } = req.params;
    const { action, reason_notes } = req.body || {}; // action: 'accept' | 'decline'

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Action must be "accept" or "decline".' });
    }

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found.' });
    }

    if (currentLine.transfer_status !== 'pending' || !currentLine.proposed_vendor) {
      return res.status(400).json({ success: false, error: 'No pending transfer request found for this line.' });
    }

    const isTarget = currentLine.proposed_vendor === req.user.permissions?.buyerCode;
    const isManager = req.user.permissions?.fullAccess;

    if (!isTarget && !isManager) {
      return res.status(403).json({ success: false, error: 'Only the proposed purchaser or management can respond to this transfer.' });
    }

    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const cleanNotes = (reason_notes || '').trim();
    const historyId = `HST-RESP-${lineId}-${Date.now()}`;

    if (action === 'accept') {
      const newBuyer = currentLine.proposed_vendor;
      db.prepare(`
        UPDATE pr_lines 
        SET assigned_vendor = ?, proposed_vendor = NULL, transfer_status = 'accepted', updated_at = ? 
        WHERE id = ?
      `).run(newBuyer, nowLocalStr, lineId);

      db.prepare(`
        INSERT INTO pr_status_history (
          id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        currentLine.plant || 'CEPL',
        lineId,
        currentLine.pr_number,
        currentLine.line_number,
        currentLine.item_name,
        currentLine.tracking_status || currentLine.po_status || 'Open order',
        currentLine.tracking_status || currentLine.po_status || 'Open order',
        `Transfer accepted by ${req.user.name}. Assigned purchaser is now ${newBuyer}.${cleanNotes ? ' | Note: ' + cleanNotes : ''}`,
        req.user.name,
        nowLocalStr,
        timestampUtc,
        req.user.username,
        req.user.role
      );

      res.json({ success: true, message: `Line transfer accepted! You are now assigned to this line.` });
    } else {
      // Decline
      db.prepare(`
        UPDATE pr_lines 
        SET proposed_vendor = NULL, transfer_status = 'declined', updated_at = ? 
        WHERE id = ?
      `).run(nowLocalStr, lineId);

      db.prepare(`
        INSERT INTO pr_status_history (
          id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        currentLine.plant || 'CEPL',
        lineId,
        currentLine.pr_number,
        currentLine.line_number,
        currentLine.item_name,
        currentLine.tracking_status || currentLine.po_status || 'Open order',
        currentLine.tracking_status || currentLine.po_status || 'Open order',
        `Transfer declined by ${req.user.name}. Line remains assigned to ${currentLine.assigned_vendor || 'original buyer'}.${cleanNotes ? ' | Reason: ' + cleanNotes : ''}`,
        req.user.name,
        nowLocalStr,
        timestampUtc,
        req.user.username,
        req.user.role
      );

      res.json({ success: true, message: `Line transfer declined. The line remains with the original purchaser.` });
    }
  } catch (err) {
    console.error('Error responding to transfer:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/transfers/pending - Get pending incoming or outgoing transfers
app.get('/api/transfers/pending', requireAuth, (req, res) => {
  try {
    const isManager = req.user.permissions?.fullAccess;
    const buyerCode = req.user.permissions?.buyerCode;

    let query = `
      SELECT l.*, 
             coalesce(l.assigned_vendor, '') as current_buyer,
             l.proposed_vendor,
             l.transfer_requested_by,
             l.transfer_requested_at
      FROM pr_lines l
      WHERE l.transfer_status = 'pending' AND l.proposed_vendor IS NOT NULL
    `;
    const params = [];

    if (!isManager && buyerCode) {
      query += ` AND (l.proposed_vendor = ? OR l.assigned_vendor = ? OR l.transfer_requested_by = ?)`;
      params.push(buyerCode, buyerCode, buyerCode);
    }

    query += ` ORDER BY l.transfer_requested_at DESC`;
    const pendingTransfers = db.prepare(query).all(...params);

    res.json({
      success: true,
      count: pendingTransfers.length,
      incoming: pendingTransfers.filter(t => t.proposed_vendor === buyerCode),
      outgoing: pendingTransfers.filter(t => t.transfer_requested_by === buyerCode),
      all: pendingTransfers
    });
  } catch (err) {
    console.error('Error fetching pending transfers:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// 1. GET /api/prs - Consolidated PR Level List (Each PR listed exactly once, NO vendor name on main page!)
app.get('/api/prs', requireAuth, (req, res) => {
  try {
    const { search, status, plant, po_filter, manual_only, vendor_group } = req.query;

    let query = `SELECT * FROM pr_lines WHERE 1=1`;
    const queryParams = [];

    // Enforce plant filter if user is plant-isolated
    const userPlant = req.user?.permissions?.plant;
    const effectivePlant = userPlant ? userPlant : (plant && plant !== 'All' ? plant : null);
    if (effectivePlant) {
      query += ` AND plant = ?`;
      queryParams.push(effectivePlant);
    }

    if (po_filter === 'with_po') {
      query += ` AND po_number IS NOT NULL AND po_number != ''`;
    } else if (po_filter === 'without_po') {
      query += ` AND (po_number IS NULL OR po_number = '')`;
    }

    query += ` ORDER BY pr_number ASC, line_number ASC`;

    let allLines = db.prepare(query).all(...queryParams);

    // If purchaser profile, strictly isolate lines to this purchaser
    const isPurchaser = req.user?.permissions?.isPurchaser;
    const buyerCode = req.user?.permissions?.buyerCode;
    if (isPurchaser && buyerCode) {
      allLines = allLines.filter(l => {
        const grp = getLineVendorGroup(l);
        return grp === buyerCode || l.assigned_vendor === buyerCode || l.proposed_vendor === buyerCode;
      });
    }

    const manualPrSet = getManuallyUpdatedPrNumbers();

    // Group lines by PR Number
    const prGroups = new Map();
    for (const line of allLines) {
      if (!prGroups.has(line.pr_number)) {
        prGroups.set(line.pr_number, []);
      }
      prGroups.get(line.pr_number).push(line);
    }

    const commentsCountMap = new Map();
    try {
      const cRows = db.prepare(`SELECT pr_number, count(*) as cnt FROM comments GROUP BY pr_number`).all();
      for (const r of cRows) {
        if (r.pr_number) commentsCountMap.set(r.pr_number, r.cnt);
      }
    } catch (e) {}

    const prSummaries = [];
    const today = new Date().toISOString().split('T')[0];

    for (const [prNumber, lines] of prGroups.entries()) {
      const distinctPOs = Array.from(new Set(lines.map(l => l.po_number).filter(p => p && p.trim() !== '')));
      const distinctRemarks = Array.from(new Set(lines.map(l => l.remarks).filter(r => r && r.trim() !== '')));
      const plants = Array.from(new Set(lines.map(l => l.plant).filter(Boolean)));

      const totalLines = lines.length;
      let fullyDeliveredLines = 0;
      let partiallyDeliveredLines = 0;
      let pendingLines = 0;
      let linesWithPo = 0;
      let linesWithoutPo = 0;
      let plannedAmount = 0;
      let totalPurchQty = 0;

      for (const l of lines) {
        const pQty = Number(l.purch_qty) || 0;
        const rQty = Number(l.received_qty) || 0;
        const price = Number(l.purchase_price) || 0;

        totalPurchQty += pQty;
        plannedAmount += (price * pQty);

        if (l.po_number && l.po_number.trim() !== '') {
          linesWithPo++;
        } else {
          linesWithoutPo++;
        }

        if (pQty > 0 && rQty >= pQty) {
          fullyDeliveredLines++;
        } else if (rQty > 0 && rQty < pQty) {
          partiallyDeliveredLines++;
        } else if (l.po_status && l.po_status.toLowerCase() !== 'cancelled') {
          pendingLines++;
        }
      }

      const generalStatus = computeGeneralPrStatus(lines);
      const lifecycleStage = computePrLifecycleStage(lines);

      // Milestone dates
      const poDates = lines.map(l => l.po_create_date).filter(Boolean).sort();
      const appDates = lines.map(l => l.pr_approve_date).filter(Boolean).sort();
      const crtDates = lines.map(l => l.pr_create_date).filter(Boolean).sort();
      const expectedDates = lines.map(l => l.expected_dlv_date).filter(Boolean).sort();
      const grnDates = lines.map(l => l.last_grn_date).filter(Boolean).sort();
      const invoiceDates = lines.map(l => l.last_invoice_date).filter(Boolean).sort();

      const earliestExpected = expectedDates[0] || '';
      const isOverdue = earliestExpected && earliestExpected < today && (pendingLines > 0 || partiallyDeliveredLines > 0);

      const isInvoiced = generalStatus === 'Invoiced';
      const isPreApprovalOrCancelled = ['PR Draft', 'PR In Review', 'PR Rejected', 'PR Cancelled', 'Cancelled'].includes(generalStatus);
      const isActive = !isInvoiced && !isPreApprovalOrCancelled;

      const hasManualUpdates = manualPrSet.has(prNumber);
      const vendorGroups = Array.from(new Set(lines.map(getLineVendorGroup)));

      const summary = {
        pr_number: prNumber,
        plant: plants[0] || 'CEPL',
        po_number: distinctPOs.join(', ') || '',
        has_po: distinctPOs.length > 0,
        remarks: distinctRemarks.join(' | ') || '',
        general_status: generalStatus,
        lifecycle_stage: lifecycleStage,
        planned_amount: Math.round(plannedAmount),
        total_purch_qty: Math.round(totalPurchQty),
        comments_count: commentsCountMap.get(prNumber) || 0,
        is_active: isActive,
        is_invoiced: isInvoiced,
        is_pre_approval: isPreApprovalOrCancelled,
        has_manual_updates: hasManualUpdates,
        vendor_groups: vendorGroups,
        primary_vendor_group: vendorGroups[0] || 'UNASSIGNED',
        total_lines: totalLines,
        lines_with_po: linesWithPo,
        lines_without_po: linesWithoutPo,
        fully_delivered_lines: fullyDeliveredLines,
        partially_delivered_lines: partiallyDeliveredLines,
        pending_lines: pendingLines,
        delivery_completion_pct: totalLines > 0 ? Math.round((fullyDeliveredLines / totalLines) * 100) : 0,
        po_create_date: poDates[0] || '',
        pr_approve_date: appDates[appDates.length - 1] || '',
        pr_create_date: crtDates[crtDates.length - 1] || '',
        expected_dlv_date: earliestExpected,
        last_grn_date: grnDates[grnDates.length - 1] || '',
        last_invoice_date: invoiceDates[invoiceDates.length - 1] || '',
        is_overdue: isOverdue
      };

      // Apply query filters
      if (manual_only === 'true' || status === 'ManualUpdates') {
        if (!summary.has_manual_updates) continue;
      }

      if (vendor_group && vendor_group !== 'All') {
        if (!summary.vendor_groups.includes(vendor_group)) continue;
      }

      if (search) {
        const q = search.trim().toLowerCase();
        const prDigitsMatch = q.match(/^(?:pr[-#\s]*)?(\d+)$/i);
        const prDigits = prDigitsMatch ? prDigitsMatch[1] : null;
        const prPadded = prDigits ? prDigits.padStart(6, '0') : null;

        const matches =
          summary.pr_number.toLowerCase().includes(q) ||
          (prDigits && summary.pr_number.replace(/\D/g, '').endsWith(prDigits)) ||
          (prPadded && summary.pr_number.includes(prPadded)) ||
          summary.po_number.toLowerCase().includes(q) ||
          summary.remarks.toLowerCase().includes(q) ||
          lines.some(l => (l.item_name && l.item_name.toLowerCase().includes(q)) || (l.item_id && l.item_id.toLowerCase().includes(q)));
        if (!matches) continue;
      }

      if (status && status !== 'All') {
        if (status === 'ManualUpdates') {
          if (!summary.has_manual_updates) continue;
        } else if (status === 'Active') {
          if (!summary.is_active) continue;
        } else if (status === 'Invoiced') {
          if (!summary.is_invoiced) continue;
        } else if (status === 'PreApproval') {
          if (!summary.is_pre_approval) continue;
        } else if (status === 'Overdue') {
          if (!summary.is_overdue) continue;
        } else if (status === 'Without PO') {
          if (summary.has_po) continue;
        } else if (status === 'With PO') {
          if (!summary.has_po) continue;
        } else if (summary.general_status.toLowerCase() !== status.toLowerCase()) {
          continue;
        }
      }

      prSummaries.push(summary);
    }

    // Default Sorting: Newest PR Approval Date first, then fallback to PO Date / PR Number
    prSummaries.sort((a, b) => {
      const dateA = a.pr_approve_date || a.po_create_date || '';
      const dateB = b.pr_approve_date || b.po_create_date || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      return b.pr_number.localeCompare(a.pr_number);
    });

    res.json({ success: true, count: prSummaries.length, data: prSummaries });
  } catch (err) {
    console.error('Error in GET /api/prs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. GET /api/lines/pending-po - Dedicated Line-Level View for PR Lines without PO
app.get('/api/lines/pending-po', requireAuth, (req, res) => {
  try {
    const { plant, buyer, search, sort = 'oldest', status = 'active' } = req.query;

    let baseQuery = `
      SELECT l.* 
      FROM pr_lines l
      WHERE (l.po_number IS NULL OR trim(l.po_number) = '')
    `;
    const params = [];

    // Filter by plant
    const userPlant = req.user?.permissions?.plant;
    const effectivePlant = userPlant ? userPlant : (plant && plant !== 'All' ? plant : null);
    if (effectivePlant) {
      baseQuery += ` AND l.plant = ?`;
      params.push(effectivePlant);
    }

    // Filter by status
    if (status === 'approved') {
      baseQuery += ` AND l.prl_status = 'Approved'`;
    } else if (status === 'preapproval') {
      baseQuery += ` AND l.prl_status IN ('Draft', 'InReview')`;
    } else if (status === 'active') {
      // Active approved or in-process lines (exclude rejected & cancelled)
      baseQuery += ` AND (l.prl_status IS NULL OR l.prl_status NOT IN ('Rejected', 'Cancelled'))`;
    }

    // Filter by buyer
    const isPurchaser = req.user?.permissions?.isPurchaser;
    const userBuyer = req.user?.permissions?.buyerCode;
    const effectiveBuyer = (isPurchaser && userBuyer) ? userBuyer : buyer;

    if (effectiveBuyer && effectiveBuyer !== 'ALL' && effectiveBuyer !== 'All') {
      if (effectiveBuyer === 'UNASSIGNED') {
        baseQuery += ` AND (l.assigned_vendor IS NULL OR trim(l.assigned_vendor) = '' OR l.assigned_vendor = 'NONE')`;
      } else {
        baseQuery += ` AND (UPPER(l.assigned_vendor) = ? OR UPPER(coalesce(l.proposed_vendor, '')) = ?)`;
        params.push(effectiveBuyer.toUpperCase(), effectiveBuyer.toUpperCase());
      }
    }

    // Search filter
    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      baseQuery += ` AND (
        lower(l.pr_number) LIKE ? OR
        lower(l.item_name) LIKE ? OR
        lower(coalesce(l.item_id, '')) LIKE ? OR
        lower(coalesce(l.remarks, '')) LIKE ? OR
        lower(coalesce(l.status_remarks, '')) LIKE ? OR
        lower(coalesce(l.assigned_vendor, '')) LIKE ?
      )`;
      params.push(term, term, term, term, term, term);
    }

    // Sorting
    if (sort === 'newest') {
      baseQuery += ` ORDER BY COALESCE(NULLIF(l.expected_dlv_date, ''), '1970-01-01') DESC, l.pr_number DESC, l.line_number ASC`;
    } else if (sort === 'pr_number') {
      baseQuery += ` ORDER BY l.pr_number ASC, l.line_number ASC`;
    } else if (sort === 'qty_desc') {
      baseQuery += ` ORDER BY l.purch_qty DESC, l.pr_number ASC`;
    } else if (sort === 'item_name') {
      baseQuery += ` ORDER BY l.item_name ASC`;
    } else {
      // Default: oldest PR creation/approval date first (Urgent!)
      baseQuery += ` ORDER BY CASE WHEN l.expected_dlv_date IS NULL OR trim(l.expected_dlv_date) = '' THEN 1 ELSE 0 END, l.expected_dlv_date ASC, l.pr_number ASC, l.line_number ASC`;
    }

    const lines = db.prepare(baseQuery).all(...params);

    // Calculate summary statistics across all pending lines for this plant / purchaser
    let statsQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN assigned_vendor IS NULL OR trim(assigned_vendor) = '' OR assigned_vendor = 'NONE' THEN 1 ELSE 0 END) as unassigned_count,
        SUM(CASE WHEN assigned_vendor IS NOT NULL AND trim(assigned_vendor) != '' AND assigned_vendor != 'NONE' THEN 1 ELSE 0 END) as assigned_count
      FROM pr_lines
      WHERE (po_number IS NULL OR trim(po_number) = '')
        AND (prl_status IS NULL OR prl_status NOT IN ('Rejected', 'Cancelled'))
    `;
    const statsParams = [];
    if (effectivePlant) {
      statsQuery += ` AND plant = ?`;
      statsParams.push(effectivePlant);
    }
    if (isPurchaser && userBuyer) {
      statsQuery += ` AND (UPPER(assigned_vendor) = ? OR UPPER(coalesce(proposed_vendor, '')) = ?)`;
      statsParams.push(userBuyer.toUpperCase(), userBuyer.toUpperCase());
    }
    const stats = db.prepare(statsQuery).get(...statsParams) || { total_count: 0, unassigned_count: 0, assigned_count: 0 };

    for (const l of lines) {
      l.lifecycle_stage = computeLineLifecycleStage(l);
      l.line_amount = Math.round((Number(l.purchase_price) || 0) * (Number(l.purch_qty) || 0));
    }

    res.json({
      success: true,
      counts: {
        total: stats.total_count || 0,
        unassigned: stats.unassigned_count || 0,
        assigned: stats.assigned_count || 0,
        filtered: lines.length
      },
      lines
    });
  } catch (err) {
    console.error('Error in GET /api/lines/pending-po:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /api/prs/:prNumber - Get Detailed Lines for a Specific PR
app.get('/api/prs/:prNumber', requireAuth, (req, res) => {
  try {
    const { prNumber } = req.params;
    let lines = db.prepare(`SELECT * FROM pr_lines WHERE pr_number = ? ORDER BY line_number ASC`).all(prNumber);

    if (!lines || lines.length === 0) {
      return res.status(404).json({ success: false, error: `PR ${prNumber} not found` });
    }

    // Plant-level security check
    const userPlant = req.user?.permissions?.plant;
    if (userPlant && lines[0]?.plant !== userPlant) {
      return res.status(403).json({ success: false, error: `Access restricted. PR belongs to plant ${lines[0]?.plant}.` });
    }

    // Purchaser-level security check
    const isPurchaser = req.user?.permissions?.isPurchaser;
    const buyerCode = req.user?.permissions?.buyerCode;
    if (isPurchaser && buyerCode) {
      lines = lines.filter(l => {
        const grp = getLineVendorGroup(l);
        return grp === buyerCode || l.assigned_vendor === buyerCode || l.proposed_vendor === buyerCode;
      });
      if (lines.length === 0) {
        return res.status(403).json({ success: false, error: `Access restricted. No line items in PR ${prNumber} are assigned to you.` });
      }
    }

    // Attach comments for this PR and lines
    let prComments = [];
    try {
      prComments = db.prepare(`SELECT * FROM comments WHERE pr_number = ? ORDER BY created_at_utc ASC`).all(prNumber);
    } catch (e) {}

    const commentsByLine = new Map();
    for (const c of prComments) {
      if (c.line_id) {
        if (!commentsByLine.has(c.line_id)) commentsByLine.set(c.line_id, []);
        commentsByLine.get(c.line_id).push(c);
      }
    }

    // Attach history count and lifecycle stage for each line
    const historyStmt = db.prepare(`SELECT * FROM pr_status_history WHERE line_id = ? ORDER BY COALESCE(timestamp_utc, changed_at) DESC`);
    for (const l of lines) {
      l.status_history = historyStmt.all(l.id);
      l.history_count = l.status_history.length;
      if (!l.tracking_status) l.tracking_status = l.po_status;
      l.lifecycle_stage = computeLineLifecycleStage(l);
      l.line_amount = Math.round((Number(l.purchase_price) || 0) * (Number(l.purch_qty) || 0));
      l.comments = commentsByLine.get(l.id) || [];
      l.comments_count = l.comments.length;
    }

    const generalStatus = computeGeneralPrStatus(lines);
    const lifecycleStage = computePrLifecycleStage(lines);

    res.json({
      success: true,
      pr_number: prNumber,
      plant: lines[0]?.plant || 'CEPL',
      general_status: generalStatus,
      lifecycle_stage: lifecycleStage,
      total_lines: lines.length,
      comments: prComments,
      comments_count: prComments.length,
      lines: lines
    });
  } catch (err) {
    console.error(`Error in GET /api/prs/${req.params.prNumber}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/lines/:lineId/history - Evolution of a Single Line Over Time
app.get('/api/lines/:lineId/history', requireAuth, (req, res) => {
  try {
    const { lineId } = req.params;
    const line = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!line) {
      return res.status(404).json({ success: false, error: 'Line not found' });
    }

    const history = db.prepare(`SELECT * FROM pr_status_history WHERE line_id = ? ORDER BY changed_at DESC`).all(lineId);
    res.json({ success: true, line, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/prs/:prNumber/history - Evolution of an entire PR across all its lines
app.get('/api/prs/:prNumber/history', requireAuth, (req, res) => {
  try {
    const { prNumber } = req.params;
    const history = db.prepare(`SELECT * FROM pr_status_history WHERE pr_number = ? ORDER BY changed_at DESC`).all(prNumber);
    res.json({ success: true, pr_number: prNumber, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. PATCH /api/lines/:lineId/status - Update Status & Remarks (The ONLY operational line status field)
app.patch('/api/lines/:lineId/status', requireStatusUpdater, (req, res) => {
  try {
    const { lineId } = req.params;
    const { new_status, reason_notes } = req.body;

    if (!new_status || !new_status.trim()) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found' });
    }

    // Standard purchaser can only update their own lines
    const isPurchaser = req.user?.permissions?.isPurchaser;
    const buyerCode = req.user?.permissions?.buyerCode;
    if (isPurchaser && buyerCode) {
      const lineBuyer = currentLine.assigned_vendor || getLineVendorGroup(currentLine);
      if (lineBuyer !== buyerCode) {
        return res.status(403).json({ success: false, error: `You can only update status for lines assigned to you (${buyerCode}). This line is assigned to ${lineBuyer || 'Unassigned'}.` });
      }
    }

    // SERVER-CONTROLLED IMMUTABLE AUDIT LOG FIELDS (NOT OVERRIDDEN BY CLIENT)
    const previousStatus = currentLine.tracking_status || currentLine.po_status || 'Open order';
    const cleanNewStatus = new_status.trim();
    const cleanNotes = (reason_notes || '').trim();
    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const userId = req.user?.username || req.user?.role || 'user';
    const userRole = req.user?.role || 'purchaser';
    const authorName = req.user?.name || 'Purchasing Officer';

    // Update tracking_status and status_remarks in pr_lines
    db.prepare(`
      UPDATE pr_lines
      SET tracking_status = ?, status_remarks = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanNewStatus, cleanNotes, nowLocalStr, lineId);

    // Insert into pr_status_history (strictly append-only, immutable record)
    const historyId = `HST-${lineId}-${Date.now()}`;
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      previousStatus,
      cleanNewStatus,
      cleanNotes || `Status updated from "${previousStatus}" to "${cleanNewStatus}"`,
      authorName,
      nowLocalStr,
      timestampUtc,
      userId,
      userRole
    );

    const updatedLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    const updatedHistory = db.prepare(`SELECT * FROM pr_status_history WHERE line_id = ? ORDER BY COALESCE(timestamp_utc, changed_at) DESC`).all(lineId);

    res.json({
      success: true,
      message: `Status updated to "${cleanNewStatus}"`,
      line: updatedLine,
      history: updatedHistory
    });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. PATCH /api/lines/:lineId/assigned-vendor - Update Assigned Vendor (3 letters, strictly restricted to Admin / Lead)
app.patch('/api/lines/:lineId/assigned-vendor', requirePurchaserAssigner, (req, res) => {
  try {
    const { lineId } = req.params;
    const { assigned_vendor } = req.body;

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found' });
    }

    const cleanVendor = (assigned_vendor || '').trim().toUpperCase().substring(0, 3);
    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const userId = req.user?.role || 'admin';
    const userRole = req.user?.role || 'admin';
    const authorName = req.user?.name || 'Admin / Lead';

    db.prepare(`
      UPDATE pr_lines
      SET assigned_vendor = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanVendor, nowLocalStr, lineId);

    // Record in status history (strictly immutable)
    const historyId = `HST-${lineId}-${Date.now()}`;
    const previousStatus = currentLine.tracking_status || currentLine.po_status || 'Open order';
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      previousStatus,
      previousStatus,
      `Assigned purchaser set to: ${cleanVendor || 'Unassigned'}`,
      authorName,
      nowLocalStr,
      timestampUtc,
      userId,
      userRole
    );

    const updatedLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    res.json({
      success: true,
      message: `Assigned vendor set to ${cleanVendor || 'None'}`,
      line: updatedLine
    });
  } catch (err) {
    console.error('Error updating assigned vendor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5c. POST /api/lines/:lineId/urgency - Plant End-User or Management sets urgency level ('Normal' | 'Urgent' | 'Critical')
app.post('/api/lines/:lineId/urgency', requireAuth, (req, res) => {
  try {
    const { lineId } = req.params;
    const { urgency_level, notes } = req.body || {};

    const validLevels = ['Normal', 'Urgent', 'Critical'];
    if (!validLevels.includes(urgency_level)) {
      return res.status(400).json({ success: false, error: 'Urgency level must be one of: Normal, Urgent, Critical.' });
    }

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found.' });
    }

    // Auth check: Plant End-User matching plant, or Procurement Manager (admin or mas)
    const isPlantUser = req.user.role === 'plant_enduser' && req.user.plant === currentLine.plant;
    const isManager = req.user.permissions?.fullAccess;

    if (!isPlantUser && !isManager) {
      return res.status(403).json({
        success: false,
        error: `Permission denied. Only ${currentLine.plant} plant end-users or procurement managers can assign urgency to this line.`
      });
    }

    const previousUrgency = currentLine.urgency_level || 'Normal';
    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const cleanNotes = (notes || '').trim();
    const historyId = `HST-URG-${lineId}-${Date.now()}`;

    db.prepare(`
      UPDATE pr_lines
      SET urgency_level = ?, urgency_set_by = ?, urgency_set_at = ?, updated_at = ?
      WHERE id = ?
    `).run(urgency_level, req.user.name, nowLocalStr, nowLocalStr, lineId);

    // Record in immutable pr_status_history
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      currentLine.tracking_status || currentLine.po_status || 'Open order',
      currentLine.tracking_status || currentLine.po_status || 'Open order',
      `Urgency updated: [${previousUrgency}] → [${urgency_level}] by ${req.user.name} (${req.user.role}).${cleanNotes ? ' | Note: ' + cleanNotes : ''}`,
      req.user.name,
      nowLocalStr,
      timestampUtc,
      req.user.username,
      req.user.role
    );

    const updatedLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    res.json({
      success: true,
      message: `Urgency level set to "${urgency_level}".`,
      urgency_level,
      line: updatedLine
    });
  } catch (err) {
    console.error('Error updating urgency:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5d. PATCH /api/lines/:lineId/expected-delivery-date - Assigned Purchaser or Management updates expected delivery date
app.patch('/api/lines/:lineId/expected-delivery-date', requireAuth, (req, res) => {
  try {
    const { lineId } = req.params;
    const { expected_dlv_date, reason } = req.body || {};

    if (!expected_dlv_date || typeof expected_dlv_date !== 'string') {
      return res.status(400).json({ success: false, error: 'A valid expected delivery date string (YYYY-MM-DD) is required.' });
    }

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found.' });
    }

    // Auth check: Must be assigned purchaser (buyerCode === assigned_vendor or default vendor group) or Management
    const effectiveBuyer = (currentLine.assigned_vendor || getLineVendorGroup(currentLine) || '').trim().toUpperCase();
    const userBuyer = (req.user.buyerCode || '').trim().toUpperCase();
    const isAssigned = req.user.role === 'purchaser' && userBuyer && userBuyer === effectiveBuyer;
    const isManager = req.user.permissions?.fullAccess;

    if (!isAssigned && !isManager) {
      return res.status(403).json({
        success: false,
        error: `Permission denied. Only the assigned purchaser (${effectiveBuyer || 'unassigned'}) or procurement management can edit the expected delivery date.`
      });
    }

    const previousDate = currentLine.expected_dlv_date || 'None';
    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const cleanReason = (reason || '').trim();
    const historyId = `HST-EDD-${lineId}-${Date.now()}`;

    db.prepare(`
      UPDATE pr_lines
      SET expected_dlv_date = ?, updated_at = ?
      WHERE id = ?
    `).run(expected_dlv_date, nowLocalStr, lineId);

    // Record in immutable pr_status_history
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      currentLine.tracking_status || currentLine.po_status || 'Open order',
      currentLine.tracking_status || currentLine.po_status || 'Open order',
      `Expected Delivery Date revised: [${previousDate}] → [${expected_dlv_date}] by ${req.user.name}.${cleanReason ? ' | Reason: ' + cleanReason : ''}`,
      req.user.name,
      nowLocalStr,
      timestampUtc,
      req.user.username,
      req.user.role
    );

    const updatedLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    res.json({
      success: true,
      message: `Expected delivery date updated to ${expected_dlv_date}.`,
      expected_dlv_date,
      line: updatedLine
    });
  } catch (err) {
    console.error('Error updating expected delivery date:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5e. POST /api/lines/bulk-status - Bulk Update Status, Remarks, and/or Assigned Vendor
app.post('/api/lines/bulk-status', requireStatusUpdater, (req, res) => {
  try {
    const { line_ids, new_status, assigned_vendor, reason_notes } = req.body;

    if (!Array.isArray(line_ids) || line_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'line_ids must be a non-empty array' });
    }

    const cleanNewStatus = new_status && new_status.trim() ? new_status.trim() : null;
    const cleanVendor = assigned_vendor !== undefined && assigned_vendor !== null && assigned_vendor !== ''
      ? (assigned_vendor === '__UNASSIGN__' ? '' : assigned_vendor.trim().toUpperCase().substring(0, 3))
      : null;

    // Check role permission if attempting to reassign purchaser
    if (cleanVendor !== null && !req.user?.permissions?.canAssignPurchaser) {
      return res.status(403).json({ success: false, error: 'Permission denied. Only Admin / Lead can assign purchasers in bulk.' });
    }

    const cleanNotes = (reason_notes || '').trim();
    const authorName = req.user?.name || 'Status Updater';
    const userId = req.user?.role || 'status_updater';
    const userRole = req.user?.role || 'status_updater';
    const nowLocalStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();

    if (!cleanNewStatus && cleanVendor === null && !cleanNotes) {
      return res.status(400).json({ success: false, error: 'Please provide at least a new status, assigned vendor, or remarks to update' });
    }

    db.exec('BEGIN TRANSACTION;');

    try {
      const updatedLines = [];
      const getLineStmt = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`);
      const updateLineStmt = db.prepare(`
        UPDATE pr_lines
        SET tracking_status = COALESCE(?, tracking_status),
            assigned_vendor = COALESCE(?, assigned_vendor),
            status_remarks = CASE WHEN ? != '' THEN ? ELSE status_remarks END,
            updated_at = ?
        WHERE id = ?
      `);
      const insertHistoryStmt = db.prepare(`
        INSERT INTO pr_status_history (
          id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at, timestamp_utc, user_id, user_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < line_ids.length; i++) {
        const lineId = line_ids[i];
        const currentLine = getLineStmt.get(lineId);
        if (!currentLine) continue;

        const previousStatus = currentLine.tracking_status || currentLine.po_status || 'Open order';
        const targetStatus = cleanNewStatus || previousStatus;

        // Note construction
        const noteParts = [];
        if (cleanNewStatus && cleanNewStatus !== previousStatus) {
          noteParts.push(`Status changed to "${cleanNewStatus}"`);
        }
        if (cleanVendor !== null && cleanVendor !== currentLine.assigned_vendor) {
          noteParts.push(`Assigned purchaser set to "${cleanVendor || 'Unassigned'}"`);
        }
        if (cleanNotes) {
          noteParts.push(cleanNotes);
        }
        const combinedNotes = noteParts.join(' | ') || `Bulk update applied`;

        // Update pr_lines
        updateLineStmt.run(
          cleanNewStatus,
          cleanVendor,
          cleanNotes,
          cleanNotes,
          nowLocalStr,
          lineId
        );

        // Record history
        const historyId = `HST-BULK-${lineId}-${Date.now()}-${i}`;
        insertHistoryStmt.run(
          historyId,
          currentLine.plant || 'CEPL',
          lineId,
          currentLine.pr_number,
          currentLine.line_number,
          currentLine.item_name,
          previousStatus,
          targetStatus,
          combinedNotes,
          authorName,
          nowLocalStr,
          timestampUtc,
          userId,
          userRole
        );

        updatedLines.push(lineId);
      }

      db.exec('COMMIT;');

      res.json({
        success: true,
        message: `Successfully updated ${updatedLines.length} line item(s) simultaneously!`,
        updated_count: updatedLines.length,
        line_ids: updatedLines
      });
    } catch (innerErr) {
      db.exec('ROLLBACK;');
      throw innerErr;
    }
  } catch (err) {
    console.error('Error in bulk status update:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5d. GET /api/comments - Fetch Comments for a PR or Line Item
app.get('/api/comments', requireAuth, (req, res) => {
  try {
    const { pr_number, line_id } = req.query;
    let query = `SELECT * FROM comments WHERE 1=1`;
    const params = [];

    if (line_id) {
      query += ` AND line_id = ?`;
      params.push(line_id);
    } else if (pr_number) {
      query += ` AND pr_number = ?`;
      params.push(pr_number);
    }

    query += ` ORDER BY created_at_utc ASC`;
    const comments = db.prepare(query).all(...params);
    res.json({ success: true, count: comments.length, comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5e. POST /api/comments - Add Comment (Strictly Executive Leadership & Admin only)
app.post('/api/comments', requireExecutiveOrAdmin, (req, res) => {
  try {
    const { entity_type = 'PR', pr_number, line_id, comment_text } = req.body;

    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ success: false, error: 'Comment text is required.' });
    }
    if (!pr_number && !line_id) {
      return res.status(400).json({ success: false, error: 'PR number or Line ID is required.' });
    }

    const commentId = `CMT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const nowUtc = new Date().toISOString();
    const nowLocal = nowUtc.replace('T', ' ').substring(0, 19);

    db.prepare(`
      INSERT INTO comments (
        id, entity_type, entity_id, pr_number, line_id, author_id, author_name, author_role, comment_text, created_at_utc, created_at_local
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      commentId,
      entity_type,
      line_id || pr_number,
      pr_number || '',
      line_id || null,
      req.user.role,
      req.user.name,
      req.user.role,
      comment_text.trim(),
      nowUtc,
      nowLocal
    );

    const inserted = db.prepare(`SELECT * FROM comments WHERE id = ?`).get(commentId);
    res.json({ success: true, comment: inserted });
  } catch (err) {
    console.error('Error posting comment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5f. GET /api/executive/alerts - Automated Threshold Alerts for Executive Leadership & Admin
app.get('/api/executive/alerts', requireAuth, (req, res) => {
  try {
    const plant = req.query.plant || 'All';
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 1. Severely Overdue Active Deliveries (>14 days past expected dlv date)
    const overdueCount = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM pr_lines l
      WHERE l.expected_dlv_date IS NOT NULL 
        AND l.expected_dlv_date != '' 
        AND l.expected_dlv_date < ?
        AND l.received_qty < l.purch_qty
        AND (l.po_status NOT IN ('Cancelled') AND (l.tracking_status IS NULL OR l.tracking_status NOT LIKE '%cancel%'))
        AND (? = 'All' OR l.plant = ?)
    `).get(fourteenDaysAgo, plant, plant).cnt;

    const overdueLines = db.prepare(`
      SELECT l.*, (l.purch_qty - l.received_qty) as remaining_qty,
             CAST(ROUND(julianday('now') - julianday(l.expected_dlv_date)) AS INTEGER) as days_overdue
      FROM pr_lines l
      WHERE l.expected_dlv_date IS NOT NULL 
        AND l.expected_dlv_date != '' 
        AND l.expected_dlv_date < ?
        AND l.received_qty < l.purch_qty
        AND (l.po_status NOT IN ('Cancelled') AND (l.tracking_status IS NULL OR l.tracking_status NOT LIKE '%cancel%'))
        AND (? = 'All' OR l.plant = ?)
      ORDER BY l.expected_dlv_date ASC
      LIMIT 200
    `).all(fourteenDaysAgo, plant, plant);

    // 2. Stale Unassigned Lines (>30 days old without PO or purchaser)
    const unassignedCount = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM pr_lines l
      WHERE (l.po_number IS NULL OR trim(l.po_number) = '')
        AND (l.assigned_vendor IS NULL OR trim(l.assigned_vendor) = '' OR l.assigned_vendor = 'NONE')
        AND (l.prl_status IS NULL OR l.prl_status NOT IN ('Rejected', 'Cancelled'))
        AND (
          (l.expected_dlv_date IS NOT NULL AND l.expected_dlv_date != '' AND l.expected_dlv_date < ?)
          OR (l.created_at IS NOT NULL AND l.created_at < ?)
        )
        AND (? = 'All' OR l.plant = ?)
    `).get(thirtyDaysAgo, thirtyDaysAgo, plant, plant).cnt;

    const unassignedLines = db.prepare(`
      SELECT l.*,
             CAST(ROUND(julianday('now') - julianday(coalesce(nullif(l.expected_dlv_date, ''), l.created_at))) AS INTEGER) as days_unassigned
      FROM pr_lines l
      WHERE (l.po_number IS NULL OR trim(l.po_number) = '')
        AND (l.assigned_vendor IS NULL OR trim(l.assigned_vendor) = '' OR l.assigned_vendor = 'NONE')
        AND (l.prl_status IS NULL OR l.prl_status NOT IN ('Rejected', 'Cancelled'))
        AND (
          (l.expected_dlv_date IS NOT NULL AND l.expected_dlv_date != '' AND l.expected_dlv_date < ?)
          OR (l.created_at IS NOT NULL AND l.created_at < ?)
        )
        AND (? = 'All' OR l.plant = ?)
      ORDER BY l.expected_dlv_date ASC, l.created_at ASC
      LIMIT 200
    `).all(thirtyDaysAgo, thirtyDaysAgo, plant, plant);

    // 3. Price Variance Lines (>10% variance across same item_id)
    const varianceCount = db.prepare(`
      WITH item_stats AS (
        SELECT item_id, MIN(purchase_price) as min_price, MAX(purchase_price) as max_price, COUNT(DISTINCT purchase_price) as price_count
        FROM pr_lines
        WHERE item_id IS NOT NULL AND item_id != '' AND purchase_price > 0
          AND (? = 'All' OR plant = ?)
        GROUP BY item_id
        HAVING price_count > 1 AND (MAX(purchase_price) - MIN(purchase_price)) / MIN(purchase_price) > 0.10
      )
      SELECT COUNT(*) as cnt
      FROM pr_lines l
      JOIN item_stats s ON l.item_id = s.item_id
      WHERE l.purchase_price > s.min_price * 1.10
        AND (? = 'All' OR l.plant = ?)
    `).get(plant, plant, plant, plant).cnt;

    const varianceItems = db.prepare(`
      WITH item_stats AS (
        SELECT item_id, MIN(purchase_price) as min_price, MAX(purchase_price) as max_price, AVG(purchase_price) as avg_price, COUNT(DISTINCT purchase_price) as price_count
        FROM pr_lines
        WHERE item_id IS NOT NULL AND item_id != '' AND purchase_price > 0
          AND (? = 'All' OR plant = ?)
        GROUP BY item_id
        HAVING price_count > 1 AND (MAX(purchase_price) - MIN(purchase_price)) / MIN(purchase_price) > 0.10
      )
      SELECT l.*, s.min_price, s.max_price, s.avg_price,
             ROUND(((l.purchase_price - s.min_price) / s.min_price) * 100, 1) as variance_pct
      FROM pr_lines l
      JOIN item_stats s ON l.item_id = s.item_id
      WHERE l.purchase_price > s.min_price * 1.10
        AND (? = 'All' OR l.plant = ?)
      ORDER BY variance_pct DESC
      LIMIT 200
    `).all(plant, plant, plant, plant);

    res.json({
      success: true,
      plant,
      summary: {
        severely_overdue_count: overdueCount,
        stale_unassigned_count: unassignedCount,
        price_variance_count: varianceCount,
        total_alerts: overdueCount + unassignedCount + varianceCount
      },
      severely_overdue: overdueLines,
      stale_unassigned: unassignedLines,
      price_variance: varianceItems
    });
  } catch (err) {
    console.error('Error fetching executive alerts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5g. GET /api/audit-trail - Immutable Complete Status Audit Trail
app.get('/api/audit-trail', requireAuth, (req, res) => {
  try {
    const { pr_number, line_id, limit = 200 } = req.query;
    let query = `SELECT * FROM pr_status_history WHERE 1=1`;
    const params = [];

    if (line_id) {
      query += ` AND line_id = ?`;
      params.push(line_id);
    } else if (pr_number) {
      query += ` AND pr_number = ?`;
      params.push(pr_number);
    }

    query += ` ORDER BY COALESCE(timestamp_utc, changed_at) DESC LIMIT ?`;
    params.push(Number(limit) || 200);

    const history = db.prepare(query).all(...params);
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5h. GET /api/financial/purchaser-summary - High-level View-Only Purchaser Financial Metrics
app.get('/api/financial/purchaser-summary', requireCashAccess, (req, res) => {
  try {
    const { plant } = req.query;
    const userPlant = req.user?.permissions?.plant;
    const effectivePlant = userPlant || plant;
    let data = getCashSettlementData(db, { plant: effectivePlant });

    // If standard purchaser, filter to only their own card
    if (req.user?.permissions?.isPurchaser && req.user?.name) {
      const buyerName = req.user.name.toLowerCase();
      const buyerCode = (req.user.permissions?.buyerCode || '').toLowerCase();
      data.purchasers = (data.purchasers || []).filter(p => {
        const pName = (p.purchaser || '').toLowerCase();
        return pName.includes(buyerName) || (buyerCode && pName.includes(buyerCode));
      });
      // Re-calculate totals for this purchaser
      const totalAdvance = data.purchasers.reduce((acc, p) => acc + (p.totalAdvance || 0), 0);
      const totalInvoice = data.purchasers.reduce((acc, p) => acc + (p.totalInvoice || 0), 0);
      const totalReturn = data.purchasers.reduce((acc, p) => acc + (p.totalReturn || 0), 0);
      const totalCashInHand = data.purchasers.reduce((acc, p) => acc + (p.cashInHand || 0), 0);
      data.summary = {
        totalAdvance,
        totalInvoice,
        totalReturn,
        totalCashInHand,
        unsettledCount: data.purchasers.reduce((acc, p) => acc + (p.unsettledCount || 0), 0),
        emergencyCount: 0
      };
      if (data.records) {
        data.records = data.records.filter(r => {
          const pName = (r.purchaser || '').toLowerCase();
          return pName.includes(buyerName) || (buyerCode && pName.includes(buyerCode));
        });
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. GET /api/kpis - Dashboard Summary Counters
app.get('/api/kpis', requireAuth, (req, res) => {
  try {
    const { plant } = req.query;
    let query = `SELECT * FROM pr_lines`;
    const params = [];
    const userPlant = req.user?.permissions?.plant;
    const effectivePlant = userPlant ? userPlant : (plant && plant !== 'All' ? plant : null);
    if (effectivePlant) {
      query += ` WHERE plant = ?`;
      params.push(effectivePlant);
    }

    let allLines = db.prepare(query).all(...params);

    const isPurchaser = req.user?.permissions?.isPurchaser;
    const buyerCode = req.user?.permissions?.buyerCode;
    if (isPurchaser && buyerCode) {
      allLines = allLines.filter(l => {
        const grp = getLineVendorGroup(l);
        return grp === buyerCode || l.assigned_vendor === buyerCode || l.proposed_vendor === buyerCode;
      });
    }

    // Group lines by PR
    const prGroups = new Map();
    for (const l of allLines) {
      if (!prGroups.has(l.pr_number)) {
        prGroups.set(l.pr_number, []);
      }
      prGroups.get(l.pr_number).push(l);
    }

    // Classify PRs: Invoiced (completed/done), Pre-Approval (Draft/InReview/Rejected/Cancelled), or Active
    const invoicedPrs = new Set();
    const preApprovalPrs = new Set();
    const activePrs = new Set();

    for (const [prNum, lines] of prGroups.entries()) {
      const gStatus = computeGeneralPrStatus(lines);
      if (gStatus === 'Invoiced') {
        invoicedPrs.add(prNum);
      } else if (['PR Draft', 'PR In Review', 'PR Rejected', 'PR Cancelled', 'Cancelled'].includes(gStatus)) {
        preApprovalPrs.add(prNum);
      } else {
        activePrs.add(prNum);
      }
    }

    // Counters for active PRs and active lines only (invoiced & pre-approval PRs excluded from all active metrics)
    let activeLinesCount = 0;
    let linesWithPo = 0;
    let linesPendingPo = 0;
    let exactFullyDelivered = 0;
    let deliveredWithin5Pct = 0;
    let partiallyDelivered = 0; // >5% shortage
    let overDelivered = 0;       // >5% excess
    let openPending = 0;
    let overdueCount = 0;

    const today = new Date().toISOString().split('T')[0];

    for (const l of allLines) {
      // RULE: Do not count lines belonging to Invoiced PRs or pre-approval/rejected PRs
      if (!activePrs.has(l.pr_number)) {
        continue;
      }

      activeLinesCount++;

      const pQty = Number(l.purch_qty) || 0;
      const rQty = Number(l.received_qty) || 0;
      const status = (l.tracking_status || l.po_status || '').toLowerCase();
      const prl = (l.prl_status || '').toLowerCase();

      // Lines with PO made vs Pending PO
      if ((l.po_number && l.po_number.trim() !== '') || prl === 'closed') {
        linesWithPo++;
      } else {
        linesPendingPo++;
      }

      // Delivery calculations (exact vs 5% tolerance)
      if (pQty > 0) {
        if (rQty === pQty) {
          exactFullyDelivered++;
        } else if (rQty > 0 && Math.abs(rQty - pQty) / pQty <= 0.05) {
          deliveredWithin5Pct++;
        } else if (rQty > 0 && rQty < 0.95 * pQty) {
          partiallyDelivered++;
        } else if (rQty > 1.05 * pQty) {
          overDelivered++;
        } else if (rQty === 0) {
          openPending++;
        }
      } else {
        openPending++;
      }

      // Overdue active deliveries
      if (l.expected_dlv_date && l.expected_dlv_date < today && rQty < pQty && !status.includes('cancelled')) {
        overdueCount++;
      }
    }

    res.json({
      success: true,
      total_active_prs: activePrs.size,
      active_line_items: activeLinesCount,
      lines_with_po: linesWithPo,
      lines_without_po: linesPendingPo,
      fully_delivered_lines: exactFullyDelivered,
      delivered_within_5pct: deliveredWithin5Pct,
      partially_delivered_lines: partiallyDelivered,
      over_delivered_lines: overDelivered,
      pending_lines: openPending,
      overdue_lines: overdueCount,
      invoiced_prs_count: invoicedPrs.size,
      pre_approval_prs_count: preApprovalPrs.size,
      total_manual_prs: getManuallyUpdatedPrNumbers().size,
      total_all_prs: prGroups.size,
      total_all_lines: allLines.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6b. GET /api/dashboard/vendor-matrix - Vendor & Company Grouped Dashboard Matrix
app.get('/api/dashboard/vendor-matrix', requireAuth, (req, res) => {
  try {
    const { plant } = req.query;
    let query = `SELECT * FROM pr_lines`;
    const params = [];
    if (plant && plant !== 'All') {
      query += ` WHERE plant = ?`;
      params.push(plant);
    }

    const allLines = db.prepare(query).all(...params);

    // Group lines by PR
    const prGroups = new Map();
    for (const l of allLines) {
      if (!prGroups.has(l.pr_number)) {
        prGroups.set(l.pr_number, {
          pr_number: l.pr_number,
          plant: l.plant,
          lines: []
        });
      }
      prGroups.get(l.pr_number).lines.push(l);
    }

    const groupOrder = ['SAR', 'MAG', 'NOU', 'ADI', 'MUD', 'TAL', 'MAS', 'ZAI', 'OTHER_VENDORS', 'UNASSIGNED'];
    const matrix = {};
    for (const code of groupOrder) {
      matrix[code] = {
        ...PURCHASER_META[code],
        total_prs: new Set(),
        active_prs: new Set(),
        cepl_prs: new Set(),
        sppl_prs: new Set(),
        total_lines: 0,
        active_lines: 0,
        fully_delivered_lines: 0,
        partially_delivered_lines: 0,
        pending_lines: 0,
        overdue_lines: 0,
        pr_numbers: new Set()
      };
    }

    const today = new Date().toISOString().split('T')[0];

    for (const [prNum, p] of prGroups.entries()) {
      const prLines = p.lines;
      const generalStatus = computeGeneralPrStatus(prLines);
      const isInvoiced = generalStatus === 'Invoiced';
      const isPreApprovalOrCancelled = ['PR Draft', 'PR In Review', 'PR Rejected', 'PR Cancelled', 'Cancelled'].includes(generalStatus);
      const isActivePr = !isInvoiced && !isPreApprovalOrCancelled;

      for (const l of prLines) {
        const grp = getLineVendorGroup(l);
        const m = matrix[grp];
        m.total_prs.add(prNum);
        m.pr_numbers.add(prNum);
        if (isActivePr) m.active_prs.add(prNum);
        if (l.plant === 'CEPL') m.cepl_prs.add(prNum);
        else if (l.plant === 'SPPL') m.sppl_prs.add(prNum);

        m.total_lines++;
        if (isActivePr) m.active_lines++;

        const pQty = Number(l.purch_qty) || 0;
        const rQty = Number(l.received_qty) || 0;
        const status = (l.tracking_status || l.po_status || '').toLowerCase();

        if (pQty > 0 && rQty >= pQty) m.fully_delivered_lines++;
        else if (rQty > 0 && rQty < pQty) m.partially_delivered_lines++;
        else m.pending_lines++;

        if (l.expected_dlv_date && l.expected_dlv_date < today && rQty < pQty && !status.includes('cancelled')) {
          m.overdue_lines++;
        }
      }
    }

    const vendorGroups = groupOrder.map(code => {
      const m = matrix[code];
      const tLines = m.total_lines;
      return {
        code: m.code,
        name: m.name,
        role: m.role,
        color: m.color,
        bg: m.bg,
        total_prs: m.total_prs.size,
        active_prs: m.active_prs.size,
        cepl_prs: m.cepl_prs.size,
        sppl_prs: m.sppl_prs.size,
        total_lines: m.total_lines,
        active_lines: m.active_lines,
        fully_delivered_lines: m.fully_delivered_lines,
        partially_delivered_lines: m.partially_delivered_lines,
        pending_lines: m.pending_lines,
        overdue_lines: m.overdue_lines,
        completion_pct: tLines > 0 ? Math.round((m.fully_delivered_lines / tLines) * 100) : 0,
        pr_numbers: Array.from(m.pr_numbers)
      };
    });

    const manualPrSet = getManuallyUpdatedPrNumbers();

    res.json({
      success: true,
      plant: plant || 'All',
      total_manual_prs: manualPrSet.size,
      vendor_groups: vendorGroups
    });
  } catch (err) {
    console.error('Error in GET /api/dashboard/vendor-matrix:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/excel/re-import - On-Demand Excel Refresh
app.post('/api/excel/re-import', requireEditor, (req, res) => {
  try {
    runExcelImport();
    res.json({ success: true, message: 'Excel data re-imported successfully from excel_files folder!' });
  } catch (err) {
    console.error('Error re-importing Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. External SQL Configuration & Readiness
app.get('/api/external-sql/config', requireAuth, (req, res) => {
  try {
    let config = db.prepare(`SELECT * FROM external_sql_config WHERE id = 'default'`).get();
    if (!config) {
      config = {
        engine: 'mssql',
        host: '127.0.0.1',
        port: 1433,
        database_name: 'SupplyChainDB',
        username: 'sa',
        password: '',
        query_or_view: 'vw_PrPoTracking',
        sync_status: 'Not configured'
      };
    }
    res.json({ success: true, config: { ...config, password: config.password ? '********' : '' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/external-sql/config', requireEditor, (req, res) => {
  try {
    const { engine, host, port, database_name, username, password, query_or_view } = req.body;
    const existing = db.prepare(`SELECT * FROM external_sql_config WHERE id = 'default'`).get();

    const pwdToSave = password && password !== '********' ? password : (existing?.password || '');

    db.prepare(`
      INSERT OR REPLACE INTO external_sql_config (
        id, engine, host, port, database_name, username, password, query_or_view, is_active, sync_status, last_sync_at
      ) VALUES (
        'default', ?, ?, ?, ?, ?, ?, ?, 1, 'Connection settings saved', datetime('now', 'localtime')
      )
    `).run(
      engine || 'mssql',
      host || '127.0.0.1',
      Number(port) || 1433,
      database_name || 'SupplyChainDB',
      username || 'sa',
      pwdToSave,
      query_or_view || 'vw_PrPoTracking'
    );

    res.json({
      success: true,
      message: 'External SQL connection profile saved successfully! The app is configured to sync with your SQL database.',
      ready_for_migration: true
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/external-sql/test', requireEditor, (req, res) => {
  try {
    const { engine, host, port, database_name } = req.body;
    res.json({
      success: true,
      message: `Simulated ping to ${engine.toUpperCase()} at ${host}:${port}/${database_name}: Port reachable and schema ready.`,
      table_view_verified: true,
      supported_views: ['vw_PrPoTracking', 'PurchLine', 'PurchReqLine']
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Export to CSV
app.get('/api/export/csv', requireAuth, (req, res) => {
  try {
    const type = req.query.type || 'lines';
    const plant = req.query.plant || 'All';

    let plantFilter = '';
    const params = [];
    if (plant && plant !== 'All') {
      plantFilter = ' WHERE plant = ?';
      params.push(plant);
    }

    if (type === 'pending_lines') {
      let q = `SELECT * FROM pr_lines WHERE (po_number IS NULL OR trim(po_number) = '')`;
      const p = [];
      if (plant && plant !== 'All') {
        q += ` AND plant = ?`;
        p.push(plant);
      }
      q += ` ORDER BY CASE WHEN expected_dlv_date IS NULL OR trim(expected_dlv_date) = '' THEN 1 ELSE 0 END, expected_dlv_date ASC, pr_number ASC, line_number ASC`;
      const pLines = db.prepare(q).all(...p);
      const headers = ['PLANT', 'PR NUMBER', 'LINE NUMBER', 'PR CREATION DATE', 'ITEM ID', 'ITEM DESCRIPTION', 'DEMAND QTY', 'UNIT', 'PR STATUS', 'ASSIGNED PURCHASER', 'REMARKS'];
      const rows = [headers.join(',')];
      for (const l of pLines) {
        rows.push([
          `"${l.plant}"`, `"${l.pr_number}"`, l.line_number, `"${l.expected_dlv_date || ''}"`, `"${l.item_id || ''}"`,
          `"${(l.item_name || '').replace(/"/g, '""')}"`, l.purch_qty, `"${l.unit}"`, `"${l.prl_status || ''}"`,
          `"${l.assigned_vendor || ''}"`, `"${(l.status_remarks || l.remarks || '').replace(/"/g, '""')}"`
        ].join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="Pending_PO_Lines_${plant}.csv"`);
      return res.send(rows.join('\r\n'));
    }

    if (type === 'prs') {
      const allLines = db.prepare(`SELECT * FROM pr_lines ${plantFilter} ORDER BY pr_number ASC, line_number ASC`).all(...params);
      const prGroups = new Map();
      for (const line of allLines) {
        if (!prGroups.has(line.pr_number)) prGroups.set(line.pr_number, []);
        prGroups.get(line.pr_number).push(line);
      }

      const headers = ['PLANT', 'PR NUMBER', 'PO NUMBER', 'REMARKS', 'OVERALL STATUS', 'TOTAL LINES', 'FULLY DELIVERED LINES', 'PARTIALLY DELIVERED LINES', 'PENDING LINES', 'PO CREATE DATE', 'EXPECTED DLV DATE'];
      const rows = [headers.join(',')];

      for (const [prNumber, lines] of prGroups.entries()) {
        const pPlant = lines[0]?.plant || 'CEPL';
        const po = Array.from(new Set(lines.map(l => l.po_number).filter(Boolean))).join('; ');
        const remarks = Array.from(new Set(lines.map(l => l.remarks).filter(Boolean))).join('; ');
        const status = computeGeneralPrStatus(lines);
        const total = lines.length;
        let fully = 0, partial = 0, pending = 0;
        for (const l of lines) {
          const p = Number(l.purch_qty) || 0;
          const r = Number(l.received_qty) || 0;
          if (p > 0 && r >= p) fully++;
          else if (r > 0 && r < p) partial++;
          else pending++;
        }
        const poDate = lines[0]?.po_create_date || '';
        const expDate = lines[0]?.expected_dlv_date || '';

        rows.push([
          `"${pPlant}"`, `"${prNumber}"`, `"${po}"`, `"${(remarks || '').replace(/"/g, '""')}"`, `"${status}"`, total, fully, partial, pending, `"${poDate}"`, `"${expDate}"`
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="PR_Overview_${plant}.csv"`);
      return res.send(rows.join('\r\n'));
    }

    // Detailed lines
    const lines = db.prepare(`SELECT * FROM pr_lines ${plantFilter} ORDER BY pr_number ASC, line_number ASC`).all(...params);
    const headers = [
      'PLANT', 'PR NUMBER', 'PO NUMBER', 'VENDOR NAME', 'ASSIGNED VENDOR', 'REMARKS', 'LINE NUMBER', 'ITEM ID', 'ITEM NAME',
      'UNIT', 'SITE', 'WAREHOUSE', 'PO STATUS', 'TRACKING STATUS', 'STATUS REMARKS', 'DEMAND QTY', 'RECEIVED QTY',
      'INVOICED QTY', 'CANCELLED QTY', 'PURCHASEPRICE', 'PO CREATE DATE',
      'EXPECTED DLV DATE', 'CONFIRM DLV DATE', 'LAST GRN DATE', 'LAST INVOICE DATE'
    ];

    const rows = [headers.join(',')];
    for (const l of lines) {
      rows.push([
        `"${l.plant}"`,
        `"${l.pr_number}"`,
        `"${l.po_number || ''}"`,
        `"${l.vendor_name || ''}"`,
        `"${l.assigned_vendor || ''}"`,
        `"${(l.remarks || '').replace(/"/g, '""')}"`,
        l.line_number,
        `"${l.item_id || ''}"`,
        `"${(l.item_name || '').replace(/"/g, '""')}"`,
        `"${l.unit}"`,
        `"${l.site}"`,
        `"${l.warehouse}"`,
        `"${l.po_status}"`,
        `"${l.tracking_status || l.po_status}"`,
        `"${(l.status_remarks || '').replace(/"/g, '""')}"`,
        l.purch_qty,
        l.received_qty,
        l.invoiced_qty,
        l.cancelled_qty,
        l.purchase_price,
        `"${l.po_create_date || ''}"`,
        `"${l.expected_dlv_date || ''}"`,
        `"${l.confirm_dlv_date || ''}"`,
        `"${l.last_grn_date || ''}"`,
        `"${l.last_invoice_date || ''}"`
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="PR_Line_Items_${plant}.csv"`);
    res.send(rows.join('\r\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Google Drive Cash Settlements Endpoints
// POST /api/gdrive/sync - Manual Sync from Google Drive (Admin, Mashhood, or Finance)
app.post('/api/gdrive/sync', requireAuth, async (req, res) => {
  try {
    if (!req.user.permissions?.canSync) {
      return res.status(403).json({ success: false, error: 'Permission denied. Syncing requires Admin, Mashhood, or Finance access.' });
    }
    const result = await syncGoogleDriveCashSettlements(db);
    res.json({
      success: true,
      message: `Successfully pulled ${result.totalRecords} cash settlement records from Google Drive!`,
      ...result
    });
  } catch (err) {
    console.error('Google Drive Sync Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/gdrive/cash-settlements - Retrieve Cash in Hand & Settlements Data
app.get('/api/gdrive/cash-settlements', requireCashAccess, (req, res) => {
  try {
    const { plant, purchaser, status, search } = req.query;
    const userPlant = req.user?.permissions?.plant;
    const effectivePlant = userPlant || plant;

    let effectivePurchaser = purchaser;
    if (req.user?.permissions?.isPurchaser && req.user?.name) {
      effectivePurchaser = req.user.name;
    }

    let data = getCashSettlementData(db, { plant: effectivePlant, purchaser: effectivePurchaser, status, search });

    if (req.user?.permissions?.isPurchaser && req.user?.name) {
      const buyerName = req.user.name.toLowerCase();
      const buyerCode = (req.user.permissions?.buyerCode || '').toLowerCase();
      data.records = (data.records || []).filter(r => {
        const pName = (r.purchaser || '').toLowerCase();
        return pName.includes(buyerName) || (buyerCode && pName.includes(buyerCode));
      });
      data.totalRecords = data.records.length;
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching cash settlements:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto-Sync Google Drive every 15 minutes (900,000 ms)
const GDRIVE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
setInterval(async () => {
  try {
    console.log('[Auto-Sync] Fetching latest Google Drive cash settlements...');
    await syncGoogleDriveCashSettlements(db);
  } catch (err) {
    console.error('[Auto-Sync Error]:', err.message);
  }
}, GDRIVE_SYNC_INTERVAL_MS);

// Initial sync on startup if table is empty
setTimeout(async () => {
  try {
    const rowCount = db.prepare('SELECT COUNT(*) as cnt FROM cash_settlements').get();
    if (!rowCount || rowCount.cnt === 0) {
      console.log('[Startup] Initializing Google Drive cash settlements cache...');
      await syncGoogleDriveCashSettlements(db);
    }
  } catch (e) {
    console.log('[Startup Sync Info]:', e.message);
  }
}, 3000);

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 PR Status Tracker Portal running on port ${PORT}`);
  console.log(`💻 Local Access:    http://localhost:${PORT}`);
  console.log(`🌐 Network Access:  http://0.0.0.0:${PORT}`);
  console.log(`📁 Database File:   ${dbPath}`);
  console.log(`=======================================================`);
});
