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

      let message = result.message || "All data has been stored successfully.";
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

  // Change Password Modal
  const changePasswordButton = document.querySelector("[data-change-password]");
  const changePasswordModal = document.querySelector("[data-change-password-modal]");
  const changePasswordForm = document.querySelector("[data-change-password-form]");
  const closeChangePasswordButton = document.querySelector("[data-close-change-password]");
  const cancelChangePasswordButton = document.querySelector("[data-cancel-change-password]");

  // Open change password modal
  changePasswordButton?.addEventListener("click", () => {
    changePasswordForm?.reset();
    changePasswordModal?.showModal();
  });

  // Close change password modal
  closeChangePasswordButton?.addEventListener("click", () => {
    changePasswordModal?.close();
  });

  cancelChangePasswordButton?.addEventListener("click", () => {
    changePasswordModal?.close();
  });

  // Handle password change form submission
  changePasswordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(changePasswordForm);
    const currentPassword = formData.get("currentPassword");
    const newPassword = formData.get("newPassword");
    const confirmPassword = formData.get("confirmPassword");

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      showToast({
        title: "Password Mismatch",
        message: "New password and confirm password do not match",
        type: "error"
      });
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      showToast({
        title: "Password Too Short",
        message: "Password must be at least 6 characters long",
        type: "error"
      });
      return;
    }

    try {
      const response = await apiFetch("/api/admin/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (response.success) {
        showToast({
          title: "Success",
          message: "Password changed successfully. Please login again with your new password.",
          type: "success"
        });

        // Close modal
        changePasswordModal?.close();

        // Logout after 2 seconds
        setTimeout(async () => {
          await apiFetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/";
        }, 2000);
      }
    } catch (error) {
      showToast({
        title: "Error",
        message: error.message || "Failed to change password",
        type: "error"
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

  const tabs = ["year", "stream", "division", "daterange", "percentage"];
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
    const startDate = formData.get("start_date");
    const endDate = formData.get("end_date");
    const threshold = formData.get("threshold");

    // Build query parameters
    const params = new URLSearchParams({
      threshold: parseFloat(threshold),
      type: "monthly",
    });

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
        const dateRangeLabel = startDate
          ? (endDate ? `${startDate} to ${endDate}` : `From ${startDate}`)
          : "All Dates";

        defaultersSummary.textContent = `${count} defaulters found (${usedThreshold}% threshold) - ${yearLabel}, ${streamLabel}, ${divisionLabel}, ${dateRangeLabel}`;
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
  const teacherInfoSearchInput = document.querySelector(
    "[data-teacher-info-search-input]",
  );
  const teachersListTab = document.querySelector("[data-teachers-list-tab]");
  const addTeacherTab = document.querySelector("[data-add-teacher-tab]");
  const editTeacherTab = document.querySelector("[data-edit-teacher-tab]");
  const openAddTeacherTabButton = document.querySelector(
    "[data-open-add-teacher-tab]",
  );
  const openEditTeacherTabButton = document.querySelector(
    "[data-open-edit-teacher-tab]",
  );
  const openTeachersListTabButton = document.querySelector(
    "[data-open-teachers-list-tab]",
  );
  const closeEditTeacherTabButton = document.querySelector(
    "[data-close-edit-teacher-tab]",
  );
  const addTeacherForm = document.querySelector("[data-add-teacher-form]");
  const addMappingRowButton = document.querySelector("[data-add-mapping-row]");
  const resetAddTeacherFormButton = document.querySelector(
    "[data-reset-add-teacher-form]",
  );
  const teacherMappingsContainer = document.querySelector(
    "[data-teacher-mappings-container]",
  );
  const teacherMappingRowTemplate = document.querySelector(
    "[data-teacher-mapping-row-template]",
  );
  const editTeacherFormPanel = document.querySelector(
    "[data-edit-teacher-form-panel]",
  );
  const editTeacherForm = document.querySelector("[data-edit-teacher-form]");
  const editTeacherList = document.querySelector("[data-edit-teacher-list]");
  const addEditMappingRowButton = document.querySelector(
    "[data-add-edit-mapping-row]",
  );
  const resetEditTeacherFormButton = document.querySelector(
    "[data-reset-edit-teacher-form]",
  );
  const editTeacherMappingsContainer = document.querySelector(
    "[data-edit-teacher-mappings-container]",
  );
  const editTeacherMappingRowTemplate = document.querySelector(
    "[data-edit-teacher-mapping-row-template]",
  );
  const confirmEditTeacherButton = document.querySelector(
    "[data-confirm-edit-teacher]",
  );
  const submitAddTeacherButton = document.querySelector(
    "[data-submit-add-teacher]",
  );

  const semesterOptionsByYear = {
    FY: ["Sem 1", "Sem 2"],
    SY: ["Sem 3", "Sem 4"],
    TY: ["Sem 5", "Sem 6"],
  };

  let teacherFormStreams = [];
  let selectedTeacherForEdit = null;

  function showTeacherListTab() {
    if (teachersListTab) teachersListTab.style.display = "block";
    if (addTeacherTab) addTeacherTab.style.display = "none";
    if (editTeacherTab) editTeacherTab.style.display = "none";
  }

  function showAddTeacherTab() {
    if (teachersListTab) teachersListTab.style.display = "none";
    if (addTeacherTab) addTeacherTab.style.display = "block";
    if (editTeacherTab) editTeacherTab.style.display = "none";
  }

  function showEditTeacherTab() {
    if (teachersListTab) teachersListTab.style.display = "none";
    if (addTeacherTab) addTeacherTab.style.display = "none";
    if (editTeacherTab) editTeacherTab.style.display = "block";
  }

  function normalizeCommonDivision(value) {
    const normalized = [...new Set(
      (value || "")
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean),
    )];
    return normalized.join(",");
  }

  function populateSemestersForMapping(select, year) {
    if (!select) return;
    select.innerHTML = '<option value="">Select semester...</option>';

    const options = semesterOptionsByYear[year] || [];
    options.forEach((semester) => {
      const option = document.createElement("option");
      option.value = semester;
      option.textContent = semester;
      select.appendChild(option);
    });
    select.disabled = options.length === 0;
  }

  function populateStreamOptionsForMapping(select) {
    if (!select) return;
    select.innerHTML = '<option value="">Select stream...</option>';

    teacherFormStreams.forEach((stream) => {
      const option = document.createElement("option");
      option.value = stream;
      option.textContent = stream;
      select.appendChild(option);
    });
  }

  function collectMappingsFromContainer(container) {
    return Array.from(
      container?.querySelectorAll("[data-remove-mapping-row]") || [],
    )
      .map((removeButton) => removeButton.closest(".card"))
      .map((row) => {
        const subject = row?.querySelector("[data-mapping-subject]")?.value?.trim();
        const year = row?.querySelector("[data-mapping-year]")?.value?.trim();
        const semester = row?.querySelector("[data-mapping-semester]")?.value?.trim();
        const stream = row?.querySelector("[data-mapping-stream]")?.value?.trim();
        return { subject, year, semester, stream };
      })
      .filter((mapping) =>
        mapping.subject && mapping.year && mapping.semester && mapping.stream,
      );
  }

  function createTeacherMappingRow(prefill = {}) {
    if (!teacherMappingRowTemplate || !teacherMappingsContainer) return;
    const rowFragment = teacherMappingRowTemplate.content.cloneNode(true);
    const rowElement = rowFragment.firstElementChild;

    const subjectInput = rowElement.querySelector("[data-mapping-subject]");
    const yearSelect = rowElement.querySelector("[data-mapping-year]");
    const semesterSelect = rowElement.querySelector("[data-mapping-semester]");
    const streamSelect = rowElement.querySelector("[data-mapping-stream]");
    const removeButton = rowElement.querySelector("[data-remove-mapping-row]");

    populateStreamOptionsForMapping(streamSelect);

    if (prefill.subject && subjectInput) subjectInput.value = prefill.subject;
    if (prefill.year && yearSelect) {
      yearSelect.value = prefill.year;
      populateSemestersForMapping(semesterSelect, prefill.year);
    }
    if (prefill.semester && semesterSelect) semesterSelect.value = prefill.semester;
    if (prefill.stream && streamSelect) streamSelect.value = prefill.stream;

    yearSelect?.addEventListener("change", () => {
      populateSemestersForMapping(semesterSelect, yearSelect.value);
    });

    removeButton?.addEventListener("click", () => {
      rowElement.remove();
      if (!teacherMappingsContainer.children.length) {
        createTeacherMappingRow();
      }
    });

    teacherMappingsContainer.appendChild(rowElement);
  }

  function createEditTeacherMappingRow(prefill = {}) {
    if (!editTeacherMappingRowTemplate || !editTeacherMappingsContainer) return;
    const rowFragment = editTeacherMappingRowTemplate.content.cloneNode(true);
    const rowElement = rowFragment.firstElementChild;

    const subjectInput = rowElement.querySelector("[data-mapping-subject]");
    const yearSelect = rowElement.querySelector("[data-mapping-year]");
    const semesterSelect = rowElement.querySelector("[data-mapping-semester]");
    const streamSelect = rowElement.querySelector("[data-mapping-stream]");
    const removeButton = rowElement.querySelector("[data-remove-mapping-row]");

    populateStreamOptionsForMapping(streamSelect);

    if (prefill.subject && subjectInput) subjectInput.value = prefill.subject;
    if (prefill.year && yearSelect) {
      yearSelect.value = prefill.year;
      populateSemestersForMapping(semesterSelect, prefill.year);
    }
    if (prefill.semester && semesterSelect) semesterSelect.value = prefill.semester;
    if (prefill.stream && streamSelect) streamSelect.value = prefill.stream;

    yearSelect?.addEventListener("change", () => {
      populateSemestersForMapping(semesterSelect, yearSelect.value);
    });

    removeButton?.addEventListener("click", () => {
      rowElement.remove();
      if (!editTeacherMappingsContainer.children.length) {
        createEditTeacherMappingRow();
      }
    });

    editTeacherMappingsContainer.appendChild(rowElement);
  }

  function resetAddTeacherForm() {
    addTeacherForm?.reset();
    if (teacherMappingsContainer) {
      teacherMappingsContainer.innerHTML = "";
      createTeacherMappingRow();
    }
  }

  function resetEditTeacherFormUI() {
    editTeacherForm?.reset();
    if (editTeacherMappingsContainer) {
      editTeacherMappingsContainer.innerHTML = "";
    }
    if (editTeacherFormPanel) {
      editTeacherFormPanel.style.display = "none";
    }
    selectedTeacherForEdit = null;
  }

  function setSelectedTeacherInList(teacherId) {
    const buttons = editTeacherList?.querySelectorAll("[data-edit-teacher-item]") || [];
    buttons.forEach((button) => {
      const isSelected = button.getAttribute("data-teacher-id") === teacherId;
      button.style.borderColor = isSelected ? "#2980b9" : "rgba(0,0,0,0.1)";
      button.style.background = isSelected ? "rgba(41,128,185,0.08)" : "#fff";
    });
  }

  async function loadTeacherFormStreams() {
    try {
      const data = await apiFetch("/api/admin/student-streams");
      teacherFormStreams = Array.isArray(data?.streams) ? data.streams : [];
    } catch (error) {
      teacherFormStreams = [];
    }
  }

  async function loadTeachersForEditList() {
    if (!editTeacherList) return;

    editTeacherList.innerHTML = '<p class="tagline">Loading teachers...</p>';
    try {
      const data = await apiFetch("/api/admin/teachers-info");
      const teachers = Array.isArray(data?.teachers) ? data.teachers : [];

      if (!teachers.length) {
        editTeacherList.innerHTML = '<p class="tagline">No teachers found</p>';
        return;
      }

      editTeacherList.innerHTML = teachers
        .map(
          (teacher) => `
            <button
              type="button"
              class="btn ghost"
              data-edit-teacher-item
              data-teacher-id="${teacher.teacher_id}"
              style="text-align: left; justify-content: flex-start; border-color: rgba(0,0,0,0.1); background: #fff; width: 100%"
            >
              <span style="display: inline-flex; flex-direction: column; align-items: flex-start">
                <strong>${teacher.teacher_id || "N/A"}</strong>
                <small>${teacher.teacher_name || "N/A"}</small>
              </span>
            </button>
          `,
        )
        .join("");

      editTeacherList
        .querySelectorAll("[data-edit-teacher-item]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const teacherId = button.getAttribute("data-teacher-id");
            if (teacherId) {
              loadTeacherForEdit(teacherId);
            }
          });
        });

      if (selectedTeacherForEdit) {
        setSelectedTeacherInList(selectedTeacherForEdit);
      }
    } catch (error) {
      editTeacherList.innerHTML = `<p class="tagline">Error: ${error.message}</p>`;
    }
  }

  async function loadTeacherForEdit(teacherId) {
    try {
      const data = await apiFetch(
        `/api/admin/teachers/${encodeURIComponent(teacherId)}/edit`,
      );
      const teacher = data?.teacher;

      if (!teacher) {
        throw new Error("Teacher details not found");
      }

      selectedTeacherForEdit = teacher.teacherId;
      setSelectedTeacherInList(selectedTeacherForEdit);

      const editTeacherIdInput = document.querySelector("#editTeacherId");
      const editTeacherNameInput = document.querySelector("#editTeacherName");
      const editTeacherDivisionsInput = document.querySelector(
        "#editTeacherDivisions",
      );

      if (editTeacherIdInput) editTeacherIdInput.value = teacher.teacherId || "";
      if (editTeacherNameInput) editTeacherNameInput.value = teacher.teacherName || "";
      if (editTeacherDivisionsInput) {
        editTeacherDivisionsInput.value = teacher.division || "";
      }

      if (editTeacherMappingsContainer) {
        editTeacherMappingsContainer.innerHTML = "";
        const assignments = Array.isArray(teacher.assignments)
          ? teacher.assignments
          : [];

        if (assignments.length) {
          assignments.forEach((assignment) => {
            createEditTeacherMappingRow({
              subject: assignment.subject,
              year: assignment.year,
              semester: assignment.semester,
              stream: assignment.stream,
            });
          });
        } else {
          createEditTeacherMappingRow();
        }
      }

      if (editTeacherFormPanel) {
        editTeacherFormPanel.style.display = "block";
      }
    } catch (error) {
      showToast({
        title: "Unable to load teacher",
        message: error.message,
        type: "error",
      });
    }
  }

  async function loadTeachersInfo() {
    if (!teachersInfoBody) return;

    teachersInfoBody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';

    try {
      const data = await apiFetch("/api/admin/teachers-info");

      if (!data.teachers || data.teachers.length === 0) {
        teachersInfoBody.innerHTML =
          '<tr><td colspan="9">No teachers found</td></tr>';
        return;
      }

      teachersInfoBody.innerHTML = data.teachers
        .map(
          (teacher) => {
            const status =
              String(teacher.status || "Active").toLowerCase() === "inactive"
                ? "Inactive"
                : "Active";
            const statusButtonStyle =
              status === "Active"
                ? "background: #eafaf1; color: #1e8449; border: 1px solid #58d68d;"
                : "background: #fdecea; color: #c0392b; border: 1px solid #f1948a;";

            return `
      <tr>
        <td>${teacher.teacher_id || "N/A"}</td>
        <td>${teacher.teacher_name || "N/A"}</td>
        <td>${teacher.subject || "N/A"}</td>
        <td>${teacher.year || "N/A"}</td>
        <td>${teacher.stream || "N/A"}</td>
        <td>${teacher.semester || "N/A"}</td>
        <td>${teacher.division || "N/A"}</td>
        <td>${teacher.student_count || 0}</td>
        <td>
          <button
            type="button"
            class="btn ghost"
            data-toggle-teacher-status
            data-teacher-id="${teacher.teacher_id || ""}"
            data-status="${status}"
            style="padding: 0.3rem 0.75rem; font-size: 0.82rem; min-width: 95px; ${statusButtonStyle}"
          >
            ${status}
          </button>
        </td>
      </tr>
    `;
          },
        )
        .join("");

      applyTeachersInfoSearch();
    } catch (error) {
      teachersInfoBody.innerHTML =
        '<tr><td colspan="9">Error loading teachers information</td></tr>';
      showToast({
        title: "Unable to load teachers",
        message: error.message,
        type: "error",
      });
    }
  }

  teachersInfoBody?.addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-toggle-teacher-status]");
    if (!statusButton) return;

    const teacherId = statusButton.getAttribute("data-teacher-id");
    const currentStatus = statusButton.getAttribute("data-status") || "Active";
    const nextStatus = currentStatus === "Active" ? "Inactive" : "Active";

    if (!teacherId) return;

    toggleLoading(statusButton, true);
    try {
      const response = await apiFetch(
        `/api/admin/teachers/${encodeURIComponent(teacherId)}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      showToast({
        title: "Teacher status updated",
        message: response.message || `${teacherId} is now ${nextStatus}`,
        type: "success",
      });

      await loadTeachersInfo();
      loadStats().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to update status",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(statusButton, false);
    }
  });

  refreshTeachersButton?.addEventListener("click", loadTeachersInfo);
  teacherInfoSearchInput?.addEventListener("input", applyTeachersInfoSearch);
  openAddTeacherTabButton?.addEventListener("click", async () => {
    if (!teacherFormStreams.length) {
      await loadTeacherFormStreams();
      const streamSelects = teacherMappingsContainer?.querySelectorAll(
        "[data-mapping-stream]",
      );
      streamSelects?.forEach((select) => populateStreamOptionsForMapping(select));
    }
    showAddTeacherTab();
  });
  openEditTeacherTabButton?.addEventListener("click", async () => {
    if (!teacherFormStreams.length) {
      await loadTeacherFormStreams();
    }
    resetEditTeacherFormUI();
    showEditTeacherTab();
    await loadTeachersForEditList();
  });
  openTeachersListTabButton?.addEventListener("click", showTeacherListTab);
  closeEditTeacherTabButton?.addEventListener("click", showTeacherListTab);

  addMappingRowButton?.addEventListener("click", () => createTeacherMappingRow());
  addEditMappingRowButton?.addEventListener("click", () =>
    createEditTeacherMappingRow(),
  );
  resetAddTeacherFormButton?.addEventListener("click", resetAddTeacherForm);
  resetEditTeacherFormButton?.addEventListener("click", async () => {
    if (!selectedTeacherForEdit) {
      resetEditTeacherFormUI();
      return;
    }
    await loadTeacherForEdit(selectedTeacherForEdit);
  });

  addTeacherForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const teacherId = document.querySelector("#addTeacherId")?.value?.trim();
    const teacherName = document.querySelector("#addTeacherName")?.value?.trim();
    const commonDivision = normalizeCommonDivision(
      document.querySelector("#addTeacherDivisions")?.value,
    );

    const mappings = collectMappingsFromContainer(teacherMappingsContainer);

    if (!teacherId || !teacherName || !commonDivision) {
      showToast({
        title: "Required fields missing",
        message: "Teacher ID, name, and common divisions are required.",
        type: "warning",
      });
      return;
    }

    if (!mappings.length) {
      showToast({
        title: "Add at least one mapping",
        message: "Each mapping requires Subject, Year, Semester, and Stream.",
        type: "warning",
      });
      return;
    }

    toggleLoading(submitAddTeacherButton, true);
    try {
      const response = await apiFetch("/api/admin/teachers/add", {
        method: "POST",
        body: JSON.stringify({
          teacherId,
          teacherName,
          division: commonDivision,
          mappings,
        }),
      });

      showToast({
        title: "Teacher added",
        message: response.message || "Teacher details saved successfully.",
        type: "success",
      });

      resetAddTeacherForm();
      await loadTeachersInfo();
      showTeacherListTab();
      loadStats().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to add teacher",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(submitAddTeacherButton, false);
    }
  });

  editTeacherForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedTeacherForEdit) {
      showToast({
        title: "Select teacher",
        message: "Please select a teacher from the list first.",
        type: "warning",
      });
      return;
    }

    const teacherName = document.querySelector("#editTeacherName")?.value?.trim();
    const commonDivision = normalizeCommonDivision(
      document.querySelector("#editTeacherDivisions")?.value,
    );
    const mappings = collectMappingsFromContainer(editTeacherMappingsContainer);

    if (!teacherName || !commonDivision) {
      showToast({
        title: "Required fields missing",
        message: "Teacher name and common divisions are required.",
        type: "warning",
      });
      return;
    }

    if (!mappings.length) {
      showToast({
        title: "Add at least one mapping",
        message: "Each mapping requires Subject, Year, Semester, and Stream.",
        type: "warning",
      });
      return;
    }

    toggleLoading(confirmEditTeacherButton, true);
    try {
      const response = await apiFetch(
        `/api/admin/teachers/${encodeURIComponent(selectedTeacherForEdit)}/update`,
        {
          method: "PUT",
          body: JSON.stringify({
            teacherName,
            division: commonDivision,
            mappings,
          }),
        },
      );

      showToast({
        title: "Teacher updated",
        message: response.message || "Teacher information updated successfully.",
        type: "success",
      });

      await loadTeachersInfo();
      await loadTeachersForEditList();
      await loadTeacherForEdit(selectedTeacherForEdit);
      loadStats().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to update teacher",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(confirmEditTeacherButton, false);
    }
  });

  createTeacherMappingRow();

  // Students Information Section
  const openAddStudentTabButton = document.querySelector(
    "[data-open-add-student-tab]",
  );
  const openEditStudentTabButton = document.querySelector(
    "[data-open-edit-student-tab]",
  );
  const openStudentBulkStatusTabButton = document.querySelector(
    "[data-open-student-bulk-status-tab]",
  );
  const openStudentsListTabButton = document.querySelector(
    "[data-open-students-list-tab]",
  );
  const closeEditStudentTabButton = document.querySelector(
    "[data-close-edit-student-tab]",
  );
  const closeStudentBulkStatusTabButton = document.querySelector(
    "[data-close-student-bulk-status-tab]",
  );
  const refreshStudentsButton = document.querySelector("[data-refresh-students]");
  const studentsListTab = document.querySelector("[data-students-list-tab]");
  const addStudentTab = document.querySelector("[data-add-student-tab]");
  const editStudentTab = document.querySelector("[data-edit-student-tab]");
  const studentBulkStatusTab = document.querySelector(
    "[data-student-bulk-status-tab]",
  );

  const addStudentForm = document.querySelector("[data-add-student-form]");
  const submitAddStudentButton = document.querySelector("[data-submit-add-student]");
  const resetAddStudentFormButton = document.querySelector(
    "[data-reset-add-student-form]",
  );

  const editStudentList = document.querySelector("[data-edit-student-list]");
  const editStudentFormPanel = document.querySelector(
    "[data-edit-student-form-panel]",
  );
  const editStudentForm = document.querySelector("[data-edit-student-form]");
  const confirmEditStudentButton = document.querySelector(
    "[data-confirm-edit-student]",
  );
  const resetEditStudentFormButton = document.querySelector(
    "[data-reset-edit-student-form]",
  );

  const bulkStudentYearSelect = document.querySelector("#bulkStudentYear");
  const bulkStudentStreamSelect = document.querySelector("#bulkStudentStream");
  const bulkStudentDivisionSelect = document.querySelector("#bulkStudentDivision");
  const studentBulkStatusForm = document.querySelector(
    "[data-student-bulk-status-form]",
  );
  const applyBulkStudentStatusButton = document.querySelector(
    "[data-apply-bulk-student-status]",
  );

  const filterYearSelect = document.querySelector("#filterYear");
  const filterStreamSelect = document.querySelector("#filterStream");
  const filterSemesterSelect = document.querySelector("#filterSemester");
  const filterDivisionSelect = document.querySelector("#filterDivision");
  const loadStudentsButton = document.querySelector("[data-load-students]");
  const studentsInfoBody = document.querySelector("[data-students-info-body]");
  const studentInfoSearchInput = document.querySelector(
    "[data-student-info-search-input]",
  );
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

  let selectedStudentForEdit = "";
  let cachedStudentsForEdit = [];

  function normalizeStudentStatus(statusValue) {
    return String(statusValue || "").toLowerCase() === "inactive"
      ? "Inactive"
      : "Active";
  }

  function doesRowMatchQuery(row, query, divisionCellIndex) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return true;

    const cellValues = Array.from(row.querySelectorAll("td")).map((cell) =>
      String(cell.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    );

    // Division can be a single letter; use exact division matching for one-letter alphabetical queries.
    if (/^[a-z]$/i.test(normalizedQuery)) {
      const divisionValue = cellValues[divisionCellIndex] || "";
      return divisionValue === normalizedQuery;
    }

    return cellValues.some((value) => value.includes(normalizedQuery));
  }

  function applyTableSearch({
    tbody,
    query,
    divisionCellIndex,
    noMatchMessage,
    noMatchColspan,
  }) {
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll("tr"));
    const dataRows = rows.filter((row) => row.querySelectorAll("td").length > 1);
    const existingNoMatchRow = tbody.querySelector("[data-inline-search-empty]");

    if (!dataRows.length) {
      existingNoMatchRow?.remove();
      return;
    }

    let matchedCount = 0;

    dataRows.forEach((row) => {
      const matched = doesRowMatchQuery(row, query, divisionCellIndex);
      row.style.display = matched ? "" : "none";
      row.classList.toggle(
        "inline-search-match",
        matched && !!String(query || "").trim(),
      );
      if (matched) matchedCount += 1;
    });

    if (!String(query || "").trim() || matchedCount > 0) {
      existingNoMatchRow?.remove();
      return;
    }

    if (!existingNoMatchRow) {
      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr data-inline-search-empty><td colspan="${noMatchColspan}">${noMatchMessage}</td></tr>`,
      );
    }
  }

  function applyTeachersInfoSearch() {
    applyTableSearch({
      tbody: teachersInfoBody,
      query: teacherInfoSearchInput?.value || "",
      divisionCellIndex: 6,
      noMatchMessage: "No matching teacher records found.",
      noMatchColspan: 9,
    });
  }

  function applyStudentsInfoSearch() {
    applyTableSearch({
      tbody: studentsInfoBody,
      query: studentInfoSearchInput?.value || "",
      divisionCellIndex: 5,
      noMatchMessage: "No matching student records found.",
      noMatchColspan: 7,
    });
  }

  function hideStudentTabs() {
    if (studentsListTab) studentsListTab.style.display = "none";
    if (addStudentTab) addStudentTab.style.display = "none";
    if (editStudentTab) editStudentTab.style.display = "none";
    if (studentBulkStatusTab) studentBulkStatusTab.style.display = "none";
  }

  function showStudentsListTab() {
    hideStudentTabs();
    if (studentsListTab) studentsListTab.style.display = "block";
  }

  function showAddStudentTab() {
    hideStudentTabs();
    if (addStudentTab) addStudentTab.style.display = "block";
  }

  function showEditStudentTab() {
    hideStudentTabs();
    if (editStudentTab) editStudentTab.style.display = "block";
  }

  function showStudentBulkStatusTab() {
    hideStudentTabs();
    if (studentBulkStatusTab) studentBulkStatusTab.style.display = "block";
  }

  function resetAddStudentForm() {
    addStudentForm?.reset();
  }

  function resetEditStudentFormUI() {
    selectedStudentForEdit = "";
    if (editStudentFormPanel) {
      editStudentFormPanel.style.display = "none";
    }
    if (editStudentForm) {
      editStudentForm.reset();
    }
    if (!editStudentList) return;
    const buttons = editStudentList.querySelectorAll("[data-edit-student-id]");
    buttons.forEach((btn) => {
      btn.style.background = "";
      btn.style.color = "";
      btn.style.borderColor = "";
    });
  }

  function setSelectedStudentInList(studentId) {
    if (!editStudentList) return;
    const buttons = editStudentList.querySelectorAll("[data-edit-student-id]");
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute("data-edit-student-id") === studentId;
      btn.style.background = isActive ? "#2563eb" : "";
      btn.style.color = isActive ? "#ffffff" : "";
      btn.style.borderColor = isActive ? "#1d4ed8" : "";
    });
  }

  async function loadStudentsForEditList() {
    if (!editStudentList) return;
    editStudentList.innerHTML = '<p class="tagline">Loading students...</p>';

    try {
      const { allStudents } = await apiFetch("/api/admin/all-students");
      cachedStudentsForEdit = Array.isArray(allStudents)
        ? [...allStudents].sort((a, b) =>
          String(a.student_id || "").localeCompare(String(b.student_id || "")),
        )
        : [];

      if (!cachedStudentsForEdit.length) {
        editStudentList.innerHTML = '<p class="tagline">No students found.</p>';
        return;
      }

      editStudentList.innerHTML = cachedStudentsForEdit
        .map((student) => {
          const status = normalizeStudentStatus(student.status);
          const statusColor =
            status === "Active" ? "color:#1e8449;" : "color:#c0392b;";
          return `
            <button
              type="button"
              class="btn secondary"
              data-edit-student-id="${student.student_id || ""}"
              style="justify-content: flex-start; text-align: left; width: 100%;"
            >
              <span style="display:block;">
                <strong>${student.student_id || "N/A"}</strong> - ${student.student_name || "N/A"}
                <span style="display:block; font-size:0.8rem; ${statusColor}">${status}</span>
              </span>
            </button>
          `;
        })
        .join("");
    } catch (error) {
      editStudentList.innerHTML = '<p class="tagline">Unable to load students.</p>';
      showToast({
        title: "Unable to load students",
        message: error.message,
        type: "error",
      });
    }
  }

  async function loadStudentForEdit(studentId) {
    if (!studentId) return;

    try {
      const { student } = await apiFetch(
        `/api/admin/students/${encodeURIComponent(studentId)}/edit`,
      );

      selectedStudentForEdit = student.studentId;
      setSelectedStudentInList(selectedStudentForEdit);

      const editStudentIdInput = document.querySelector("#editStudentId");
      const editStudentNameInput = document.querySelector("#editStudentName");
      const editStudentRollNoInput = document.querySelector("#editStudentRollNo");
      const editStudentYearSelect = document.querySelector("#editStudentYear");
      const editStudentStreamInput = document.querySelector("#editStudentStream");
      const editStudentDivisionInput = document.querySelector("#editStudentDivision");

      if (editStudentIdInput) editStudentIdInput.value = student.studentId || "";
      if (editStudentNameInput) editStudentNameInput.value = student.studentName || "";
      if (editStudentRollNoInput) {
        editStudentRollNoInput.value = student.rollNo ?? "";
      }
      if (editStudentYearSelect) editStudentYearSelect.value = student.year || "";
      if (editStudentStreamInput) editStudentStreamInput.value = student.stream || "";
      if (editStudentDivisionInput) {
        editStudentDivisionInput.value = student.division || "";
      }

      if (editStudentFormPanel) {
        editStudentFormPanel.style.display = "block";
      }
    } catch (error) {
      showToast({
        title: "Unable to load student",
        message: error.message,
        type: "error",
      });
    }
  }

  async function populateBulkStreamOptions(year) {
    if (!bulkStudentStreamSelect || !year) return;

    bulkStudentStreamSelect.innerHTML = '<option value="">Loading streams...</option>';
    bulkStudentStreamSelect.disabled = true;

    try {
      const data = await apiFetch(
        `/api/admin/streams-divisions?year=${encodeURIComponent(year)}`,
      );
      const streams = Array.isArray(data.streams) ? data.streams : [];

      if (!streams.length) {
        bulkStudentStreamSelect.innerHTML =
          '<option value="">No streams found for year</option>';
        return;
      }

      bulkStudentStreamSelect.innerHTML = streams
        .map((stream) => `<option value="${stream}">${stream}</option>`)
        .join("");
      bulkStudentStreamSelect.disabled = false;

      await populateBulkDivisionOptions(year, bulkStudentStreamSelect.value);
    } catch (error) {
      bulkStudentStreamSelect.innerHTML =
        '<option value="">Unable to load streams</option>';
      showToast({
        title: "Unable to auto-fill streams",
        message: error.message,
        type: "error",
      });
    }
  }

  async function populateBulkDivisionOptions(year, stream) {
    if (!bulkStudentDivisionSelect || !year || !stream) return;

    bulkStudentDivisionSelect.innerHTML =
      '<option value="">Loading divisions...</option>';
    bulkStudentDivisionSelect.disabled = true;

    try {
      const data = await apiFetch(
        `/api/admin/streams-divisions?year=${encodeURIComponent(year)}&stream=${encodeURIComponent(stream)}`,
      );
      const divisions = Array.isArray(data.divisions) ? data.divisions : [];

      if (!divisions.length) {
        bulkStudentDivisionSelect.innerHTML =
          '<option value="">No divisions found for selection</option>';
        return;
      }

      bulkStudentDivisionSelect.innerHTML = divisions
        .map((division) => `<option value="${division}">${division}</option>`)
        .join("");
      bulkStudentDivisionSelect.disabled = false;
    } catch (error) {
      bulkStudentDivisionSelect.innerHTML =
        '<option value="">Unable to load divisions</option>';
      showToast({
        title: "Unable to auto-fill divisions",
        message: error.message,
        type: "error",
      });
    }
  }

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

  async function loadStudentsInfo({ showExtras = true } = {}) {
    const year = filterYearSelect?.value;
    const stream = filterStreamSelect?.value;
    const semester = filterSemesterSelect?.value;
    const division = filterDivisionSelect?.value;

    if (!studentsInfoBody) return;

    studentsInfoBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

    try {
      const params = new URLSearchParams();
      if (year) params.set("year", year);
      if (stream) params.set("stream", stream);
      if (semester) params.set("semester", semester);
      if (division) params.set("division", division);
      const data = await apiFetch(`/api/admin/students-info?${params.toString()}`);

      if (showExtras) {
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
      }

      // Display students
      if (!data.students || data.students.length === 0) {
        studentsInfoBody.innerHTML =
          '<tr><td colspan="7">No students found for this year, stream, and division</td></tr>';
        if (studentsInfoTable) {
          studentsInfoTable.style.display = "block";
        }
        if (studentCountDisplay) {
          studentCountDisplay.style.display = "none";
        }
        return;
      }

      // Sort by student_id in ascending order
      const sortedStudents = [...data.students].sort((a, b) => {
        const idA = String(a.student_id || '').toLowerCase();
        const idB = String(b.student_id || '').toLowerCase();
        return idA.localeCompare(idB);
      });

      studentsInfoBody.innerHTML = sortedStudents
        .map(
          (student) => `
      <tr>
        <td>${student.roll_no || "N/A"}</td>
        <td>${student.student_id || "N/A"}</td>
        <td>${student.student_name || "N/A"}</td>
        <td>${student.year || "N/A"}</td>
        <td>${student.stream || "N/A"}</td>
        <td>${student.division || "N/A"}</td>
        <td>
          <button
            type="button"
            class="btn ghost"
            data-toggle-student-status
            data-student-id="${student.student_id || ""}"
            data-status="${normalizeStudentStatus(student.status)}"
            style="padding: 0.3rem 0.75rem; font-size: 0.82rem; min-width: 95px; ${normalizeStudentStatus(student.status) === "Active"
              ? "background: #eafaf1; color: #1e8449; border: 1px solid #58d68d;"
              : "background: #fdecea; color: #c0392b; border: 1px solid #f1948a;"
            }"
          >
            ${normalizeStudentStatus(student.status)}
          </button>
        </td>
      </tr>
    `,
        )
        .join("");

      applyStudentsInfoSearch();

      if (studentsInfoTable) {
        studentsInfoTable.style.display = "block";
      }

      if (showExtras) {
        const semesterLabel = semester === "ALL" ? "All Semesters" : semester;
        const divisionLabel = division === "ALL" ? "All Divisions" : division;
        showToast({
          title: "Students loaded",
          message: `Found ${data.count} students in ${year} ${stream} - ${semesterLabel} - ${divisionLabel}`,
          type: "success",
        });
      }
    } catch (error) {
      studentsInfoBody.innerHTML =
        '<tr><td colspan="7">Error loading students information</td></tr>';
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

  studentsInfoBody?.addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-toggle-student-status]");
    if (!statusButton) return;

    const studentId = statusButton.getAttribute("data-student-id");
    const currentStatus = normalizeStudentStatus(
      statusButton.getAttribute("data-status"),
    );
    const nextStatus = currentStatus === "Active" ? "Inactive" : "Active";

    if (!studentId) return;

    toggleLoading(statusButton, true);
    try {
      const response = await apiFetch(
        `/api/admin/students/${encodeURIComponent(studentId)}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      showToast({
        title: "Student status updated",
        message: response.message || `${studentId} is now ${nextStatus}`,
        type: "success",
      });

      await loadStudentsInfo();
      loadStats().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to update student status",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(statusButton, false);
    }
  });

  openAddStudentTabButton?.addEventListener("click", showAddStudentTab);
  openEditStudentTabButton?.addEventListener("click", async () => {
    resetEditStudentFormUI();
    showEditStudentTab();
    await loadStudentsForEditList();
  });
  openStudentBulkStatusTabButton?.addEventListener(
    "click",
    showStudentBulkStatusTab,
  );
  openStudentsListTabButton?.addEventListener("click", showStudentsListTab);
  closeEditStudentTabButton?.addEventListener("click", showStudentsListTab);
  closeStudentBulkStatusTabButton?.addEventListener(
    "click",
    showStudentsListTab,
  );

  resetAddStudentFormButton?.addEventListener("click", resetAddStudentForm);
  resetEditStudentFormButton?.addEventListener("click", async () => {
    if (!selectedStudentForEdit) {
      resetEditStudentFormUI();
      return;
    }
    await loadStudentForEdit(selectedStudentForEdit);
  });

  editStudentList?.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-edit-student-id]");
    if (!target) return;
    const studentId = target.getAttribute("data-edit-student-id");
    await loadStudentForEdit(studentId);
  });

  addStudentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const studentId = document.querySelector("#addStudentId")?.value?.trim();
    const studentName = document.querySelector("#addStudentName")?.value?.trim();
    const rollNoValue = document.querySelector("#addStudentRollNo")?.value?.trim();
    const year = document.querySelector("#addStudentYear")?.value?.trim();
    const stream = document.querySelector("#addStudentStream")?.value?.trim();
    const division = document.querySelector("#addStudentDivision")?.value?.trim();

    if (!studentId || !studentName || !rollNoValue || !year || !stream || !division) {
      showToast({
        title: "Required fields missing",
        message: "Student ID, name, roll no, year, stream, and division are required.",
        type: "warning",
      });
      return;
    }

    toggleLoading(submitAddStudentButton, true);
    try {
      const response = await apiFetch("/api/admin/students/add", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          studentName,
          rollNo: Number(rollNoValue),
          year,
          stream,
          division,
        }),
      });

      showToast({
        title: "Student added",
        message: response.message || "Student added successfully.",
        type: "success",
      });

      resetAddStudentForm();
      showStudentsListTab();
      loadStats().catch(() => { });
      await loadStudentsInfo().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to add student",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(submitAddStudentButton, false);
    }
  });

  editStudentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedStudentForEdit) {
      showToast({
        title: "Select student",
        message: "Please select a student from the list first.",
        type: "warning",
      });
      return;
    }

    const studentName = document.querySelector("#editStudentName")?.value?.trim();
    const rollNoValue = document.querySelector("#editStudentRollNo")?.value?.trim();
    const year = document.querySelector("#editStudentYear")?.value?.trim();
    const stream = document.querySelector("#editStudentStream")?.value?.trim();
    const division = document.querySelector("#editStudentDivision")?.value?.trim();

    if (!studentName || !rollNoValue || !year || !stream || !division) {
      showToast({
        title: "Required fields missing",
        message: "Name, roll no, year, stream, and division are required.",
        type: "warning",
      });
      return;
    }

    toggleLoading(confirmEditStudentButton, true);
    try {
      const response = await apiFetch(
        `/api/admin/students/${encodeURIComponent(selectedStudentForEdit)}/update`,
        {
          method: "PUT",
          body: JSON.stringify({
            studentName,
            rollNo: Number(rollNoValue),
            year,
            stream,
            division,
          }),
        },
      );

      showToast({
        title: "Student updated",
        message: response.message || "Student information updated successfully.",
        type: "success",
      });

      await loadStudentsForEditList();
      await loadStudentForEdit(selectedStudentForEdit);
      await loadStudentsInfo().catch(() => { });
      loadStats().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to update student",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(confirmEditStudentButton, false);
    }
  });

  bulkStudentYearSelect?.addEventListener("change", async () => {
    const year = bulkStudentYearSelect.value;

    if (!year) {
      if (bulkStudentStreamSelect) {
        bulkStudentStreamSelect.innerHTML = '<option value="ALL">All Streams</option>';
        bulkStudentStreamSelect.disabled = true;
      }
      if (bulkStudentDivisionSelect) {
        bulkStudentDivisionSelect.innerHTML = '<option value="ALL">All Divisions</option>';
        bulkStudentDivisionSelect.disabled = true;
      }
      return;
    }

    await populateBulkStreamOptions(year);
  });

  bulkStudentStreamSelect?.addEventListener("change", async () => {
    const year = bulkStudentYearSelect?.value;
    const stream = bulkStudentStreamSelect.value;
    if (!year || !stream) return;
    await populateBulkDivisionOptions(year, stream);
  });

  studentBulkStatusForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const year = bulkStudentYearSelect?.value;
    const stream = bulkStudentStreamSelect?.value;
    const division = bulkStudentDivisionSelect?.value;
    const status = document.querySelector("#bulkStudentStatus")?.value;

    if (!year || !stream || !division || !status) {
      showToast({
        title: "Required fields missing",
        message: "Year, stream, division, and status are required.",
        type: "warning",
      });
      return;
    }

    toggleLoading(applyBulkStudentStatusButton, true);
    try {
      const response = await apiFetch("/api/admin/students/status/bulk", {
        method: "PUT",
        body: JSON.stringify({ year, stream, division, status }),
      });

      showToast({
        title: "Bulk status updated",
        message:
          response.message ||
          `Updated ${response.updated || 0} student record(s) to ${status}.`,
        type: "success",
      });

      showStudentsListTab();
      await loadStudentsInfo().catch(() => { });
      loadStats().catch(() => { });
    } catch (error) {
      showToast({
        title: "Unable to update student status",
        message: error.message,
        type: "error",
      });
    } finally {
      toggleLoading(applyBulkStudentStatusButton, false);
    }
  });

  refreshStudentsButton?.addEventListener("click", async () => {
    await loadStreamsFromTeachers();
    await loadStudentsInfo().catch(() => { });
  });
  studentInfoSearchInput?.addEventListener("input", async () => {
    if (studentsInfoTable && studentsInfoTable.style.display === "none") {
      await loadStudentsInfo({ showExtras: false });
    } else {
      applyStudentsInfoSearch();
    }
  });

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

      // Sort by student ID in ascending order
      const sortedStudents = [...students].sort((a, b) => {
        const idA = String(a.studentId || '').toLowerCase();
        const idB = String(b.studentId || '').toLowerCase();
        return idA.localeCompare(idB);
      });

      const rows = sortedStudents
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
      } else if (statType === "current-sessions") {
        await showCurrentSessionsList();
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

      // Sort by student_id in ascending order
      const sortedStudents = [...allStudents].sort((a, b) => {
        const idA = String(a.student_id || '').toLowerCase();
        const idB = String(b.student_id || '').toLowerCase();
        return idA.localeCompare(idB);
      });

      const rows = sortedStudents
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

  async function showCurrentSessionsList() {
    const modal = document.querySelector("[data-current-sessions-list-modal]");
    const tbody = document.querySelector("[data-current-sessions-list-body]");

    if (!modal || !tbody) return;

    modal.showModal();
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

    try {
      const { currentSessions } = await apiFetch("/api/admin/current-sessions");

      if (!currentSessions || currentSessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No ongoing sessions found</td></tr>';
        return;
      }

      const rows = currentSessions
        .map(
          (s) => `
        <tr>
          <td>${s.subject || "—"}</td>
          <td><strong>${s.teacher_name || s.teacher_id || "—"}</strong></td>
          <td>${s.year || "—"}</td>
          <td>${s.stream || "—"}</td>
          <td>${s.division || "—"}</td>
          <td>${formatDateTime(s.started_at) || "—"}</td>
        </tr>
      `,
        )
        .join("");

      tbody.innerHTML = rows;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
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
    .querySelector("[data-close-current-sessions-list]")
    ?.addEventListener("click", () => {
      document.querySelector("[data-current-sessions-list-modal]")?.close();
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
    const searchResultsModal = document.querySelector("[data-search-results-modal]");
    const studentDetailsModal = document.querySelector("[data-student-details-modal]");
    const teacherDetailsModal = document.querySelector("[data-teacher-details-modal]");
    const sessionAttendanceModal = document.querySelector("[data-session-attendance-modal]");
    const searchResultsContent = document.querySelector("[data-search-results-content]");
    const studentDetailsContent = document.querySelector("[data-student-details-content]");
    const teacherDetailsContent = document.querySelector("[data-teacher-details-content]");
    const sessionAttendanceContent = document.querySelector("[data-session-attendance-content]");
    const closeSearchResultsBtn = document.querySelector("[data-close-search-results]");
    const closeStudentDetailsBtn = document.querySelector("[data-close-student-details]");
    const closeTeacherDetailsBtn = document.querySelector("[data-close-teacher-details]");
    const closeSessionAttendanceBtn = document.querySelector("[data-close-session-attendance]");
    const sessionSearchInput = document.querySelector("[data-session-search-input]");

    let allSessionData = []; // Store all session data for filtering

    async function performSearch() {
      const searchQuery = searchInput?.value?.trim();

      if (!searchQuery) {
        showToast({
          title: "Search Required",
          message: "Please enter search term (ID, Name, Roll No, Subject, etc.)",
          type: "warning"
        });
        return;
      }

      let foundResults = false;

      try {
        // Try to search for student first
        const studentResponse = await apiFetch(`/api/admin/search/student/${encodeURIComponent(searchQuery)}`);

        if (studentResponse.success && studentResponse.data) {
          foundResults = true;

          // Check if multiple results
          if (Array.isArray(studentResponse.data) && studentResponse.data.length > 1) {
            displaySearchResults(studentResponse.data, 'student');
            return;
          } else {
            // Single result - show details directly
            const student = Array.isArray(studentResponse.data) ? studentResponse.data[0] : studentResponse.data;
            student.attendance_percentage = student.total_sessions > 0
              ? (student.attendance_count / student.total_sessions) * 100
              : 0;
            student.total_lectures = student.total_sessions || 0;
            student.attended_lectures = student.attendance_count || 0;
            displayStudentDetails(student);
            return;
          }
        }
      } catch (error) {
        console.log("Student not found, trying teacher...");
      }

      try {
        // Try to search for teacher
        const teacherResponse = await apiFetch(`/api/admin/search/teacher/${encodeURIComponent(searchQuery)}`);

        if (teacherResponse.success && teacherResponse.data) {
          foundResults = true;

          // Check if multiple results
          if (Array.isArray(teacherResponse.data) && teacherResponse.data.length > 1) {
            displaySearchResults(teacherResponse.data, 'teacher');
            return;
          } else {
            // Single result - show details directly
            const teacher = Array.isArray(teacherResponse.data) ? teacherResponse.data[0] : teacherResponse.data;
            teacher.student_count = teacher.assigned_students || 0;
            displayTeacherDetails(teacher);
            return;
          }
        }
      } catch (error) {
        console.log("Teacher not found");
      }

      // Neither found
      if (!foundResults) {
        showToast({
          title: "Not Found",
          message: `No student or teacher found matching: ${searchQuery}`,
          type: "error"
        });
      }
    }

    function displaySearchResults(results, type) {
      const searchResultsModal = document.querySelector('[data-search-results-modal]');
      const searchResultsContent = document.querySelector('[data-search-results-content]');

      if (!searchResultsModal || !searchResultsContent) {
        console.error('Search results modal elements not found');
        return;
      }

      const resultsHtml = results.map((item, index) => {
        if (type === 'student') {
          return `
            <div class="card" style="padding: 1rem; cursor: pointer; transition: all 0.2s;" 
                 onmouseover="this.style.background='#f0f0f0'" 
                 onmouseout="this.style.background='white'"
                 onclick="selectSearchResult(${index}, 'student')">
              <div style="display: grid; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div>
                    <strong style="font-size: 1.1rem; color: #2c3e50;">${item.student_name || 'N/A'}</strong>
                    <div style="color: #7f8c8d; font-size: 0.9rem; margin-top: 0.25rem;">
                      ID: ${item.student_id || 'N/A'} | Roll No: ${item.roll_no || 'N/A'}
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.85rem; color: #555;">
                  <span><strong>Year:</strong> ${item.year || 'N/A'}</span>
                  <span><strong>Stream:</strong> ${item.stream || 'N/A'}</span>
                  <span><strong>Division:</strong> ${item.division || 'N/A'}</span>
                </div>
              </div>
            </div>
          `;
        } else if (type === 'teacher') {
          return `
            <div class="card" style="padding: 1rem; cursor: pointer; transition: all 0.2s;" 
                 onmouseover="this.style.background='#f0f0f0'" 
                 onmouseout="this.style.background='white'"
                 onclick="selectSearchResult(${index}, 'teacher')">
              <div style="display: grid; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div>
                    <strong style="font-size: 1.1rem; color: #2c3e50;">${item.name || 'N/A'}</strong>
                    <div style="color: #7f8c8d; font-size: 0.9rem; margin-top: 0.25rem;">
                      ID: ${item.teacher_id || 'N/A'}
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.85rem; color: #555; flex-wrap: wrap;">
                  <span><strong>Subject:</strong> ${item.subject || 'N/A'}</span>
                  <span><strong>Year:</strong> ${item.year || 'N/A'}</span>
                  <span><strong>Stream:</strong> ${item.stream || 'N/A'}</span>
                </div>
              </div>
            </div>
          `;
        }
        return '';
      }).join('');

      const typeLabel = type === 'student' ? 'student' : 'teacher';
      searchResultsContent.innerHTML = `
        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #e8f4f8; border-radius: 8px; color: #2c3e50;">
          Found ${results.length} matching ${typeLabel}${results.length > 1 ? 's' : ''}. Click to view details.
        </div>
        <div style="display: grid; gap: 0.75rem;">
          ${resultsHtml}
        </div>
      `;

      // Store results for selection
      window.searchResultsData = results;
      window.searchResultsType = type;

      searchResultsModal.showModal();
    }

    function selectSearchResult(index, type) {
      const results = window.searchResultsData;
      const searchResultsModal = document.querySelector('[data-search-results-modal]');

      if (!results || !results[index]) return;

      // Close search results modal
      if (searchResultsModal) {
        searchResultsModal.close();
      }

      // Display the selected item details
      if (type === 'student') {
        const student = results[index];
        student.attendance_percentage = student.total_sessions > 0
          ? (student.attendance_count / student.total_sessions) * 100
          : 0;
        student.total_lectures = student.total_sessions || 0;
        student.attended_lectures = student.attendance_count || 0;
        displayStudentDetails(student);
      } else if (type === 'teacher') {
        const teacher = results[index];
        teacher.student_count = teacher.assigned_students || 0;
        displayTeacherDetails(teacher);
      }
    }

    // Make selectSearchResult available globally
    window.selectSearchResult = selectSearchResult;

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

            <div 
              data-attendance-clickable
              data-student-id="${student.student_id}"
              style="background: ${attendanceColor}15; border: 2px solid ${attendanceColor}; padding: 1.5rem; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.2s;"
              onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';"
              onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
            >
              <div style="color: #7f8c8d; font-size: 0.9rem; margin-bottom: 0.5rem;">Overall Attendance (Click to view details)</div>
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

    // Show session attendance details
    async function showSessionAttendance(studentId) {
      try {
        sessionAttendanceContent.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #666;">
            <div class="spinner" style="margin: 0 auto;"></div>
            <p style="margin-top: 1rem;">Loading session attendance data...</p>
          </div>
        `;

        sessionAttendanceModal?.showModal();

        console.log(`Fetching sessions for student: ${studentId}`);
        const response = await apiFetch(`/api/admin/student/${encodeURIComponent(studentId)}/sessions`);
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

    // Render session attendance table
    function renderSessionAttendanceTable(sessions, highlightQuery = '') {
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
                  <td style="padding: 0.75rem;">${session.student_id || 'N/A'}</td>
                  <td style="padding: 0.75rem;">${session.student_name || 'N/A'}</td>
                  <td style="padding: 0.75rem;">${session.roll_no || 'N/A'}</td>
                  <td style="padding: 0.75rem;">${session.year || 'N/A'}</td>
                  <td style="padding: 0.75rem;">${session.stream || 'N/A'}</td>
                  <td style="padding: 0.75rem;">${session.division || 'N/A'}</td>
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
                  <td style="padding: 0.75rem;">${session.teacher || 'N/A'}</td>
                </tr>
              `;
      }).join('')}
          </tbody>
        </table>
      `;

      sessionAttendanceContent.innerHTML = tableHTML;
    }

    // Check if row should be highlighted based on search query
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

    // Filter session attendance based on search input
    function filterSessionAttendance() {
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

    // Event listeners
    searchBtn?.addEventListener("click", performSearch);
    searchInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        performSearch();
      }
    });

    closeSearchResultsBtn?.addEventListener("click", () => {
      searchResultsModal?.close();
    });

    closeStudentDetailsBtn?.addEventListener("click", () => {
      studentDetailsModal?.close();
    });

    closeTeacherDetailsBtn?.addEventListener("click", () => {
      teacherDetailsModal?.close();
    });

    searchResultsModal?.addEventListener("click", (e) => {
      if (e.target === searchResultsModal) {
        searchResultsModal.close();
      }
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

    closeSessionAttendanceBtn?.addEventListener("click", () => {
      sessionAttendanceModal?.close();
    });

    sessionAttendanceModal?.addEventListener("click", (e) => {
      if (e.target === sessionAttendanceModal) {
        sessionAttendanceModal.close();
      }
    });

    sessionSearchInput?.addEventListener("input", filterSessionAttendance);

    console.log("✅ Initialization complete!");
  } catch (error) {
    console.error("💥 Initialization error:", error);
  }
});
