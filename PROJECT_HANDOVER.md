# PR Status Tracker — Project Handover & Hosting Guide

This document is for developer and AI assistant handover when migrating and hosting the **PR Status Tracker** portal on another PC or server.

---

## 1. Project Overview & Current Architecture

- **Application Type**: Full-stack Supply Chain & Procurement Requisition Tracker with Dynamics AX ERP integration.
- **Backend**: Node.js (`server.js`) utilizing native `node:sqlite` (`DatabaseSync`) — zero external native build tools required.
- **Database**: Local SQLite database located at `./data/pr_tracker.db`.
  - Holds all PR header and line data across **CEPL** and **SPPL** plants.
  - Holds full audit history in `pr_status_history`.
  - Preserves manual tracking updates, custom remarks, and purchaser assignments across re-imports.
- **Frontend**: Single-Page Application in `./public/` (`index.html`, `styles.css`, `app.js`).
- **Excel Ingestion**: `./import_excel.js` reads files from `./excel_files/`.

---

## 2. Established ERP Business Rules & Customizations

1. **Active PRs Exclusion**:
   - Requisitions marked as **`Invoiced`** in Dynamics AX are settled/closed and are excluded from active counts and line metrics.
   - Requisitions with `PRL STATUS` in `['Draft', 'InReview', 'Rejected', 'Cancelled']` are pre-approval and excluded from active counts.
2. **Delivery Categorization (±5% Tolerance)**:
   - **Exact Fully Delivered**: `received_qty == purch_qty`.
   - **Within ±5% Tolerance**: `0.95 * purch_qty <= received_qty <= 1.05 * purch_qty`.
   - **Partial Delivery**: `0 < received_qty < 0.95 * purch_qty` (>5% shortage).
   - **Over-delivered**: `received_qty > 1.05 * purch_qty` (>5% excess).
3. **Purchaser Auto-Assignment & External Vendors**:
   - The 8 internal purchasers are: `SAR` (Sarfraz Ahmad), `MAG` (Maghfoor Ahmad), `NOU` (Nouman Khan), `ADI` (Adil Mahmood), `MUD` (Mudassir Ghauri), `TAL` (Talha Baig), `MAS` (Mashhood), and `ZAI` (Muhammad Zain).
   - If a PR has a PO made and the vendor name matches any of the 8 purchasers (with flexible fuzzy matching handling cash purchase suffixes and spelling variations like `MUDASSER`), `assigned_vendor` is set to that purchaser's 3-letter code.
   - If the PO is issued to an external supplier (e.g. *Fast Cables*, *Ammar Industries*), `assigned_vendor` is left empty (`-- Unassigned --`).
   - Manual user assignments remain fully editable via inline dropdowns and are preserved during Excel re-syncs.
4. **Vendor & Company Matrix Dashboard**:
   - Accessible via the **`📊 Vendor Matrix`** tab in the header.
   - Groups PRs across the 8 purchasers, `OTHER_VENDORS`, and `UNASSIGNED`, sliced by company (**CEPL** vs **SPPL**).
5. **Manually Updated PRs Quick Button**:
   - Header button **`✍️ Manually Updated (32)`** immediately filters the table to requisitions with user status/remark updates.

---

## 3. How to Run & Host on This PC

### Quick Start
1. Ensure **Node.js (v20+ or v22+)** is installed on this PC.
2. Open terminal in this folder and run:
   ```bash
   node server.js
   ```
   *Or double-click `start.bat`.*
3. Open browser at: `http://localhost:3000`

### Access from Other Devices on Same Wi-Fi / LAN
1. Run `allow-firewall-port-3000.bat` as Administrator to allow incoming connections on port 3000.
2. Find this PC's local IP address:
   ```bash
   ipconfig
   ```
   *(Look for IPv4 Address, e.g. `192.168.1.50`).*
3. Other devices on the same Wi-Fi can now open:
   ```
   http://<YOUR-IP-ADDRESS>:3000
   ```

### 24/7 Background Hosting (Always Running)
To keep the server running in the background without keeping a terminal open:
```bash
npm install -g pm2
pm2 start server.js --name "pr-tracker"
pm2 save
pm2 startup
```

### Making It Accessible from Anywhere ("On Air" over Internet)
Use **Cloudflare Tunnel** (free, secure, no open ports required):
1. `cloudflared` is installed.
2. Double click `start-cloudflared-tunnel.bat` or run:
   ```bash
   cloudflared tunnel --edge-ip-version 4 --protocol http2 --url http://localhost:3000
   ```

---

## 4. Authentication & Security (Role-Based Access Control)

The application features a secure login greeting overlay on all incoming connections:

| Role | Password | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **Viewer** | *(None)* | **Read-Only** | Instant 1-click access via "Continue as Viewer". Can view PRs, KPIs, vendor matrix, and history. All editing, status updates, purchaser reassignments, and Excel syncing are blocked. |
| **Procurement Engineer** | `12345567` | **Total Access** | Full rights to update line tracking status, remarks, assigned purchasers, bulk update lines, and sync Excel. |
| **Procurement Manager** | `12345678` | **Total Access** | Full administrative and editing rights across the entire portal. |

- **Session Persistence**: Sessions are saved in SQLite (`auth_sessions`), preserving logged-in status across browser refreshes.
- **Backend Protection**: All modifying API endpoints (`PATCH /api/lines/:id/status`, `PATCH /api/lines/:id/assigned-vendor`, `POST /api/lines/bulk-status`, `POST /api/excel/re-import`, `POST /api/external-sql/*`) enforce `403 Forbidden` if invoked with a Viewer role.

---

## 5. Mobile Device Optimization (Essential View Mode)

The frontend automatically detects smartphone and tablet screens (`<= 768px`) and presents an **Essential Mobile View**:
- **Requisitions Overview**: Replaces the 13-column master table with streamlined **Mobile Cards** highlighting:
  - Plant badge (`CEPL` / `SPPL`)
  - PR Number (e.g. `PR #102431`)
  - General status pill (`Fully Received`, `Open order`, `Partially Delivered`)
  - PO Number & Assigned Purchaser
  - Delivery Progress bar + line delivery count (`X/Y lines delivered`)
  - Expected Delivery Date (with `OVERDUE` alert if past due)
  - Direct touch buttons: `Open Lines (N) ➔` and `🕒 History`
- **PR Detail View**: Condenses 22 table columns into clean **Line Item Cards** showing item name, line #, demand vs received vs invoiced quantities, progress notes, and one-touch status update buttons for editors.
- **Micro-Grid KPI Banner**: Compact 2-column grid saving 75% vertical screen space.
- **Desktop Preservation**: Desktop users (`> 768px`) continue to see the full 13-column master spreadsheet table and 22-column line table with column toggles completely unchanged.

---

## 6. Prompt to Give Antigravity on This PC

When opening this project in Antigravity on a new machine, paste this message to Antigravity:

> *"Hello Antigravity! I have moved the PR Status Tracker project to this PC to host it. Please read `PROJECT_HANDOVER.md` and `walkthrough.md` to understand our architecture, ERP business rules, and database setup. Check if Node.js is ready, start the server on port 3000, and verify the endpoints."*
