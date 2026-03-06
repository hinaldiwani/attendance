import {
  showToast,
  apiFetch,
  formatDateTime,
  asPercentage,
  toggleLoading,
} from "./main.js";

const summaryPresentEl = document.querySelector("[data-summary-present]");
const summaryStreamsEl = document.querySelector("[data-summary-streams]");
const summaryDivisionsEl = document.querySelector("[data-summary-divisions]");
const summaryYearsEl = document.querySelector("[data-summary-years]");
const summarySubjectsEl = document.querySelector("[data-summary-subjects]");
const summarySubjectSessionsEl = document.querySelector("[data-summary-subject-sessions]");
const recentBody = document.querySelector("[data-recent-body]");
const activityBody = document.querySelector("[data-activity-body]");
const refreshButton = document.querySelector("[data-refresh]");
const refreshActivityButton = document.querySelector("[data-refresh-activity]");
const clearRecentButton = document.querySelector("[data-clear-recent]");
const clearActivityButton = document.querySelector("[data-clear-activity]");
const signoutButton = document.querySelector("[data-signout]");
const startSessionButton = document.querySelector("[data-start-session]");
const endSessionButton = document.querySelector("[data-end-session]");
const sessionModal = document.querySelector("[data-session-modal]");
const sessionForm = sessionModal?.querySelector("form");
const activeSection = document.querySelector("[data-active-session]");
const attendanceBody = document.querySelector("[data-attendance-body]");
const viewHistoryButton = document.querySelector("[data-view-history]");
const historyModal = document.querySelector("[data-history-modal]");
const historyBody = document.querySelector("[data-history-body]");
const closeHistoryButton = document.querySelector("[data-close-history]");

// Defaulter history
const viewDefaulterHistoryButton = document.querySelector(
  "[data-view-defaulter-history]",
);
const defaulterHistoryModal = document.querySelector(
  "[data-defaulter-history-modal]",
);
const defaulterHistoryBody = document.querySelector(
  "[data-defaulter-history-body]",
);
const closeDefaulterHistoryButton = document.querySelector(
  "[data-close-defaulter-history]",
);
const defaulterHistoryDetailModal = document.querySelector(
  "[data-defaulter-history-detail-modal]",
);
const defaulterHistoryDetailBody = document.querySelector(
  "[data-dh-detail-body]",
);
const defaulterHistoryDetailSummary = document.querySelector(
  "[data-dh-detail-summary]",
);
const closeDefaulterHistoryDetailButton = document.querySelector(
  "[data-close-defaulter-history-detail]",
);

const previewModal = document.querySelector("[data-preview-modal]");
const closePreviewButton = document.querySelector("[data-close-preview]");
const previewStudentsBody = document.querySelector("[data-preview-students]");

// Stats modals
const showStreamsButton = document.querySelector("[data-show-streams]");
const showDivisionsButton = document.querySelector("[data-show-divisions]");
const showYearsButton = document.querySelector("[data-show-years]");
const showSubjectsButton = document.querySelector("[data-show-subjects]");
const showSubjectSessionsButton = document.querySelector("[data-show-subject-sessions]");
const showStudentsPresentButton = document.querySelector(
  "[data-show-students-present]",
);

const streamsModal = document.querySelector("[data-streams-modal]");
const divisionsModal = document.querySelector("[data-divisions-modal]");
const yearsModal = document.querySelector("[data-years-modal]");
const subjectsModal = document.querySelector("[data-subjects-modal]");
const subjectSessionsModal = document.querySelector("[data-subject-sessions-modal]");
const studentsPresentModal = document.querySelector(
  "[data-students-present-modal]",
);

const closeStreamsButton = document.querySelector("[data-close-streams]");
const closeDivisionsButton = document.querySelector("[data-close-divisions]");
const closeYearsButton = document.querySelector("[data-close-years]");
const closeSubjectsButton = document.querySelector("[data-close-subjects]");
const closeSubjectSessionsButton = document.querySelector("[data-close-subject-sessions]");
const closeStudentsPresentButton = document.querySelector(
  "[data-close-students-present]",
);

const snapshotSubject = document.querySelector("[data-session-subject]");
const snapshotYear = document.querySelector("[data-session-year]");
const snapshotSemester = document.querySelector("[data-session-semester]");
const snapshotDivision = document.querySelector("[data-session-division]");
const snapshotStream = document.querySelector("[data-session-stream]");
const snapshotStart = document.querySelector("[data-session-start]");
const badgeSize = document.querySelector("[data-session-size]");
const badgePresent = document.querySelector("[data-session-present]");
const badgeAbsent = document.querySelector("[data-session-absent]");

// Save confirmation modal
const saveConfirmationModal = document.querySelector("[data-save-confirmation-modal]");
const confirmPresentEl = document.querySelector("[data-confirm-present]");
const confirmAbsentEl = document.querySelector("[data-confirm-absent]");
const cancelSaveConfirmationButton = document.querySelector("[data-cancel-save-confirmation]");
const confirmSaveSessionButton = document.querySelector("[data-confirm-save-session]");

let currentSession = null;
let lastSessionDetails = null;
let teacherData = null;
let availableStreams = [];
let availableDivisions = [];
let availableYears = [];
let availableSemesters = [];
let availableSubjects = [];

function handleError(error, fallback = "Something went wrong") {
  console.error(error);
  showToast({
    title: "Heads up",
    message: error.message || fallback,
    type: "danger",
  });
}

async function loadDashboard() {
  try {
    const data = await apiFetch("/api/teacher/dashboard");
    teacherData = data.teacherInfo || {};
    availableStreams = data.streams || [];
    availableDivisions = data.divisions || [];
    availableYears = data.years || [];
    availableSemesters = data.semesters || [];
    availableSubjects = data.subjects || [];

    // Update teacher name in header
    const teacherNameEl = document.querySelector("[data-teacher-name]");
    if (teacherNameEl && teacherData?.name) {
      teacherNameEl.textContent = teacherData.name;
    }

    const summary = data?.summary || {};
    summaryPresentEl.textContent = summary.totalPresent ?? 0;

    // Update new stats
    if (summaryStreamsEl)
      summaryStreamsEl.textContent = availableStreams.length;
    if (summaryDivisionsEl)
      summaryDivisionsEl.textContent = availableDivisions.length;
    if (summaryYearsEl) summaryYearsEl.textContent = availableYears.length;

    // Count unique subjects from backend data
    if (summarySubjectsEl)
      summarySubjectsEl.textContent = availableSubjects.length || 1;

    // Set subject sessions count
    if (summarySubjectSessionsEl)
      summarySubjectSessionsEl.textContent = summary.sessions ?? 0;

    renderRecentSessions(data?.recentSessions || []);

    // Populate dropdowns
    populateYearDropdown();
    populateStreamDropdown();
    populateDivisionDropdown();
    setupClassSelectionListeners();
  } catch (error) {
    handleError(error, "Unable to load dashboard");
  }
}

async function loadSubjectsForClass(year, stream, division, semester) {
  try {
    let url = `/api/teacher/subjects?year=${encodeURIComponent(year)}&stream=${encodeURIComponent(stream)}&division=${encodeURIComponent(division)}`;
    if (semester) {
      url += `&semester=${encodeURIComponent(semester)}`;
    }

    const response = await apiFetch(url);

    const subjectDropdown = document.querySelector("#sessionSubject");
    const subjectGroup = document.querySelector("#subjectGroup");
    const beginButton = document.querySelector("#beginButton");

    if (!subjectDropdown || !subjectGroup) return;

    // Clear existing options except the first one
    subjectDropdown.innerHTML = '<option value="">Select subject...</option>';

    if (response.subjects && response.subjects.length > 0) {
      // Add available subjects
      response.subjects.forEach((subject) => {
        const option = document.createElement("option");
        option.value = subject;
        option.textContent = subject;
        subjectDropdown.appendChild(option);
      });

      // Show the subject group
      subjectGroup.style.display = "block";

      showToast({
        title: "Subjects loaded",
        message: `${response.subjects.length} subject(s) available for this class`,
        type: "success",
      });
    } else {
      subjectGroup.style.display = "none";
      if (beginButton) beginButton.disabled = true;

      showToast({
        title: "No subjects found",
        message: "No subjects are mapped to this year, stream, and division",
        type: "warning",
      });
    }
  } catch (error) {
    console.error("Failed to load subjects:", error);
    showToast({
      title: "Unable to load subjects",
      message: error.message || "Failed to fetch subjects for this class",
      type: "error",
    });
  }
}

function setupClassSelectionListeners() {
  const yearDropdown = document.querySelector("#sessionYear");
  const semesterDropdown = document.querySelector("#sessionSemester");
  const streamDropdown = document.querySelector("#sessionStream");
  const divisionDropdown = document.querySelector("#sessionDivision");
  const subjectDropdown = document.querySelector("#sessionSubject");
  const subjectGroup = document.querySelector("#subjectGroup");
  const beginButton = document.querySelector("#beginButton");

  if (!yearDropdown || !streamDropdown || !divisionDropdown) return;

  // Update semester options based on year selection
  yearDropdown.addEventListener("change", () => {
    populateSemesterDropdown(yearDropdown.value);
  });

  function checkAndLoadSubjects() {
    const year = yearDropdown.value;
    const semester = semesterDropdown.value;
    const stream = streamDropdown.value;
    const division = divisionDropdown.value;

    // Hide subject dropdown and disable begin button initially
    if (subjectGroup) subjectGroup.style.display = "none";
    if (beginButton) beginButton.disabled = true;

    // If all required fields are selected, load subjects
    if (year && stream && division) {
      loadSubjectsForClass(year, stream, division, semester);
    }
  }

  // Add listeners to all dropdowns
  yearDropdown.addEventListener("change", checkAndLoadSubjects);
  semesterDropdown.addEventListener("change", checkAndLoadSubjects);
  streamDropdown.addEventListener("change", checkAndLoadSubjects);
  divisionDropdown.addEventListener("change", checkAndLoadSubjects);

  // Enable begin button only when subject is selected
  if (subjectDropdown && beginButton) {
    subjectDropdown.addEventListener("change", () => {
      beginButton.disabled = !subjectDropdown.value;
    });
  }
}

function populateYearDropdown() {
  const yearDropdown = document.querySelector("#sessionYear");
  if (!yearDropdown) return;

  // Clear existing options except the first one
  while (yearDropdown.options.length > 1) {
    yearDropdown.remove(1);
  }

  // Define year display names
  const yearNames = {
    FY: "FY (First Year)",
    SY: "SY (Second Year)",
    TY: "TY (Third Year)",
  };

  // Add only available years
  availableYears.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = yearNames[year] || year;
    yearDropdown.appendChild(option);
  });
}

function populateSemesterDropdown(year) {
  const semesterDropdown = document.querySelector("#sessionSemester");
  if (!semesterDropdown) return;

  // Clear existing options
  semesterDropdown.innerHTML = '<option value="">Select semester...</option>';

  // Define semester mapping
  const semesterMap = {
    FY: [1, 2],
    SY: [3, 4],
    TY: [5, 6],
  };

  if (year && semesterMap[year]) {
    // Filter to only show semesters that the teacher is assigned to
    const possibleSemesters = semesterMap[year];
    const availableSemestersForYear = possibleSemesters.filter((sem) => {
      // Check if availableSemesters includes this semester in "Sem X" format or just "X"
      return (
        availableSemesters.includes(`Sem ${sem}`) ||
        availableSemesters.includes(String(sem))
      );
    });

    if (availableSemestersForYear.length > 0) {
      availableSemestersForYear.forEach((sem) => {
        const option = document.createElement("option");
        option.value = `Sem ${sem}`;  // Fixed: Send "Sem 1" instead of just "1"
        option.textContent = `Semester ${sem}`;
        semesterDropdown.appendChild(option);
      });
      semesterDropdown.disabled = false;
    } else {
      semesterDropdown.innerHTML =
        '<option value="">No semesters assigned...</option>';
      semesterDropdown.disabled = true;
    }
  } else {
    semesterDropdown.innerHTML =
      '<option value="">Select year first...</option>';
    semesterDropdown.disabled = true;
  }
}

function populateStreamDropdown() {
  const streamDropdown = document.querySelector("#sessionStream");
  if (!streamDropdown) return;

  // Clear existing options except the first one
  while (streamDropdown.options.length > 1) {
    streamDropdown.remove(1);
  }

  // Add all available streams
  availableStreams.forEach((stream) => {
    const option = document.createElement("option");
    option.value = stream;
    option.textContent = stream;
    streamDropdown.appendChild(option);
  });

  // Pre-select teacher's stream if available
  if (teacherData?.stream && availableStreams.includes(teacherData.stream)) {
    streamDropdown.value = teacherData.stream;
  }
}

function populateDivisionDropdown() {
  const divisionDropdown = document.querySelector("#sessionDivision");
  if (!divisionDropdown) return;

  // Clear existing options except the first one
  while (divisionDropdown.options.length > 1) {
    divisionDropdown.remove(1);
  }

  // Add all available divisions
  availableDivisions.forEach((division) => {
    const option = document.createElement("option");
    option.value = division;
    option.textContent = division;
    divisionDropdown.appendChild(option);
  });
}

function renderRecentSessions(sessions) {
  if (!recentBody) return;

  if (!sessions.length) {
    recentBody.innerHTML = `<tr><td colspan="8">No sessions recorded yet.</td></tr>`;
    return;
  }

  const rows = sessions
    .map((session) => {
      const present = session.present_count ?? 0;
      const absent = session.absent_count ?? 0;
      const total = present + absent;
      const percentage = total ? asPercentage(present, total) : "—";

      return `
        <tr>
          <td>${formatDateTime(session.started_at)}</td>
          <td>${session.subject || "—"}</td>
          <td>${session.stream || "—"}</td>
          <td>${session.year || "—"}</td>
          <td>${session.division || "—"}</td>
          <td>${present}</td>
          <td>${absent}</td>
          <td>${percentage}</td>
        </tr>
      `;
    })
    .join("");

  recentBody.innerHTML = rows;
}

async function loadActivity() {
  try {
    const { activity } = await apiFetch("/api/teacher/activity");
    renderActivity(activity || []);
  } catch (error) {
    handleError(error, "Unable to load activity log");
  }
}

function formatActivityAction(action) {
  switch (action) {
    case "START_ATTENDANCE":
      return "Session started";
    case "END_ATTENDANCE":
      return "Session ended";
    case "MANUAL_OVERRIDE":
      return "Manual override";
    default:
      return action;
  }
}

function renderActivity(activity) {
  if (!activityBody) return;

  if (!activity.length) {
    activityBody.innerHTML = `<tr><td colspan="3">No activity yet.</td></tr>`;
    return;
  }

  const rows = activity
    .map((item) => {
      let meta = {};
      if (item.details) {
        try {
          meta = JSON.parse(item.details);
        } catch (error) {
          console.warn("Unable to parse activity details", error);
        }
      }

      const detailText = buildDetailText(item.action, meta);

      return `
        <tr>
          <td>${formatDateTime(item.created_at)}</td>
          <td>${formatActivityAction(item.action)}</td>
          <td>${detailText}</td>
        </tr>
      `;
    })
    .join("");

  activityBody.innerHTML = rows;
}

function handleClearRecent() {
  if (
    !confirm(
      "Are you sure you want to clear the Recent Classes list? This will only clear the display, not delete records from the database.",
    )
  ) {
    return;
  }

  if (recentBody) {
    recentBody.innerHTML =
      '<tr><td colspan="8">Recent classes cleared.</td></tr>';
    showToast({
      title: "Cleared",
      message: "Recent classes list has been cleared.",
      type: "success",
    });
  }
}

function handleClearActivity() {
  if (
    !confirm(
      "Are you sure you want to clear the Activity Log? This will only clear the display, not delete records from the database.",
    )
  ) {
    return;
  }

  if (activityBody) {
    activityBody.innerHTML =
      '<tr><td colspan="3">Activity log cleared.</td></tr>';
    showToast({
      title: "Cleared",
      message: "Activity log has been cleared.",
      type: "success",
    });
  }
}

function buildDetailText(action, meta) {
  if (!meta || typeof meta !== "object") return "—";

  if (action === "START_ATTENDANCE") {
    return (
      [meta.subject, meta.stream, meta.division].filter(Boolean).join(" · ") ||
      "—"
    );
  }

  if (action === "END_ATTENDANCE") {
    const present = meta.present ?? 0;
    const absent = meta.absent ?? 0;
    const total = present + absent;
    const percentage = total ? asPercentage(present, total) : "—";
    return `${meta.subject || "Class"
      } • ${percentage} (${present} present/${absent} absent)`;
  }

  if (action === "MANUAL_OVERRIDE") {
    const status = meta.status === "P" ? "present" : "absent";
    const reason = meta.reason ? ` – ${meta.reason}` : "";
    return `Student ${meta.studentId || "—"} marked ${status}${reason}`;
  }

  return (
    Object.entries(meta)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ") || "—"
  );
}

function updateSnapshot(details) {
  snapshotSubject.textContent = details?.subject || "–";
  snapshotYear.textContent = details?.year || "–";
  snapshotSemester.textContent = details?.semester || "–";
  snapshotDivision.textContent = details?.division || "–";
  snapshotStream.textContent = details?.stream || "–";
  snapshotStart.textContent = details?.startedAt
    ? formatDateTime(details.startedAt)
    : "–";
}

function updateSessionBadges() {
  if (!currentSession) {
    badgeSize.textContent = "0 students";
    badgePresent.textContent = "0 present";
    badgeAbsent.textContent = "0 absent";
    return;
  }

  const total = currentSession.students.length;
  const present = currentSession.students.filter(
    (item) => item.status === "P",
  ).length;
  const absent = total - present;

  badgeSize.textContent = `${total} student${total === 1 ? "" : "s"}`;
  badgePresent.textContent = `${present} present`;
  badgeAbsent.textContent = `${absent} absent`;
}

function renderActiveSession() {
  if (!activeSection || !attendanceBody) return;

  if (!currentSession) {
    activeSection.style.display = "none";
    attendanceBody.innerHTML = `
      <tr>
        <td colspan="4">Tap "Start attendance" to begin.</td>
      </tr>
    `;
    updateSnapshot(null);
    updateSessionBadges();
    return;
  }

  activeSection.style.display = "block";
  updateSnapshot(currentSession);
  updateSessionBadges();

  // Sort students by roll number in ascending order before rendering
  const sortedStudents = [...currentSession.students].sort((a, b) => {
    const rollA = parseInt(a.rollNo) || 0;
    const rollB = parseInt(b.rollNo) || 0;
    return rollA - rollB;
  });

  const rows = sortedStudents
    .map(
      (student) => `
        <tr data-student="${student.id}">
          <td>${student.rollNo || "–"}</td>
          <td>${student.id}</td>
          <td>${student.name}</td>
          <td>
            <button type="button" class="status-pill" data-toggle-status data-status="${student.status
        }" data-student="${student.id}">
              ${student.status === "P" ? "Present" : "Absent"}
            </button>
          </td>
        </tr>
      `,
    )
    .join("");

  attendanceBody.innerHTML = rows;
}

function toggleStudentStatus(studentId) {
  if (!currentSession) return;

  const target = currentSession.students.find(
    (student) => student.id === studentId,
  );
  if (!target) return;

  target.status = target.status === "P" ? "A" : "P";
  renderActiveSession();
}

function attachAttendanceEvents() {
  if (!attendanceBody) return;

  attendanceBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-toggle-status]");
    if (!button) return;

    const studentId = button.dataset.student;
    toggleStudentStatus(studentId);
  });
}

async function handleStartSession(event) {
  event.preventDefault();
  if (!sessionForm) return;

  if (currentSession) {
    showToast({
      title: "Session active",
      message: "End the current session before starting another.",
      type: "warning",
    });
    return;
  }

  const submitButton = sessionForm.querySelector('button[value="submit"]');
  const formData = new FormData(sessionForm);
  const payload = {
    subject: formData.get("subject")?.trim(),
    year: formData.get("year")?.trim(),
    semester: formData.get("semester")?.trim(),
    stream: formData.get("stream")?.trim(),
    division: formData.get("division")?.trim(),
  };

  if (
    !payload.subject ||
    !payload.year ||
    !payload.semester ||
    !payload.stream ||
    !payload.division
  ) {
    showToast({
      title: "Missing info",
      message:
        "Please fill all required fields: subject, year, semester, stream, and division.",
      type: "warning",
    });
    return;
  }

  try {
    toggleLoading(submitButton, true);
    const response = await apiFetch("/api/teacher/attendance/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const students = Array.isArray(response.students)
      ? response.students.map((student) => ({
        id: student.student_id,
        name: student.student_name,
        rollNo: student.roll_no,
        stream: student.stream,
        division: student.division,
        status: "P",
      })).sort((a, b) => {
        // Sort by roll number in ascending order
        const rollA = parseInt(a.rollNo) || 0;
        const rollB = parseInt(b.rollNo) || 0;
        return rollA - rollB;
      })
      : [];

    currentSession = {
      id: response.sessionId,
      subject: payload.subject,
      year: payload.year,
      semester: payload.semester,
      stream: payload.stream,
      division: payload.division,
      startedAt: new Date(),
      students,
    };

    lastSessionDetails = { ...payload };

    renderActiveSession();
    sessionForm.reset();
    sessionModal.close();

    showToast({
      title: "Session ready",
      message: "Attendance session started.",
      type: "success",
    });
  } catch (error) {
    handleError(error, "Unable to start attendance session");
  } finally {
    toggleLoading(submitButton, false);
  }
}

async function exportAttendanceCsv(summary) {
  if (!currentSession) return;

  // Request server to generate formatted Excel file
  try {
    const payload = {
      sessionId: currentSession.id,
      subject: currentSession.subject,
      year: currentSession.year,
      semester: currentSession.semester,
      stream: currentSession.stream,
      division: currentSession.division,
      startedAt: currentSession.startedAt,
      teacherName: teacherData?.name || "Teacher",
      summary: summary,
      students: currentSession.students.map((s) => ({
        rollNo: s.rollNo ?? "",
        studentId: s.id,
        name: s.name,
        status: s.status,
      })),
    };

    const response = await fetch("/api/teacher/attendance/export-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to generate Excel file");
    }

    // Get the blob and download it
    const blob = await response.blob();

    // Build filename as requested: DD-MM-YYYY_HH-MM-SS_subjectname_attendance_record
    const pad = (n) => String(n).padStart(2, "0");
    const d = currentSession.startedAt
      ? new Date(currentSession.startedAt)
      : new Date();
    const datePart = `${pad(d.getDate())}-${pad(
      d.getMonth() + 1,
    )}-${d.getFullYear()}`;
    const timePart = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(
      d.getSeconds(),
    )}`;
    const subjectPart = (currentSession.subject || "session")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "_");
    const filename = `${datePart}_${timePart}_${subjectPart}_attendance_record.xlsx`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    // Also send backup to server for history
    const backupPayload = {
      filename,
      fileContent: await blob.text(), // Note: this will be binary, we'll handle it on server
      sessionId: currentSession.id,
      subject: currentSession.subject,
      year: currentSession.year,
      semester: currentSession.semester,
      stream: currentSession.stream,
      division: currentSession.division,
      startedAt: currentSession.startedAt,
      attendance: currentSession.students.map((s) => ({
        studentId: s.id,
        status: s.status,
      })),
    };

    apiFetch("/api/teacher/attendance/backup", {
      method: "POST",
      body: JSON.stringify(backupPayload),
    }).catch((err) => console.warn("Attendance backup failed:", err));
  } catch (err) {
    console.warn("Failed to export Excel:", err);
    showToast({
      title: "Export failed",
      message: "Unable to generate Excel file. Please try again.",
      type: "error",
    });
  }
}

async function handleEndSession() {
  if (!currentSession) {
    showToast({
      title: "No active session",
      message: "Start a session before ending attendance.",
      type: "warning",
    });
    return;
  }

  // Show confirmation modal with attendance summary
  const presentCount = currentSession.students.filter(s => s.status === "P").length;
  const absentCount = currentSession.students.filter(s => s.status === "A").length;

  if (confirmPresentEl) confirmPresentEl.textContent = presentCount;
  if (confirmAbsentEl) confirmAbsentEl.textContent = absentCount;

  if (saveConfirmationModal) {
    saveConfirmationModal.showModal();
  }
}

async function confirmAndSaveSession() {
  if (!currentSession) return;

  // Close the confirmation modal
  if (saveConfirmationModal) {
    saveConfirmationModal.close();
  }

  try {
    toggleLoading(endSessionButton, true);
    const payload = {
      sessionId: currentSession.id,
      subject: currentSession.subject,
      year: currentSession.year,
      semester: currentSession.semester,
      stream: currentSession.stream,
      division: currentSession.division,
      attendance: currentSession.students.map((student) => ({
        studentId: student.id,
        status: student.status,
      })),
    };

    const response = await apiFetch("/api/teacher/attendance/end", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast({
      title: "Attendance saved",
      message: "Session saved successfully. View it in the history tab.",
      type: "success",
    });

    currentSession = null;
    renderActiveSession();
    loadDashboard();
    loadActivity();
  } catch (error) {
    handleError(error, "Unable to end attendance session");
  } finally {
    toggleLoading(endSessionButton, false);
  }
}

function showStreamsModal() {
  if (!streamsModal) return;

  const list = streamsModal.querySelector("[data-streams-list]");
  if (list && availableStreams.length) {
    list.innerHTML = availableStreams
      .map(
        (stream) =>
          `<li style="padding: 0.75rem; border-bottom: 1px solid #eee; font-size: 1rem;">${stream}</li>`,
      )
      .join("");
  } else if (list) {
    list.innerHTML = '<li style="padding: 0.75rem;">No streams assigned</li>';
  }

  streamsModal.showModal();
}

function showDivisionsModal() {
  if (!divisionsModal) return;

  const list = divisionsModal.querySelector("[data-divisions-list]");
  if (list && availableDivisions.length) {
    list.innerHTML = availableDivisions
      .map(
        (division) =>
          `<li style="padding: 0.75rem; border-bottom: 1px solid #eee; font-size: 1rem;">${division}</li>`,
      )
      .join("");
  } else if (list) {
    list.innerHTML = '<li style="padding: 0.75rem;">No divisions assigned</li>';
  }

  divisionsModal.showModal();
}

function showYearsModal() {
  if (!yearsModal) return;

  const list = yearsModal.querySelector("[data-years-list]");
  if (list && availableYears.length) {
    list.innerHTML = availableYears
      .map(
        (year) =>
          `<li style="padding: 0.75rem; border-bottom: 1px solid #eee; font-size: 1rem;">${year}</li>`,
      )
      .join("");
  } else if (list) {
    list.innerHTML = '<li style="padding: 0.75rem;">No years assigned</li>';
  }

  yearsModal.showModal();
}

function showSubjectsModal() {
  if (!subjectsModal) return;

  const list = subjectsModal.querySelector("[data-subjects-list]");

  if (list && availableSubjects.length) {
    list.innerHTML = availableSubjects
      .map(
        (subject) =>
          `<li style="padding: 0.75rem; border-bottom: 1px solid #eee; font-size: 1rem;">${subject}</li>`,
      )
      .join("");
  } else if (list) {
    list.innerHTML = '<li style="padding: 0.75rem;">No subjects assigned</li>';
  }

  subjectsModal.showModal();
}

async function showSubjectSessionsModal() {
  if (!subjectSessionsModal) return;

  const list = subjectSessionsModal.querySelector("[data-subject-sessions-list]");

  if (!list) return;

  list.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  subjectSessionsModal.showModal();

  try {
    // Fetch subject session breakdown
    const response = await apiFetch("/api/teacher/subject-sessions");
    const subjectSessions = response.subjectSessions || [];

    if (subjectSessions.length) {
      list.innerHTML = subjectSessions
        .map(
          (session) => `
        <tr>
          <td>${session.subject || "—"}</td>
          <td>${session.year || "—"}</td>
          <td>${session.semester || "—"}</td>
          <td>${session.stream || "—"}</td>
          <td>${session.division || "—"}</td>
          <td><strong>${session.session_count || 0}</strong></td>
          <td><strong>${parseFloat(session.attendance_percentage || 0).toFixed(2)}%</strong></td>
        </tr>
      `,
        )
        .join("");
    } else {
      list.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No subject sessions found</td></tr>';
    }
  } catch (error) {
    console.error("Error loading subject sessions:", error);
    list.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--color-danger);">Failed to load subject sessions</td></tr>';
  }
}

async function showStudentsPresentModal() {
  if (!studentsPresentModal) return;

  const list = studentsPresentModal.querySelector(
    "[data-students-present-list]",
  );

  if (!list) return;

  list.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  studentsPresentModal.showModal();

  try {
    // Fetch all students who have been marked present at least once
    const response = await apiFetch("/api/teacher/students/present");
    const students = response.students || [];

    if (students.length) {
      list.innerHTML = students
        .map(
          (student) => `
        <tr>
          <td>${student.roll_no || "—"}</td>
          <td>${student.student_id || "—"}</td>
          <td>${student.student_name || "—"}</td>
          <td>${student.year || "—"}</td>
          <td>${student.stream || "—"}</td>
          <td>${student.division || "—"}</td>
        </tr>
      `,
        )
        .join("");
    } else {
      list.innerHTML =
        '<tr><td colspan="6">No students marked present yet</td></tr>';
    }
  } catch (error) {
    list.innerHTML = '<tr><td colspan="6">Failed to load students</td></tr>';
    handleError(error, "Unable to load students present data");
  }
}

function initDialogs() {
  if (startSessionButton && sessionModal && sessionForm) {
    startSessionButton.addEventListener("click", () => {
      if (currentSession) {
        showToast({
          title: "Session active",
          message: "End the current session before starting another.",
          type: "warning",
        });
        return;
      }

      sessionForm.reset();

      // Hide subject group and disable begin button initially
      const subjectGroup = document.querySelector("#subjectGroup");
      const beginButton = document.querySelector("#beginButton");
      if (subjectGroup) subjectGroup.style.display = "none";
      if (beginButton) beginButton.disabled = true;

      // Re-populate dropdowns after reset
      populateStreamDropdown();
      populateDivisionDropdown();

      // Pre-fill with teacher's stream
      if (teacherData?.stream) {
        sessionForm.querySelector("#sessionStream").value = teacherData.stream;
      }

      // Restore last session details if available
      if (lastSessionDetails) {
        if (lastSessionDetails.year) {
          sessionForm.querySelector("#sessionYear").value =
            lastSessionDetails.year;
        }
        if (lastSessionDetails.stream) {
          sessionForm.querySelector("#sessionStream").value =
            lastSessionDetails.stream;
        }
        if (lastSessionDetails.division) {
          sessionForm.querySelector("#sessionDivision").value =
            lastSessionDetails.division;
        }

        // If year, stream, and division are pre-filled, load subjects
        if (
          lastSessionDetails.year &&
          lastSessionDetails.stream &&
          lastSessionDetails.division
        ) {
          loadSubjectsForClass(
            lastSessionDetails.year,
            lastSessionDetails.stream,
            lastSessionDetails.division,
            lastSessionDetails.semester,
          ).then(() => {
            // After loading subjects, set the previously selected subject if available
            if (lastSessionDetails.subject) {
              const subjectDropdown =
                sessionForm.querySelector("#sessionSubject");
              if (subjectDropdown) {
                subjectDropdown.value = lastSessionDetails.subject;
              }
              if (beginButton) beginButton.disabled = false;
            }
          });
        }
      }

      sessionModal.showModal();
    });

    sessionForm.addEventListener("submit", handleStartSession);

    // Handle cancel button
    const cancelSessionButton = sessionModal.querySelector(
      "[data-cancel-session]",
    );
    if (cancelSessionButton) {
      cancelSessionButton.addEventListener("click", () => {
        sessionModal.close();
        sessionForm.reset();
        // Hide subject group when closing
        const subjectGroup = document.querySelector("#subjectGroup");
        const beginButton = document.querySelector("#beginButton");
        if (subjectGroup) subjectGroup.style.display = "none";
        if (beginButton) beginButton.disabled = true;
      });
    }
  }

  // Stats modal event listeners
  showStreamsButton?.addEventListener("click", showStreamsModal);
  showDivisionsButton?.addEventListener("click", showDivisionsModal);
  showYearsButton?.addEventListener("click", showYearsModal);
  showSubjectsButton?.addEventListener("click", showSubjectsModal);
  showSubjectSessionsButton?.addEventListener("click", showSubjectSessionsModal);
  showStudentsPresentButton?.addEventListener(
    "click",
    showStudentsPresentModal,
  );

  closeStreamsButton?.addEventListener("click", () => streamsModal?.close());
  closeDivisionsButton?.addEventListener("click", () =>
    divisionsModal?.close(),
  );
  closeYearsButton?.addEventListener("click", () => yearsModal?.close());
  closeSubjectsButton?.addEventListener("click", () => subjectsModal?.close());
  closeSubjectSessionsButton?.addEventListener("click", () => subjectSessionsModal?.close());
  closeStudentsPresentButton?.addEventListener("click", () =>
    studentsPresentModal?.close(),
  );
}

function initControls() {
  refreshButton?.addEventListener("click", async () => {
    showToast({
      title: "Refreshing",
      message: "Reloading dashboard data...",
      type: "info",
    });
    await loadDashboard();
  });

  refreshActivityButton?.addEventListener("click", async () => {
    showToast({
      title: "Refreshing",
      message: "Reloading activity log...",
      type: "info",
    });
    await loadActivity();
  });

  clearRecentButton?.addEventListener("click", handleClearRecent);
  clearActivityButton?.addEventListener("click", handleClearActivity);
  endSessionButton?.addEventListener("click", handleEndSession);

  // Save confirmation modal handlers
  confirmSaveSessionButton?.addEventListener("click", confirmAndSaveSession);
  cancelSaveConfirmationButton?.addEventListener("click", () => {
    if (saveConfirmationModal) {
      saveConfirmationModal.close();
    }
  });
  saveConfirmationModal?.addEventListener("click", (e) => {
    if (e.target === saveConfirmationModal) {
      saveConfirmationModal.close();
    }
  });

  viewHistoryButton?.addEventListener("click", async () => {
    if (historyModal) {
      historyModal.showModal();
      await loadAttendanceHistory();
    }
  });

  closeHistoryButton?.addEventListener("click", () => {
    if (historyModal) {
      historyModal.close();
    }
  });

  // ── Defaulter History button ────────────────────────────────────────────────
  viewDefaulterHistoryButton?.addEventListener("click", async () => {
    defaulterHistoryModal?.showModal();
    await loadDefaulterHistory();
  });

  closeDefaulterHistoryButton?.addEventListener("click", () => {
    defaulterHistoryModal?.close();
  });

  defaulterHistoryModal?.addEventListener("click", (e) => {
    if (e.target === defaulterHistoryModal) defaulterHistoryModal.close();
  });

  closeDefaulterHistoryDetailButton?.addEventListener("click", () => {
    defaulterHistoryDetailModal?.close();
  });

  defaulterHistoryDetailModal?.addEventListener("click", (e) => {
    if (e.target === defaulterHistoryDetailModal)
      defaulterHistoryDetailModal.close();
  });

  closePreviewButton?.addEventListener("click", () => {
    if (previewModal) {
      previewModal.close();
    }
  });

  signoutButton?.addEventListener("click", async (event) => {
    event.preventDefault();

    // Close live updates connection before logout
    cleanupLiveUpdates();

    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (error) {
      handleError(error, "Unable to sign out");
    }
  });
}

async function loadAttendanceHistory() {
  if (!historyBody) return;

  try {
    historyBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    const { history } = await apiFetch("/api/teacher/attendance/history");

    if (!history || !history.length) {
      historyBody.innerHTML =
        '<tr><td colspan="7">No attendance history found.</td></tr>';
      return;
    }

    const rows = history
      .map((item) => {
        const savedDate = formatDateTime(item.saved_at);
        return `
        <tr>
          <td>${item.filename || "—"}</td>
          <td>${item.subject || "—"}</td>
          <td>${item.stream || "—"}</td>
          <td>${item.year || "—"}</td>
          <td>${item.division || "—"}</td>
          <td>${savedDate}</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn ghost" data-view-backup="${item.id
          }" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;">
                View
              </button>
              <a href="/api/teacher/attendance/backup/${item.id
          }" class="btn ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;" download>
                Download
              </a>
              <button class="btn ghost" data-delete-backup="${item.id
          }" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; color: #dc3545;">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join("");

    historyBody.innerHTML = rows;

    // Add event listeners for view buttons
    const viewButtons = historyBody.querySelectorAll("[data-view-backup]");
    viewButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const backupId = btn.getAttribute("data-view-backup");
        viewAttendanceBackup(backupId);
      });
    });

    // Add event listeners for delete buttons
    const deleteButtons = historyBody.querySelectorAll("[data-delete-backup]");
    deleteButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const backupId = btn.getAttribute("data-delete-backup");
        deleteAttendanceBackup(backupId);
      });
    });
  } catch (error) {
    historyBody.innerHTML =
      '<tr><td colspan="6">Failed to load history.</td></tr>';
    handleError(error, "Unable to load attendance history");
  }
}

// ── Defaulter Lists History ───────────────────────────────────────────────────

async function loadDefaulterHistory() {
  if (!defaulterHistoryBody) return;

  defaulterHistoryBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

  try {
    const { history } = await apiFetch("/api/teacher/defaulters/history");

    if (!history || !history.length) {
      defaulterHistoryBody.innerHTML =
        '<tr><td colspan="5">No defaulter history found. Lists are saved automatically when you View them.</td></tr>';
      return;
    }

    const rows = history
      .map(
        (item) => `
        <tr>
          <td style="font-size:0.85rem">${item.filters_summary || "—"}</td>
          <td style="text-align:center">${item.threshold}%</td>
          <td style="text-align:center; color:#e74c3c; font-weight:600">${item.defaulter_count}</td>
          <td style="font-size:0.85rem">${formatDateTime(item.created_at)}</td>
          <td>
            <div style="display:flex; gap:0.4rem">
              <button class="btn ghost" data-dh-view="${item.id}"
                style="padding:0.25rem 0.65rem; font-size:0.8rem">View</button>
              <button class="btn ghost" data-dh-download="${item.id}"
                style="padding:0.25rem 0.65rem; font-size:0.8rem; color:#2980b9; border-color:#2980b9">Download</button>
              <button class="btn ghost" data-dh-delete="${item.id}"
                style="padding:0.25rem 0.65rem; font-size:0.8rem; color:#dc3545">Delete</button>
            </div>
          </td>
        </tr>
      `,
      )
      .join("");

    defaulterHistoryBody.innerHTML = rows;

    // View buttons
    defaulterHistoryBody.querySelectorAll("[data-dh-view]").forEach((btn) => {
      btn.addEventListener("click", () =>
        openDefaulterHistoryDetail(btn.getAttribute("data-dh-view")),
      );
    });

    // Download buttons
    defaulterHistoryBody
      .querySelectorAll("[data-dh-download]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-dh-download");
          window.open(
            `/api/teacher/defaulters/history/${id}/download`,
            "_blank",
          );
        });
      });

    // Delete buttons
    defaulterHistoryBody.querySelectorAll("[data-dh-delete]").forEach((btn) => {
      btn.addEventListener("click", () =>
        deleteDefaulterHistoryItem(btn.getAttribute("data-dh-delete")),
      );
    });
  } catch (error) {
    defaulterHistoryBody.innerHTML =
      '<tr><td colspan="5">Failed to load defaulter history.</td></tr>';
    handleError(error, "Unable to load defaulter history");
  }
}

async function openDefaulterHistoryDetail(id) {
  if (!defaulterHistoryDetailModal) return;

  defaulterHistoryDetailModal.showModal();
  defaulterHistoryDetailBody.innerHTML =
    '<tr><td colspan="7">Loading...</td></tr>';
  if (defaulterHistoryDetailSummary)
    defaulterHistoryDetailSummary.textContent = "Loading...";

  try {
    const { record, defaulters } = await apiFetch(
      `/api/teacher/defaulters/history/${id}`,
    );

    if (defaulterHistoryDetailSummary) {
      defaulterHistoryDetailSummary.textContent = `${record.filters_summary || ""} — ${record.defaulter_count} defaulter${record.defaulter_count !== 1 ? "s" : ""} · saved ${formatDateTime(record.created_at)}`;
    }

    if (!defaulters || defaulters.length === 0) {
      defaulterHistoryDetailBody.innerHTML =
        '<tr><td colspan="7" style="text-align:center; color:#27ae60">✅ No defaulters were recorded in this list.</td></tr>';
      return;
    }

    defaulterHistoryDetailBody.innerHTML = defaulters
      .map(
        (d, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${d.roll_no || "—"}</td>
          <td><strong>${d.student_name || "—"}</strong></td>
          <td>${d.year || d.year_value || "—"}</td>
          <td>${d.stream || "—"}</td>
          <td>${d.division || "—"}</td>
          <td>${d.attended_lectures || 0} / ${d.total_lectures || 0}</td>
          <td style="color:#e74c3c; font-weight:600">${d.attendance_percentage != null
            ? parseFloat(d.attendance_percentage).toFixed(2) + "%"
            : "—"
          }</td>
        </tr>
      `,
      )
      .join("");
  } catch (error) {
    defaulterHistoryDetailBody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
  }
}

async function deleteDefaulterHistoryItem(id) {
  const confirmed = confirm(
    "Delete this defaulter history entry?\nThis action cannot be undone.",
  );
  if (!confirmed) return;

  try {
    await apiFetch(`/api/teacher/defaulters/history/${id}`, {
      method: "DELETE",
    });
    showToast({
      title: "Deleted",
      message: "Defaulter history entry removed",
      type: "success",
    });
    await loadDefaulterHistory();
  } catch (error) {
    showToast({
      title: "Delete failed",
      message: error.message,
      type: "danger",
    });
  }
}

async function deleteAttendanceBackup(backupId) {
  console.log("=== DELETE FUNCTION CALLED (v3 - New Controller) ===");
  console.log("Delete called with backupId:", backupId);
  console.log("Type of backupId:", typeof backupId);

  if (!backupId) {
    console.error("ERROR: backupId is null or undefined!");
    return;
  }

  // Show confirmation dialog with warning
  const confirmed = confirm(
    "⚠️ WARNING: Are you sure you want to delete this attendance history?\n\n" +
    "This action CANNOT be undone!\n" +
    "Once deleted, you will NOT be able to retrieve this data again.\n\n" +
    "Click 'OK' to permanently delete, or 'Cancel' to keep the data.",
  );

  if (!confirmed) {
    console.log("Delete cancelled by user");
    return; // User cancelled
  }

  const deleteUrl = `/api/teacher/attendance/delete-history`;
  console.log("Sending POST request to:", deleteUrl);
  console.log("With body:", { backupId });

  try {
    const data = await apiFetch(deleteUrl, {
      method: "POST",
      body: JSON.stringify({ backupId }),
    });

    console.log("Delete successful:", data);
    showToast({
      title: "Success",
      message: data.message || "Attendance history deleted successfully",
      type: "success",
    });

    // Reload the history list
    await loadAttendanceHistory();
  } catch (error) {
    console.error("Delete error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
    });
    handleError(error, "Unable to delete attendance history");
  }
}

async function viewAttendanceBackup(backupId) {
  if (!previewModal || !previewStudentsBody) return;

  try {
    // Show modal with loading state
    previewModal.showModal();
    previewStudentsBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    // Fetch backup data
    const data = await apiFetch(
      `/api/teacher/attendance/backup/${backupId}/view`,
    );

    if (!data || !data.sessionInfo) {
      throw new Error("Invalid backup data");
    }

    const { sessionInfo, students } = data;

    // Populate session information
    document.querySelector("[data-preview-session-id]").textContent =
      sessionInfo.sessionId || "—";
    document.querySelector("[data-preview-subject]").textContent =
      sessionInfo.subject || "—";
    document.querySelector("[data-preview-year]").textContent =
      sessionInfo.year || "—";
    document.querySelector("[data-preview-semester]").textContent =
      sessionInfo.semester || "—";
    document.querySelector("[data-preview-stream]").textContent =
      sessionInfo.stream || "—";
    document.querySelector("[data-preview-division]").textContent =
      sessionInfo.division || "—";
    document.querySelector("[data-preview-teacher]").textContent =
      sessionInfo.teacher || "—";
    document.querySelector("[data-preview-datetime]").textContent =
      sessionInfo.startedAt ? formatDateTime(sessionInfo.startedAt) : "—";
    document.querySelector("[data-preview-present]").textContent =
      sessionInfo.present || 0;
    document.querySelector("[data-preview-absent]").textContent =
      sessionInfo.absent || 0;
    document.querySelector("[data-preview-total]").textContent =
      sessionInfo.total || 0;

    // Populate students table
    if (!students || students.length === 0) {
      previewStudentsBody.innerHTML =
        '<tr><td colspan="4">No student records found.</td></tr>';
      return;
    }

    const studentRows = students
      .map((student) => {
        const isPresent = student.status === "P";
        const statusClass = isPresent ? "text-success" : "text-danger";
        const statusText = isPresent ? "Present" : "Absent";
        const rowStyle = isPresent
          ? "background: #d4edda;"
          : "background: #f8d7da;";

        return `
        <tr style="${rowStyle}">
          <td>${student.rollNo || "—"}</td>
          <td>${student.studentId || "—"}</td>
          <td>${student.name || "—"}</td>
          <td class="${statusClass}" style="font-weight: 600;">${statusText}</td>
        </tr>
      `;
      })
      .join("");

    previewStudentsBody.innerHTML = studentRows;
  } catch (error) {
    previewStudentsBody.innerHTML =
      '<tr><td colspan="4">Failed to load attendance data.</td></tr>';
    handleError(error, "Unable to load attendance preview");
  }
}

function initDefaulterButton() {
  const defaulterModal = document.querySelector("[data-defaulter-modal]");
  const defaulterForm = document.querySelector("[data-defaulter-form]");
  const defaulterCancelButton = document.querySelector(
    "[data-defaulter-cancel]",
  );
  const defaulterNextButton = document.querySelector("[data-defaulter-next]");
  const defaulterPrevButton = document.querySelector("[data-defaulter-prev]");
  const defaulterViewButton = document.querySelector("[data-defaulter-view]");
  const defaulterExportButton = document.querySelector(
    "[data-defaulter-export]",
  );
  const tabButtons = document.querySelectorAll("[data-defaulter-tab]");
  const tabContents = document.querySelectorAll("[data-tab-content]");

  const tabs = ["year", "stream", "division", "month", "date", "percentage"];
  let currentTabIndex = 0;

  // Open modal
  const generateDefaultersButton = document.querySelector(
    "[data-generate-defaulters]",
  );
  if (!generateDefaultersButton) return;

  generateDefaultersButton.addEventListener("click", async () => {
    // Populate year, stream, division with ONLY this teacher's assigned values
    const yearSelect = document.getElementById("defaulterYear");
    const streamSelect = document.getElementById("defaulterStream");
    const divisionSelect = document.getElementById("defaulterDivision");

    // ── Year ──────────────────────────────────────────────────────────────
    yearSelect.innerHTML = '<option value="">Select year...</option>';
    (availableYears.length ? availableYears : ["FY", "SY", "TY"]).forEach(
      (yr) => {
        const opt = document.createElement("option");
        opt.value = yr;
        opt.textContent = yr;
        yearSelect.appendChild(opt);
      },
    );
    if (availableYears.length === 1) yearSelect.value = availableYears[0];

    // ── Stream ────────────────────────────────────────────────────────────
    streamSelect.innerHTML = '<option value="">Select stream...</option>';
    availableStreams.forEach((stream) => {
      const opt = document.createElement("option");
      opt.value = stream;
      opt.textContent = stream;
      streamSelect.appendChild(opt);
    });
    if (availableStreams.length === 1) streamSelect.value = availableStreams[0];

    // ── Division ──────────────────────────────────────────────────────────
    divisionSelect.innerHTML = '<option value="">Select division...</option>';
    availableDivisions.forEach((division) => {
      const opt = document.createElement("option");
      opt.value = division;
      opt.textContent = division;
      divisionSelect.appendChild(opt);
    });
    if (availableDivisions.length === 1)
      divisionSelect.value = availableDivisions[0];

    // Reset to first tab
    currentTabIndex = 0;
    showTab(currentTabIndex);
    defaulterModal?.showModal();
  });

  // Tab navigation
  function showTab(index) {
    currentTabIndex = index;

    // Update tab buttons
    tabButtons.forEach((btn, i) => {
      if (i === index) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update tab content
    tabContents.forEach((content, i) => {
      if (i === index) {
        content.style.display = "block";
        content.classList.add("active");
      } else {
        content.style.display = "none";
        content.classList.remove("active");
      }
    });

    // Update button visibility
    if (defaulterPrevButton)
      defaulterPrevButton.style.display = index > 0 ? "block" : "none";
    if (defaulterNextButton)
      defaulterNextButton.style.display =
        index < tabs.length - 1 ? "block" : "none";
    const isLast = index === tabs.length - 1;
    if (defaulterViewButton)
      defaulterViewButton.style.display = isLast ? "block" : "none";
    if (defaulterExportButton)
      defaulterExportButton.style.display = isLast ? "block" : "none";

    // Auto-load dates when Date tab is shown (index 4)
    if (index === 4) {
      loadAvailableDates();
    }
  }

  // Fetch available dates based on selected month
  async function loadAvailableDates() {
    const monthSelect = document.getElementById("defaulterMonth");
    const startDateSelect = document.getElementById("defaulterStartDate");
    const endDateSelect = document.getElementById("defaulterEndDate");
    const yearSelect = document.getElementById("defaulterYear");
    
    if (!startDateSelect || !endDateSelect) {
      console.warn("Date selectors not found");
      return;
    }
    
    const yearValue = yearSelect?.value;
    const month = monthSelect?.value;

    if (!month || month === "ALL") {
      startDateSelect.innerHTML = '<option value="">Select start date...</option>';
      endDateSelect.innerHTML = '<option value="">Select end date...</option>';
      return;
    }

    try {
      // Generate dates for the selected month
      // Extract year - handle both academic year formats (FY, SY, TY) and actual years
      let year = new Date().getFullYear(); // Default to current year
      
      if (yearValue && yearValue !== "ALL") {
        // Try to extract a 4-digit year from the value
        const yearMatch = yearValue.match(/\d{4}/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
        }
        // Otherwise use current year for academic year selections (FY, SY, TY)
      }
      
      const monthNum = parseInt(month);
      
      // Get number of days in the month
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      const dates = [];
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthNum - 1, day);
        const dateStr = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        dates.push(dateStr);
      }

      // Populate start date
      startDateSelect.innerHTML = '<option value="">Select start date...</option>';
      dates.forEach(date => {
        const option = document.createElement("option");
        option.value = date;
        option.textContent = new Date(date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        startDateSelect.appendChild(option);
      });

      // Populate end date
      endDateSelect.innerHTML = '<option value="">Select end date...</option>';
      dates.forEach(date => {
        const option = document.createElement("option");
        option.value = date;
        option.textContent = new Date(date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        endDateSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Failed to generate dates:", error);
      startDateSelect.innerHTML = '<option value="">Error generating dates</option>';
      endDateSelect.innerHTML = '<option value="">Error generating dates</option>';
    }
  }

  // Add month change listener  
  const monthSelect = document.getElementById("defaulterMonth");
  monthSelect?.addEventListener("change", loadAvailableDates);

  // Add year change listener
  const yearSelect = document.getElementById("defaulterYear");
  yearSelect?.addEventListener("change", loadAvailableDates);

  // Tab button clicks
  tabButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      showTab(index);
    });
  });

  // Next button
  defaulterNextButton?.addEventListener("click", () => {
    const currentTab = tabs[currentTabIndex];
    const currentField = document.querySelector(
      `[data-tab-content="${currentTab}"] select, [data-tab-content="${currentTab}"] input`,
    );

    if (currentField && !currentField.checkValidity()) {
      currentField.reportValidity();
      return;
    }

    if (currentTabIndex < tabs.length - 1) {
      showTab(currentTabIndex + 1);
    }
  });

  // Previous button
  defaulterPrevButton?.addEventListener("click", () => {
    if (currentTabIndex > 0) {
      showTab(currentTabIndex - 1);
    }
  });

  // Cancel button
  defaulterCancelButton?.addEventListener("click", () => {
    defaulterModal?.close();
    defaulterForm?.reset();
  });

  // Helper: collect current form params
  function buildDefaulterParams() {
    const formData = new FormData(defaulterForm);
    const year = formData.get("year");
    const stream = formData.get("stream");
    const division = formData.get("division");
    const month = formData.get("month");
    const startDate = formData.get("start_date");
    const endDate = formData.get("end_date");
    const threshold = formData.get("threshold");

    const params = new URLSearchParams({ threshold: parseFloat(threshold) });
    if (month && month !== "ALL") params.append("month", month);
    if (year && year !== "ALL") params.append("year", year);
    if (stream && stream !== "ALL") params.append("stream", stream);
    if (division && division !== "ALL") params.append("division", division);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    return { params, year, stream, division, month, startDate, endDate, threshold };
  }

  // ── VIEW button: fetch JSON and show results modal ──────────────────────
  const defaulterResultsModal = document.querySelector(
    "[data-defaulter-results-modal]",
  );
  const defaulterResultsBody = document.querySelector(
    "[data-defaulter-results-body]",
  );
  const defaulterResultsSummary = document.querySelector(
    "[data-defaulter-results-summary]",
  );
  const defaulterResultsExportBtn = document.querySelector(
    "[data-defaulter-results-export]",
  );
  const closeDefaulterResults = document.querySelector(
    "[data-close-defaulter-results]",
  );

  closeDefaulterResults?.addEventListener("click", () =>
    defaulterResultsModal?.close(),
  );
  defaulterResultsModal?.addEventListener("click", (e) => {
    if (e.target === defaulterResultsModal) defaulterResultsModal.close();
  });

  // Store last used params so Export button inside results modal can reuse them
  let lastDefaulterParams = null;

  defaulterViewButton?.addEventListener("click", async () => {
    const { params, year, stream, division, month, threshold } =
      buildDefaulterParams();
    lastDefaulterParams = { params, year, stream, division, month, threshold };

    defaulterModal?.close();
    defaulterResultsBody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
    if (defaulterResultsSummary)
      defaulterResultsSummary.textContent = "Loading defaulter list...";
    defaulterResultsModal?.showModal();

    try {
      const response = await fetch(
        `/api/teacher/defaulters?${params.toString()}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ message: "Failed to fetch defaulter list" }));
        throw new Error(err.message);
      }

      const data = await response.json();
      const defaulters = data.defaulters || [];

      if (defaulterResultsSummary) {
        defaulterResultsSummary.textContent = `${defaulters.length} defaulter${defaulters.length !== 1 ? "s" : ""} below ${threshold}% attendance`;
      }

      if (defaulters.length === 0) {
        defaulterResultsBody.innerHTML =
          '<tr><td colspan="8" style="text-align:center; color: #27ae60">✅ No defaulters found — all students meet the threshold.</td></tr>';
        return;
      }

      defaulterResultsBody.innerHTML = defaulters
        .map(
          (d, i) => {
            const lecturesInfo = `${d.attended_lectures || 0} / ${d.total_lectures || 0}`;
            return `
        <tr>
          <td>${i + 1}</td>
          <td>${d.roll_no || "—"}</td>
          <td><strong>${d.student_name || "—"}</strong></td>
          <td>${d.year || d.year_value || "—"}</td>
          <td>${d.stream || "—"}</td>
          <td>${d.division || "—"}</td>
          <td>${lecturesInfo}</td>
          <td style="color:#e74c3c; font-weight:600">${d.attendance_percentage != null
                ? parseFloat(d.attendance_percentage).toFixed(2) + "%"
                : "—"
              }</td>
        </tr>
      `;
          },
        )
        .join("");
    } catch (error) {
      defaulterResultsBody.innerHTML = `<tr><td colspan="8">Error: ${error.message}</td></tr>`;
      showToast({
        title: "Unable to load defaulter list",
        message: error.message,
        type: "danger",
      });
    }
  });

  // ── EXPORT button (in wizard) ──────────────────────────────────────────
  async function downloadDefaulterExcel({ params, year, month, threshold }) {
    const response = await fetch(
      `/api/teacher/defaulters/download?${params.toString()}`,
      { method: "GET", credentials: "include" },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to generate defaulter list" }));
      throw new Error(error.message);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const monthName = month === "ALL" ? "All" : month || "All";
    const yearName = year === "ALL" ? "All" : year || "All";
    a.download = `Defaulter_List_${threshold}%_${monthName}_${yearName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  defaulterExportButton?.addEventListener("click", async () => {
    const exportData = buildDefaulterParams();
    try {
      toggleLoading(defaulterExportButton, true);
      defaulterModal?.close();
      await downloadDefaulterExcel(exportData);
      showToast({
        title: "Success",
        message: `Defaulter list exported with ${exportData.threshold}% threshold`,
        type: "success",
      });
      defaulterForm?.reset();
    } catch (error) {
      showToast({
        title: "Unable to export defaulter list",
        message: error.message,
        type: "danger",
      });
    } finally {
      toggleLoading(defaulterExportButton, false);
    }
  });

  // ── EXPORT button inside the results modal ─────────────────────────────
  defaulterResultsExportBtn?.addEventListener("click", async () => {
    if (!lastDefaulterParams) return;
    try {
      toggleLoading(defaulterResultsExportBtn, true);
      await downloadDefaulterExcel(lastDefaulterParams);
      showToast({
        title: "Exported",
        message: "Defaulter list downloaded successfully",
        type: "success",
      });
    } catch (error) {
      showToast({
        title: "Export failed",
        message: error.message,
        type: "danger",
      });
    } finally {
      toggleLoading(defaulterResultsExportBtn, false);
    }
  });

  // Close modal on backdrop click
  defaulterModal?.addEventListener("click", (e) => {
    if (e.target === defaulterModal) {
      defaulterModal.close();
      defaulterForm?.reset();
    }
  });
}

// Setup live updates with Server-Sent Events
let liveEventSource = null;

function setupLiveUpdates() {
  // Close existing connection if any
  if (liveEventSource) {
    liveEventSource.close();
    liveEventSource = null;
  }

  liveEventSource = new EventSource("/api/teacher/live-updates");

  liveEventSource.addEventListener("attendance_marked", (event) => {
    const data = JSON.parse(event.data);
    // Only show if it's from another teacher
    if (teacherData && data.teacherId !== teacherData.id) {
      showToast({
        title: "Attendance Marked",
        message: `${data.teacherName} marked attendance for ${data.subject} - ${data.year} ${data.stream} ${data.division}`,
        type: "info",
      });
    }
    // Refresh dashboard to show updated stats
    loadDashboard();
  });

  liveEventSource.addEventListener("data_import", (event) => {
    const data = JSON.parse(event.data);
    showToast({
      title: "Data Updated",
      message: `Student/Teacher data has been updated`,
      type: "info",
    });
    loadDashboard();
  });

  liveEventSource.addEventListener("defaulter_generated", (event) => {
    const data = JSON.parse(event.data);
    if (data.role === "teacher") {
      showToast({
        title: "Defaulter List Generated",
        message: `${data.count} defaulters found`,
        type: "info",
      });
    }
    loadActivity();
  });

  liveEventSource.addEventListener("stats_update", (event) => {
    loadDashboard();
  });

  liveEventSource.onerror = (error) => {
    console.error("SSE connection error:", error);
    if (liveEventSource) {
      liveEventSource.close();
      liveEventSource = null;
    }
    // Retry connection after 5 seconds
    setTimeout(setupLiveUpdates, 5000);
  };
}

// Cleanup live updates connection on page unload
function cleanupLiveUpdates() {
  if (liveEventSource) {
    console.log("🔌 Closing SSE connection on page unload");
    liveEventSource.close();
    liveEventSource = null;
  }
}

// Multiple event handlers to ensure cleanup
window.addEventListener("beforeunload", cleanupLiveUpdates);
window.addEventListener("pagehide", cleanupLiveUpdates);
window.addEventListener("unload", cleanupLiveUpdates);

// Close connection when page becomes hidden (tab switch, minimize, etc.)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cleanupLiveUpdates();
  } else {
    // Reconnect when page becomes visible again
    if (!liveEventSource) {
      setupLiveUpdates();
    }
  }
});

// Search functionality for student lookup
function performSearch() {
  const searchInput = document.getElementById('teacherSearchInput');
  const searchValue = searchInput.value.trim();
  
  if (!searchValue) {
    showToast({
      title: 'Search Required',
      message: 'Please enter a Student ID',
      type: 'error'
    });
    return;
  }
  
  // Search for student only (teachers cannot search other teachers)
  searchStudent(searchValue);
}

async function searchStudent(studentId) {
  try {
    const response = await apiFetch(`/api/teacher/search/student/${encodeURIComponent(studentId)}`);
    
    if (response.success && response.data) {
      displayStudentDetails(response.data);
    } else {
      showToast({
        title: 'Not Found',
        message: response.message || 'Student not found or not assigned to you',
        type: 'error'
      });
    }
  } catch (error) {
    console.error('Error searching student:', error);
    showToast({
      title: 'Search Error',
      message: 'Error searching for student. Please try again.',
      type: 'error'
    });
  }
}

function displayStudentDetails(student) {
  const studentDetailsModal = document.querySelector('[data-student-details-modal]');
  const studentDetailsContent = document.querySelector('[data-student-details-content]');
  
  if (!studentDetailsModal || !studentDetailsContent) {
    console.error('Student details modal elements not found');
    return;
  }
  
  // Calculate attendance percentage
  const attendancePercentage = student.total_sessions > 0 
    ? ((student.attendance_count / student.total_sessions) * 100).toFixed(2)
    : '0.00';
  
  // Determine attendance status
  const attendanceColor = parseFloat(attendancePercentage) >= 75 ? '#27ae60' : '#e74c3c';
  
  studentDetailsContent.innerHTML = `
    <div class="card" style="background: #f8f9fa; padding: 1.5rem;">
      <div style="display: grid; gap: 1rem;">
        <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
          <h2 style="margin: 0; color: #2c3e50;">${escapeHtml(student.student_name)}</h2>
          <p style="margin: 0.5rem 0 0; color: #7f8c8d; font-size: 0.9rem;">
            ID: ${escapeHtml(student.student_id)}
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div style="background: white; padding: 1rem; border-radius: 8px;">
            <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Roll No</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${escapeHtml(student.roll_no || 'N/A')}</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 8px;">
            <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Year</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${escapeHtml(student.year)}</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 8px;">
            <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Stream</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${escapeHtml(student.stream)}</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 8px;">
            <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Division</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${escapeHtml(student.division)}</div>
          </div>
        </div>

        <div 
          data-attendance-clickable
          data-student-id="${student.student_id}"
          style="background: ${attendanceColor}15; border: 2px solid ${attendanceColor}; padding: 1.5rem; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.2s;"
          onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';"
          onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
        >
          <div style="color: #7f8c8d; font-size: 0.9rem; margin-bottom: 0.5rem;">Overall Attendance (Click to view details)</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: ${attendanceColor};">
            ${attendancePercentage}%
          </div>
          <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">
            ${student.total_sessions || 0} total lectures | ${student.attendance_count || 0} attended
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Attach click event to attendance section
  const attendanceSection = studentDetailsContent.querySelector('[data-attendance-clickable]');
  if (attendanceSection) {
    attendanceSection.addEventListener('click', () => {
      const studentId = attendanceSection.getAttribute('data-student-id');
      showSessionAttendance(studentId);
    });
  }
  
  studentDetailsModal?.showModal();
}

function closeStudentModal() {
  const studentDetailsModal = document.querySelector('[data-student-details-modal]');
  studentDetailsModal?.close();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Session Attendance Modal Functions
let allSessionData = []; // Store all session data for filtering

async function showSessionAttendance(studentId) {
  const sessionAttendanceModal = document.querySelector('[data-session-attendance-modal]');
  const sessionAttendanceContent = document.querySelector('[data-session-attendance-content]');
  
  if (!sessionAttendanceModal || !sessionAttendanceContent) {
    console.error('Session attendance modal elements not found');
    return;
  }
  
  try {
    sessionAttendanceContent.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #666;">
        <p style="margin-top: 1rem;">Loading session attendance data...</p>
      </div>
    `;
    
    sessionAttendanceModal?.showModal();
    
    console.log(`Fetching sessions for student: ${studentId}`);
    const response = await apiFetch(`/api/teacher/student/${encodeURIComponent(studentId)}/sessions`);
    console.log('Session response:', response);
    
    if (response.success && response.data) {
      allSessionData = response.data;
      if (allSessionData.length === 0) {
        sessionAttendanceContent.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #7f8c8d;">
            <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">📝 No attendance sessions found</p>
            <p style="font-size: 0.9rem; color: #95a5a6;">This student has no attendance records yet.</p>
          </div>
        `;
      } else {
        renderSessionAttendanceTable(allSessionData);
      }
    } else {
      sessionAttendanceContent.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #e74c3c;">
          <p>${response.message || 'No session attendance data found.'}</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error fetching session attendance:', error);
    sessionAttendanceContent.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #e74c3c;">
        <p style="font-weight: 600; margin-bottom: 0.5rem;">⚠️ Error loading session attendance data</p>
        <p style="font-size: 0.9rem; color: #c0392b;">${error.message || 'Please try again later.'}</p>
      </div>
    `;
  }
}

function renderSessionAttendanceTable(sessions, highlightQuery = '') {
  const sessionAttendanceContent = document.querySelector('[data-session-attendance-content]');
  
  if (!sessionAttendanceContent) return;
  
  if (!sessions || sessions.length === 0) {
    sessionAttendanceContent.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #666;">
        <p>No session records found.</p>
      </div>
    `;
    return;
  }

  const tableHTML = `
    <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <thead>
        <tr style="background: #3498db; color: white;">
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Student ID</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Name</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Roll No</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Year</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Stream</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Division</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Date</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Status</th>
          <th style="padding: 1rem; text-align: left; font-weight: 600;">Teacher</th>
        </tr>
      </thead>
      <tbody>
        ${sessions.map((session, index) => {
          const isHighlighted = highlightQuery && shouldHighlightRow(session, highlightQuery);
          const rowStyle = `
            background: ${isHighlighted ? '#fff3cd' : index % 2 === 0 ? '#f8f9fa' : 'white'};
            border-bottom: 1px solid #dee2e6;
            ${isHighlighted ? 'box-shadow: inset 0 0 0 2px #ffc107;' : ''}
          `;
          const isPresent = session.status?.toUpperCase() === 'P';
          const statusColor = isPresent ? '#27ae60' : '#e74c3c';
          const statusText = isPresent ? 'Present' : 'Absent';
          const formattedDate = session.date ? new Date(session.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }) : 'N/A';
          
          return `
            <tr style="${rowStyle}">
              <td style="padding: 0.75rem;">${escapeHtml(session.student_id || 'N/A')}</td>
              <td style="padding: 0.75rem;">${escapeHtml(session.student_name || 'N/A')}</td>
              <td style="padding: 0.75rem;">${escapeHtml(session.roll_no || 'N/A')}</td>
              <td style="padding: 0.75rem;">${escapeHtml(session.year || 'N/A')}</td>
              <td style="padding: 0.75rem;">${escapeHtml(session.stream || 'N/A')}</td>
              <td style="padding: 0.75rem;">${escapeHtml(session.division || 'N/A')}</td>
              <td style="padding: 0.75rem;">${formattedDate}</td>
              <td style="padding: 0.75rem;">
                <span style="
                  display: inline-block;
                  padding: 0.25rem 0.75rem;
                  border-radius: 12px;
                  background: ${statusColor}15;
                  color: ${statusColor};
                  font-weight: 600;
                  font-size: 0.85rem;
                ">${statusText}</span>
              </td>
              <td style="padding: 0.75rem;">${escapeHtml(session.teacher || 'N/A')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  sessionAttendanceContent.innerHTML = tableHTML;
}

function shouldHighlightRow(session, query) {
  const lowerQuery = query.toLowerCase();
  // Convert status to display text for searching
  const statusText = session.status?.toUpperCase() === 'P' ? 'present' : 'absent';
  return (
    (session.student_id || '').toLowerCase().includes(lowerQuery) ||
    (session.student_name || '').toLowerCase().includes(lowerQuery) ||
    (session.roll_no || '').toLowerCase().includes(lowerQuery) ||
    (session.year || '').toLowerCase().includes(lowerQuery) ||
    (session.stream || '').toLowerCase().includes(lowerQuery) ||
    (session.division || '').toLowerCase().includes(lowerQuery) ||
    statusText.includes(lowerQuery) ||
    (session.status || '').toLowerCase().includes(lowerQuery) ||
    (session.teacher || '').toLowerCase().includes(lowerQuery) ||
    (session.date ? new Date(session.date).toLocaleDateString('en-IN').toLowerCase().includes(lowerQuery) : false)
  );
}

function filterSessionAttendance() {
  const sessionSearchInput = document.querySelector('[data-session-search-input]');
  const query = sessionSearchInput?.value?.trim() || '';
  
  if (!query) {
    renderSessionAttendanceTable(allSessionData);
    return;
  }

  const filteredSessions = allSessionData.filter(session => 
    shouldHighlightRow(session, query)
  );

  renderSessionAttendanceTable(filteredSessions, query);
}

// Event listeners for search functionality
document.addEventListener('DOMContentLoaded', function() {
  const searchButton = document.getElementById('teacherSearchButton');
  const searchInput = document.getElementById('teacherSearchInput');
  const studentModal = document.querySelector('[data-student-details-modal]');
  const sessionAttendanceModal = document.querySelector('[data-session-attendance-modal]');
  const closeStudentDetailsBtn = document.querySelector('[data-close-student-details]');
  const closeSessionAttendanceBtn = document.querySelector('[data-close-session-attendance]');
  const sessionSearchInput = document.querySelector('[data-session-search-input]');
  
  // Search button click
  if (searchButton) {
    searchButton.addEventListener('click', performSearch);
  }
  
  // Enter key in search input
  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  }
  
  // Close student details modal
  if (closeStudentDetailsBtn) {
    closeStudentDetailsBtn.addEventListener('click', () => {
      studentModal?.close();
    });
  }
  
  // Close session attendance modal
  if (closeSessionAttendanceBtn) {
    closeSessionAttendanceBtn.addEventListener('click', () => {
      sessionAttendanceModal?.close();
    });
  }
  
  // Session search input
  if (sessionSearchInput) {
    sessionSearchInput.addEventListener('input', filterSessionAttendance);
  }
  
  // Close modals when clicking outside
  if (studentModal) {
    studentModal.addEventListener('click', function(e) {
      if (e.target === studentModal) {
        studentModal.close();
      }
    });
  }
  
  if (sessionAttendanceModal) {
    sessionAttendanceModal.addEventListener('click', function(e) {
      if (e.target === sessionAttendanceModal) {
        sessionAttendanceModal.close();
      }
    });
  }
});

function bootstrap() {
  renderActiveSession();
  attachAttendanceEvents();
  initDialogs();
  initControls();
  initDefaulterButton();
  loadDashboard();
  loadActivity();
  setupLiveUpdates();
}

bootstrap();
