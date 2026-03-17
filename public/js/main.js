console.log("🟢 main.js module loaded!");

const toastStack = document.querySelector("[data-toast-stack]");
console.log("📌 Toast stack element:", toastStack);

export function showToast({ title, message, type = "info" }) {
  if (!toastStack) {
    console.warn("⚠️ Toast stack not found, cannot show toast:", {
      title,
      message,
    });
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "toast";
  wrapper.dataset.type = type;
  wrapper.innerHTML = `
    <div>
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;

  toastStack.appendChild(wrapper);

  setTimeout(() => {
    wrapper.style.opacity = "0";
    wrapper.style.transform = "translateY(-6px)";
    setTimeout(() => wrapper.remove(), 220);
  }, 4200);
}

export async function apiFetch(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const config = {
    method: options.method || "GET",
    credentials: "include",
    ...options,
    headers,
  };

  const response = await fetch(url, config);
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  // Session expired / unauthenticated: redirect to login immediately.
  if (response.status === 401) {
    const currentPath = window.location.pathname || "";
    if (currentPath !== "/") {
      window.location.href = "/";
    }
    throw new Error("Session expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(payload.message || payload || "Request failed");
  }

  return payload;
}

export function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function asPercentage(part, whole) {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(2)}%`;
}

export function toggleLoading(element, state) {
  if (!element) return;
  if (state) {
    element.dataset.originalText = element.textContent;
    element.textContent = "Please wait…";
    element.disabled = true;
  } else {
    element.textContent = element.dataset.originalText || element.textContent;
    element.disabled = false;
  }
}

function normalizeTooltipKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildFallbackTooltip(label) {
  const clean = String(label || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!clean) return "Click to perform this action.";
  if (clean.startsWith("view ")) return `Open ${clean.slice(5)}.`;
  if (clean.startsWith("add ")) return `Create ${clean.slice(4)}.`;
  if (clean.startsWith("edit ")) return `Modify ${clean.slice(5)}.`;
  if (clean.startsWith("download ")) return `Download ${clean.slice(9)}.`;
  if (clean.startsWith("refresh")) return "Reload the latest data.";
  if (clean.startsWith("clear ")) return `Remove ${clean.slice(6)}.`;
  if (clean.startsWith("start ")) return `Begin ${clean.slice(6)}.`;
  if (clean.startsWith("end ")) return `Close ${clean.slice(4)}.`;
  if (clean.startsWith("confirm ")) return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
  if (clean === "search") return "Search using your current filters or query.";
  if (clean === "sign out") return "Sign out from your account and return to login.";
  return `Click to ${clean}.`;
}

const tooltipByLabel = {
  "view history": "Open attendance history records.",
  "defaulter history": "Open previously generated defaulter reports.",
  "change password": "Open password update form for your account.",
  "delete data": "Delete imported attendance data and reset dashboard values.",
  "refresh mappings": "Rebuild student-teacher mapping relationships.",
  "download template": "Show template options for Teacher and Student CSV downloads.",
  teacher: "Download Teacher import template CSV with required columns.",
  student: "Download Student import template CSV with required columns.",
  "add teacher": "Open the Add Teacher form to create teacher mappings.",
  "edit teacher": "Open the Edit Teacher tab to update existing teacher details.",
  refresh: "Reload the latest data on this page.",
  "start attendance": "Start a new attendance session for your class.",
  "generate defaulter list": "Generate a list of students below attendance threshold.",
  search: "Search records using the entered keywords.",
  "clear activity": "Remove all activity log entries from the table.",
  "clear history": "Remove all history entries from this view.",
  "clear recent": "Remove recent session entries from the table.",
  "start session": "Start a live attendance session.",
  "end session": "End the current attendance session.",
  "close": "Close this panel or dialog.",
  "confirm import": "Finalize import and save uploaded students/teachers.",
  add: "Add this entry to the list.",
  reset: "Reset form fields to default values.",
  previous: "Go to previous view.",
  next: "Go to next view.",
  "back to list": "Return to the list view.",
  "sign in": "Sign in with your selected role and credentials.",
};

export function initializeActionTooltips(root = document) {
  if (!root) return;
  const controls = root.querySelectorAll(
    "button, input[type='button'], input[type='submit'], a.btn, .calendar-nav-btn",
  );

  controls.forEach((control) => {
    if (!control || control.dataset.noTooltip === "true") return;
    const existingTitle = control.getAttribute("title");
    if (existingTitle && existingTitle.trim()) return;

    const label =
      control.getAttribute("aria-label") ||
      control.textContent ||
      control.value ||
      "";
    const normalized = normalizeTooltipKey(label);
    const stripped = normalized.replace(/[\u2190\u2192]/g, "").trim();

    const tooltip = tooltipByLabel[stripped] || buildFallbackTooltip(stripped);
    control.setAttribute("title", tooltip);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initializeActionTooltips());
  } else {
    initializeActionTooltips();
  }
}
