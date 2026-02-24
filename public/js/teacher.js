import {
  showToast,
  apiFetch,
  formatDateTime,
  asPercentage,
  toggleLoading,
} from "./main.js";

const summarySessionsEl = document.querySelector("[data-summary-sessions]");
const summaryAverageEl = document.querySelector("[data-summary-average]");
const summaryPresentEl = document.querySelector("[data-summary-present]");
const recentBody = document.querySelector("[data-recent-body]");
const activityBody = document.querySelector("[data-activity-body]");
const refreshButton = document.querySelector("[data-refresh]");
const refreshActivityButton = document.querySelector("[data-refresh-activity]");
const clearRecentButton = document.querySelector("[data-clear-recent]");
const clearActivityButton = document.querySelector("[data-clear-activity]");
const signoutButton = document.querySelector("[data-signout]");
const startSessionButton = document.querySelector("[data-start-session]");
const endSessionButton = document.querySelector("[data-end-session]");
const manualButton = document.querySelector("[data-open-manual]");
const manualModal = document.querySelector("[data-manual-modal]");
const manualForm = manualModal?.querySelector("form");
const sessionModal = document.querySelector("[data-session-modal]");
const sessionForm = sessionModal?.querySelector("form");
const activeSection = document.querySelector("[data-active-session]");
const attendanceBody = document.querySelector("[data-attendance-body]");
const viewHistoryButton = document.querySelector("[data-view-history]");
const historyModal = document.querySelector("[data-history-modal]");
const historyBody = document.querySelector("[data-history-body]");
const closeHistoryButton = document.querySelector("[data-close-history]");

const previewModal = document.querySelector("[data-preview-modal]");
const closePreviewButton = document.querySelector("[data-close-preview]");
const previewStudentsBody = document.querySelector("[data-preview-students]");

const snapshotSubject = document.querySelector("[data-session-subject]");
const snapshotYear = document.querySelector("[data-session-year]");
const snapshotSemester = document.querySelector("[data-session-semester]");
const snapshotDivision = document.querySelector("[data-session-division]");
const snapshotStream = document.querySelector("[data-session-stream]");
const snapshotStart = document.querySelector("[data-session-start]");
const badgeSize = document.querySelector("[data-session-size]");
const badgePresent = document.querySelector("[data-session-present]");
const badgeAbsent = document.querySelector("[data-session-absent]");

let currentSession = null;
let lastSessionDetails = null;
let teacherData = null;
let availableStreams = [];
let availableDivisions = [];
let availableYears = [];
let availableSemesters = [];

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

    const summary = data?.summary || {};
    summarySessionsEl.textContent = summary.sessions ?? 0;
    summaryAverageEl.textContent = `${summary.averagePercentage ?? 0}%`;
    summaryPresentEl.textContent = summary.totalPresent ?? 0;
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
        option.value = sem;
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
    recentBody.innerHTML = `<tr><td colspan="6">No sessions recorded yet.</td></tr>`;
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
      '<tr><td colspan="6">Recent classes cleared.</td></tr>';
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
    return `${
      meta.subject || "Class"
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

  const rows = currentSession.students
    .map(
      (student) => `
        <tr data-student="${student.id}">
          <td>${student.rollNo || "–"}</td>
          <td>${student.id}</td>
          <td>${student.name}</td>
          <td>
            <button type="button" class="status-pill" data-toggle-status data-status="${
              student.status
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
        }))
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

async function handleManualOverride(event) {
  event.preventDefault();
  if (!manualForm) return;

  const submitButton = manualForm.querySelector('button[value="submit"]');
  const formData = new FormData(manualForm);
  const payload = {
    studentId: formData.get("studentId")?.trim(),
    status: formData.get("status"),
    reason: formData.get("reason")?.trim(),
  };

  if (!payload.studentId || !payload.status) {
    showToast({
      title: "Missing info",
      message: "Student ID and status are required.",
      type: "warning",
    });
    return;
  }

  try {
    toggleLoading(submitButton, true);
    await apiFetch("/api/teacher/attendance/manual", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (currentSession) {
      const student = currentSession.students.find(
        (item) => item.id === payload.studentId,
      );
      if (student) {
        student.status = payload.status === "P" ? "P" : "A";
        renderActiveSession();
      }
    }

    showToast({
      title: "Override saved",
      message: "Manual attendance override recorded.",
      type: "success",
    });

    manualForm.reset();
    manualModal.close();
    loadActivity();
  } catch (error) {
    handleError(error, "Unable to save manual override");
  } finally {
    toggleLoading(submitButton, false);
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

  if (manualButton && manualModal && manualForm) {
    manualButton.addEventListener("click", () => {
      manualForm.reset();
      manualModal.showModal();
    });

    manualForm.addEventListener("submit", handleManualOverride);

    // Handle cancel button
    const cancelManualButton = manualModal.querySelector(
      "[data-cancel-manual]",
    );
    if (cancelManualButton) {
      cancelManualButton.addEventListener("click", () => {
        manualModal.close();
      });
    }
  }
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

  closePreviewButton?.addEventListener("click", () => {
    if (previewModal) {
      previewModal.close();
    }
  });

  signoutButton?.addEventListener("click", async (event) => {
    event.preventDefault();
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
    historyBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    const { history } = await apiFetch("/api/teacher/attendance/history");

    if (!history || !history.length) {
      historyBody.innerHTML =
        '<tr><td colspan="6">No attendance history found.</td></tr>';
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
          <td>${item.division || "—"}</td>
          <td>${savedDate}</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn ghost" data-view-backup="${
                item.id
              }" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;">
                View
              </button>
              <a href="/api/teacher/attendance/backup/${
                item.id
              }" class="btn ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;" download>
                Download
              </a>
              <button class="btn ghost" data-delete-backup="${
                item.id
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
  const defaulterGenerateButton = document.querySelector(
    "[data-defaulter-generate]",
  );
  const tabButtons = document.querySelectorAll("[data-defaulter-tab]");
  const tabContents = document.querySelectorAll("[data-tab-content]");

  const tabs = ["year", "stream", "division", "month", "percentage"];
  let currentTabIndex = 0;

  // Open modal
  const generateDefaultersButton = document.querySelector(
    "[data-generate-defaulters]",
  );
  if (!generateDefaultersButton) return;

  generateDefaultersButton.addEventListener("click", async () => {
    // Populate streams and divisions
    try {
      const response = await fetch("/api/teacher/streams", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const streamSelect = document.getElementById("defaulterStream");
        const divisionSelect = document.getElementById("defaulterDivision");

        // Populate streams
        if (data.streams) {
          streamSelect.innerHTML =
            '<option value="">Select stream...</option><option value="ALL">All Streams</option>';
          data.streams.forEach((stream) => {
            const option = document.createElement("option");
            option.value = stream;
            option.textContent = stream;
            streamSelect.appendChild(option);
          });
        }

        // Populate divisions
        if (data.divisions) {
          divisionSelect.innerHTML =
            '<option value="">Select division...</option><option value="ALL">All Divisions</option>';
          data.divisions.forEach((division) => {
            const option = document.createElement("option");
            option.value = division;
            option.textContent = division;
            divisionSelect.appendChild(option);
          });
        }
      }
    } catch (error) {
      console.error("Failed to load streams/divisions:", error);
    }

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
    if (defaulterGenerateButton)
      defaulterGenerateButton.style.display =
        index === tabs.length - 1 ? "block" : "none";
  }

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

  // Form submission
  defaulterForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(defaulterForm);
    const year = formData.get("year");
    const stream = formData.get("stream");
    const division = formData.get("division");
    const month = formData.get("month");
    const threshold = formData.get("threshold");

    // Build query parameters
    const params = new URLSearchParams({
      threshold: parseFloat(threshold),
    });

    if (month && month !== "ALL") params.append("month", month);
    if (year && year !== "ALL") params.append("year", year);
    if (stream && stream !== "ALL") params.append("stream", stream);
    if (division && division !== "ALL") params.append("division", division);

    try {
      toggleLoading(defaulterGenerateButton, true);
      defaulterModal?.close();

      // Fetch the Excel file
      const response = await fetch(
        `/api/teacher/defaulters/download?${params.toString()}`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: "Failed to generate defaulter list" }));
        throw new Error(error.message);
      }

      // Download file
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

      showToast({
        title: "Success",
        message: `Defaulter list generated with ${threshold}% threshold`,
        type: "success",
      });

      defaulterForm?.reset();
    } catch (error) {
      showToast({
        title: "Unable to generate defaulter list",
        message: error.message,
        type: "danger",
      });
    } finally {
      toggleLoading(defaulterGenerateButton, false);
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
function setupLiveUpdates() {
  const eventSource = new EventSource("/api/teacher/live-updates");

  eventSource.addEventListener("attendance_marked", (event) => {
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

  eventSource.addEventListener("data_import", (event) => {
    const data = JSON.parse(event.data);
    showToast({
      title: "Data Updated",
      message: `Student/Teacher data has been updated`,
      type: "info",
    });
    loadDashboard();
  });

  eventSource.addEventListener("defaulter_generated", (event) => {
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

  eventSource.addEventListener("stats_update", (event) => {
    loadDashboard();
  });

  eventSource.onerror = (error) => {
    console.error("SSE connection error:", error);
    eventSource.close();
    // Retry connection after 5 seconds
    setTimeout(setupLiveUpdates, 5000);
  };

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    eventSource.close();
  });
}

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
