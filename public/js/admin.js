import { apiFetch, showToast, toggleLoading, formatDateTime } from "./main.js";

const statElements = document.querySelectorAll("[data-stat]");
const activityBody = document.querySelector("[data-activity-body]");
const clearActivityButton = document.querySelector("[data-clear-activity]");
const previewArea = document.querySelector("[data-preview-area]");
const previewTable = previewArea?.querySelector("[data-preview-table]");
const previewHead = previewTable?.querySelector("thead");
const previewBody = previewTable?.querySelector("tbody");
const confirmButton = previewArea?.querySelector("[data-confirm-import]");
const stepsList = document.querySelector("[data-import-steps]");
const viewHistoryButton = document.querySelector("[data-view-history]");
const deleteDataButton = document.querySelector("[data-delete-data]");
const historyModal = document.querySelector("[data-history-modal]");
const historyBody = document.querySelector("[data-history-body]");
const closeHistoryButton = document.querySelector("[data-close-history]");
const clearHistoryButton = document.querySelector("[data-clear-history]");

let currentStage = 1;
const importState = {
  students: 0,
  teachers: 0,
};

function updateSteps() {
  if (!stepsList) return;
  const labels = stepsList.querySelectorAll("li");
  labels.forEach((label, index) => {
    const stepNumber = index + 1;
    label.style.opacity = stepNumber <= currentStage ? "1" : "0.45";
    label.style.fontWeight = stepNumber === currentStage ? "600" : "400";
  });
}

async function loadStats() {
  try {
    const data = await apiFetch("/api/admin/stats");
    console.log('📊 Dashboard stats received from API:', data);
    console.log('📊 Student count from API:', data.students);

    statElements.forEach((stat) => {
      const key = stat.dataset.stat;
      if (key === "streams") {
        stat.textContent = `${data.streams?.length || 0}`;
      } else {
        stat.textContent = data[key] ?? 0;
        console.log(`📊 Setting ${key} stat to:`, data[key] ?? 0);
      }
    });
  } catch (error) {
    showToast({
      title: "Unable to load stats",
      message: error.message,
      type: "error",
    });
  }
}

function renderPreview(entries) {
  if (!previewArea || !previewTable || !previewHead || !previewBody) return;

  if (!entries || !entries.length) {
    previewTable.style.display = "none";
    confirmButton.style.display = "none";
    return;
  }

  const columns = Object.keys(entries[0]);
  previewHead.innerHTML = `<tr>${columns
    .map((col) => `<th>${col}</th>`)
    .join("")}</tr>`;
  previewBody.innerHTML = entries
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => `<td>${row[col] || ""}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  previewTable.style.display = "block";
  confirmButton.style.display = "inline-flex";
}

async function loadActivity() {
  try {
    const { activity } = await apiFetch("/api/admin/activity");
    if (!activity.length) {
      activityBody.innerHTML =
        '<tr><td colspan="3">No recent activity.</td></tr>';
      return;
    }

    activityBody.innerHTML = activity
      .map((item) => {
        const details = (() => {
          try {
            return JSON.parse(item.details || "{}");
          } catch (error) {
            return {};
          }
        })();
        return `
          <tr>
            <td>${formatDateTime(item.created_at)}</td>
            <td>${item.action}</td>
            <td><code>${JSON.stringify(details)}</code></td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    showToast({
      title: "Unable to load activity",
      message: error.message,
      type: "error",
    });
  }
}

function setupUploads() {
  const forms = document.querySelectorAll("[data-upload-form]");
  forms.forEach((form) => {
    const type = form.dataset.uploadForm;
    const input = form.querySelector('input[type="file"]');
    const browseButton = form.querySelector("[data-browse]");
    const fileLabel = form.querySelector("[data-file-name]");

    browseButton?.addEventListener("click", () => input?.click());

    input?.addEventListener("change", () => {
      fileLabel.textContent = input.files?.[0]?.name || "No file selected";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input?.files?.length) {
        showToast({
          title: "No file selected",
          message: "Please choose a file first.",
          type: "warning",
        });
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      toggleLoading(submitBtn, true);

      try {
        const formData = new FormData();
        formData.append("file", input.files[0]);

        const endpoint =
          type === "students"
            ? "/api/admin/import/students"
            : "/api/admin/import/teachers";

        const response = await fetch(endpoint, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.message || "Failed to upload file");
        }

        const payload = await response.json();
        renderPreview(payload.preview);

        importState[type] = payload.total;
        currentStage = type === "students" ? 2 : 3;
        updateSteps();

        showToast({
          title: "Upload successful",
          message: `${payload.total} rows ready for review`,
          type: "success",
        });
      } catch (error) {
        showToast({
          title: "Unable to process file",
          message: error.message,
          type: "error",
        });
      } finally {
        toggleLoading(submitBtn, false);
      }
    });
  });
}

confirmButton?.addEventListener("click", async () => {
  // Ask user if they want to clear existing data
  const clearExisting = confirm(
    "Do you want to CLEAR ALL existing data before importing?\n\n" +
    "• Click OK to DELETE all existing students/teachers and import fresh data\n" +
    "• Click Cancel to ADD/UPDATE the imported data to existing records\n\n" +
    "Recommended: Choose OK for a clean import with only the uploaded data.",
  );

  toggleLoading(confirmButton, true);
  try {
    const result = await apiFetch("/api/admin/import/confirm", {
      method: "POST",
      body: JSON.stringify({
        mappings: [],
        clearExisting: clearExisting,
      }),
    });

    renderPreview([]);
    importState.students = 0;
    importState.teachers = 0;
    currentStage = 1;
    updateSteps();

    let message = "All data has been stored successfully.";
    if (result.results?.cleared) {
      message += ` Cleared ${result.results.cleared.students || 0} students and ${result.results.cleared.teachers || 0} teachers before import.`;
    }

    showToast({
      title: "Import complete",
      message: message,
      type: "success",
    });

    // Real-time dashboard update
    await loadStats();
    await loadActivity();

    // Refresh teacher and student info sections if they exist
    const teachersSection = document.querySelector("[data-teachers-info]");
    const studentsSection = document.querySelector("[data-students-info]");
    if (teachersSection) {
      await loadTeachersInfo();
    }
    if (studentsSection) {
      await loadStudentsInfo();
    }
  } catch (error) {
    showToast({
      title: "Import failed",
      message: error.message,
      type: "error",
    });
  } finally {
    toggleLoading(confirmButton, false);
  }
});

const templateButtons = document.querySelectorAll("[data-download-template]");
const exportStudentsModal = document.querySelector(
  "[data-export-students-modal]",
);
const exportStudentsForm = exportStudentsModal?.querySelector("form");
const exportStreamSelect = document.querySelector("#exportStream");
const exportDivisionSelect = document.querySelector("#exportDivision");
const exportYearSelect = document.querySelector("#exportYear");
const cancelExportButton = document.querySelector("[data-cancel-export]");

let availableStreams = [];
let availableDivisions = [];

// Fetch available streams and divisions
async function loadStreamsDivisions() {
  try {
    const data = await apiFetch("/api/admin/dashboard");
    // Use the distinct streams and divisions arrays directly from the API
    availableStreams = data.streams || [];
    availableDivisions = data.divisions || [];

    // Populate stream dropdown
    if (exportStreamSelect) {
      exportStreamSelect.innerHTML =
        '<option value="">Select stream...</option><option value="ALL">All Streams</option>';
      availableStreams.forEach((stream) => {
        const option = document.createElement("option");
        option.value = stream;
        option.textContent = stream;
        exportStreamSelect.appendChild(option);
      });
    }

    // Populate division dropdown
    if (exportDivisionSelect) {
      exportDivisionSelect.innerHTML =
        '<option value="">Select division...</option><option value="ALL">All Divisions</option>';
      availableDivisions.forEach((division) => {
        const option = document.createElement("option");
        option.value = division;
        option.textContent = division;
        exportDivisionSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Failed to load streams/divisions:", error);
  }
}

templateButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const type = button.dataset.downloadTemplate;

    if (type === "students") {
      // Show modal for students export
      loadStreamsDivisions();
      exportStudentsModal?.showModal();
    } else {
      // Direct download for teachers
      window.open(`/api/admin/templates/${type}`, "_blank");
    }
  });
});

cancelExportButton?.addEventListener("click", () => {
  exportStudentsModal?.close();
});

exportStudentsForm?.addEventListener("submit", (e) => {
  e.preventDefault();

  const stream = exportStreamSelect?.value;
  const division = exportDivisionSelect?.value;
  const year = exportYearSelect?.value;

  if (!stream || !division || !year) {
    showToast({
      title: "Missing selection",
      message: "Please select stream, division, and year",
      type: "warning",
    });
    return;
  }

  // Build display message
  const yearLabel = year === "ALL" ? "All Years" : year;
  const streamLabel = stream === "ALL" ? "All Streams" : stream;
  const divisionLabel = division === "ALL" ? "All Divisions" : division;

  // Download with filters
  window.open(
    `/api/admin/templates/students?stream=${encodeURIComponent(stream)}&division=${encodeURIComponent(division)}&year=${encodeURIComponent(year)}`,
    "_blank",
  );
  exportStudentsModal?.close();

  showToast({
    title: "Export started",
    message: `Downloading students: ${yearLabel} - ${streamLabel} - ${divisionLabel}`,
    type: "success",
  });
});

const refreshDashboardButton = document.querySelector(
  "[data-refresh-dashboard]",
);
refreshDashboardButton?.addEventListener("click", loadStats);

const refreshActivityButton = document.querySelector("[data-refresh-activity]");
refreshActivityButton?.addEventListener("click", loadActivity);

clearActivityButton?.addEventListener("click", () => {
  if (
    !confirm(
      "Are you sure you want to clear the Recent Activity display? This will only clear the display, not delete records from the database.",
    )
  ) {
    return;
  }

  if (activityBody) {
    activityBody.innerHTML = '<tr><td colspan="3">Activity cleared.</td></tr>';
    showToast({
      title: "Cleared",
      message: "Recent activity display has been cleared.",
      type: "success",
    });
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

deleteDataButton?.addEventListener("click", async () => {
  const confirmed = confirm(
    "⚠️ WARNING: This will permanently delete ALL data including:\n\n" +
    "• All students\n" +
    "• All teachers\n" +
    "• All attendance sessions and records\n" +
    "• All student-teacher mappings\n" +
    "• All activity logs\n\n" +
    "CSV backup records will be preserved.\n\n" +
    "This action CANNOT be undone. Are you absolutely sure?",
  );

  if (!confirmed) return;

  const doubleConfirmed = confirm(
    "This is your last chance to cancel.\n\n" +
    "Type deletion will proceed in 3 seconds.\n\n" +
    "Click OK to proceed with deletion or Cancel to abort.",
  );

  if (!doubleConfirmed) return;

  toggleLoading(deleteDataButton, true);
  try {
    const result = await apiFetch("/api/admin/delete-all-data", {
      method: "POST",
      body: JSON.stringify({}),
    });

    showToast({
      title: "Data deleted successfully",
      message: `Cleared ${result.collectionsCleared?.length || 0} collections`,
      type: "success",
    });

    // Refresh the dashboard
    await loadStats();
    await loadActivity();
  } catch (error) {
    showToast({
      title: "Delete operation failed",
      message: error.message,
      type: "error",
    });
  } finally {
    toggleLoading(deleteDataButton, false);
  }
});

clearHistoryButton?.addEventListener("click", async () => {
  const confirmed = confirm(
    "⚠️ WARNING: This will permanently delete ALL attendance history records including:\n\n" +
    "• All saved Excel/CSV files\n" +
    "• All download links\n" +
    "• All backup attendance data\n\n" +
    "This action CANNOT be undone. Are you sure you want to clear the history?",
  );

  if (!confirmed) return;

  toggleLoading(clearHistoryButton, true);
  try {
    const result = await apiFetch("/api/admin/attendance/clear-history", {
      method: "POST",
      body: JSON.stringify({}),
    });

    showToast({
      title: "History cleared successfully",
      message: `Deleted ${result.recordsDeleted} record(s)`,
      type: "success",
    });

    // Reload the history table to show it's empty
    await loadAttendanceHistory();
  } catch (error) {
    showToast({
      title: "Clear history failed",
      message: error.message,
      type: "error",
    });
  } finally {
    toggleLoading(clearHistoryButton, false);
  }
});
async function loadAttendanceHistory() {
  if (!historyBody) return;

  try {
    historyBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    const { history } = await apiFetch("/api/admin/attendance/history");

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
          <td>${item.teacher_id || "—"}</td>
          <td>${item.subject || "—"}</td>
          <td>${item.stream || "—"}</td>
          <td>${item.division || "—"}</td>
          <td>${savedDate}</td>
          <td>
            <a href="/api/admin/attendance/backup/${item.id
          }" class="btn ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;" download>
              Download
            </a>
          </td>
        </tr>
      `;
      })
      .join("");

    historyBody.innerHTML = rows;
  } catch (error) {
    historyBody.innerHTML =
      '<tr><td colspan="7">Failed to load history.</td></tr>';
    showToast({
      title: "Unable to load history",
      message: error.message,
      type: "error",
    });
  }
}

const signoutLink = document.querySelector("[data-signout]");
signoutLink?.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  } catch (error) {
    showToast({
      title: "Unable to sign out",
      message: error.message,
      type: "error",
    });
  }
});

// Defaulter List Generation Modal
const defaulterModal = document.querySelector("[data-defaulter-modal]");
const defaulterForm = document.querySelector("[data-defaulter-form]");
const defaulterCancelButton = document.querySelector("[data-defaulter-cancel]");
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
generateDefaultersButton?.addEventListener("click", async () => {
  // Populate streams and divisions
  try {
    const data = await apiFetch("/api/admin/stats");
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
  defaulterPrevButton.style.display = index > 0 ? "block" : "none";
  defaulterNextButton.style.display =
    index < tabs.length - 1 ? "block" : "none";
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
    type: "monthly",
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
      `/api/admin/defaulters/download?${params.toString()}`,
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
      type: "error",
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

// Setup live updates with Server-Sent Events
function setupLiveUpdates() {
  const eventSource = new EventSource("/api/admin/live-updates");

  eventSource.addEventListener("attendance_marked", (event) => {
    const data = JSON.parse(event.data);
    showToast({
      title: "Attendance Marked",
      message: `${data.teacherName} marked attendance for ${data.subject} - ${data.year} ${data.stream} ${data.division} (${data.present} present, ${data.absent} absent)`,
      type: "info",
    });
    // Refresh stats to show updated numbers
    loadStats();
    loadActivity();
  });

  eventSource.addEventListener("data_import", (event) => {
    const data = JSON.parse(event.data);
    showToast({
      title: "Data Imported",
      message: `${data.studentsCount} students, ${data.teachersCount} teachers imported`,
      type: "success",
    });
    loadStats();
    loadActivity();
  });

  eventSource.addEventListener("defaulter_generated", (event) => {
    const data = JSON.parse(event.data);
    showToast({
      title: "Defaulter List Generated",
      message: `${data.count} defaulters found (${data.threshold}% threshold)`,
      type: "info",
    });
    loadActivity();
  });

  eventSource.addEventListener("stats_update", (event) => {
    loadStats();
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

// Teacher Information Section
const teachersInfoBody = document.querySelector("[data-teachers-info-body]");
const refreshTeachersButton = document.querySelector("[data-refresh-teachers]");

async function loadTeachersInfo() {
  if (!teachersInfoBody) return;

  teachersInfoBody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';

  try {
    const data = await apiFetch("/api/admin/teachers-info");

    if (!data.teachers || data.teachers.length === 0) {
      teachersInfoBody.innerHTML =
        '<tr><td colspan="8">No teachers found</td></tr>';
      return;
    }

    teachersInfoBody.innerHTML = data.teachers
      .map(
        (teacher) => `
      <tr>
        <td>${teacher.teacher_id || "N/A"}</td>
        <td>${teacher.teacher_name || "N/A"}</td>
        <td>${teacher.subject || "N/A"}</td>
        <td>${teacher.year || "N/A"}</td>
        <td>${teacher.stream || "N/A"}</td>
        <td>${teacher.semester || "N/A"}</td>
        <td>${teacher.divisions || "N/A"}</td>
        <td>${teacher.student_count || 0}</td>
      </tr>
    `,
      )
      .join("");
  } catch (error) {
    teachersInfoBody.innerHTML =
      '<tr><td colspan="8">Error loading teachers information</td></tr>';
    showToast({
      title: "Unable to load teachers",
      message: error.message,
      type: "error",
    });
  }
}

refreshTeachersButton?.addEventListener("click", loadTeachersInfo);

// Students Information Section
const filterYearSelect = document.querySelector("#filterYear");
const filterStreamSelect = document.querySelector("#filterStream");
const filterSemesterSelect = document.querySelector("#filterSemester");
const filterDivisionSelect = document.querySelector("#filterDivision");
const loadStudentsButton = document.querySelector("[data-load-students]");
const studentsInfoBody = document.querySelector("[data-students-info-body]");
const studentsInfoTable = document.querySelector("[data-students-info-table]");
const studentCountDisplay = document.querySelector(
  "[data-student-count-display]",
);
const studentCountValue = document.querySelector("[data-student-count-value]");
const subjectsTeachersContainer = document.querySelector(
  "[data-subjects-teachers-container]",
);
const subjectsList = document.querySelector("[data-subjects-list]");
const teachersList = document.querySelector("[data-teachers-list]");

// Load streams from teacher_details_db
async function loadStreamsFromTeachers() {
  if (!filterStreamSelect) return;

  try {
    // Load streams from student data instead of teacher data
    const data = await apiFetch('/api/admin/student-streams');

    if (data.streams && data.streams.length > 0) {
      filterStreamSelect.innerHTML = '<option value="">Select stream...</option>';
      data.streams.forEach((stream) => {
        const option = document.createElement("option");
        option.value = stream;
        option.textContent = stream;
        filterStreamSelect.appendChild(option);
      });
    } else {
      filterStreamSelect.innerHTML = '<option value="">No streams available</option>';
    }
  } catch (error) {
    console.error("Failed to load streams:", error);
    filterStreamSelect.innerHTML = '<option value="">Error loading streams</option>';
  }
}

// Populate semester dropdown based on year
function populateSemestersByYear(year) {
  if (!filterSemesterSelect) return;

  filterSemesterSelect.innerHTML = '<option value="">Select semester...</option>';

  // Add All Semesters option
  const allOption = document.createElement('option');
  allOption.value = 'ALL';
  allOption.textContent = 'All Semesters';
  filterSemesterSelect.appendChild(allOption);

  const semesterOptions = {
    'FY': [
      { value: 'Sem 1', label: 'Semester 1' },
      { value: 'Sem 2', label: 'Semester 2' }
    ],
    'SY': [
      { value: 'Sem 3', label: 'Semester 3' },
      { value: 'Sem 4', label: 'Semester 4' }
    ],
    'TY': [
      { value: 'Sem 5', label: 'Semester 5' },
      { value: 'Sem 6', label: 'Semester 6' }
    ]
  };

  const semesters = semesterOptions[year] || [];

  semesters.forEach((sem) => {
    const option = document.createElement('option');
    option.value = sem.value;
    option.textContent = sem.label;
    filterSemesterSelect.appendChild(option);
  });
}

// Populate division filters from teacher_details_db based on stream, year, and semester
async function populateDivisionFiltersFromTeachers(stream, year, semester) {
  if (!filterDivisionSelect) return;

  filterDivisionSelect.innerHTML = '<option value="">Select division...</option>';
  filterDivisionSelect.disabled = true;

  if (!stream || !year || !semester) {
    return;
  }

  try {
    // Get divisions from student data instead of teacher data
    const url = `/api/admin/student-divisions?stream=${encodeURIComponent(stream)}&year=${encodeURIComponent(year)}`;

    const data = await apiFetch(url);

    // Add All Divisions option
    const allOption = document.createElement("option");
    allOption.value = "ALL";
    allOption.textContent = "All Divisions";
    filterDivisionSelect.appendChild(allOption);

    if (data.divisions && data.divisions.length > 0) {
      data.divisions.forEach((division) => {
        const option = document.createElement("option");
        option.value = division;
        option.textContent = division;
        filterDivisionSelect.appendChild(option);
      });
      filterDivisionSelect.disabled = false;
    } else {
      filterDivisionSelect.innerHTML = '<option value="">No divisions available</option>';
    }
  } catch (error) {
    console.error("Failed to populate division filters:", error);
    filterDivisionSelect.innerHTML = '<option value="">Error loading divisions</option>';
  }
}

// Setup cascading filter listeners
function setupStudentFilters() {
  // Load streams on page load
  loadStreamsFromTeachers();

  // When stream changes, enable year
  if (filterStreamSelect) {
    filterStreamSelect.addEventListener("change", () => {
      const stream = filterStreamSelect.value;

      // Reset year, semester, and division
      if (filterYearSelect) {
        filterYearSelect.value = "";
        filterYearSelect.disabled = !stream;
      }
      if (filterSemesterSelect) {
        filterSemesterSelect.value = "";
        filterSemesterSelect.disabled = true;
      }
      if (filterDivisionSelect) {
        filterDivisionSelect.innerHTML = '<option value="">Select division...</option>';
        filterDivisionSelect.disabled = true;
      }
    });
  }

  // When year changes, populate relevant semesters
  if (filterYearSelect) {
    filterYearSelect.addEventListener("change", () => {
      const year = filterYearSelect.value;

      // Reset semester and division
      if (filterSemesterSelect) {
        filterSemesterSelect.value = "";
        filterSemesterSelect.disabled = true;
        filterSemesterSelect.innerHTML = '<option value="">Select semester...</option>';
      }
      if (filterDivisionSelect) {
        filterDivisionSelect.innerHTML = '<option value="">Select division...</option>';
        filterDivisionSelect.disabled = true;
      }

      // Populate semesters for selected year
      if (year) {
        populateSemestersByYear(year);
        if (filterSemesterSelect) {
          filterSemesterSelect.disabled = false;
        }
      }
    });
  }

  // When semester changes, load divisions from teachers
  if (filterSemesterSelect) {
    filterSemesterSelect.addEventListener("change", async () => {
      const stream = filterStreamSelect?.value;
      const year = filterYearSelect?.value;
      const semester = filterSemesterSelect.value;

      // Reset division
      if (filterDivisionSelect) {
        filterDivisionSelect.innerHTML = '<option value="">Select division...</option>';
        filterDivisionSelect.disabled = true;
      }

      // Load divisions for selected stream, year, and semester from teachers
      if (stream && year && semester) {
        await populateDivisionFiltersFromTeachers(stream, year, semester);
      }
    });
  }
}

async function loadStudentsInfo() {
  const year = filterYearSelect?.value;
  const stream = filterStreamSelect?.value;
  const semester = filterSemesterSelect?.value;
  const division = filterDivisionSelect?.value;

  if (!stream || !year || !semester || !division) {
    showToast({
      title: "Selection required",
      message: "Please select stream, year, semester, and division",
      type: "warning",
    });
    return;
  }

  if (!studentsInfoBody) return;

  studentsInfoBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const data = await apiFetch(
      `/api/admin/students-info?year=${encodeURIComponent(year)}&stream=${encodeURIComponent(stream)}&semester=${encodeURIComponent(semester)}&division=${encodeURIComponent(division)}`,
    );

    // Display subjects
    if (subjectsList && data.subjects && data.subjects.length > 0) {
      subjectsList.innerHTML = data.subjects
        .map(
          (subject) => `
        <div style="padding: 0.5rem; background: #f5f5f5; border-radius: 4px;">
          <strong>${subject}</strong>
        </div>
      `,
        )
        .join("");
    } else if (subjectsList) {
      subjectsList.innerHTML = '<p class="tagline">No subjects available</p>';
    }

    // Display teachers
    if (teachersList && data.teachers && data.teachers.length > 0) {
      teachersList.innerHTML = data.teachers
        .map(
          (teacher) => `
        <div style="padding: 0.5rem; background: #f5f5f5; border-radius: 4px;">
          <strong>${teacher.teacher_name}</strong> - ${teacher.subject}
        </div>
      `,
        )
        .join("");
    } else if (teachersList) {
      teachersList.innerHTML = '<p class="tagline">No teachers available</p>';
    }

    // Show subjects and teachers container
    if (subjectsTeachersContainer) {
      subjectsTeachersContainer.style.display = "grid";
    }

    // Display student count
    if (studentCountValue) {
      studentCountValue.textContent = data.count || 0;
    }
    if (studentCountDisplay) {
      studentCountDisplay.style.display = "block";
    }

    // Display students
    if (!data.students || data.students.length === 0) {
      studentsInfoBody.innerHTML =
        '<tr><td colspan="6">No students found for this year, stream, and division</td></tr>';
      if (studentsInfoTable) {
        studentsInfoTable.style.display = "block";
      }
      if (studentCountDisplay) {
        studentCountDisplay.style.display = "none";
      }
      return;
    }

    studentsInfoBody.innerHTML = data.students
      .map(
        (student) => `
      <tr>
        <td>${student.roll_no || "N/A"}</td>
        <td>${student.student_id || "N/A"}</td>
        <td>${student.student_name || "N/A"}</td>
        <td>${student.year || "N/A"}</td>
        <td>${student.stream || "N/A"}</td>
        <td>${student.division || "N/A"}</td>
      </tr>
    `,
      )
      .join("");

    if (studentsInfoTable) {
      studentsInfoTable.style.display = "block";
    }

    const semesterLabel = semester === 'ALL' ? 'All Semesters' : semester;
    const divisionLabel = division === 'ALL' ? 'All Divisions' : division;

    showToast({
      title: "Students loaded",
      message: `Found ${data.count} students in ${year} ${stream} - ${semesterLabel} - ${divisionLabel}`,
      type: "success",
    });
  } catch (error) {
    studentsInfoBody.innerHTML =
      '<tr><td colspan="6">Error loading students information</td></tr>';
    if (studentsInfoTable) {
      studentsInfoTable.style.display = "block";
    }
    showToast({
      title: "Unable to load students",
      message: error.message,
      type: "error",
    });
  }
}

loadStudentsButton?.addEventListener("click", loadStudentsInfo);

updateSteps();
setupUploads();
loadStats();
loadActivity();
setupLiveUpdates();
loadTeachersInfo();
setupStudentFilters();
