# PR Status Tracker & Procurement Lifecycle Portal

A high-performance, enterprise-grade web application to track Purchase Requisitions (PR) and Purchase Orders (PO) across multiple manufacturing plants (**CEPL** and **SPPL**) at both the **Consolidated PR Overview Level** and the **Line-Level Item Tracking Level**, featuring **Multi-Line Bulk Updates**, **3-Letter Purchaser Assignment**, **Status Evolution Audit Trails**, and **External SQL Database Readiness**.

---

## 🌟 Key Features

### 1. Multi-Plant Procurement Hub (CEPL & SPPL)
- Seamlessly switches between **All Plants**, **🏭 CEPL**, and **🏭 SPPL**.
- KPI banner displaying active PRs, lines with PO, pending POs, delivery completions, and overdue items in real time.

### 2. Consolidated PR Overview (Requisition-Level)
- Lists each PR **exactly once** with rollup progress indicators:
  - Overall Requisition Status (`Invoiced`, `Fully Received`, `Partially Delivered`, `Open order`, `Pending PO Creation`, `Overdue`)
  - `Total Lines`, `Fully Delivered`, `Partially Delivered`, and `Pending / Open` counts
  - Visual completion progress bar
  - Requisition Demand / Purpose remarks
  - PO creation date & earliest expected delivery date with overdue tags
  - Direct 1-click drill-down into detailed line items

### 3. Detailed Line-Level Tracking & Strict Data Immutability
- All ERP baseline columns are strictly protected and non-deletable.
- Interactive **`STATUS & REMARKS (TRACKING)`** column:
  - Update tracking status (e.g. *Vendor Dispatched*, *At Factory Gate*, *Under Inspection*, *Received*, *Invoiced*, *Delayed*, *Cancelled*).
  - Add dispatch details, vehicle tracking numbers, and progress notes.
- **Assigned Vendor / Purchaser**:
  - Assign any of the 8 purchasers using standard 3-letter codes:
    - **`SAR`** (Sarfraz)
    - **`MAG`** (Maghfoor)
    - **`NOU`** (Nouman)
    - **`ADI`** (Adil)
    - **`MUD`** (Mudassir)
    - **`TAL`** (Talha)
    - **`MAS`** (Mashhood)
    - **`ZAI`** (Zain)
  - Inline table dropdown + modal selection.

### 4. ⚡ Multi-Line Selection & Bulk Updates
- Update 5, 10, or all lines of a PR in a single action!
- Dedicated checkbox column + **"Select All"** header toggle.
- Floating bulk action bar showing selected count.
- Bulk update window allows setting **Status**, **Assigned Vendor**, and **Shared Remarks** across all selected lines.
- **100% Audit Integrity**: Every line maintains its own independent history record with timestamps and author info.

### 5. Column Tuck-In / Toggle System
- Clean, uncluttered interface with toggleable columns:
  - `[ ] Remarks`
  - `[ ] Site & Warehouse`
  - `[ ] Vendor Name`
  - `[ ] Assigned Vendor`
  - `[ ] Cancelled Qty`
  - `[ ] Purchase Price`
  - `[ ] Milestone Dates (PO Date, Expected Date, Last GRN, Last Invoice)`

### 6. Chronological Status Evolution Audit Trail
- Every status or vendor change is permanently logged in the database.
- Click **"🕒 History"** on any row or PR to view a visual vertical timeline of all lifecycle changes.

### 7. Dual Data Source Architecture
- **Excel Sync**: Automatically imports Dynamics AX / 365 reports from `excel_files/`.
- **External SQL Database Ready**: Pre-configured with database view scripts and connection profiles for Microsoft SQL Server, MySQL, and PostgreSQL.

---

## 🚀 How to Run

### Quick Launch (Windows)
Double-click `start.bat` in this folder. It will launch the application and open your web browser.

### Command Line
```bash
# 1. Install dependencies
npm install

# 2. Start the application
npm start
```

Access the portal in your browser at:
🌐 **`http://localhost:3000`**

---

## 📁 Project Structure

```text
pr-status-tracker/
├── excel_files/                  # ERP export Excel files (CEPL & SPPL)
│   ├── PO_Detail_Report_CEPL.xlsx
│   ├── PR_Detail_Report_CEPL.xlsx
│   ├── PO_Detail_Report_SPPL.xlsx
│   └── PR_Detail_Report_SPPL.xlsx
├── data/
│   └── pr_tracker.db             # High-performance SQLite database (WAL mode)
├── public/
│   ├── index.html                # Responsive web portal interface
│   ├── styles.css                # Modern ERP styling & floating bulk bar
│   └── app.js                    # Dynamic frontend controller & batch logic
├── server.js                     # Express REST API & SQLite data layer
├── import_excel.js               # Excel parser & auto-assignment pipeline
├── package.json                  # Dependencies & scripts
└── start.bat                     # Windows one-click launcher
```

---

## 🔒 Security & Data Integrity

- Immutability: ERP financial and quantity baseline values cannot be edited or deleted through the interface.
- Audit Trail: All tracking modifications are version-stamped with author and timestamp.
- Atomic Transactions: Bulk line updates execute within database transactions to ensure zero partial writes.
