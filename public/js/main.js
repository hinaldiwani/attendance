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
