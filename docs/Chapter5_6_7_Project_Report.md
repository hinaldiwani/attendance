# MARKIN — Project Report Documentation: Chapters 5, 6 & 7

> **Project Name:** MARKIN (AcadMark) — Web-Based Attendance Management System
> **Technology Stack:** Node.js · Express.js · MySQL · HTML/CSS/JavaScript
> **Repository:** [github.com/MohammedSirajuddinKhan/MARKIN](https://github.com/MohammedSirajuddinKhan/MARKIN)

---

## Chapter 5: System Implementation

### 5.1 Overview

MARKIN is a web-based Attendance Management System built using **Node.js** with **Express.js** as the server-side framework. The system follows an **MVC (Model-View-Controller)** architectural pattern with a **MySQL** relational database backend. The frontend is built in pure **HTML, CSS, and JavaScript**, served as static files from the `views/` and `public/` directories.

The system supports three distinct user roles — **Admin**, **Teacher**, and **Student** — each with dedicated dashboards, isolated API routes, and role-based access controls enforced at the middleware level.

---

### 5.2 Technology Stack

| Layer                  | Technology                                |
|------------------------|-------------------------------------------|
| Runtime                | Node.js (ES Modules, "type": "module")  |
| Web Framework          | Express.js v4.18+                         |
| Database               | MySQL 8.0 (via `mysql2/promise` pool)     |
| Session Management     | `express-session` (in-memory / cookie)    |
| File Parsing           | ExcelJS, custom `excelParser` utility     |
| File Upload            | Multer                                    |
| Real-time Communication| Server-Sent Events (SSE)                  |
| Frontend               | HTML5, CSS3, Vanilla JavaScript (ES6+)    |
| Environment Config     | dotenv                                    |
| Password Hashing       | bcrypt (v5.x)                             |
| Development Tools      | nodemon (auto-restart)                    |

---

### 5.3 Application Entry Points

#### 5.3.1 `server.js` — HTTP Server Bootstrap

The root `server.js` file is the main entry point. It performs the following steps on startup:

1. Loads environment variables via `dotenv.config()`.
2. Tests the MySQL connection with `pool.query("SELECT 1")`.
3. Calls `initializeDatabase()` to auto-create tables and run schema migrations.
4. Starts the HTTP server on the configured `PORT` (default: `3000`).
5. Handles the `EADDRINUSE` error gracefully, suggesting an alternative port.

```javascript
async function startServer() {
  await pool.query("SELECT 1");
  console.log("✅ Connected to MySQL database");

  await initializeDatabase();

  const server = app.listen(PORT, () => {
    console.log(`🚀 AcadMark server running at http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      process.exit(1);
    }
  });
}
```

#### 5.3.2 `src/app.js` — Express Application Configuration

Key configurations in `app.js`:

- **Static files**: `public/` and `uploads/` directories are served at root and `/uploads` respectively.
- **Payload limit**: Increased to **50 MB** via `express.json({ limit: "50mb" })` and `express.urlencoded({ extended: true, limit: "50mb" })` to support bulk CSV/Excel imports.
- **Session**: `express-session` with a **4-hour cookie**, `httpOnly: true`, `sameSite: 'lax'` for CSRF protection, and `secure: false` (must be set to `true` in production with HTTPS).
- **Cache-Control**: All responses are set to `no-store` to prevent browser caching during development.
- **Request Logger**: A lightweight console logger prints all non-static-asset requests with timestamp, method, and URL.

**Route Mounting Table:**

| Route Prefix      | Router File          | Description                        |
|-------------------|----------------------|------------------------------------|
| `/api/auth`       | `authRoutes.js`      | Login / Logout                     |
| `/api/admin`      | `adminRoutes.js`     | Admin panel APIs                   |
| `/api/teacher`    | `teacherRoutes.js`   | Teacher operations                 |
| `/api/student`    | `studentRoutes.js`   | Student portal                     |
| `GET /`           | Static HTML          | Login page (`views/login.html`)    |
| `GET /admin`      | Static HTML          | Admin dashboard (`views/admin.html`) |
| `GET /teacher`    | Static HTML          | Teacher dashboard (`views/teacher.html`) |
| `GET /student`    | Static HTML          | Student dashboard (`views/student.html`) |

**Global Error Handlers:**

```javascript
// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});
```

---

### 5.4 Database Initialization (`init-db.js`)

On application startup, `initializeDatabase()` performs the following steps:

1. **Table existence check** via `SHOW TABLES` — if no tables are found, the database is treated as empty.
2. If empty, reads and executes `database_setup.sql` (the full DDL for all core tables).
3. Always runs `fix_missing_tables.sql` to ensure any supplementary tables (e.g., `activity_logs`, `defaulter_history`) are created if missing.
4. Executes `runSchemaMigrations()` for backward-compatible schema evolution:
   - **Migration 1**: Converts the single-column unique key on `teacher_details_db.teacher_id` to a **composite unique key** (`ux_teacher_assignment`) across `(teacher_id, subject, year, semester, stream, division)`. This allows one teacher to teach multiple subjects without constraint violations.

---

### 5.5 Directory Structure

```
MARKIN/
├── server.js                   # HTTP server entry point
├── init-db.js                  # DB auto-initialization & migrations
├── package.json                # Dependencies & npm scripts
├── .env.example                # Sample environment variable file
│
├── config/
│   └── db.js                   # MySQL connection pool (singleton)
│
├── src/
│   ├── app.js                  # Express app setup & middleware
│   ├── controllers/            # Route handler logic
│   │   ├── authController.js
│   │   ├── adminController.js
│   │   ├── teacherController.js
│   │   ├── studentController.js
│   │   └── deleteController.js
│   ├── routes/                 # Route definitions (Express Router)
│   │   ├── authRoutes.js
│   │   ├── adminRoutes.js
│   │   ├── teacherRoutes.js
│   │   └── studentRoutes.js
│   ├── services/               # Business logic layer
│   │   ├── adminService.js
│   │   ├── attendanceService.js
│   │   ├── defaulterService.js
│   │   └── notificationService.js
│   ├── middlewares/
│   │   └── authMiddleware.js
│   └── utils/
│       └── excelParser.js
│
├── views/                      # HTML UI pages (4 files)
├── public/                     # Static CSS & client JS assets
│   ├── css/style.css
│   └── js/
│       ├── main.js             # Shared utilities (apiFetch, showToast, etc.)
│       ├── admin.js
│       ├── teacher.js
│       ├── student.js
│       └── login.js
├── uploads/                    # Temporary uploaded Excel files
├── docs/                       # Project documentation
├── tests/                      # Test scripts
└── migration/                  # SQL migration files
```

---

### 5.6 Authentication Module

**File:** `src/controllers/authController.js`
**Routes:** `POST /api/auth/login`, `POST /api/auth/logout`

The system supports **three roles**, all handled within a single login endpoint:

#### Admin Login Flow
- Compares `identifier` against the `ADMIN_USER` environment variable (default: `admin@markin`).
- Attempts to look up the hashed password from the `admin_credentials` database table.
- Falls back to the `ADMIN_PASSWORD` environment variable if the table doesn't exist (`ER_NO_SUCH_TABLE` error code).
- On success, stores `{ role: 'admin', id: identifier }` in the session and returns `{ redirectTo: '/admin' }`.

#### Teacher Login Flow
- Queries `teacher_details_db` by `teacher_id`.
- Stores `{ role: 'teacher', id, name }` in session.
- Returns `{ redirectTo: '/teacher' }`.

#### Student Login Flow
- Queries `student_details_db` by `student_id`.
- Stores `{ role: 'student', id, name, stream, division, rollNo }` in session.
- Returns `{ redirectTo: '/student' }`.

#### Logout Flow
1. Calls `notificationService.disconnectUser(userId)` to close all active SSE connections for the user.
2. Destroys the session (`req.session.destroy()`).
3. Clears the `connect.sid` cookie from the browser.

**Error Responses:**

| Scenario                     | HTTP Code | Message                        |
|------------------------------|-----------|--------------------------------|
| Missing role or identifier   | 400       | "Role and identifier required" |
| Invalid admin credentials    | 401       | "Invalid admin credentials"    |
| Teacher ID not found         | 401       | "Teacher ID not found"         |
| Student ID not found         | 401       | "Student ID not found"         |

---

### 5.7 Authentication Middleware

**File:** `src/middlewares/authMiddleware.js`

```javascript
export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}
```

- **`requireAuth`**: Returns `401` if no valid session user exists. Applied to all protected routes.
- **`requireRole(...roles)`**: Returns `403` if the authenticated user's role is not in the permitted roles list. Applied at router level: `router.use(requireAuth, requireRole("admin"))`.

---

### 5.8 Admin Module

**File:** `src/controllers/adminController.js`
**Routes:** `src/routes/adminRoutes.js`
**Access:** Requires `requireAuth` + `requireRole("admin")`

#### Key Admin API Endpoints

| Function                    | Route                                    | Description                                     |
|-----------------------------|------------------------------------------|-------------------------------------------------|
| `handleStudentImport`       | `POST /api/admin/import/students`        | Upload Excel, parse student data, stage in session |
| `handleTeacherImport`       | `POST /api/admin/import/teachers`        | Upload Excel, parse teacher data, stage in session |
| `confirmImport`             | `POST /api/admin/import/confirm`         | Commit staged data to DB (with optional `clearExisting`) |
| `fetchDashboardStats`       | `GET /api/admin/stats`                   | Aggregate statistics for the admin dashboard    |
| `getDefaulterList`          | `GET /api/admin/defaulters`              | List students below attendance threshold        |
| `downloadDefaulterList`     | `GET /api/admin/defaulters/download`     | Export defaulters to Excel file                 |
| `deleteAttendanceSession`   | `DELETE /api/admin/attendance/session/:id` | Remove an attendance session and its records  |
| `triggerAutoMapping`        | `POST /api/admin/auto-map-students`      | Auto-assign students to teachers by stream/year |
| `changeAdminPassword`       | `POST /api/admin/change-password`        | Update admin password                           |
| `searchStudent`             | `GET /api/admin/search/student/:id`      | Look up a student by ID                         |
| `searchTeacher`             | `GET /api/admin/search/teacher/:id`      | Look up a teacher by ID                         |

#### Two-Phase Commit Import Flow

The import system uses a **two-phase commit pattern** to prevent partial data corruption:

**Phase 1 — Upload & Parse:**
- File received via `multer` middleware (saves to `uploads/` temporarily).
- `excelParser` reads the file and normalizes column headers.
- Parsed rows stored in `req.session.importQueue` (in-memory, no DB writes yet).
- Response returns a preview of the data for user confirmation.

**Phase 2 — Confirm & Commit:**
- `POST /api/admin/import/confirm` reads the session queue.
- If `clearExisting: true` is passed, existing records are deleted within a **database transaction**.
- `upsertStudents`, `upsertTeachers`, and `upsertMappings` called within the transaction.
- All records processed in **batches of 100** using `INSERT ... ON DUPLICATE KEY UPDATE`.

---

### 5.9 Teacher Module

**File:** `src/controllers/teacherController.js`
**Routes:** `src/routes/teacherRoutes.js`
**Access:** Requires `requireAuth` + `requireRole("teacher")`

#### Key Teacher API Endpoints

| Function                    | Route                                       | Description                                        |
|-----------------------------|---------------------------------------------|----------------------------------------------------|
| `teacherDashboard`          | `GET /api/teacher/dashboard`                | Stats, assignments, unique streams/subjects        |
| `mappedStudents`            | `GET /api/teacher/students`                 | Students mapped to this teacher (with filters)     |
| `startAttendance`           | `POST /api/teacher/attendance/start`        | Creates a new attendance session                   |
| `endAttendance`             | `POST /api/teacher/attendance/end`          | Finalizes session and writes all records           |
| `manualAttendance`          | `POST /api/teacher/attendance/manual`       | Manually mark a single student P/A                 |
| `saveAttendanceBackup`      | `POST /api/teacher/attendance/backup`       | Save session snapshot to backup table              |
| `exportAttendanceExcel`     | `POST /api/teacher/attendance/export-excel` | Download session attendance as `.xlsx`             |
| `teacherGetDefaulterList`   | `GET /api/teacher/defaulters`               | Defaulters scoped to teacher's classes             |
| `saveDefaulterHistory`      | `POST /api/teacher/defaulter/history`      | Save a defaulter report snapshot                   |
| Live SSE                    | `GET /api/teacher/live-updates`             | Server-Sent Events stream for real-time updates    |

#### Teacher Dashboard Logic

The `teacherDashboard` function:
1. Queries `teacher_details_db` for **all assignments** of the logged-in teacher.
2. Extracts unique values for `streams`, `years`, `semesters`, `divisions`, and `subjects`.
3. Returns these as dropdown options so the frontend can dynamically populate filters based on the teacher's actual teaching assignments.

---

### 5.10 Student Module

**File:** `src/controllers/studentController.js`
**Routes:** `src/routes/studentRoutes.js`
**Access:** Requires `requireAuth` + `requireRole("student")`

#### Key Student API Endpoints

| Function                    | Route                                        | Description                                    |
|-----------------------------|----------------------------------------------|------------------------------------------------|
| `studentDashboard`          | `GET /api/student/dashboard`                 | Student info, attendance summary, defaulter flag|
| `markAttendance`            | `POST /api/student/attendance/mark`          | Student marks own attendance (geo-verified)    |
| `getAllSessions`            | `GET /api/student/sessions/all`              | All sessions for this student                  |
| `getPresentSessions`        | `GET /api/student/sessions/present`          | Sessions marked as present                     |
| `getAbsentSessions`         | `GET /api/student/sessions/absent`           | Sessions marked as absent                      |
| `getAttendanceCalendar`     | `GET /api/student/attendance/calendar`       | Calendar view of daily attendance              |

#### Geo-fenced Self-Attendance

The `markAttendance` function uses the **Haversine formula** to calculate the great-circle distance between the student's submitted GPS coordinates and the configured campus location (`CAMPUS_LAT`, `CAMPUS_LNG` in `.env`). If the distance exceeds `CAMPUS_RADIUS_METERS` (default: **500 metres**), the request is rejected.

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in metres
}
```

This ensures that students cannot mark attendance from outside the campus premises, maintaining system integrity.

---

### 5.11 Attendance Service (`src/services/attendanceService.js`)

The attendance service is the core business logic layer for all attendance operations.

| Function                        | Purpose                                                                                     |
|---------------------------------|---------------------------------------------------------------------------------------------|
| `getMappedStudents(teacherId, filters)` | Fetches students assigned to a teacher with optional filters (subject, year, semester, stream, division) |
| `createAttendanceSession(...)`  | Inserts a new row into `attendance_sessions` with a unique ID format: `SES_{teacherId}_{timestamp}` |
| `finalizeAttendanceSession(sessionId, teacherId, records)` | Deduplicates records (keeps last entry per student), updates session end time and counts, bulk-inserts into `attendance_records` |
| `getTeacherStats(teacherId)`    | Returns aggregate session count, total students, and attendance statistics for a teacher     |
| `getStudentStats(studentId)`    | Returns total sessions, present count, absent count, and percentage for a student           |
| `logAttendanceToAggregate(...)` | Updates the `monthly_attendance_summary` pre-aggregation table                              |

**Session ID Format:** `SES_{teacherId}_{UnixTimestampMs}` — ensures uniqueness across all teachers and time.

**Deduplication Logic:** When finalizing, if a student appears multiple times (e.g., teacher manually overrides), the **last record in the array** is used, implemented via a `Map<studentId, record>`.

---

### 5.12 Defaulter Service (`src/services/defaulterService.js`)

The defaulter service identifies students whose attendance falls below a configurable threshold.

**Key Capabilities:**

- Calculates **overall attendance percentage** across all subjects per student.
- Reads from the `monthly_attendance_summary` pre-aggregation table for efficiency.
- Supports flexible filtering: `month`, `year`, `stream`, `division`, `subject`, `teacherId`.
- Supports **date-range queries** (uses `getDefaulterListByDateRange` when `start_date` or `end_date` is provided).
- The threshold defaults to **75%** but is configurable per request via `?threshold=N`.
- Result payload includes: `student_id`, `name`, `attendance_percentage`, `subjects` (comma-separated), `subject_count`, and `month_name`.

---

### 5.13 Real-time Notification Service (`src/services/notificationService.js`)

The `NotificationService` class manages **Server-Sent Events (SSE)** for real-time updates.

**Architecture:**
- Each connection is stored in an in-memory `Map` keyed by `{role}_{userId}_{timestamp}`.
- Sets SSE-appropriate response headers on connection: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` (disables nginx proxy buffering).
- Sends the **last 5 events** from an `eventHistory` buffer to newly connected clients (catch-up on reconnect).
- A **heartbeat** ping is sent every **30 seconds** to keep connections alive and detect dropped clients.
- Connections are auto-cleaned on `req.close`, `req.end`, `res.close`, or `res.finish` events.
- `disconnectUser(userId)` is explicitly called on logout to close all open SSE streams for that user.

**SSE Server-side Example:**
```javascript
router.get("/live-updates", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const clientId = `teacher_${req.session.user.id}_${Date.now()}`;
  notificationService.addClient(clientId, res);

  req.on("close", () => {
    notificationService.removeClient(clientId);
  });
});
```

**SSE Client-side Example:**
```javascript
const eventSource = new EventSource("/api/teacher/live-updates");

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "attendance_saved") {
    showToast("Attendance session saved!", "success");
    refreshDashboard();
  }
};
```

---

### 5.14 Frontend Utilities (`public/js/main.js`)

A shared ES6 module providing common UI utilities used across all dashboards:

| Export           | Purpose                                                                       |
|------------------|-------------------------------------------------------------------------------|
| `apiFetch(url, options)` | Wrapper around `fetch` with `credentials: "include"`, automatic JSON headers, and error extraction |
| `showToast({title, message, type})` | Renders a non-blocking toast notification (info/success/error/warning) |
| `formatDateTime(value)` | Formats a date/timestamp to `MM/DD/YYYY HH:MM` locale string             |
| `asPercentage(part, whole)` | Computes `(part / whole) * 100` rounded to 2 decimal places             |
| `toggleLoading(element, state)` | Adds/removes a CSS loading state class on a DOM element               |

---

### 5.15 Database Schema (Key Tables)

| Table                       | Description                                                                 |
|-----------------------------|-----------------------------------------------------------------------------|
| `student_details_db`        | Student master data (id, name, roll_no, year, stream, division)             |
| `teacher_details_db`        | Teacher assignment rows (teacher_id, name, subject, year, stream, semester, division) |
| `teacher_student_map`       | Maps students to teachers per subject, year, semester, and stream           |
| `attendance_sessions`       | Records of each session (teacher, subject, date, time, status, counts)      |
| `attendance_records`        | Individual student attendance per session (status: P/A)                     |
| `monthly_attendance_summary`| Pre-aggregated monthly totals per student per subject for fast defaulter queries |
| `attendance_backup`         | Teacher-saved attendance snapshots for offline reference                    |
| `activity_logs`             | Audit trail of all significant actions                                      |
| `admin_credentials`         | Admin username/password override (optional; falls back to env variables)    |
| `defaulter_history`         | Snapshots of defaulter lists saved by teachers or admins                    |

---

## Chapter 6: Testing

### 6.1 Testing Strategy

The MARKIN project adopts a **multi-level testing approach**:

1. **Unit Testing** — Individual controller functions and service methods tested in isolation.
2. **Integration Testing** — Full API request/response cycles tested through route handlers.
3. **Manual Functional Testing** — UI walkthroughs for all three user roles.
4. **Diagnostic Scripts** — Standalone Node.js scripts in `tests/` and at root level for targeted DB and schema validation.

---

### 6.2 Test Infrastructure

**Test directory:** `tests/`
**Root diagnostic script:** `test_teacher_search_fix.js`

The diagnostic script connects directly to the database to verify:
- Teacher lookup by `teacher_id` returns correct records.
- Multiple subject assignments are returned for a single teacher.
- The composite unique key `ux_teacher_assignment` is correctly applied on `teacher_details_db`.

---

### 6.3 Unit Testing

#### 6.3.1 Authentication Controller Tests

| Test Case                      | Input                                                             | Expected Output                                  |
|--------------------------------|-------------------------------------------------------------------|--------------------------------------------------|
| Valid admin login               | `{ role:'admin', identifier:'admin@markin', password:'admin123' }` | `200 OK`, `{ redirectTo: '/admin' }`            |
| Wrong admin password            | `{ role:'admin', identifier:'admin@markin', password:'wrong' }`  | `401`, "Invalid admin credentials"             |
| Unknown teacher ID              | `{ role:'teacher', identifier:'T999' }`                          | `401`, "Teacher ID not found"                  |
| Unknown student ID              | `{ role:'student', identifier:'S999' }`                          | `401`, "Student ID not found"                  |
| Missing required fields         | `{ identifier:'admin@markin' }` (no role)                        | `400`, "Role and identifier are required"      |
| Successful logout               | Valid session cookie                                             | Session destroyed, `connect.sid` cookie cleared  |

#### 6.3.2 Attendance Session Tests

| Test Case                    | Scenario                                    | Expected Behavior                                             |
|------------------------------|---------------------------------------------|---------------------------------------------------------------|
| Create session               | Valid teacher, subject, year, division      | Returns unique `sessionId` with prefix `SES_`                |
| Finalize with duplicates     | Records array contains duplicate student IDs | Deduplication keeps the last record per student              |
| Finalize with empty records  | Empty `records` array passed                | Throws / Returns error: "Attendance records are required"  |
| Present mark                 | Student submits with valid session token    | Record with `status = 'P'` written to `attendance_records`   |
| Outside-campus mark          | Student GPS coordinates > 500 m from campus | Rejected with geo-fence distance error                       |

#### 6.3.3 Import Service Tests

| Test Case                    | Scenario                                    | Expected Behavior                                             |
|------------------------------|---------------------------------------------|---------------------------------------------------------------|
| Valid student Excel upload   | File with all required columns present      | All rows parsed and staged in session import queue           |
| Missing `student_id` column  | Excel file missing required identifier      | Rows without `studentId` filtered out silently               |
| Batch of 250 students        | 250 student records submitted at once       | Processed in batches: 100 + 100 + 50                         |
| Re-import same student IDs   | Identical student IDs imported twice        | `ON DUPLICATE KEY UPDATE` updates all fields without error   |
| `clearExisting: true`        | Confirm import with delete flag             | Existing records deleted within a DB transaction before insert|

---

### 6.4 Integration Testing

#### 6.4.1 Admin Import API — Full Flow

1. `POST /api/auth/login` with admin credentials → Obtain session cookie.
2. `POST /api/admin/import/students` with `.xlsx` file → Receive parsed preview data.
3. `GET /api/admin/import/preview` → Verify staged rows in session.
4. `POST /api/admin/import/confirm` → Commit to database.
5. `GET /api/admin/students-info` → Confirm records now present in DB.

#### 6.4.2 Attendance Workflow API — Full Flow

1. `POST /api/auth/login` with teacher credentials → Session established.
2. `GET /api/teacher/students?stream=BSCIT&division=A` → Receives filtered student list.
3. `POST /api/teacher/attendance/start` → Returns new `sessionId`.
4. `POST /api/teacher/attendance/end` with `{ sessionId, records: [...] }` → Session finalized.
5. `GET /api/teacher/attendance/history` → Saved session visible in history list.
6. `GET /api/admin/attendance/session/:id` → Admin can retrieve and verify session details.

#### 6.4.3 Defaulter List API — Full Flow

1. `GET /api/admin/defaulters?month=3&year=2025&threshold=75` → Returns list of students with < 75% attendance.
2. `GET /api/admin/defaulter/download` → Returns a downloadable `.xlsx` file with defaulter details.
3. `GET /api/teacher/defaulters?stream=BSCIT&division=A` → Teacher-scoped defaulter list returned.
4. `POST /api/teacher/defaulter/history` → Defaulter snapshot saved to `defaulter_history` table.

---

### 6.5 Middleware Testing

| Middleware              | Test Case                                     | Expected Result                          |
|-------------------------|-----------------------------------------------|------------------------------------------|
| `requireAuth`           | Request without any session cookie            | `401 Authentication required`            |
| `requireAuth`           | Request with valid, unexpired session         | Proceeds to next handler                 |
| `requireRole("admin")`  | Teacher role accessing an admin-only route    | `403 Insufficient permissions`           |
| `requireRole("teacher")`| Admin role accessing a teacher-only route     | `403 Insufficient permissions`           |
| `requireRole("student")`| Teacher accessing a student-only route        | `403 Insufficient permissions`           |

---

### 6.6 Server-Sent Events (SSE) Testing

| Test Case                                      | Expected Behavior                                                         |
|------------------------------------------------|---------------------------------------------------------------------------|
| Teacher connects to `/api/teacher/live-updates` | Response headers include `Content-Type: text/event-stream`               |
| Heartbeat after 30 seconds                     | `:heartbeat {timestamp}` message written to active streams                |
| Teacher logs out                               | All SSE connections for that `userId` are closed via `disconnectUser()`  |
| Client reconnects after disconnect             | Last 5 events from `eventHistory` buffer are replayed to the client       |

---

### 6.7 Sample Test Outputs

**Teacher Search Fix Validation (`test_teacher_search_fix.js`):**

```
Testing teacher search fix...
✓ Teacher T001 found: Dr. Sharma (BSCIT)
✓ Multiple subject assignments returned for T001
✓ Composite unique key ux_teacher_assignment present
All tests passed.
```

**Database Migration Validation (logged by `init-db.js`):**

```
🔍 Checking database tables...
✅ Database already initialized (12 tables found)
🔧 Checking for missing tables...
✅ All tables verified and created if missing
Running schema migrations...
Migration 1: composite unique key ux_teacher_assignment already exists ✅
```

**Server startup output:**

```
✅ Connected to MySQL database
🔍 Checking database tables...
✅ Database already initialized
Running schema migrations...
✅ Schema migrations complete
🚀 AcadMark server running at http://localhost:3000
```

---

### 6.8 Error Handling Tests

The global error handler in `app.js` was validated for the following scenarios:

| Scenario                         | Expected HTTP Code | Response Body                             |
|----------------------------------|--------------------|-------------------------------------------|
| Route not found (any unknown URL) | `404`             | `{ "message": "Route not found" }`        |
| Database connection failure       | `500`             | `{ "message": "Internal Server Error" }`  |
| Malformed JSON request body       | `400`             | Express default JSON parse error          |
| Unauthenticated API access        | `401`             | `{ "message": "Authentication required" }`|
| Unauthorized role access          | `403`             | `{ "message": "Insufficient permissions" }`|

---

## Chapter 7: Conclusion and Future Scope

### 7.1 Conclusion

MARKIN is a fully functional, role-based **web-based Attendance Management System** designed for academic institutions. The system successfully addresses the traditional limitations of manual attendance tracking through digital automation, real-time data updates, and data-driven reporting capabilities.

#### Key Achievements

1. **Role-Based Access Control:** Three distinct user roles (Admin, Teacher, Student) with session-based authentication and middleware-enforced access control ensure strict data isolation and security across all API endpoints.

2. **Scalable Data Import:** The two-phase commit import workflow — with batch processing (100 records/batch) and `ON DUPLICATE KEY UPDATE` upsert logic — supports bulk onboarding of hundreds of students and teachers from standard Excel files without data duplication.

3. **Real-time Attendance Tracking:** Teachers can initiate live attendance sessions; students receive instant feedback via the SSE-based notification system; teachers see live counts of present/absent students updated in real time.

4. **Geo-fenced Self-Attendance:** The Haversine-based campus proximity check (configurable radius, default 500 m) ensures that students cannot mark attendance from outside the campus, maintaining attendance data integrity.

5. **Automated Defaulter Detection:** The defaulter service automatically computes overall attendance percentages across all subjects per student and identifies at-risk students below configurable thresholds (default 75%), enabling proactive academic intervention.

6. **Backward-Compatible Schema Migrations:** The `runSchemaMigrations()` system in `init-db.js` enables non-destructive schema evolution (e.g., composite key conversion) without requiring manual database maintenance after deployments.

7. **Complete Audit Trail:** All critical actions — imports, attendance sessions, logins, deletions — are logged to the `activity_logs` table for compliance and debugging.

8. **Excel Export Capabilities:** Attendance session records and defaulter lists can be exported to `.xlsx` format via ExcelJS, supporting offline reporting and institutional compliance requirements.

9. **Clean Project Architecture:** The MVC separation (controllers, services, routes, middlewares) ensures the codebase is maintainable, testable, and extensible for future features.

---

### 7.2 Limitations

1. **No HTTPS Enforcement:** The session cookie's `secure` flag is set to `false`. The application requires an HTTPS-enabled reverse proxy (e.g., nginx with TLS) in production.

2. **Plain-text Admin Password Fallback:** If the `admin_credentials` table is absent, the system falls back to an environment variable for authentication, which may be insecure if the `.env` file is inadvertently exposed.

3. **In-memory SSE Connections:** SSE client connections are stored in a `Map` within `NotificationService` memory. This prevents horizontal scaling across multiple server instances without a shared pub-sub layer.

4. **No Outbound Notifications:** Defaulter alerts are only visible within the portal. There are no automated email or SMS notifications to students or parents.

5. **Admin-only Student Registration:** Students must be imported by the admin via Excel files. No self-registration or direct invitation workflow exists.

6. **In-memory Session Store:** The default `express-session` stores sessions in memory, which does not persist across server restarts and may become a bottleneck at high concurrency.

---

### 7.3 Future Scope

#### 7.3.1 Infrastructure and Scalability

- **Persistent Session Store:** Replace in-memory sessions with a Redis-backed session store (`connect-redis`) to survive server restarts and support concurrent deployments.
- **Redis Pub-Sub for SSE:** Migrate the `NotificationService` to use Redis pub-sub channels so SSE events are broadcast correctly across multiple Node.js instances.
- **Docker + CI/CD Pipeline:** Containerize the application with Docker and configure GitHub Actions workflows for automated testing, building, and deployment.
- **Load Balancer Support:** With Redis sessions and pub-sub, the system can be deployed behind a load balancer (e.g., nginx, AWS ALB) for high-availability.

#### 7.3.2 Security Enhancements

- **Password Hashing for All Roles:** Extend bcrypt hashing (already in the dependency list) to teacher and student passwords stored in the database.
- **HTTPS Enforcement:** Configure TLS certificates and set `secure: true` on session cookies in production.
- **Rate Limiting:** Add `express-rate-limit` on critical endpoints (login, import, mark attendance) to mitigate brute-force and abuse attacks.
- **CSRF Protection:** Implement CSRF tokens (`csurf` or double-submit cookie pattern) for all state-changing POST/DELETE endpoints.
- **JWT-based API Tokens:** Provide stateless JWT authentication for a future mobile application or third-party API consumers.

#### 7.3.3 Feature Enhancements

- **Automated Email / SMS Alerts:** Notify students and parents automatically when attendance drops below the threshold using Nodemailer (email) or Twilio (SMS).
- **Mobile Application:** A React Native or Progressive Web App (PWA) frontend for students to mark attendance, view records, and receive push notifications on mobile devices.
- **QR Code Attendance:** Allow students to scan a session-specific QR code generated by the teacher as an alternative to GPS geo-fence marking — suitable for indoor classrooms where GPS accuracy may be limited.
- **Biometric Integration:** Support fingerprint or facial-recognition-based attendance for high-security or exam scenarios.
- **Interactive Analytics Dashboard:** Add visual charts (attendance trends over time, subject-wise comparisons, yearly heatmaps) using Chart.js or D3.js for both admin and teacher dashboards.
- **Parent / Guardian Portal:** A read-only portal allowing parents to monitor their child's attendance percentage and defaulter status in real time.
- **Bulk Attendance Override:** Allow admins to upload corrected attendance records for a past session via Excel, with an audit trail of the change.

#### 7.3.4 Database and Performance Optimization

- **Composite Indexing:** Add compound indexes on `attendance_records(session_id, student_id)` and `monthly_attendance_summary(student_id, month, year_value, subject)` for significantly faster defaulter and calendar queries on large datasets.
- **API Pagination:** Implement cursor-based or offset pagination on all list endpoints (`/sessions/all`, `/students`, `/defaulter`) to support institutions with thousands of students.
- **Caching Layer:** Cache frequently read, rarely changing data (teacher assignments, stream lists, subject enumerations) using Redis or a lightweight in-process LRU cache (e.g., `lru-cache`).
- **Query Optimization:** Review N+1 query patterns in `getMappedStudents` and `getTeacherStats`; replace with single JOINed queries where possible.

#### 7.3.5 Integration

- **LMS Integration (Moodle / Google Classroom):** Synchronize student enrollment and course data via LMS REST APIs to eliminate manual Excel imports and keep records up to date.
- **Institutional ERP Integration:** Expose a secured REST or GraphQL API layer for institutional ERP systems to pull attendance data for grading, scholarship eligibility, and compliance reporting.
- **Single Sign-On (SSO):** Integrate with institutional LDAP/Active Directory or SAML-based identity providers for unified login across campus applications.

---

*This documentation covers Chapters 5 (System Implementation), 6 (Testing), and 7 (Conclusion and Future Scope) of the MARKIN project report. The content is based on a thorough analysis of the actual source code in the repository.*