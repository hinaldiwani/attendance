// ===================================================================
// TEACHER MANAGEMENT JavaScript Functions
// Add these functions to public/js/admin.js
// ===================================================================

// Update loadTeachersInfo function to include status column
async function loadTeachersInfo() {
    if (!teachersInfoBody) return;

    teachersInfoBody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';

    try {
        const data = await apiFetch("/api/admin/teachers/all-with-status");

        if (!data.teachers || data.teachers.length === 0) {
            teachersInfoBody.innerHTML =
                '<tr><td colspan="9">No teachers found</td></tr>';
            return;
        }

        teachersInfoBody.innerHTML = data.teachers
            .map(
                (teacher) => `
      <tr>
        <td>${teacher.teacher_id || "N/A"}</td>
        <td>${teacher.name || "N/A"}</td>
        <td>${teacher.subject || "N/A"}</td>
        <td>${teacher.year || "N/A"}</td>
        <td>${teacher.stream || "N/A"}</td>
        <td>${teacher.semester || "N/A"}</td>
        <td>${teacher.division || "N/A"}</td>
        <td>${teacher.student_count || 0}</td>
        <td><span class="badge ${teacher.status === 'Active' ? 'success' : 'danger'}">${teacher.status || 'Active'}</span></td>
      </tr>
    `,
            )
            .join("");
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

// Teacher Search Functionality
const teacherSearchInput = document.querySelector("[data-teacher-search-input]");

let teacherSearchTimeout;
teacherSearchInput?.addEventListener("input", (e) => {
    clearTimeout(teacherSearchTimeout);
    const query = e.target.value.trim();

    if (query.length === 0) {
        loadTeachersInfo();
        return;
    }

    teacherSearchTimeout = setTimeout(async () => {
        if (query.length < 2) return;

        teachersInfoBody.innerHTML = '<tr><td colspan="9">Searching...</td></tr>';

        try {
            const data = await apiFetch(`/api/admin/teachers/search/${encodeURIComponent(query)}`);

            if (!data.teachers || data.teachers.length === 0) {
                teachersInfoBody.innerHTML =
                    '<tr><td colspan="9">No matching teachers found</td></tr>';
                return;
            }

            teachersInfoBody.innerHTML = data.teachers
                .map(
                    (teacher) => `
        <tr>
          <td>${teacher.teacher_id || "N/A"}</td>
          <td>${teacher.name || "N/A"}</td>
          <td>${teacher.subject || "N/A"}</td>
          <td>${teacher.year || "N/A"}</td>
          <td>${teacher.stream || "N/A"}</td>
          <td>${teacher.semester || "N/A"}</td>
          <td>${teacher.division || "N/A"}</td>
          <td>${teacher.student_count || 0}</td>
          <td><span class="badge ${teacher.status === 'Active' ? 'success' : 'danger'}">${teacher.status || 'Active'}</span></td>
        </tr>
      `,
                )
                .join("");
        } catch (error) {
            teachersInfoBody.innerHTML =
                '<tr><td colspan="9">Error searching teachers</td></tr>';
            showToast({
                title: "Search failed",
                message: error.message,
                type: "error",
            });
        }
    }, 300);
});

// Add Teacher Button
const addTeacherBtn = document.querySelector("[data-add-teacher-btn]");

addTeacherBtn?.addEventListener("click", () => {
    const teacherId = prompt("Enter Teacher ID (e.g., TCH001):");
    if (!teacherId) return;

    const name = prompt("Enter Teacher Name:");
    if (!name) return;

    const subject = prompt("Enter Subject:");
    if (!subject) return;

    const year = prompt("Enter Year (FY, SY, or TY):");
    if (!year) return;

    const stream = prompt("Enter Stream (BSCIT, BSCDS, or BSC):");
    if (!stream) return;

    const semester = prompt("Enter Semester (optional):");

    const division = prompt("Enter Division(s) (comma-separated, e.g., A,B,C):");

    // Confirm before adding
    const confirmAdd = confirm(
        `Add teacher:\n\n` +
        `ID: ${teacherId}\n` +
        `Name: ${name}\n` +
        `Subject: ${subject}\n` +
        `Year: ${year}\n` +
        `Stream: ${stream}\n` +
        `Semester: ${semester || 'N/A'}\n` +
        `Division: ${division || 'N/A'}\n\n` +
        `Proceed?`
    );

    if (!confirmAdd) return;

    apiFetch("/api/admin/teachers/add", {
        method: "POST",
        body: JSON.stringify({
            teacherId,
            name,
            subject,
            year,
            stream,
            semester,
            division,
            status: 'Active'
        }),
    })
        .then((data) => {
            if (data.success) {
                showToast({
                    title: "Teacher added successfully",
                    message: `${name} has been added to the system`,
                    type: "success",
                });
                loadTeachersInfo();
            } else {
                showToast({
                    title: "Failed to add teacher",
                    message: data.message || "Unknown error",
                    type: "error",
                });
            }
        })
        .catch((error) => {
            showToast({
                title: "Error adding teacher",
                message: error.message,
                type: "error",
            });
        });
});

// Remove Teacher Button
const removeTeacherBtn = document.querySelector("[data-remove-teacher-btn]");

removeTeacherBtn?.addEventListener("click", () => {
    const teacherId = prompt("Enter Teacher ID to remove:");
    if (!teacherId) return;

    const subject = prompt("Enter Subject (optional, leave blank to remove all subjects):");
    const year = prompt("Enter Year (optional, leave blank for all years):");
    const stream = prompt("Enter Stream (optional, leave blank for all streams):");
    const semester = prompt("Enter Semester (optional):");

    // Confirm removal
    const confirmRemove = confirm(
        `Remove teacher(s):\n\n` +
        `Teacher ID: ${teacherId}\n` +
        `Subject: ${subject || 'All'}\n` +
        `Year: ${year || 'All'}\n` +
        `Stream: ${stream || 'All'}\n` +
        `Semester: ${semester || 'All'}\n\n` +
        `This will set the status to INACTIVE.\n` +
        `Proceed?`
    );

    if (!confirmRemove) return;

    const requestBody = { teacherId };
    if (subject) requestBody.subject = subject;
    if (year) requestBody.year = year;
    if (stream) requestBody.stream = stream;
    if (semester) requestBody.semester = semester;

    apiFetch("/api/admin/teachers/remove", {
        method: "DELETE",
        body: JSON.stringify(requestBody),
    })
        .then((data) => {
            if (data.success) {
                showToast({
                    title: "Teacher(s) removed",
                    message: `${data.removedCount} teacher(s) set to Inactive`,
                    type: "success",
                });
                loadTeachersInfo();
            } else {
                showToast({
                    title: "Failed to remove teacher",
                    message: data.message || "Unknown error",
                    type: "error",
                });
            }
        })
        .catch((error) => {
            showToast({
                title: "Error removing teacher",
                message: error.message,
                type: "error",
            });
        });
});

// Configure Status Button
const configureStatusBtn = document.querySelector("[data-configure-status-btn]");

configureStatusBtn?.addEventListener("click", () => {
    const teacherId = prompt("Enter Teacher ID:");
    if (!teacherId) return;

    const subject = prompt("Enter Subject (optional):");
    const year = prompt("Enter Year (optional):");
    const stream = prompt("Enter Stream (optional):");
    const semester = prompt("Enter Semester (optional):");

    const status = prompt("Enter Status (Active or Inactive):");
    if (!status || !['Active', 'Inactive'].includes(status)) {
        showToast({
            title: "Invalid status",
            message: "Status must be either 'Active' or 'Inactive'",
            type: "error",
        });
        return;
    }

    const confirmChange = confirm(
        `Change teacher status:\n\n` +
        `Teacher ID: ${teacherId}\n` +
        `Subject: ${subject || 'All'}\n` +
        `Year: ${year || 'All'}\n` +
        `Stream: ${stream || 'All'}\n` +
        `Semester: ${semester || 'All'}\n` +
        `New Status: ${status}\n\n` +
        `Proceed?`
    );

    if (!confirmChange) return;

    const requestBody = { teacherId, status };
    if (subject) requestBody.subject = subject;
    if (year) requestBody.year = year;
    if (stream) requestBody.stream = stream;
    if (semester) requestBody.semester = semester;

    apiFetch("/api/admin/teachers/status", {
        method: "PUT",
        body: JSON.stringify(requestBody),
    })
        .then((data) => {
            if (data.success) {
                showToast({
                    title: "Status updated",
                    message: `${data.affectedRows} teacher(s) updated to ${status}`,
                    type: "success",
                });
                loadTeachersInfo();
            } else {
                showToast({
                    title: "Failed to update status",
                    message: data.message || "Unknown error",
                    type: "error",
                });
            }
        })
        .catch((error) => {
            showToast({
                title: "Error updating status",
                message: error.message,
                type: "error",
            });
        });
});
