import { showToast, apiFetch, formatDateTime, asPercentage } from "./main.js";

const profileId = document.querySelector("[data-profile-id]");
const profileName = document.querySelector("[data-profile-name]");
const profileRoll = document.querySelector("[data-profile-roll]");
const profileStream = document.querySelector("[data-profile-stream]");
const profileDivision = document.querySelector("[data-profile-division]");
const profileYear = document.querySelector("[data-profile-year]");
const studentHeader = document.querySelector("[data-student-header]");

const summarySessionsEl = document.querySelector("[data-summary-sessions]");
const summaryPresentEl = document.querySelector("[data-summary-present]");
const summaryAbsentEl = document.querySelector("[data-summary-absent]");
const summaryPercentageEl = document.querySelector("[data-summary-percentage]");

const progressBar = document.querySelector("[data-progress-bar]");
const progressText = document.querySelector("[data-progress-text]");

const attendanceBody = document.querySelector("[data-attendance-body]");
const monthlyBody = document.querySelector("[data-monthly-body]");

const refreshButton = document.querySelector("[data-refresh]");
const signoutButton = document.querySelector("[data-signout]");

// Modal elements
const showTotalSessionsButton = document.querySelector(
  "[data-show-total-sessions]",
);
const showPresentSessionsButton = document.querySelector(
  "[data-show-present-sessions]",
);
const showAbsentSessionsButton = document.querySelector(
  "[data-show-absent-sessions]",
);

const totalSessionsModal = document.querySelector(
  "[data-total-sessions-modal]",
);
const presentSessionsModal = document.querySelector(
  "[data-present-sessions-modal]",
);
const absentSessionsModal = document.querySelector(
  "[data-absent-sessions-modal]",
);

const closeTotalSessionsButton = document.querySelector(
  "[data-close-total-sessions]",
);
const closePresentSessionsButton = document.querySelector(
  "[data-close-present-sessions]",
);
const closeAbsentSessionsButton = document.querySelector(
  "[data-close-absent-sessions]",
);

const totalSessionsList = document.querySelector("[data-total-sessions-list]");
const presentSessionsList = document.querySelector(
  "[data-present-sessions-list]",
);
const absentSessionsList = document.querySelector(
  "[data-absent-sessions-list]",
);

const calendarContainer = document.querySelector("[data-calendar-container]");
const calendarMonthDisplay = document.querySelector(
  "[data-calendar-month-display]",
);
const calendarYearSelector = document.querySelector(
  "[data-calendar-year-selector]",
);
const calendarPrevBtn = document.querySelector("[data-calendar-prev-btn]");
const calendarNextBtn = document.querySelector("[data-calendar-next-btn]");

// Subject section elements
const subjectsSection = document.querySelector("[data-subjects-section]");
const subjectDetailModal = document.querySelector("[data-subject-detail-modal]");
const subjectModalTitle = document.querySelector("[data-subject-modal-title]");
const modalTotal = document.querySelector("[data-modal-total]");
const modalPresent = document.querySelector("[data-modal-present]");
const modalAbsent = document.querySelector("[data-modal-absent]");
const modalPercentage = document.querySelector("[data-modal-percentage]");
const closeSubjectDetailButtons = document.querySelectorAll("[data-close-subject-detail]");

let studentData = null;
let subjectBreakdownData = [];
let attendanceCalendarData = {};
let currentCalendarMonth = new Date().getMonth(); // 0-11
let currentCalendarYear = new Date().getFullYear();

function handleError(error, fallback = "Something went wrong") {
  console.error(error);
  showToast({
    title: "Error",
    message: error.message || fallback,
    type: "danger",
  });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Hello";
}

async function loadDashboard() {
  try {
    const data = await apiFetch("/api/student/dashboard");
    studentData = data.studentInfo || {};

    // Update profile
    profileId.textContent = studentData.id || "–";
    profileName.textContent = studentData.name || "–";
    profileRoll.textContent = studentData.rollNo || "–";
    profileStream.textContent = studentData.stream || "–";
    profileDivision.textContent = studentData.division || "–";
    profileYear.textContent = studentData.year || "–";

    // Update header with greeting and student name
    if (studentHeader && studentData.name) {
      const greeting = getGreeting();
      studentHeader.textContent = `${greeting}, ${studentData.name}`;
    }

    // Update summary
    const summary = data.summary || {};
    summarySessionsEl.textContent = summary.totalSessions ?? 0;
    summaryPresentEl.textContent = summary.presentCount ?? 0;
    summaryAbsentEl.textContent = summary.absentCount ?? 0;

    const percentage = summary.percentage ?? 0;
    summaryPercentageEl.textContent = `${percentage}%`;

    // Update progress bar
    progressText.textContent = `${percentage}%`;
    progressBar.style.width = `${percentage}%`;

    // Render recent attendance
    renderRecentAttendance(data.recentAttendance || []);

    // Render monthly summary
    renderMonthlySummary(data.monthlySummary || []);

    // Store and render subject breakdown
    subjectBreakdownData = data.subjectBreakdown || [];
    renderSubjectCards(subjectBreakdownData);

    // Load attendance calendar
    loadAttendanceCalendar();
  } catch (error) {
    handleError(error, "Unable to load dashboard");
  }
}
function renderSubjectCards(subjects) {
  if (!subjectsSection) return;

  // Filter out subjects with null or empty names
  const validSubjects = subjects.filter(s => s.subject && s.subject.trim() !== '');

  if (!validSubjects || validSubjects.length === 0) {
    subjectsSection.innerHTML = '';
    subjectsSection.style.display = 'none';
    return;
  }

  subjectsSection.style.display = 'grid';

  const cards = validSubjects.map((subject) => {
    const total = subject.total || 0;
    const present = subject.present || 0;
    const absent = total - present;
    const percentage = total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

    return `
      <div class="card" style="cursor: pointer;" data-subject-card data-subject-name="${subject.subject}" data-subject-total="${total}" data-subject-present="${present}" data-subject-absent="${absent}" data-subject-percentage="${percentage}">
        <div style="margin-bottom: 0.75rem;">
          <h4 style="margin: 0; font-size: 1rem; color: #2c3e50;">${subject.subject}</h4>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 0.5rem; gap: 0.5rem;">
          <span style="font-size: 0.875rem; color: #7f8c8d; flex: 0 0 auto;">Total Sessions</span>
          <span style="font-size: 1.25rem; font-weight: 600; color: #3498db; margin-left: auto;">${total}</span>
        </div>
        <div style="display: flex; font-size: 0.875rem; margin-bottom: 0.25rem; gap: 0.5rem;">
          <span style="color: #7f8c8d; flex: 0 0 auto;">Present:</span>
          <span style="font-weight: 600; color: #27ae60; margin-left: auto;">${present}</span>
        </div>
        <div style="display: flex; font-size: 0.875rem; margin-bottom: 0.75rem; gap: 0.5rem;">
          <span style="color: #7f8c8d; flex: 0 0 auto;">Absent:</span>
          <span style="font-weight: 600; color: #e74c3c; margin-left: auto;">${absent}</span>
        </div>
        <div style="padding: 0.5rem; background: ${percentage >= 75 ? '#e8f5e9' : '#ffebee'}; border-radius: 6px; text-align: center;">
          <span style="font-weight: 600; color: ${percentage >= 75 ? '#27ae60' : '#e74c3c'}; font-size:1rem;">${percentage}%</span>
        </div>
      </div>
    `;
  }).join('');

  subjectsSection.innerHTML = cards;

  // Attach click handlers to subject cards
  attachSubjectCardHandlers();
}

function attachSubjectCardHandlers() {
  const subjectCards = document.querySelectorAll('[data-subject-card]');

  subjectCards.forEach(card => {
    card.addEventListener('click', () => {
      const subjectName = card.dataset.subjectName;
      const total = parseInt(card.dataset.subjectTotal) || 0;
      const present = parseInt(card.dataset.subjectPresent) || 0;
      const absent = parseInt(card.dataset.subjectAbsent) || 0;
      const percentage = parseFloat(card.dataset.subjectPercentage) || 0;

      showSubjectDetailModal(subjectName, total, present, absent, percentage);
    });
  });
}

function showSubjectDetailModal(subjectName, total, present, absent, percentage) {
  if (!subjectDetailModal) return;

  if (subjectModalTitle) subjectModalTitle.textContent = subjectName;
  if (modalTotal) modalTotal.textContent = total;
  if (modalPresent) modalPresent.textContent = present;
  if (modalAbsent) modalAbsent.textContent = absent;
  if (modalPercentage) modalPercentage.textContent = `${percentage}%`;

  subjectDetailModal.showModal();
}
function renderRecentAttendance(records) {
  if (!attendanceBody) return;

  if (!records.length) {
    attendanceBody.innerHTML = `<tr><td colspan="6">No attendance records yet.</td></tr>`;
    return;
  }

  const rows = records
    .map((record) => {
      const statusClass = record.status === "P" ? "success" : "danger";
      const statusText = record.status === "P" ? "Present" : "Absent";

      return `
        <tr>
          <td>${formatDateTime(record.session_date || record.created_at)}</td>
          <td>${record.subject || "–"}</td>
          <td>${record.year || "–"}</td>
          <td>${record.stream || "–"}</td>
          <td>${record.division || "–"}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join("");

  attendanceBody.innerHTML = rows;
}

function renderMonthlySummary(summaries) {
  if (!monthlyBody) return;

  if (!summaries.length) {
    monthlyBody.innerHTML = `<tr><td colspan="8">No data available.</td></tr>`;
    return;
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const rows = summaries
    .map((summary) => {
      const monthName =
        monthNames[summary.month - 1] || `Month ${summary.month}`;
      const present = summary.present_count ?? 0;
      const absent = summary.absent_count ?? 0;
      const total = summary.total_sessions ?? 0;
      const percentage = summary.percentage ?? 0;

      return `
        <tr>
          <td>${monthName} ${summary.year}</td>
          <td>${summary.year || "–"}</td>
          <td>${summary.stream || "–"}</td>
          <td>${summary.division || "–"}</td>
          <td>${total}</td>
          <td>${present}</td>
          <td>${absent}</td>
          <td>${percentage}%</td>
        </tr>
      `;
    })
    .join("");

  monthlyBody.innerHTML = rows;
}

// Calendar functions
async function loadAttendanceCalendar() {
  if (!calendarContainer) return;

  try {
    const data = await apiFetch("/api/student/attendance/calendar");
    attendanceCalendarData = data.calendar || {};
    renderCalendar();
  } catch (error) {
    console.error("Calendar load error:", error);
    calendarContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--color-text-muted)">Unable to load calendar. Please try refreshing the page.</div>`;
    // Don't show error toast for calendar - it's not critical
  }
}

function renderCalendar() {
  if (!calendarContainer) return;

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Update month display
  if (calendarMonthDisplay) {
    calendarMonthDisplay.textContent = `${monthNames[currentCalendarMonth]}`;
  }

  // Update year selector
  if (calendarYearSelector && calendarYearSelector.options.length === 0) {
    // Populate year selector (current year ± 5 years)
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 5; year <= currentYear + 10; year++) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      if (year === currentCalendarYear) {
        option.selected = true;
      }
      calendarYearSelector.appendChild(option);
    }
  } else if (calendarYearSelector) {
    calendarYearSelector.value = currentCalendarYear;
  }

  // Get first day of month and number of days in month
  const firstDayOfMonth = new Date(
    currentCalendarYear,
    currentCalendarMonth,
    1,
  );
  const lastDayOfMonth = new Date(
    currentCalendarYear,
    currentCalendarMonth + 1,
    0,
  );
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday

  // Build calendar HTML
  let calendarHTML = "";

  // Weekday headers
  calendarHTML += '<div class="calendar-weekday-header">';
  weekdayLabels.forEach((day) => {
    calendarHTML += `<div class="calendar-weekday">${day}</div>`;
  });
  calendarHTML += "</div>";

  // Calendar grid
  calendarHTML += '<div class="calendar-grid">';

  // Empty cells before first day of month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarHTML += '<div class="calendar-day empty"></div>';
  }

  // Days of the month
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split("T")[0];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentCalendarYear, currentCalendarMonth, day);
    const dateStr = date.toISOString().split("T")[0];
    const dayData = attendanceCalendarData[dateStr] || {
      total: 0,
      present: 0,
      absent: 0,
    };

    const color = getAttendanceColor(
      dayData.total,
      dayData.present,
      dayData.absent,
    );
    const isToday = dateStr === todayStr;

    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    let tooltip = formattedDate;
    if (dayData.total > 0) {
      tooltip += `: ${dayData.present} present, ${dayData.absent} absent (${dayData.total} sessions)`;
    } else {
      tooltip += ": No sessions";
    }

    const todayClass = isToday ? " today" : "";
    calendarHTML += `<div class="calendar-day${todayClass}" style="background-color: ${color}" data-tooltip="${tooltip}">${day}</div>`;
  }

  calendarHTML += "</div>";

  calendarContainer.innerHTML = calendarHTML;
}

function previousMonth() {
  currentCalendarMonth--;
  if (currentCalendarMonth < 0) {
    currentCalendarMonth = 11;
    currentCalendarYear--;
  }
  renderCalendar();
}

function nextMonth() {
  currentCalendarMonth++;
  if (currentCalendarMonth > 11) {
    currentCalendarMonth = 0;
    currentCalendarYear++;
  }
  renderCalendar();
}

function getAttendanceColor(total, present, absent) {
  if (total === 0) {
    return "var(--color-border)"; // No sessions - gray
  }

  if (absent === total) {
    return "#ff4444"; // All absent - red
  }

  const attendanceRate = present / total;

  if (attendanceRate === 1) {
    return "#216e39"; // 100% - darkest green
  } else if (attendanceRate >= 0.75) {
    return "#30a14e"; // 75-99% - dark green
  } else if (attendanceRate >= 0.5) {
    return "#40c463"; // 50-74% - medium green
  } else if (attendanceRate > 0) {
    return "#9be9a8"; // 1-49% - light green
  } else {
    return "#ff4444"; // 0% - red
  }
}

// Modal functions
async function showTotalSessionsModal() {
  if (!totalSessionsModal) return;

  totalSessionsList.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem">Loading...</td></tr>`;
  totalSessionsModal.showModal();

  try {
    const data = await apiFetch("/api/student/sessions/all");
    const sessions = data.sessions || [];

    // Filter out incomplete sessions (missing required fields)
    const validSessions = sessions.filter(
      (session) => session.year && session.stream && session.division && session.subject
    );

    if (!validSessions.length) {
      totalSessionsList.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem">No sessions recorded yet.</td></tr>`;
      return;
    }

    const rows = validSessions
      .map((session) => {
        const sessionLabel = `${session.year}-${session.stream}-${session.division}`;
        const date = new Date(session.session_date || session.created_at);
        const formattedDate = date.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const teacherName = session.teacher_name || "Unknown";
        const subject = session.subject;
        const details = `started by ${teacherName} for ${subject} on ${formattedDate}`;

        const statusClass = session.status === "P" ? "success" : "danger";
        const statusText = session.status === "P" ? "Present" : "Absent";

        return `
          <tr>
            <td><strong>${sessionLabel}</strong></td>
            <td>${details}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
          </tr>
        `;
      })
      .join("");

    totalSessionsList.innerHTML = rows;
  } catch (error) {
    totalSessionsList.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--color-danger)">Failed to load sessions</td></tr>`;
    handleError(error, "Unable to load all sessions");
  }
}

async function showPresentSessionsModal() {
  if (!presentSessionsModal) return;

  presentSessionsList.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem">Loading...</td></tr>`;
  presentSessionsModal.showModal();

  try {
    const data = await apiFetch("/api/student/sessions/present");
    const sessions = data.sessions || [];

    // Filter out incomplete sessions
    const validSessions = sessions.filter(
      (session) => session.year && session.stream && session.division && session.subject
    );

    if (!validSessions.length) {
      presentSessionsList.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem">No sessions attended yet.</td></tr>`;
      return;
    }

    const rows = validSessions
      .map((session) => {
        const sessionLabel = `${session.year}-${session.stream}-${session.division}`;
        const date = new Date(session.session_date);
        const formattedDate = date.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const subject = session.subject;
        const details = `on ${formattedDate} for ${subject}`;

        return `
          <tr>
            <td><strong>${sessionLabel}</strong></td>
            <td>${details}</td>
          </tr>
        `;
      })
      .join("");

    presentSessionsList.innerHTML = rows;
  } catch (error) {
    presentSessionsList.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem; color: var(--color-danger)">Failed to load sessions</td></tr>`;
    handleError(error, "Unable to load present sessions");
  }
}

async function showAbsentSessionsModal() {
  if (!absentSessionsModal) return;

  absentSessionsList.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem">Loading...</td></tr>`;
  absentSessionsModal.showModal();

  try {
    const data = await apiFetch("/api/student/sessions/absent");
    const sessions = data.sessions || [];

    // Filter out incomplete sessions
    const validSessions = sessions.filter(
      (session) => session.year && session.stream && session.division && session.subject
    );

    if (!validSessions.length) {
      absentSessionsList.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem">No absent sessions. Great job!</td></tr>`;
      return;
    }

    const rows = validSessions
      .map((session) => {
        const sessionLabel = `${session.year}-${session.stream}-${session.division}`;
        const date = new Date(session.session_date);
        const formattedDate = date.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const subject = session.subject;
        const details = `on ${formattedDate} for ${subject}`;

        return `
          <tr>
            <td><strong>${sessionLabel}</strong></td>
            <td>${details}</td>
          </tr>
        `;
      })
      .join("");

    absentSessionsList.innerHTML = rows;
  } catch (error) {
    absentSessionsList.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem; color: var(--color-danger)">Failed to load sessions</td></tr>`;
    handleError(error, "Unable to load absent sessions");
  }
}

function initControls() {
  refreshButton?.addEventListener("click", loadDashboard);

  signoutButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (error) {
      handleError(error, "Unable to sign out");
    }
  });

  // Modal event listeners
  showTotalSessionsButton?.addEventListener("click", showTotalSessionsModal);
  showPresentSessionsButton?.addEventListener(
    "click",
    showPresentSessionsModal,
  );
  showAbsentSessionsButton?.addEventListener("click", showAbsentSessionsModal);

  closeTotalSessionsButton?.addEventListener("click", () =>
    totalSessionsModal?.close(),
  );
  closePresentSessionsButton?.addEventListener("click", () =>
    presentSessionsModal?.close(),
  );
  closeAbsentSessionsButton?.addEventListener("click", () =>
    absentSessionsModal?.close(),
  );

  // Subject detail modal close handlers
  closeSubjectDetailButtons?.forEach(button => {
    button.addEventListener("click", () => {
      if (subjectDetailModal) {
        subjectDetailModal.close();
      }
    });
  });

  subjectDetailModal?.addEventListener("click", (e) => {
    if (e.target === subjectDetailModal) {
      subjectDetailModal.close();
    }
  });

  // Calendar navigation event listeners
  calendarPrevBtn?.addEventListener("click", previousMonth);
  calendarNextBtn?.addEventListener("click", nextMonth);
  calendarYearSelector?.addEventListener("change", (e) => {
    currentCalendarYear = parseInt(e.target.value);
    renderCalendar();
  });
}

function bootstrap() {
  initControls();
  loadDashboard();
}

bootstrap();
