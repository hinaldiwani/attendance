import { apiFetch, showToast, toggleLoading, formatDateTime } from "./main.js";

console.log("🟢 admin.js module loaded successfully!");
console.log("✅ Imports available:", {
  apiFetch,
  showToast,
  toggleLoading,
  formatDateTime,
});

window.addEventListener("DOMContentLoaded", () => {
  console.log("🎯 DOMContentLoaded event fired!");
  // All DOM queries and event listeners go inside here
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
    const steps = stepsList.querySelectorAll(".import-step");

    steps.forEach((step, index) => {
      const stepNumber = index + 1;

      // Remove all state classes first
      step.classList.remove("pending", "active", "completed");

      // Add appropriate state class
      if (stepNumber < currentStage) {
        step.classList.add("completed");
      } else if (stepNumber === currentStage) {
        step.classList.add("active");
      } else {
        step.classList.add("pending");
      }

      // Add animation when step becomes completed
      if (stepNumber < currentStage && !step.dataset.animated) {
        step.dataset.animated = "true";
        step.style.animation = "none";
        setTimeout(() => {
          step.style.animation = "stepComplete 0.5s ease";
        }, 10);
      }
    });
  }

  // All function definitions must be inside DOMContentLoaded to access DOM elements

  async function loadStats() {
    console.log("🚀 loadStats() called");
    try {
      console.log("🔄 Fetching /api/admin/stats...");
      const data = await apiFetch("/api/admin/stats");
      console.log("✅ Dashboard stats received from API:", data);
      console.log("📊 Student count from API:", data.students);

      statElements.forEach((stat) => {
        const key = stat.dataset.stat;
        if (key === "streams") {
          // Display count of unique streams
          stat.textContent = `${data.streams?.length || 0}`;
        } else if (key === "divisions") {
          // Display count of unique divisions
          stat.textContent = `${data.divisions?.length || 0}`;
        } else if (key === "subjects") {
          // Display count of unique subjects
          stat.textContent = `${data.subjects?.length || 0}`;
        } else {
          stat.textContent = data[key] ?? 0;
          console.log(`📊 Setting ${key} stat to:`, data[key] ?? 0);
        }
      });

      // Store data globally for modal access
      window.adminStatsData = data;

      // Update import checklist based on existing data
      updateImportChecklistFromData(data);
    } catch (error) {
      showToast({
        title: "Unable to load stats",
        message: error.message,
        type: "error",
      });
    }
  }

  function updateImportChecklistFromData(data) {
    // Only update checklist if no active import is in progress
    // Check if there's data in preview (active import session)
    const hasActiveImport = previewTable?.style.display !== "none" &&
      previewBody?.children.length > 0;

    if (hasActiveImport) {
      // Don't override the current import flow
      console.log("⏭️ Skipping checklist update - active import in progress");
      return;
    }

    const studentsCount = data.students || 0;
    const teachersCount = data.teachers || 0;

    console.log(`📊 Updating checklist from data: ${studentsCount} students, ${teachersCount} teachers`);

    // Update checklist based on what's already imported
    if (studentsCount > 0 && teachersCount > 0) {
      // Both students and teachers exist - all steps completed
      currentStage = 3;
      importState.students = studentsCount;
      importState.teachers = teachersCount;

      // Mark all steps as completed
      const steps = stepsList?.querySelectorAll(".import-step");
      steps?.forEach((step, index) => {
        step.classList.remove("pending", "active");
        step.classList.add("completed");
        if (!step.dataset.animated) {
          step.dataset.animated = "true";
        }
      });
      console.log("✅ All import steps marked as completed");
    } else if (studentsCount > 0) {
      // Only students exist - step 1 completed, step 2 active
      currentStage = 2;
      importState.students = studentsCount;
      updateSteps();
      console.log("✅ Step 1 completed, Step 2 active");
    } else {
      // No data - start from step 1
      currentStage = 1;
      updateSteps();
      console.log("📝 Starting fresh - Step 1 active");
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
    console.log("🚀 loadActivity() called");
    try {
      console.log("🔄 Fetching /api/admin/activity...");
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

          // If uploading students, it's the start of a new import cycle
          if (type === "students") {
            currentStage = 2; // Student upload complete, teachers next
            // Reset animation states for fresh import cycle
            const steps = stepsList?.querySelectorAll(".import-step");
            steps?.forEach(step => {
              delete step.dataset.animated;
              step.style.animation = "none";
            });
          } else {
            currentStage = 3; // Teachers uploaded, ready to confirm
          }

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

      // Don't reset immediately - let loadStats update based on actual data
      // This ensures the checklist reflects the database state

      let message = "All data has been stored successfully.";
      if (result.results?.cleared) {
        message += ` Cleared ${result.results.cleared.students || 0} students and ${result.results.cleared.teachers || 0} teachers before import.`;
      }

      showToast({
        title: "Import complete",
        message: message,
        type: "success",
      });

      // Real-time dashboard update - this will update the checklist too
      await loadStats();
      await loadActivity();

      // Always refresh teachers info table with the latest imported data
      await loadTeachersInfo();

      // Refresh stream filters so newly imported streams/divisions appear
      await loadStreamsFromTeachers();
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

    const studentsViewTable = exportStudentsModal?.querySelector(
      "[data-students-view-table]",
    );
    const studentsViewBody = exportStudentsModal?.querySelector(
      "[data-students-view-body]",
    );
    const exportXlsxButton = exportStudentsModal?.querySelector(
      "[data-export-students-xlsx]",
    );

    if (studentsViewBody)
      studentsViewBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

    apiFetch(
      `/api/admin/students?stream=${encodeURIComponent(stream)}&division=${encodeURIComponent(division)}&year=${encodeURIComponent(year)}`,
    )
      .then(({ students }) => {
        if (!students || !students.length) {
          if (studentsViewBody)
            studentsViewBody.innerHTML =
              '<tr><td colspan="6">No students found for selected filters.</td></tr>';
          if (studentsViewTable) studentsViewTable.style.display = "block";
          if (exportXlsxButton) exportXlsxButton.style.display = "none";
          return;
        }
        const rows = students
          .map(
            (student) => `
        <tr>
          <td>${student.roll_no || "—"}</td>
          <td>${student.student_id || "—"}</td>
          <td>${student.name || "—"}</td>
          <td>${student.year || "—"}</td>
          <td>${student.stream || "—"}</td>
          <td>${student.division || "—"}</td>
        </tr>
      `,
          )
          .join("");
        if (studentsViewBody) studentsViewBody.innerHTML = rows;
        if (studentsViewTable) studentsViewTable.style.display = "block";
        if (exportXlsxButton) exportXlsxButton.style.display = "inline-block";
        // Store data for xlsx export
        exportStudentsModal.studentsData = { students, stream, division, year };
      })
      .catch((error) => {
        if (studentsViewBody)
          studentsViewBody.innerHTML = `<tr><td colspan="6">Failed to load students: ${error.message}</td></tr>`;
        if (studentsViewTable) studentsViewTable.style.display = "block";
        if (exportXlsxButton) exportXlsxButton.style.display = "none";
      });
  });

  // Remove the duplicate submit handler that immediately exports
  // (the one that was at line 465 in the original file)

  // Export as .xlsx logic for students
  const exportStudentsXlsxButton = exportStudentsModal?.querySelector(
    "[data-export-students-xlsx]",
  );
  if (exportStudentsXlsxButton) {
    exportStudentsXlsxButton.addEventListener("click", () => {
      const data = exportStudentsModal.studentsData;
      if (!data || !data.students || !data.students.length) {
        showToast({
          title: "No data",
          message: "No students to export.",
          type: "warning",
        });
        return;
      }

      const { stream, division, year } = data;

      // Download with filters
      window.open(
        `/api/admin/templates/students?stream=${encodeURIComponent(stream)}&division=${encodeURIComponent(division)}&year=${encodeURIComponent(year)}`,
        "_blank",
      );
      exportStudentsModal?.close();

      const yearLabel = year === "ALL" ? "All Years" : year;
      const streamLabel = stream === "ALL" ? "All Streams" : stream;
      const divisionLabel = division === "ALL" ? "All Divisions" : division;

      showToast({
        title: "Export started",
        message: `Downloading students: ${yearLabel} - ${streamLabel} - ${divisionLabel}`,
        type: "success",
      });
    });
  }

  // Remove the duplicate submit handler that immediately exports
  // (the one that was at line 465 in the original file)

  const refreshDashboardButton = document.querySelector(
    "[data-refresh-dashboard]",
  );
  refreshDashboardButton?.addEventListener("click", loadStats);

  const refreshActivityButton = document.querySelector(
    "[data-refresh-activity]",
  );
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
      activityBody.innerHTML =
        '<tr><td colspan="3">Activity cleared.</td></tr>';
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

  // Refresh Mappings button handler
  const refreshMappingsButton = document.querySelector("[data-refresh-mappings]");
  refreshMappingsButton?.addEventListener("click", async () => {
    const confirmed = confirm(
      "This will refresh all student-teacher mappings based on:\n\n" +
      "• Year\n" +
      "• Stream\n" +
      "• Division\n\n" +
      "Old mappings will be cleared and new ones will be created automatically.\n\n" +
      "Do you want to proceed?",
    );

    if (!confirmed) return;

    toggleLoading(refreshMappingsButton, true);
    try {
      const result = await apiFetch("/api/admin/auto-map-students", {
        method: "POST",
        body: JSON.stringify({}),
      });

      showToast({
        title: "Mappings refreshed successfully",
        message: `Mapped ${result.mapped || 0} student-teacher relationships`,
        type: "success",
      });

      // Refresh the dashboard to show updated numbers
      await loadStats();
    } catch (error) {
      showToast({
        title: "Mapping refresh failed",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(refreshMappingsButton, false);
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
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;" onclick="viewSessionStudents(${item.id})">
                View
              </button>
              <button class="btn ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; color: #2980b9; border-color: #2980b9;" onclick="window.open('/api/admin/attendance/backup/${item.id}', '_blank')">
                Download
              </button>
              <button class="btn ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; color: #dc3545; border-color: #dc3545;" onclick="deleteAttendanceRecord(${item.id})">
                Delete
              </button>
            </div>
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

    // Close live updates connection before logout
    cleanupLiveUpdates();

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
  const defaulterCancelButton = document.querySelector(
    "[data-defaulter-cancel]",
  );
  const defaulterNextButton = document.querySelector("[data-defaulter-next]");
  const defaulterPrevButton = document.querySelector("[data-defaulter-prev]");
  const defaulterGenerateButton = document.querySelector(
    "[data-defaulter-generate]",
  );
  const defaulterExportDirectButton = document.querySelector(
    "[data-defaulter-export-direct]",
  );
  const tabButtons = document.querySelectorAll("[data-defaulter-tab]");
  const tabContents = document.querySelectorAll("[data-tab-content]");

  const tabs = ["year", "stream", "division", "month", "date", "percentage"];
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
    if (defaulterExportDirectButton)
      defaulterExportDirectButton.style.display =
        index === tabs.length - 1 ? "block" : "none";

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
    defaulterForm.style.display = "block";
    const defaultersPreview = document.querySelector(
      "[data-defaulters-preview]",
    );
    if (defaultersPreview) defaultersPreview.style.display = "none";
  });

  // Form submission - Show preview instead of immediate download
  defaulterForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(defaulterForm);
    const year = formData.get("year");
    const stream = formData.get("stream");
    const division = formData.get("division");
    const month = formData.get("month");
    const startDate = formData.get("start_date");
    const endDate = formData.get("end_date");
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
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    try {
      toggleLoading(defaulterGenerateButton, true);

      // Fetch defaulters list for preview
      const response = await apiFetch(
        `/api/admin/defaulters?${params.toString()}`,
      );

      const { defaulters, count, threshold: usedThreshold } = response;

      // Hide form, show preview
      defaulterForm.style.display = "none";

      const defaultersPreview = document.querySelector(
        "[data-defaulters-preview]",
      );
      const defaultersSummary = document.querySelector(
        "[data-defaulters-summary]",
      );
      const defaultersBody = document.querySelector("[data-defaulters-body]");

      if (defaultersPreview) defaultersPreview.style.display = "block";

      if (defaultersSummary) {
        const yearLabel = year === "ALL" ? "All Years" : year || "All Years";
        const streamLabel =
          stream === "ALL" ? "All Streams" : stream || "All Streams";
        const divisionLabel =
          division === "ALL" ? "All Divisions" : division || "All Divisions";
        const monthLabel =
          month === "ALL" ? "All Months" : month || "All Months";

        defaultersSummary.textContent = `${count} defaulters found (${usedThreshold}% threshold) - ${yearLabel}, ${streamLabel}, ${divisionLabel}, Month: ${monthLabel}`;
      }

      if (defaultersBody) {
        if (!defaulters || defaulters.length === 0) {
          defaultersBody.innerHTML =
            '<tr><td colspan="8">No defaulters found with the selected criteria</td></tr>';
        } else {
          const rows = defaulters
            .map(
              (d) => {
                const subjects = d.subjects || d.subject || "N/A";
                const subjectCount = d.subject_count || 1;
                const lecturesInfo = `${d.attended_lectures || 0} / ${d.total_lectures || 0}`;
                return `
            <tr>
              <td>${d.student_id || "—"}</td>
              <td>${d.student_name || "—"}</td>
              <td>${d.year || "—"}</td>
              <td>${d.stream || "—"}</td>
              <td>${d.division || "—"}</td>
              <td>${lecturesInfo}</td>
              <td style="color: #dc3545; font-weight: 600;">${parseFloat(d.attendance_percentage || 0).toFixed(2)}%</td>
            </tr>
          `;
              },
            )
            .join("");
          defaultersBody.innerHTML = rows;
        }
      }

      // Store params for export
      defaulterModal.defaulterParams = params;

      showToast({
        title: "Defaulters loaded",
        message: `Found ${count} defaulters`,
        type: count > 0 ? "info" : "success",
      });
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

  // Wizard direct Export button (no preview)
  defaulterExportDirectButton?.addEventListener("click", async () => {
    const formData = new FormData(defaulterForm);
    const year = formData.get("year");
    const stream = formData.get("stream");
    const division = formData.get("division");
    const month = formData.get("month");
    const startDate = formData.get("start_date");
    const endDate = formData.get("end_date");
    const threshold = formData.get("threshold");

    if (!threshold) {
      showToast({
        title: "Missing threshold",
        message: "Please complete all steps before exporting",
        type: "warning",
      });
      return;
    }

    const params = new URLSearchParams({
      threshold: parseFloat(threshold),
      type: "monthly",
    });
    if (month && month !== "ALL") params.append("month", month);
    if (year && year !== "ALL") params.append("year", year);
    if (stream && stream !== "ALL") params.append("stream", stream);
    if (division && division !== "ALL") params.append("division", division);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    try {
      toggleLoading(defaulterExportDirectButton, true);

      const response = await fetch(
        `/api/admin/defaulters/download?${params.toString()}`,
        { method: "GET", credentials: "include" },
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: "Failed to download defaulter list" }));
        throw new Error(error.message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const monthLabel = month || "All";
      const yearLabel = year || "All";
      const thresholdLabel = threshold || "75";
      a.download = `Defaulter_List_${thresholdLabel}%_${monthLabel}_${yearLabel}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast({
        title: "Export successful",
        message: "Defaulter list downloaded",
        type: "success",
      });

      defaulterModal?.close();
      defaulterForm?.reset();
      defaulterForm.style.display = "block";
      const defaultersPreview = document.querySelector(
        "[data-defaulters-preview]",
      );
      if (defaultersPreview) defaultersPreview.style.display = "none";
    } catch (error) {
      showToast({
        title: "Export failed",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(defaulterExportDirectButton, false);
    }
  });

  // Export defaulters as .xlsx
  const exportDefaultersXlsxButton = document.querySelector(
    "[data-export-defaulters-xlsx]",
  );
  exportDefaultersXlsxButton?.addEventListener("click", async () => {
    const params = defaulterModal.defaulterParams;

    if (!params) {
      showToast({
        title: "No data",
        message: "Please generate defaulters list first",
        type: "warning",
      });
      return;
    }

    try {
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
          .catch(() => ({ message: "Failed to download defaulter list" }));
        throw new Error(error.message);
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const month = params.get("month") || "All";
      const year = params.get("year") || "All";
      const threshold = params.get("threshold") || "75";
      a.download = `Defaulter_List_${threshold}%_${month}_${year}.xlsx`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast({
        title: "Export successful",
        message: `Defaulter list downloaded`,
        type: "success",
      });

      // Close modal and reset
      defaulterModal?.close();
      defaulterForm?.reset();
      defaulterForm.style.display = "block";
      const defaultersPreview = document.querySelector(
        "[data-defaulters-preview]",
      );
      if (defaultersPreview) defaultersPreview.style.display = "none";
    } catch (error) {
      showToast({
        title: "Export failed",
        message: error.message,
        type: "error",
      });
    }
  });

  // Close modal on backdrop click
  defaulterModal?.addEventListener("click", (e) => {
    if (e.target === defaulterModal) {
      defaulterModal.close();
      defaulterForm?.reset();
    }
  });

  // ── Admin Defaulter History ────────────────────────────────────────────────
  const viewAdminDefaulterHistoryButton = document.querySelector(
    "[data-view-admin-defaulter-history]",
  );
  const adminDefaulterHistoryModal = document.querySelector(
    "[data-admin-defaulter-history-modal]",
  );
  const adminDefaulterHistoryBody = document.querySelector(
    "[data-admin-defaulter-history-body]",
  );
  const closeAdminDefaulterHistoryButton = document.querySelector(
    "[data-close-admin-defaulter-history]",
  );
  const adminDhDetailModal = document.querySelector(
    "[data-admin-dh-detail-modal]",
  );
  const adminDhDetailBody = document.querySelector(
    "[data-admin-dh-detail-body]",
  );
  const adminDhDetailSummary = document.querySelector(
    "[data-admin-dh-detail-summary]",
  );
  const closeAdminDhDetailButton = document.querySelector(
    "[data-close-admin-dh-detail]",
  );

  viewAdminDefaulterHistoryButton?.addEventListener("click", () => {
    loadAdminDefaulterHistory();
    adminDefaulterHistoryModal?.showModal();
  });

  closeAdminDefaulterHistoryButton?.addEventListener("click", () =>
    adminDefaulterHistoryModal?.close(),
  );
  adminDefaulterHistoryModal?.addEventListener("click", (e) => {
    if (e.target === adminDefaulterHistoryModal)
      adminDefaulterHistoryModal.close();
  });

  closeAdminDhDetailButton?.addEventListener("click", () =>
    adminDhDetailModal?.close(),
  );
  adminDhDetailModal?.addEventListener("click", (e) => {
    if (e.target === adminDhDetailModal) adminDhDetailModal.close();
  });

  async function loadAdminDefaulterHistory() {
    if (!adminDefaulterHistoryBody) return;
    adminDefaulterHistoryBody.innerHTML =
      '<tr><td colspan="6">Loading...</td></tr>';
    try {
      const { history } = await apiFetch("/api/admin/defaulters/history");

      if (!history || history.length === 0) {
        adminDefaulterHistoryBody.innerHTML =
          '<tr><td colspan="6">No defaulter history found.</td></tr>';
        return;
      }

      adminDefaulterHistoryBody.innerHTML = history
        .map((item) => {
          const date = new Date(item.created_at).toLocaleString();
          const threshold = item.threshold || 75;
          return `
          <tr>
            <td>${item.teacher_name || item.teacher_id || "—"}</td>
            <td style="font-size:0.85rem;">${item.filters_summary || "—"}</td>
            <td>${threshold}%</td>
            <td style="font-weight:600;">${item.defaulter_count ?? 0}</td>
            <td style="font-size:0.85rem;">${date}</td>
            <td>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                <button class="btn ghost" style="padding:0.2rem 0.6rem;font-size:0.8rem;"
                  onclick="openAdminDhDetail(${item.id})">View</button>
                <button class="btn ghost" style="padding:0.2rem 0.6rem;font-size:0.8rem;color:#2980b9;border-color:#2980b9;"
                  onclick="window.open('/api/admin/defaulters/history/${item.id}/download', '_blank')">Download</button>
                <button class="btn ghost" style="padding:0.2rem 0.6rem;font-size:0.8rem;color:#dc3545;border-color:#dc3545;"
                  onclick="deleteAdminDhItem(${item.id})">Delete</button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
    } catch (error) {
      adminDefaulterHistoryBody.innerHTML =
        '<tr><td colspan="6">Failed to load history.</td></tr>';
      showToast({
        title: "Unable to load defaulter history",
        message: error.message,
        type: "error",
      });
    }
  }

  window.openAdminDhDetail = async function (id) {
    if (!adminDhDetailModal) return;
    if (adminDhDetailBody)
      adminDhDetailBody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
    if (adminDhDetailSummary) adminDhDetailSummary.textContent = "Loading…";
    adminDhDetailModal.showModal();

    try {
      const { record, defaulters } = await apiFetch(
        `/api/admin/defaulters/history/${id}`,
      );

      const threshold = record.threshold || 75;
      const date = new Date(record.created_at).toLocaleString();
      if (adminDhDetailSummary) {
        adminDhDetailSummary.textContent = `${record.teacher_name || record.teacher_id} · ${record.filters_summary || ""} · ${threshold}% threshold · ${defaulters.length} defaulters · ${date}`;
      }

      if (!defaulters || defaulters.length === 0) {
        if (adminDhDetailBody)
          adminDhDetailBody.innerHTML =
            '<tr><td colspan="8">No defaulters in this record.</td></tr>';
        return;
      }

      if (adminDhDetailBody) {
        adminDhDetailBody.innerHTML = defaulters
          .map(
            (d, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${d.roll_no || "—"}</td>
            <td>${d.student_name || "—"}</td>
            <td>${d.year || "—"}</td>
            <td>${d.stream || "—"}</td>
            <td>${d.division || "—"}</td>
            <td>${d.attended_lectures || 0} / ${d.total_lectures || 0}</td>
            <td style="color:#dc3545;font-weight:600;">${parseFloat(d.attendance_percentage || 0).toFixed(2)}%</td>
          </tr>`,
          )
          .join("");
      }
    } catch (error) {
      if (adminDhDetailBody)
        adminDhDetailBody.innerHTML =
          '<tr><td colspan="8">Failed to load detail.</td></tr>';
      showToast({
        title: "Unable to load detail",
        message: error.message,
        type: "error",
      });
    }
  };

  window.deleteAdminDhItem = async function (id) {
    if (!confirm("Delete this defaulter history entry? This cannot be undone."))
      return;
    try {
      await apiFetch(`/api/admin/defaulters/history/${id}`, {
        method: "DELETE",
      });
      showToast({
        title: "Deleted",
        message: "Defaulter history entry removed",
        type: "success",
      });
      loadAdminDefaulterHistory();
    } catch (error) {
      showToast({
        title: "Delete failed",
        message: error.message,
        type: "error",
      });
    }
  };

  // Setup live updates with Server-Sent Events
  let liveEventSource = null;

  function setupLiveUpdates() {
    // Close existing connection if any
    if (liveEventSource) {
      liveEventSource.close();
      liveEventSource = null;
    }

    liveEventSource = new EventSource("/api/admin/live-updates");

    liveEventSource.addEventListener("attendance_marked", (event) => {
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

    liveEventSource.addEventListener("data_import", (event) => {
      const data = JSON.parse(event.data);
      showToast({
        title: "Data Imported",
        message: `${data.studentsCount} students, ${data.teachersCount} teachers imported`,
        type: "success",
      });
      loadStats();
      loadActivity();
    });

    liveEventSource.addEventListener("defaulter_generated", (event) => {
      const data = JSON.parse(event.data);
      showToast({
        title: "Defaulter List Generated",
        message: `${data.count} defaulters found (${data.threshold}% threshold)`,
        type: "info",
      });
      loadActivity();
    });

    liveEventSource.addEventListener("stats_update", (event) => {
      loadStats();
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

  // Teacher Information Section
  const teachersInfoBody = document.querySelector("[data-teachers-info-body]");
  const refreshTeachersButton = document.querySelector(
    "[data-refresh-teachers]",
  );

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
        <td>${teacher.division || "N/A"}</td>
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
  const studentsInfoTable = document.querySelector(
    "[data-students-info-table]",
  );
  const studentCountDisplay = document.querySelector(
    "[data-student-count-display]",
  );
  const studentCountValue = document.querySelector(
    "[data-student-count-value]",
  );
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
      const data = await apiFetch("/api/admin/student-streams");

      if (data.streams && data.streams.length > 0) {
        filterStreamSelect.innerHTML =
          '<option value="">Select stream...</option>';
        data.streams.forEach((stream) => {
          const option = document.createElement("option");
          option.value = stream;
          option.textContent = stream;
          filterStreamSelect.appendChild(option);
        });
      } else {
        filterStreamSelect.innerHTML =
          '<option value="">No streams available</option>';
      }
    } catch (error) {
      console.error("Failed to load streams:", error);
      filterStreamSelect.innerHTML =
        '<option value="">Error loading streams</option>';
    }
  }

  // Populate semester dropdown based on year
  function populateSemestersByYear(year) {
    if (!filterSemesterSelect) return;

    filterSemesterSelect.innerHTML =
      '<option value="">Select semester...</option>';

    // Add All Semesters option
    const allOption = document.createElement("option");
    allOption.value = "ALL";
    allOption.textContent = "All Semesters";
    filterSemesterSelect.appendChild(allOption);

    const semesterOptions = {
      FY: [
        { value: "Sem 1", label: "Semester 1" },
        { value: "Sem 2", label: "Semester 2" },
      ],
      SY: [
        { value: "Sem 3", label: "Semester 3" },
        { value: "Sem 4", label: "Semester 4" },
      ],
      TY: [
        { value: "Sem 5", label: "Semester 5" },
        { value: "Sem 6", label: "Semester 6" },
      ],
    };

    const semesters = semesterOptions[year] || [];

    semesters.forEach((sem) => {
      const option = document.createElement("option");
      option.value = sem.value;
      option.textContent = sem.label;
      filterSemesterSelect.appendChild(option);
    });
  }

  // Populate division filters from teacher_details_db based on stream, year, and semester
  async function populateDivisionFiltersFromTeachers(stream, year, semester) {
    if (!filterDivisionSelect) return;

    filterDivisionSelect.innerHTML =
      '<option value="">Select division...</option>';
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
        filterDivisionSelect.innerHTML =
          '<option value="">No divisions available</option>';
      }
    } catch (error) {
      console.error("Failed to populate division filters:", error);
      filterDivisionSelect.innerHTML =
        '<option value="">Error loading divisions</option>';
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
          filterDivisionSelect.innerHTML =
            '<option value="">Select division...</option>';
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
          filterSemesterSelect.innerHTML =
            '<option value="">Select semester...</option>';
        }
        if (filterDivisionSelect) {
          filterDivisionSelect.innerHTML =
            '<option value="">Select division...</option>';
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
          filterDivisionSelect.innerHTML =
            '<option value="">Select division...</option>';
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

      const semesterLabel = semester === "ALL" ? "All Semesters" : semester;
      const divisionLabel = division === "ALL" ? "All Divisions" : division;

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

  // === Global functions for attendance history view/delete ===
  window.viewSessionStudents = async function (sessionId) {
    const viewSessionModal = document.querySelector(
      "[data-view-session-modal]",
    );
    const sessionDetailsEl = document.querySelector("[data-session-details]");
    const sessionStudentsBody = document.querySelector(
      "[data-session-students-body]",
    );

    if (!viewSessionModal || !sessionStudentsBody) return;

    try {
      sessionStudentsBody.innerHTML =
        '<tr><td colspan="4">Loading...</td></tr>';
      viewSessionModal.showModal();

      const response = await apiFetch(
        `/api/admin/attendance/session/${sessionId}`,
      );
      const { session, students } = response;

      // Update session details
      if (sessionDetailsEl) {
        sessionDetailsEl.textContent = `${session.subject} - ${session.year} ${session.stream} ${session.division} (${session.teacher_id})`;
      }

      // Render students
      if (!students || students.length === 0) {
        sessionStudentsBody.innerHTML =
          '<tr><td colspan="4">No students found</td></tr>';
        return;
      }

      const rows = students
        .map(
          (s) => `
        <tr>
          <td>${s.rollNo || "—"}</td>
          <td>${s.studentId || "—"}</td>
          <td>${s.name || "—"}</td>
          <td style="color: ${s.status === "P" ? "#28a745" : "#dc3545"}; font-weight: 600;">
            ${s.status === "P" ? "Present" : "Absent"}
          </td>
        </tr>
      `,
        )
        .join("");

      sessionStudentsBody.innerHTML = rows;

      // Store data for export
      viewSessionModal.sessionData = { session, students };
    } catch (error) {
      sessionStudentsBody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
      showToast({
        title: "Failed to load session",
        message: error.message,
        type: "error",
      });
    }
  };

  window.deleteAttendanceRecord = async function (sessionId) {
    if (
      !confirm(
        "Are you sure you want to delete this attendance record? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await apiFetch(`/api/admin/attendance/session/${sessionId}`, {
        method: "DELETE",
      });

      showToast({
        title: "Record deleted",
        message: "Attendance record has been deleted successfully",
        type: "success",
      });

      // Reload history
      await loadAttendanceHistory();
    } catch (error) {
      showToast({
        title: "Delete failed",
        message: error.message,
        type: "error",
      });
    }
  };

  // === Close view session modal ===
  const closeViewSessionButton = document.querySelector(
    "[data-close-view-session]",
  );
  closeViewSessionButton?.addEventListener("click", () => {
    const viewSessionModal = document.querySelector(
      "[data-view-session-modal]",
    );
    viewSessionModal?.close();
  });

  // === Export session as xlsx ===
  const exportSessionButton = document.querySelector("[data-export-session]");
  exportSessionButton?.addEventListener("click", async () => {
    const viewSessionModal = document.querySelector(
      "[data-view-session-modal]",
    );
    const sessionData = viewSessionModal?.sessionData;

    if (!sessionData) {
      showToast({
        title: "No data",
        message: "No session data to export",
        type: "warning",
      });
      return;
    }

    try {
      // Download the Excel file from backend
      const sessionId = sessionData.session.id;
      window.open(`/api/admin/attendance/backup/${sessionId}`, "_blank");

      showToast({
        title: "Export started",
        message: "Downloading attendance report",
        type: "success",
      });
    } catch (error) {
      showToast({
        title: "Export failed",
        message: error.message,
        type: "error",
      });
    }
  });

  // === Clickable stat cards ===
  const statCards = document.querySelectorAll("[data-stat-card]");
  statCards.forEach((card) => {
    card.addEventListener("click", async () => {
      const statType = card.dataset.statCard;

      if (statType === "students") {
        await showStudentsList();
      } else if (statType === "teachers") {
        await showTeachersList();
      } else if (statType === "streams") {
        await showStreamsList();
      } else if (statType === "subjects") {
        await showSubjectsList();
      } else if (statType === "divisions") {
        await showDivisionsList();
      }
    });
  });

  async function showStudentsList() {
    const modal = document.querySelector("[data-students-list-modal]");
    const tbody = document.querySelector("[data-students-list-body]");

    if (!modal || !tbody) return;

    modal.showModal();
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    try {
      const { allStudents } = await apiFetch("/api/admin/all-students");

      if (!allStudents || allStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No students found</td></tr>';
        return;
      }

      const rows = allStudents
        .map(
          (s) => `
        <tr>
          <td>${s.student_name || "—"}</td>
          <td>${s.year || "—"}</td>
          <td>${s.stream || "—"}</td>
          <td>${s.division || "—"}</td>
        </tr>
      `,
        )
        .join("");

      tbody.innerHTML = rows;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
    }
  }

  async function showTeachersList() {
    const modal = document.querySelector("[data-teachers-list-modal]");
    const tbody = document.querySelector("[data-teachers-list-body]");

    if (!modal || !tbody) return;

    modal.showModal();
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

    try {
      const { allTeachers } = await apiFetch("/api/admin/all-teachers");

      if (!allTeachers || allTeachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No teachers found</td></tr>';
        return;
      }

      // Each row = one unique teaching assignment (10 rows for 10 CSV entries)
      const rows = allTeachers
        .map(
          (t) => `
        <tr>
          <td>${t.teacher_id || "—"}</td>
          <td><strong>${t.teacher_name || "—"}</strong></td>
          <td>${t.subject || "—"}</td>
          <td>${t.year || "—"}</td>
          <td>${t.stream || "—"}</td>
          <td>${t.semester || "—"}</td>
          <td>${t.division || "—"}</td>
        </tr>
      `,
        )
        .join("");

      tbody.innerHTML = rows;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
    }
  }

  async function showStreamsList() {
    const modal = document.querySelector("[data-streams-list-modal]");
    const tbody = document.querySelector("[data-streams-list-body]");

    if (!modal || !tbody) return;

    modal.showModal();
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
      // Fetch stream summary from students (shows real student streams)
      const { allStudents } = await apiFetch("/api/admin/all-students");

      if (!allStudents || allStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2">No streams found</td></tr>';
        return;
      }

      // Count students per stream
      const streamMap = {};
      allStudents.forEach((s) => {
        const key = s.stream || "Unknown";
        streamMap[key] = (streamMap[key] || 0) + 1;
      });

      const rows = Object.entries(streamMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(
          ([stream, count]) => `
          <tr>
            <td><strong>${stream}</strong></td>
            <td>${count} student${count !== 1 ? "s" : ""}</td>
          </tr>
        `,
        )
        .join("");

      tbody.innerHTML = rows;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="2">Error: ${error.message}</td></tr>`;
    }
  }

  async function showSubjectsList() {
    const modal = document.querySelector("[data-subjects-list-modal]");
    const tbody = document.querySelector("[data-subjects-list-body]");

    if (!modal || !tbody) return;

    modal.showModal();
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

    try {
      const { allSubjects } = await apiFetch("/api/admin/all-subjects");

      if (!allSubjects || allSubjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">No subjects found</td></tr>';
        return;
      }

      const rows = allSubjects
        .map(
          (s) => `
        <tr>
          <td>${s.subject || "—"}</td>
          <td>${s.year}-${s.stream}-${s.division || "—"}</td>
          <td>${s.teacher_name || "—"}</td>
        </tr>
      `,
        )
        .join("");

      tbody.innerHTML = rows;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="3">Error: ${error.message}</td></tr>`;
    }
  }

  async function showDivisionsList() {
    const modal = document.querySelector("[data-divisions-list-modal]");
    const tbody = document.querySelector("[data-divisions-list-body]");

    if (!modal || !tbody) return;

    modal.showModal();
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
      const { allDivisions } = await apiFetch("/api/admin/all-divisions");

      if (!allDivisions || allDivisions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2">No divisions found</td></tr>';
        return;
      }

      const rows = allDivisions
        .map(
          (d) => `
        <tr>
          <td>${d.division || "—"}</td>
          <td>${d.teachers || "—"}</td>
        </tr>
      `,
        )
        .join("");

      tbody.innerHTML = rows;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="2">Error: ${error.message}</td></tr>`;
    }
  }

  // Close modal buttons
  document
    .querySelector("[data-close-students-list]")
    ?.addEventListener("click", () => {
      document.querySelector("[data-students-list-modal]")?.close();
    });

  document
    .querySelector("[data-close-teachers-list]")
    ?.addEventListener("click", () => {
      document.querySelector("[data-teachers-list-modal]")?.close();
    });

  document
    .querySelector("[data-close-streams-list]")
    ?.addEventListener("click", () => {
      document.querySelector("[data-streams-list-modal]")?.close();
    });

  document
    .querySelector("[data-close-subjects-list]")
    ?.addEventListener("click", () => {
      document.querySelector("[data-subjects-list-modal]")?.close();
    });

  document
    .querySelector("[data-close-divisions-list]")
    ?.addEventListener("click", () => {
      document.querySelector("[data-divisions-list-modal]")?.close();
    });

  // === Export Teachers functionality ===
  const exportTeachersModal = document.querySelector(
    "[data-export-teachers-modal]",
  );
  const exportTeachersButton = document.querySelector(
    "[data-export-teachers-xlsx]",
  );
  const cancelExportTeachersButton = document.querySelector(
    "[data-cancel-export-teachers]",
  );

  // Update template buttons to handle teachers differently
  templateButtons.forEach((button) => {
    const existingHandler = button.onclick;
    button.onclick = null;

    button.addEventListener("click", async () => {
      const type = button.dataset.downloadTemplate;
      if (type === "students") {
        // Show modal for students view
        loadStreamsDivisions();
        exportStudentsModal?.showModal();
        // Reset table and export button
        const studentsViewTable = exportStudentsModal?.querySelector(
          "[data-students-view-table]",
        );
        const studentsViewBody = exportStudentsModal?.querySelector(
          "[data-students-view-body]",
        );
        const exportXlsxButton = exportStudentsModal?.querySelector(
          "[data-export-students-xlsx]",
        );
        if (studentsViewTable) studentsViewTable.style.display = "none";
        if (exportXlsxButton) exportXlsxButton.style.display = "none";
        if (studentsViewBody)
          studentsViewBody.innerHTML =
            '<tr><td colspan="6">Select filters and click View to see students.</td></tr>';
      } else if (type === "teachers") {
        // Show teachers modal with preview
        const teachersViewBody = exportTeachersModal?.querySelector(
          "[data-teachers-view-body]",
        );

        if (teachersViewBody) {
          teachersViewBody.innerHTML =
            '<tr><td colspan="7">Loading...</td></tr>';
        }

        exportTeachersModal?.showModal();

        try {
          const { teachers } = await apiFetch("/api/admin/teachers-info");

          if (!teachers || teachers.length === 0) {
            teachersViewBody.innerHTML =
              '<tr><td colspan="7">No teachers found</td></tr>';
            return;
          }

          const rows = teachers
            .map(
              (t) => `
            <tr>
              <td>${t.teacher_id || "—"}</td>
              <td>${t.teacher_name || "—"}</td>
              <td>${t.subject || "—"}</td>
              <td>${t.year || "—"}</td>
              <td>${t.stream || "—"}</td>
              <td>${t.semester || "—"}</td>
              <td>${t.division || "—"}</td>
            </tr>
          `,
            )
            .join("");

          teachersViewBody.innerHTML = rows;
        } catch (error) {
          teachersViewBody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
        }
      } else {
        window.open(`/api/admin/templates/${type}`, "_blank");
      }
    });
  });

  cancelExportTeachersButton?.addEventListener("click", () => {
    exportTeachersModal?.close();
  });

  exportTeachersButton?.addEventListener("click", () => {
    window.open("/api/admin/templates/teachers", "_blank");
    exportTeachersModal?.close();

    showToast({
      title: "Export started",
      message: "Downloading teachers list",
      type: "success",
    });
  });

  // Initialize everything after all functions are defined
  console.log("🎬 Starting initialization...");
  try {
    console.log("📝 Running updateSteps()");
    updateSteps();
    console.log("📂 Running setupUploads()");
    setupUploads();

    console.log("📊 Starting async initializations...");
    // Run async initializations independently to prevent blocking
    loadStats().catch((err) => {
      console.error("❌ loadStats failed:", err);
      showToast({
        title: "Stats Loading Error",
        message: err.message,
        type: "error",
      });
    });

    loadActivity().catch((err) => {
      console.error("❌ loadActivity failed:", err);
      showToast({
        title: "Activity Loading Error",
        message: err.message,
        type: "error",
      });
    });

    loadTeachersInfo().catch((err) => {
      console.error("❌ loadTeachersInfo failed:", err);
      showToast({
        title: "Teachers Info Loading Error",
        message: err.message,
        type: "error",
      });
    });

    setupLiveUpdates();

    console.log("🔧 Running setupStudentFilters()");
    try {
      setupStudentFilters();
    } catch (err) {
      console.error("❌ setupStudentFilters failed:", err);
    }

    // ────────────────────────────────────────────────────────────────────────────────
    // Search Functionality
    // ────────────────────────────────────────────────────────────────────────────────
    const searchInput = document.getElementById("adminSearchInput");
    const searchBtn = document.querySelector("[data-search-btn]");
    const studentDetailsModal = document.querySelector("[data-student-details-modal]");
    const teacherDetailsModal = document.querySelector("[data-teacher-details-modal]");
    const studentDetailsContent = document.querySelector("[data-student-details-content]");
    const teacherDetailsContent = document.querySelector("[data-teacher-details-content]");
    const closeStudentDetailsBtn = document.querySelector("[data-close-student-details]");
    const closeTeacherDetailsBtn = document.querySelector("[data-close-teacher-details]");

    async function performSearch() {
      const searchQuery = searchInput?.value?.trim();
      
      if (!searchQuery) {
        showToast({
          title: "Search Required",
          message: "Please enter a Student ID or Teacher ID",
          type: "warning"
        });
        return;
      }

      try {
        // Try to search for student first
        const studentResponse = await apiFetch(`/api/admin/search/student/${encodeURIComponent(searchQuery)}`);
        
        if (studentResponse.success && studentResponse.data) {
          // Calculate attendance percentage
          const student = studentResponse.data;
          student.attendance_percentage = student.total_sessions > 0 
            ? (student.attendance_count / student.total_sessions) * 100 
            : 0;
          student.total_lectures = student.total_sessions || 0;
          student.attended_lectures = student.attendance_count || 0;
          displayStudentDetails(student);
          return;
        }
      } catch (error) {
        console.log("Student not found, trying teacher...");
      }

      try {
        // Try to search for teacher
        const teacherResponse = await apiFetch(`/api/admin/search/teacher/${encodeURIComponent(searchQuery)}`);
        
        if (teacherResponse.success && teacherResponse.data) {
          const teacher = teacherResponse.data;
          teacher.student_count = teacher.assigned_students || 0;
          displayTeacherDetails(teacher);
          return;
        }
      } catch (error) {
        console.log("Teacher not found");
      }

      // Neither found
      showToast({
        title: "Not Found",
        message: `No student or teacher found with ID: ${searchQuery}`,
        type: "error"
      });
    }

    function displayStudentDetails(student) {
      const attendancePercentage = student.attendance_percentage || 0;
      const attendanceColor = attendancePercentage >= 75 ? '#27ae60' : '#e74c3c';
      
      studentDetailsContent.innerHTML = `
        <div class="card" style="background: #f8f9fa; padding: 1.5rem;">
          <div style="display: grid; gap: 1rem;">
            <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
              <h2 style="margin: 0; color: #2c3e50;">${student.student_name || 'N/A'}</h2>
              <p style="margin: 0.5rem 0 0; color: #7f8c8d; font-size: 0.9rem;">
                ID: ${student.student_id || 'N/A'}
              </p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Roll No</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${student.roll_no || 'N/A'}</div>
              </div>
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Year</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${student.year || 'N/A'}</div>
              </div>
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Stream</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${student.stream || 'N/A'}</div>
              </div>
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Division</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${student.division || 'N/A'}</div>
              </div>
            </div>

            <div style="background: ${attendanceColor}15; border: 2px solid ${attendanceColor}; padding: 1.5rem; border-radius: 12px; text-align: center;">
              <div style="color: #7f8c8d; font-size: 0.9rem; margin-bottom: 0.5rem;">Overall Attendance</div>
              <div style="font-size: 2.5rem; font-weight: 700; color: ${attendanceColor};">
                ${attendancePercentage.toFixed(2)}%
              </div>
              <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">
                ${student.total_lectures || 0} total lectures | ${student.attended_lectures || 0} attended
              </div>
            </div>

            ${student.subjects ? `
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.5rem;">Subjects</div>
                <div style="font-size: 0.95rem;">${student.subjects}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
      
      studentDetailsModal?.showModal();
    }

    function displayTeacherDetails(teacher) {
      teacherDetailsContent.innerHTML = `
        <div class="card" style="background: #f8f9fa; padding: 1.5rem;">
          <div style="display: grid; gap: 1rem;">
            <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
              <h2 style="margin: 0; color: #2c3e50;">${teacher.name || 'N/A'}</h2>
              <p style="margin: 0.5rem 0 0; color: #7f8c8d; font-size: 0.9rem;">
                ID: ${teacher.teacher_id || 'N/A'}
              </p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Subject</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${teacher.subject || 'N/A'}</div>
              </div>
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Year</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${teacher.year || 'N/A'}</div>
              </div>
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Stream</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${teacher.stream || 'N/A'}</div>
              </div>
              <div style="background: white; padding: 1rem; border-radius: 8px;">
                <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Semester</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${teacher.semester || 'N/A'}</div>
              </div>
            </div>

            <div style="background: white; padding: 1rem; border-radius: 8px;">
              <div style="color: #7f8c8d; font-size: 0.85rem; margin-bottom: 0.25rem;">Division</div>
              <div style="font-size: 1.1rem; font-weight: 600;">${teacher.division || 'N/A'}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              ${teacher.student_count !== undefined ? `
                <div style="background: #3498db15; border: 2px solid #3498db; padding: 1.5rem; border-radius: 12px; text-align: center;">
                  <div style="color: #7f8c8d; font-size: 0.9rem; margin-bottom: 0.5rem;">Assigned Students</div>
                  <div style="font-size: 2.5rem; font-weight: 700; color: #3498db;">
                    ${teacher.student_count}
                  </div>
                </div>
              ` : ''}
              
              ${teacher.sessions_taken !== undefined ? `
                <div style="background: #9b59b615; border: 2px solid #9b59b6; padding: 1.5rem; border-radius: 12px; text-align: center;">
                  <div style="color: #7f8c8d; font-size: 0.9rem; margin-bottom: 0.5rem;">Sessions Taken</div>
                  <div style="font-size: 2.5rem; font-weight: 700; color: #9b59b6;">
                    ${teacher.sessions_taken}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
      
      teacherDetailsModal?.showModal();
    }

    // Event listeners
    searchBtn?.addEventListener("click", performSearch);
    searchInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        performSearch();
      }
    });

    closeStudentDetailsBtn?.addEventListener("click", () => {
      studentDetailsModal?.close();
    });

    closeTeacherDetailsBtn?.addEventListener("click", () => {
      teacherDetailsModal?.close();
    });

    studentDetailsModal?.addEventListener("click", (e) => {
      if (e.target === studentDetailsModal) {
        studentDetailsModal.close();
      }
    });

    teacherDetailsModal?.addEventListener("click", (e) => {
      if (e.target === teacherDetailsModal) {
        teacherDetailsModal.close();
      }
    });

    console.log("✅ Initialization complete!");
  } catch (error) {
    console.error("💥 Initialization error:", error);
  }
});
