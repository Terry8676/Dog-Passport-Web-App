const medList = document.getElementById("med-list");
const form = document.getElementById("med-form");
const formError = document.getElementById("form-error");

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
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
        await api(`/api/meds/${med.id}/logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: s }),
        });
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
  const body = Object.fromEntries(new FormData(form));
  try {
    await api("/api/meds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    form.reset();
    await loadMeds();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});

loadMeds();
