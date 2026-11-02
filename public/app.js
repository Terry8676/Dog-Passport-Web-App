const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const who = document.getElementById("who");
const userEmail = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");
const authForm = document.getElementById("auth-form");
const signupBtn = document.getElementById("signup-btn");
const authError = document.getElementById("auth-error");
const medList = document.getElementById("med-list");
const form = document.getElementById("med-form");
const formError = document.getElementById("form-error");

// ---------- helpers ----------

function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
  who.hidden = true;
  medList.replaceChildren();
}

function showApp(user) {
  authView.hidden = true;
  appView.hidden = false;
  who.hidden = false;
  userEmail.textContent = user.email;
  authForm.reset();
  loadMeds();
}

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  // A 401 from a medication call means the login expired: back to sign-in.
  if (res.status === 401 && !url.startsWith("/api/auth/")) showAuth();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function postJson(url, body) {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// ---------- medications ----------

async function renderMed(med) {
  const card = el("article", "card");
  card.append(el("h3", "", `${med.dog_name}: ${med.name}`));
  if (med.dose) card.append(el("p", "meta", `Dose: ${med.dose}`));
  if (med.schedule) card.append(el("p", "meta", `Schedule: ${med.schedule}`));

  const status = el("p", "status");
  const history = el("ul", "history");

  async function loadLogs() {
    const logs = await api(`/api/meds/${med.id}/logs`);
    status.textContent = logs.length
      ? `Last: ${logs[0].status} at ${formatTime(logs[0].logged_at)}`
      : "No entries yet";
    history.replaceChildren();
    logs.slice(0, 5).forEach((log) => {
      const note = log.note ? ` (${log.note})` : "";
      history.append(el("li", "", `${log.status}, ${formatTime(log.logged_at)}${note}`));
    });
  }

  const actions = el("div", "actions");
  ["given", "skipped", "unable"].forEach((s) => {
    const btn = el("button", s, s.charAt(0).toUpperCase() + s.slice(1));
    btn.addEventListener("click", async () => {
      try {
        await postJson(`/api/meds/${med.id}/logs`, { status: s });
        await loadLogs();
      } catch (err) {
        alert(err.message);
      }
    });
    actions.append(btn);
  });

  card.append(actions, status, history);
  await loadLogs();
  return card;
}

async function loadMeds() {
  try {
    const meds = await api("/api/meds");
    medList.replaceChildren();
    if (!meds.length) {
      medList.append(el("p", "meta", "No medications yet. Add one above."));
      return;
    }
    for (const med of meds) medList.append(await renderMed(med));
  } catch (err) {
    medList.replaceChildren(el("p", "error", err.message));
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;
  try {
    await postJson("/api/meds", Object.fromEntries(new FormData(form)));
    form.reset();
    await loadMeds();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});

// ---------- accounts ----------

async function authenticate(path) {
  authError.hidden = true;
  try {
    const user = await postJson(path, Object.fromEntries(new FormData(authForm)));
    showApp(user);
  } catch (err) {
    authError.textContent = err.message;
    authError.hidden = false;
  }
}

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authenticate("/api/auth/login");
});

signupBtn.addEventListener("click", () => {
  if (!authForm.reportValidity()) return;
  authenticate("/api/auth/signup");
});

logoutBtn.addEventListener("click", async () => {
  await postJson("/api/auth/logout", {});
  showAuth();
});

// ---------- start ----------

(async function init() {
  try {
    showApp(await api("/api/auth/me"));
  } catch {
    showAuth();
  }
})();
