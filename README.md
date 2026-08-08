# Fresko Staff Portal — Technical README

**Version:** 4.0 (August 2026)
**Hosted at:** https://devfresko.github.io/staff-portal/
**Stack:** GitHub Pages (PWA frontend) + Google Apps Script (backend API) + Google Sheets (database)
**Built by:** Autoworkflow LLP (`@autoworkflowllp`)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Google Sheets — Database Structure](#2-google-sheets--database-structure)
3. [Apps Script — Backend (Code.gs)](#3-apps-script--backend-codegs)
4. [AppConfig — All Configurable Settings](#4-appconfig--all-configurable-settings)
5. [Frontend Modules (index.html)](#5-frontend-modules-indexhtml)
6. [Role & Permission System](#6-role--permission-system)
7. [WhatsApp Automation](#7-whatsapp-automation)
8. [PWA Setup (manifest + service worker)](#8-pwa-setup-manifest--service-worker)
9. [Deployment Checklist](#9-deployment-checklist)
10. [Recent Changes (v4.0)](#10-recent-changes-v40)
11. [Known Setup Steps (One-Time)](#11-known-setup-steps-one-time)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Pages  (devfresko.github.io/staff-portal/)      │
│  ├── index.html   — Single-file SPA (all JS + CSS)     │
│  ├── manifest.json — PWA config                         │
│  ├── sw.js         — Service Worker (offline cache)     │
│  └── icon-*.png    — App icons (180, 192, 512px)        │
└──────────────────────┬──────────────────────────────────┘
                       │ fetch POST (JSON)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Google Apps Script  (Web App — Execute as: Me)         │
│  Code.gs  — Single file, doPost handler                 │
│  ├── _callFn()   — Routes all actions to functions      │
│  ├── AppConfig   — Runtime config (from Sheet)          │
│  ├── CacheService — 10-min sheet caching                │
│  └── UrlFetchApp — WhatsApp API calls                   │
└──────────────────────┬──────────────────────────────────┘
                       │ getSheetData / appendRow
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Google Sheets (3 spreadsheets)                         │
│  ├── MASTER_SHEET       — Staff, Tasks, Delegation      │
│  ├── CHECKLIST_MASTER   — Daily checklist logs          │
│  └── ATTENDANCE_SHEET   — Punch records, leaves         │
└─────────────────────────────────────────────────────────┘
```

**API pattern:** Every frontend call goes through `_gas(actionName, [args], successCb, errorCb)` → `fetch POST` → GAS `doPost` → `_callFn(action, args)` → individual function.

---

## 2. Google Sheets — Database Structure

### 2A. MASTER Sheet (`MASTER_SHEET_ID`)

| Tab Name | Purpose | Key Columns |
|----------|---------|-------------|
| **Doer List** | All employees — master directory | `Emp ID`, `Name`, `Department`, `Office Email`, `Password`, `Role`, `Phone`, `Mobile`, `PHOTO`, `NeedAttendance`, `Week Off Day`, `Office IN`, `Office OUT` |
| **Task List** | Recurring task setup | `Setup Task ID`, `Task`, `Assigned To` (Emp ID), `Department`, `Frequency` (D/W/F/M), `Delete Repeated Task` |
| **Delegation** | All delegated tasks | `Task ID`, `Task Description`, `Delegated To`, `Delegated By`, `First Date`, `Final Date`, `Status`, `Revision 1`, `Revision 2` |
| **AppConfig** | Runtime settings (key-value) | `Key`, `Value` — see §4 for full list |
| **Holiday List** | Company holidays | `Date`, `Holiday Name` |
| **Announcements** | Company notices | `Title`, `Body`, `Posted By`, `Posted At`, `Expires At` |
| **EMWeeklyScore** | Weekly meeting commitments | `Record ID`, `Emp ID`, `Week`, `Commitment`, `Status`, `Score` |
| **EMIncrementAppraisal** | Salary appraisal records | `Appraisal ID`, `Emp ID`, `Date`, `Old Salary`, `New Salary`, `Notes` |
| **Payroll** | Monthly salary records | `payroll_id`, `emp_id`, `emp_name`, `dept`, `month`, `basic_salary`, `hra`, `conveyance`, `other_allowances`, `gross_salary`, `pf_deduction`, `esi_deduction`, `tds`, `other_deductions`, `total_deductions`, `net_salary`, `payment_date`, `payment_mode`, `remarks`, `status`, `approved_by`, `created_at` |
| **Week List** | Weekdays config | Used for weekly task generation |
| **Working Day Calender** | Calendar overrides | Custom working days |

> **`Week Off Day` column in Doer List** — Values: `Sunday` / `Saturday` / `Monday` etc., or `0`–`6` (0=Sun, 6=Sat). Default = Sunday if blank. Used for per-employee weekly off in all attendance reports and muster grid.

### 2B. CHECKLIST_MASTER Sheet (`CHECKLIST_MASTER_ID`)

| Tab Name | Purpose | Key Columns |
|----------|---------|-------------|
| **Checklist** | Full historical log (all dates) | `Task ID`, `UID In TaskLIst`, `Name Id`, `Name`, `Department`, `Task`, `Freq`, `Planned`, `Status`, `Actual`, `Transferred To`, `Transfer By`, `Transferred At`, `Transfer Reason`, `Remark` |
| **Checklist_Today** | Today's snapshot (auto-refreshed) | Same columns as Checklist |

> **`Remark` column** — Added automatically by `markTaskDone()` if not present. Staff can leave an optional completion note when marking a task Done.

### 2C. ATTENDANCE Sheet (`NEW_ATTENDANCE_SHEET_ID`)

| Tab Name | Purpose | Key Columns |
|----------|---------|-------------|
| **Daily-Attendance** | Punch records | `emp_id`, `emp_name`, `dept`, `date`, `check_in`, `check_out`, `total_hours`, `status` (Present / Half Day / Absent), `late_mins`, `location_lat`, `location_lng` |
| **leave_requests** | Leave applications | `leave_id`, `emp_id`, `emp_name`, `dept`, `leave_type`, `from_date`, `to_date`, `days`, `reason`, `status`, `remark`, `approved_by`, `approved_at` |
| **regularization_requests** | Punch correction requests | `reg_id`, `emp_id`, `date`, `req_in`, `req_out`, `reason`, `status`, `remark`, `approved_by` |

---

## 3. Apps Script — Backend (Code.gs)

### 3A. Sheet ID Constants (top of file — change these)

```javascript
var MASTER_SHEET_ID       = '1gNTj4PlVkeT1ApSWiP1DzQ5vXv8vK0ae9gY8TPgRRFI';
var CHECKLIST_MASTER_ID   = '1gaL0-UZ_Hx868Xly1oq6VYhJolyZV9WtKQ1hxLfVHqw';
var NEW_ATTENDANCE_SHEET_ID = '16L75-L3gjZAS2__4pVN2jvc3x_FjDQr4hb_fh3vrcWE';
```

### 3B. WhatsApp API Constants (top of file)

```javascript
var WA_API_KEY    = '01de01ec7d489783060e2fdc535a87ca5e963b7baba7e95ff3';
var WA_BASIC_AUTH = 'ZnJlc2tvOkFHUk9AQEAyMDI2';   // Base64(username:password)
var WA_API_URL    = 'https://app.messageautosender.com/api/v1/message/create';
// MessageAutoSender login: Fresko / AGRO@@@2026
```

> These can be overridden via AppConfig keys `WA_API_KEY` and `WA_BASIC_AUTH`.

### 3C. All Registered API Functions

| Category | Function | Who Can Call | Description |
|----------|----------|-------------|-------------|
| **Auth** | `getAllData` | All | Login + bulk data load at startup |
| **Dashboard** | `getDashboardStats`, `getDashboardStatsFresh` | All | KPI cards + activity |
| **Checklist** | `getTodayTasks` | All | My tasks for today (includes `remark` field) |
| | `getWeeklyTasks` | All | Weekly task history |
| | `getTaskHistory` | All | Full history log (includes `remark`) |
| | `markTaskDone` | All | Mark task done + save optional remark |
| | `getTaskSetup` | Manager | Task master list |
| | `saveNewTask` | Manager | Add recurring task |
| | `deactivateTask` | Manager | Remove task |
| | `portalGenerateChecklist` | Manager | Force-generate today's checklist |
| | `getDeptTasks` | Manager | All department tasks |
| | `getTeamChecklistToday` | Manager | Team checklist view (includes `remark`) |
| | `markTeamTaskDone` | Manager | Mark team member's task done |
| | `transferChecklistTask` | Manager | Transfer task to another employee |
| | `getChecklistAnalytics`, `getChecklistAnalyticsV2` | Manager | Analytics + drill-down (includes `remark`) |
| **Delegation** | `getMyDelegations` | All | Tasks delegated TO me |
| | `getMyDelegatedOut` | Manager | Tasks I delegated OUT |
| | `getAllDelegations` | Manager | All delegations (filters by **Final Date** / due date) |
| | `createDelegation` | Manager | Create new delegation |
| | `updateDelegationStatus` | All | Complete / cancel |
| | `requestDateRevision` | All | Request shift (max 2 revisions) |
| | `getDelegationAnalytics`, `getDelegationAnalyticsV2` | Manager | Analytics |
| | `managerCompleteDelegation` | Manager | Mark done on behalf |
| | `managerShiftDelegation` | Manager | Shift due date |
| **Attendance** | `getTodayAttendanceStatus` | All | My punch status today |
| | `getMyAttendance` | All | My attendance history |
| | `recordCheckIn` | All | GPS + time validated punch-in |
| | `recordCheckOut` | All | Punch-out + hours calc |
| | `validateGpsForAttendance` | All | Check if in office radius |
| | `getTeamAttendanceStatus` | Manager | Team's today status |
| | `markStaffAttendance` | Manager | Override attendance |
| | `getAttendanceAnalytics`, `getAttendanceAnalyticsV2` | Manager | Reports |
| | `getMusterReport` | Manager | Monthly summary |
| | `getMusterGrid` | Manager | Per-day matrix (respects `Week Off Day`) |
| **Leave** | `requestLeave` | All | Apply for leave |
| | `getLeaveRequests` | All/Manager | View requests |
| | `cancelLeaveRequest` | All | Cancel own request |
| | `approveLeaveRequest` | Manager | Approve / reject |
| | `getLeaveSummary` | Manager | Summary analytics |
| | `getLeaveBalance` | All | My leave balance |
| **Regularization** | `requestRegularization` | All | Punch correction |
| | `getRegularizationRequests` | All/Manager | View requests |
| | `approveRegularization` | Manager | Approve / reject |
| **EM Dashboard** | `getEMDashboard` | Manager | All-doers overview (Delegation: Due/Shifted only) |
| | `getEMDoerDetail` | Manager | Drill-down for one employee |
| **Weekly Meeting** | `saveWeeklyCommitment` | Manager | Add commitment |
| | `getWeeklyCommitments` | Manager | History (supports date filters) |
| | `updateCommitmentStatus` | Manager | Mark Met / Partial / Not Met |
| **Payroll** | `getPayroll` | Manager | Monthly salary sheet |
| | `savePayroll` | Manager | Add / update salary record |
| | `updatePayrollStatus` | **Owner only** | Mark as Paid |
| **Directory** | `getDoerList` | All | Employee list (includes `phone`, `week_off_day`) |
| | `getEmployeeDirectory` | Manager | Full directory with stats |
| **Other** | `getHolidayList` | All | Public holidays |
| | `getAnnouncements` | All | Notices |
| | `postAnnouncement` | Manager | Post notice |
| | `getTodayCelebrations` | All | Birthdays / anniversaries |
| | `getMyProfile` | All | My profile |
| | `changePassword` | All | Update password |
| | `getAllAppConfigForFrontend` | All | Runtime config |
| | `getPayroll` | Manager | Payroll records |

---

## 4. AppConfig — All Configurable Settings

Stored in **MASTER Sheet > AppConfig tab** as `Key | Value` pairs.

| Key | Default | Description |
|-----|---------|-------------|
| `COMPANY_NAME` | `Fresko` | Shown in login screen + WhatsApp messages |
| `TIMEZONE` | `Asia/Kolkata` | All date/time operations |
| `MASTER_PASSWORD` | `fresko@2026` | Override password for all accounts |
| `WORK_START_TIME` | `09:00` | Shift start (24h format) |
| `WORK_END_TIME` | `18:00` | Shift end |
| `LATE_THRESHOLD_MINS` | `15` | Minutes after `WORK_START_TIME` = Late |
| `HALF_DAY_THRESHOLD_HRS` | `6.0` | Hours below = Half Day, above = Full Day |
| `GPS_ATTENDANCE` | `Yes` | Enable GPS-enforced check-in (`Yes` / `No`) |
| `OFFICE_LOC1_LAT` | — | Office 1 latitude |
| `OFFICE_LOC1_LNG` | — | Office 1 longitude |
| `OFFICE_LOC1_RADIUS_KM` | `0.05` | Allowed radius in km (50m default) |
| `OFFICE_LOC1_NAME` | `Office 1` | Display name |
| `OFFICE_LOC2_LAT/LNG/RADIUS_KM/NAME` | — | Second office location (optional) |
| `LEAVE_TYPES` | `CL,SL,PL,LWP` | Comma-separated leave types |
| `SESSION_HOURS` | `8` | Standard working hours per day |
| `SKIP_SUNDAYS` | `Yes` | Skip Sundays in checklist generation |
| `WA_API_KEY` | *(hardcoded)* | MessageAutoSender API key override |
| `WA_BASIC_AUTH` | *(hardcoded)* | MessageAutoSender Basic Auth override |
| `WA_CHECKIN_NOTIFY` | `Yes` | Send WA on check-in/check-out |
| `WA_LATE_ALERT` | `Yes` | Send late alert to managers |
| `WA_GPS_BLOCK_NOTIFY` | `Yes` | Notify when GPS check-in blocked |
| `DRIVE_INDEX_HTML` | — | Google Drive file ID for HTML serving (legacy) |

**Per-employee overrides** (in Doer List, not AppConfig):

| Column | Description |
|--------|-------------|
| `Office IN` | Employee's shift start (e.g. `09:00`) |
| `Office OUT` | Employee's shift end (e.g. `18:00`) |
| `NeedAttendance` | Set `No` to exclude from all attendance reports |
| `Week Off Day` | `Sunday` (default), `Saturday`, `Monday`, or `0`–`6` |

---

## 5. Frontend Modules (index.html)

Single HTML file — all CSS, JS, and markup inline. Served from GitHub Pages.

### 5A. All Sidebar Modules

| Module | Route | Access | Description |
|--------|-------|--------|-------------|
| Dashboard | `dash` | All | KPI cards, activity, celebrations |
| Activity Feed | `feed` | All | Recent actions stream |
| Announcements | `ann` | All | Company notices |
| Checklist | `check` | All | My daily tasks — mark done with optional remark |
| Delegation | `deleg` | All | Tasks assigned to me / by me |
| Attendance & Leave | `attend` | All | Punch in/out, history |
| Leave Management | `leave` | All | Apply, view balance, approvals |
| Holiday Calendar | `holcal` | All | Full-year holiday view |
| My Profile | `profile` | All | Profile info + change password |
| **EM Dashboard** | `em` | Manager+ | All-doers: Checklist + Delegation + Attendance |
| Employee Directory | `empdir` | Manager+ | Team cards + table with phone + call button |
| Checklist Analytics | `clana` | Manager+ | Completion %, drill-down (with remark column) |
| Delegation Analytics | `delana` | Manager+ | Stats, overdue, completion rate |
| Attendance Analytics | `attana` | Manager+ | Trend charts, heatmaps |
| Muster Report | `muster` | Manager+ | Per-employee per-day grid (Week Off Day aware) |
| **Payroll** | `payroll` | Manager+ | Monthly salary sheet, add/edit, mark paid |
| Weekly Meeting | `emwm` | Manager+ | Commitments tracker (with date filters) |

### 5B. Key Frontend Functions

| Function | What It Does |
|----------|-------------|
| `_gas(fn, args, ok, err)` | All API calls — POST to GAS, handles auth/token |
| `_markDone(rowId)` | Opens remark modal → `markTaskDone` with optional remark |
| `_loadV(view)` | Route to any module |
| `_vPayroll()` | Payroll page — month selector → salary table |
| `_prLoad()` | Load payroll records for selected month |
| `_prRender(data, month)` | Render dept-grouped salary table + grand totals |
| `_prAddRow()` | Add employee salary record modal (live net preview) |
| `_prEdit(id, name)` | Edit existing salary record |
| `_prMarkPaid(id, name)` | Owner-only: mark salary as Paid |
| `_prExportCSV()` | Download payroll as CSV |
| `_wmLoadHistory()` | Weekly meeting history (emp + dept + status + **date** filters) |
| `_wmClearFilters()` | Reset all WM filters |
| `_renderDelegCards(dels, pane, isOut)` | Delegation cards (Overdue → Pending → Shifted → Done) |
| `_isOwner()` | Returns true if logged-in user role === OWNER |
| `_isManager()` | Returns true if OWNER or MANAGER |
| `_prFmt(n)` | Format number as Indian locale (e.g. `₹15,000`) |

### 5C. Delegation Date Filter (important)

The **Delegation module** (`getAllDelegations`) filters by **Final Date (due date)**, not by First Date (assigned date). This means:

- Date range picker → shows tasks **due** in that range
- A task created on 1 Jan but due on 15 Feb will appear when you filter Feb, not Jan
- **EM Dashboard Delegation tab** shows only: Completed, Shifted, or Pending tasks where `due date ≤ today`

---

## 6. Role & Permission System

| Role | Code | Can Do |
|------|------|--------|
| `STAFF` | Default | My Checklist, My Attendance, My Delegation, My Profile, Leave |
| `COORDINATOR` | Hybrid | All Staff + mark team attendance, team checklist |
| `MANAGER` | Senior | All above + EM Dashboard, Analytics, Delegation Out, Payroll (view/add), Directory, Muster |
| `OWNER` | Admin | All above + mark Payroll as Paid, approve regularization/leave |

Set in **Doer List > Role** column. Case-sensitive: use `OWNER`, `MANAGER`, `COORDINATOR`, `STAFF`.

---

## 7. WhatsApp Automation

Uses **MessageAutoSender** API (`app.messageautosender.com`).

**Login:** Username: `Fresko` / Password: `AGRO@@@2026`

**API type:** GET request with query params (not POST body) — critical requirement.

### Automation Triggers

| Trigger | Recipient | AppConfig Key | Default |
|---------|-----------|--------------|---------|
| Check-in recorded | Employee | `WA_CHECKIN_NOTIFY` | Yes |
| Check-out recorded | Employee | `WA_CHECKIN_NOTIFY` | Yes |
| Late arrival | Managers (OWNER role) | `WA_LATE_ALERT` | Yes |
| GPS block (outside radius) | Employee | `WA_GPS_BLOCK_NOTIFY` | Yes |
| Birthday / Anniversary | Employee | — (via `sendCelebrationWishes`) | Always |

### Phone Number Source

GAS looks up phone from **Doer List > `Phone`** (or `Mobile`) column via `_waPhone(empCode)`. If blank, WA message is skipped silently.

### Testing WA

In Apps Script editor, run:
```javascript
testWhatsAppMessage()      // Send test to your number (MY_NUMBER constant)
testManagerWhatsApp()      // Test manager-to-staff send
```

---

## 8. PWA Setup (manifest + service worker)

**manifest.json:**

```json
{
  "name": "Fresko Staff Portal",
  "short_name": "Fresko",
  "start_url": "./index.html?pwa=1",
  "display": "standalone",
  "theme_color": "#005F73",
  "background_color": "#005F73"
}
```

**sw.js (Service Worker v4):**
- Caches: `index.html`, `manifest.json`, FontAwesome CSS, Chart.js
- **Never caches** GAS API calls (`script.google.com`)
- HTML: network-first, cache fallback
- CDN assets: cache-first, background update

**Icons required:**
- `icon-180.png` — Apple touch icon
- `icon-192.png` — Android home screen
- `icon-512.png` — Splash / Play Store

---

## 9. Deployment Checklist

### First-Time Setup

- [ ] Create 3 Google Sheets: Master, Checklist Master, Attendance
- [ ] Paste Sheet IDs into `Code.gs` top constants
- [ ] Set up **Doer List** tab with at least one `OWNER` role employee
- [ ] Set up **AppConfig** tab with minimum keys: `COMPANY_NAME`, `MASTER_PASSWORD`, `WORK_START_TIME`, `WORK_END_TIME`
- [ ] Set up **Holiday List** tab (columns: `Date`, `Holiday Name`)
- [ ] Run `setupPayrollTab()` in Apps Script editor — creates Payroll tab automatically
- [ ] Deploy Apps Script as Web App: Execute as **Me**, Access: **Anyone**
- [ ] Copy the GAS web app URL → paste into `index.html` as `GAS_URL` constant
- [ ] Push `index.html`, `manifest.json`, `sw.js`, icons to GitHub repo
- [ ] Enable GitHub Pages on the repo (Settings → Pages → main branch)

### Adding a New Employee

1. Add row in **Doer List** with: `Emp ID`, `Name`, `Department`, `Office Email`, `Password`, `Role`, `Phone`, `Week Off Day`
2. Set `NeedAttendance = No` if this employee doesn't punch (e.g. remote/owner)
3. Clear script cache: run `clearAllCaches()` in Apps Script editor, or wait 10 minutes

### Updating Deployed GAS

1. Make changes to `Code.gs`
2. Deploy → **New deployment** (do NOT edit existing — creates a new URL)  
   OR Deploy → **Manage deployments → Edit** to update same URL
3. If URL changed: update `GAS_URL` in `index.html` and push to GitHub

---

## 10. Recent Changes (v4.0)

### 1. Delegation Date Filter Fixed
- **Module:** `getAllDelegations` (Code.gs) + Delegation page frontend
- **Change:** Date range filter now uses `Final Date` (due date), not `First Date` (task creation date)
- **Impact:** Manager's date filter on "All Delegations" tab now shows tasks by when they are **due**, not when they were assigned

### 2. EM Dashboard Delegation — Due/Shifted Only
- **Module:** `getEMDashboard`, `getEMDoerDetail` (Code.gs)
- **Change:** Delegation score in EM Dashboard now counts only:
  - Completed / Cancelled (always counted)
  - Shifted tasks
  - Pending tasks where `Final Date ≤ today` (actually due)
  - Future pending tasks with due date in the future are **excluded**
- **Frontend:** Tab label updated to "Delegation (Due/Shifted)"

### 3. Per-Employee Weekly Off Day
- **Column added:** `Week Off Day` in Doer List (values: `Sunday`, `Saturday`, `0`–`6`)
- **Fixed in:** `getMusterGrid`, `_readAttendanceFiltered`, `getEMDashboard._isExcluded`, `getDoerList`, `getEmployeeDirectory`
- **Impact:** Anil Kumar's Saturday off will now show correctly as WO in Muster Report, Attendance Analytics, and EM Dashboard — not as Absent

### 4. Checklist Completion Remark
- **Backend:** `markTaskDone` saves remark to `Remark` column (auto-creates column if missing)
- **APIs updated:** `getTodayTasks`, `getTeamChecklistToday`, `getTaskHistory`, `getChecklistAnalyticsV2` — all return `remark` field
- **Shown in:**
  - My Checklist — blue badge on Done tasks
  - EM Dashboard team checklist — inline badge
  - Weekly History table — new Remark column
  - Checklist Analytics drill-down — Remark column replaces Note column

### 5. Employee Directory — Phone Number
- **Backend:** `getDoerList` and `getEmployeeDirectory` now return `phone` field (reads `Phone` or `Mobile` column from Doer List)
- **Frontend (card view):** Phone row with icon
- **Frontend (table view):** New Phone column with tap-to-call link
- **Frontend (card footer):** Call button opens dialer directly

### 6. Weekly Meeting — Date Filters
- **Added:** From / To date pickers in Commitment History section
- **Added:** Clear Filters button (`_wmClearFilters`)
- **Backend:** `getWeeklyCommitments` already supported `from`/`to` — now wired to UI

### 7. Payroll Page (Management Only)
- **Access:** MANAGER and OWNER only (hidden from STAFF / COORDINATOR)
- **Design:** Accountant-friendly — select month → full salary sheet appears
- **Features:**
  - Department-grouped table with Grand Total row
  - Add employee salary record (live net preview as you type)
  - Edit existing records
  - Mark as Paid (Owner only)
  - Export to CSV
- **Backend:** `getPayroll`, `savePayroll`, `updatePayrollStatus`, `setupPayrollTab`
- **Sheet:** MASTER_SHEET > Payroll tab (run `setupPayrollTab()` once to create)

---

## 11. Known Setup Steps (One-Time)

### Create Payroll Sheet Tab
Run in Apps Script editor:
```javascript
setupPayrollTab();
```
This creates the `Payroll` tab in MASTER_SHEET with correct headers and formatting.

### Clear Cache After Doer List Changes
```javascript
clearAllCaches();
```
Or wait 10 minutes (cache TTL).

### Test WhatsApp
```javascript
testWhatsAppMessage();
```

### Generate Today's Checklist Manually
```javascript
generateDailyChecklist();  // or use portal button
```

---

## 12. Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Login fails for all users | Sheet ID wrong or Doer List tab missing | Check `MASTER_SHEET_ID` constant, verify "Doer List" tab exists |
| `NOT_AUTHENTICATED` error | Session expired or password wrong | Re-login; check `MASTER_PASSWORD` in AppConfig |
| Attendance not recording | GPS_ATTENDANCE=Yes but GPS coordinates wrong | Set `OFFICE_LOC1_LAT/LNG` in AppConfig, or set `GPS_ATTENDANCE=No` to disable |
| Muster Report shows wrong WO | `Week Off Day` column missing or wrong value | Add column to Doer List with values like `Saturday`, `Sunday`, or `6`, `0` |
| WhatsApp not sending | Phone blank in Doer List or WA account disconnected | Check `Phone` column; verify phone connected in MessageAutoSender |
| Payroll tab not found | `setupPayrollTab()` never run | Run `setupPayrollTab()` once in Apps Script editor |
| Checklist Remark not saving | `Remark` column doesn't exist in sheet | Auto-created on first Done — or manually add `Remark` header to Checklist and Checklist_Today sheets |
| Old data showing after edit | Cache still has old data | Run `clearAllCaches()` or wait 10 minutes |
| GAS timeout | Too many rows in Checklist / Attendance | Archive old data; Checklist analytics reads last 2000 rows |
| `Unknown action: xyz` error | Function not registered in `_callFn` | Add to `_callFn` dispatch table in Code.gs |

---

*README generated: August 2026 | Autoworkflow LLP*
*Contact: @autoworkflowllp | autoworkflow.in*
