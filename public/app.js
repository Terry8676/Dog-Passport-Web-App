const $ = (id) => document.getElementById(id);
const state = { user: null, dogs: [], dogId: null, code: null };

// ---------- helpers ----------

async function api(url, options) {
  const res = await fetch(url, options);
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !url.startsWith("/api/auth/")) showAuth();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function send(url, body, method = "POST") {
  return api(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function when(iso) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A small reusable popup form. Throw inside onSubmit to show an error.
const dlg = $("dlg");
const dlgForm = $("dlg-form");
$("dlg-cancel").addEventListener("click", () => dlg.close());

function openForm({ title, fields, submit, onSubmit }) {
  $("dlg-title").textContent = title;
  const box = $("dlg-fields");
  box.replaceChildren();
  fields.forEach((f) => {
    const label = el("label", "", f.label);
    const input = el("input");
    input.name = f.name;
    input.type = f.type || "text";
    input.placeholder = f.placeholder || "";
    input.required = !!f.required;
    if (f.min) input.min = f.min;
    label.append(input);
    box.append(label);
  });
  $("dlg-ok").textContent = submit;
  $("dlg-error").hidden = true;
  dlgForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(Object.fromEntries(new FormData(dlgForm)));
      dlg.close();
    } catch (err) {
      $("dlg-error").textContent = err.message;
      $("dlg-error").hidden = false;
    }
  };
  dlg.showModal();
  box.querySelector("input")?.focus();
}

// ---------- screens ----------

function showAuth() {
  $("auth-view").hidden = false;
  $("app").hidden = true;
  state.user = null;
  state.dogs = [];
  state.dogId = null;
  state.code = null;
}

function showApp(user) {
  state.user = user;
  $("auth-view").hidden = true;
  $("app").hidden = false;
  $("user-email").textContent = user.email;
  $("auth-form").reset();
  loadDogs();
}

async function loadDogs() {
  try {
    state.dogs = await api("/api/dogs");
  } catch (err) {
    $("main").replaceChildren(el("p", "error", err.message));
    return;
  }
  if (!state.dogs.some((d) => d.id === state.dogId)) {
    state.dogId = state.dogs.length ? state.dogs[0].id : null;
  }
  renderSidebar();
  await renderDog();
}

function renderSidebar() {
  const list = $("dog-list");
  list.replaceChildren();
  if (!state.dogs.length) {
    list.append(el("div", "side-empty", "No dogs yet. Add one, or join with a code."));
    return;
  }
  state.dogs.forEach((d) => {
    const b = el("button", "side-btn" + (d.id === state.dogId ? " active" : ""));
    b.type = "button";
    b.append(el("span", "", d.name), el("small", "", cap(d.role)));
    b.addEventListener("click", () => {
      state.dogId = d.id;
      renderSidebar();
      renderDog();
    });
    list.append(b);
  });
}

function emptyState() {
  const box = el("div", "card");
  box.append(el("h1", "", "Welcome"));
  box.append(el("p", "empty", "Add your dog to start tracking medication, or join with a code if an owner invited you as a sitter."));
  return box;
}

async function renderDog() {
  const main = $("main");
  const dog = state.dogs.find((d) => d.id === state.dogId);
  if (!dog) {
    main.replaceChildren(emptyState());
    return;
  }
  const id = dog.id;
  const owner = dog.role === "owner";

  let meds, team, logs;
  try {
    [meds, team] = await Promise.all([api(`/api/dogs/${id}/meds`), api(`/api/dogs/${id}/members`)]);
    logs = await Promise.all(meds.map((m) => api(`/api/meds/${m.id}/logs`).catch(() => [])));
  } catch (err) {
    main.replaceChildren(el("p", "error", err.message));
    return;
  }
  if (state.dogId !== id) return; // switched dogs while loading

  const parts = [];

  const head = el("header", "head");
  const title = el("div", "title");
  title.append(el("h1", "", dog.name), el("span", "chip", cap(dog.role)));
  head.append(title);
  if (owner) {
    const buttons = el("div", "row");
    const add = el("button", "", "Add medication");
    add.addEventListener("click", () => addMedication(id));
    const invite = el("button", "secondary", "Invite sitter");
    invite.addEventListener("click", async () => {
      try {
        state.code = { dogId: id, ...(await send(`/api/dogs/${id}/invites`)) };
        renderDog();
      } catch (err) {
        alert(err.message);
      }
    });
    buttons.append(add, invite);
    head.append(buttons);
  }
  parts.push(head);

  if (!owner) {
    parts.push(el("div", "notice", `You are a sitter for ${dog.name}. You can see everything and log doses. Only the owner can add medications, change pill counts, or invite and remove people.`));
  }

  if (owner && state.code && state.code.dogId === id) {
    const banner = el("div", "card invite");
    banner.append(
      el("span", "", "Give this code to your sitter. It works once and expires on " + new Date(state.code.expires_at).toLocaleDateString() + "."),
      el("span", "code", state.code.code)
    );
    parts.push(banner);
  }

  const layout = el("div", "layout");
  const medsCol = el("section", "meds");
  if (!meds.length) {
    const none = el("div", "card");
    none.append(el("p", "empty", owner ? "No medications yet. Use Add medication to create the first one." : "The owner has not added any medications yet."));
    medsCol.append(none);
  }
  meds.forEach((m, i) => medsCol.append(medCard(m, logs[i], owner)));

  const aside = el("aside", "card team");
  aside.append(el("h2", "", "Care team"), el("p", "meta", "Linked accounts. Sitters join with the owner's one-time code."));
  team.forEach((p) => {
    const row = el("div", "person");
    row.append(el("div", "avatar", p.email[0].toUpperCase()));
    const who = el("div", "who", p.email);
    who.append(el("small", "", cap(p.role) + (p.id === state.user.id ? " (you)" : "")));
    row.append(who);
    if (owner && p.role === "sitter") {
      const rm = el("button", "danger", "Remove");
      rm.addEventListener("click", async () => {
        if (!confirm(`Remove ${p.email} from ${dog.name}?`)) return;
        try {
          await send(`/api/dogs/${id}/members/${p.id}`, {}, "DELETE");
          renderDog();
        } catch (err) {
          alert(err.message);
        }
      });
      row.append(rm);
    }
    aside.append(row);
  });
  if (!owner) {
    const leave = el("button", "danger leave", "Stop sitting for this dog");
    leave.addEventListener("click", async () => {
      if (!confirm(`Stop sitting for ${dog.name}? You will need a new code to rejoin.`)) return;
      try {
        await send(`/api/dogs/${id}/members/${state.user.id}`, {}, "DELETE");
        state.dogId = null;
        loadDogs();
      } catch (err) {
        alert(err.message);
      }
    });
    aside.append(leave);
  }

  layout.append(medsCol, aside);
  parts.push(layout);
  main.replaceChildren(...parts);
}

function medCard(m, logs, owner) {
  const card = el("article", "card med");

  const top = el("div", "med-top");
  const left = el("div");
  left.append(el("h2", "", m.name), el("div", "meta", [m.dose, m.schedule].filter(Boolean).join(" · ") || "No dose details"));
  const right = el("div", "pills");
  const tracked = m.pills_total !== null && m.pills_remaining !== null;
  right.append(el(tracked ? "span" : "span", tracked ? "pill-count" : "meta",
    tracked ? `${m.pills_remaining} of ${m.pills_total} pills left` : "Pill count not tracked"));
  if (owner) {
    const refill = el("button", "secondary", "New bottle");
    refill.addEventListener("click", () => {
      openForm({
        title: `New bottle of ${m.name}`,
        fields: [{ name: "pills", label: "Pills in the bottle", type: "number", min: "1", required: true }],
        submit: "Save",
        onSubmit: async (v) => {
          await send(`/api/meds/${m.id}/refill`, { pills: v.pills });
          renderDog();
        },
      });
    });
    right.append(refill);
  }
  top.append(left, right);
  card.append(top);

  if (tracked) {
    const perDose = Math.max(1, m.pills_per_dose);
    const daysLeft = Math.floor(m.pills_remaining / perDose);
    const low = daysLeft <= 7;
    const bar = el("div", "bar");
    const fill = el("div");
    fill.style.width = (m.pills_total > 0 ? Math.round((m.pills_remaining / m.pills_total) * 100) : 0) + "%";
    fill.style.background = low ? "#C2410C" : "#2F6F5E";
    bar.append(fill);
    card.append(bar);
    if (m.pills_remaining === 0) card.append(el("div", "low", "Out of pills. Time to refill."));
    else if (low) card.append(el("div", "low", `Running low: about ${daysLeft} dose${daysLeft === 1 ? "" : "s"} left. Time to refill.`));
  }

  const msg = el("p", "error");
  msg.hidden = true;
  const actions = el("div", "actions");
  ["given", "skipped", "unable"].forEach((s) => {
    const b = el("button", s, cap(s));
    b.addEventListener("click", async () => {
      actions.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try {
        await send(`/api/meds/${m.id}/logs`, { status: s });
        renderDog();
      } catch (err) {
        msg.textContent = err.message;
        msg.hidden = false;
        actions.querySelectorAll("button").forEach((x) => (x.disabled = false));
      }
    });
    actions.append(b);
  });
  card.append(actions, msg);

  const last = el("div", "last");
  if (logs.length) {
    const l = logs[0];
    last.textContent = `Last: ${cap(l.status)} ${when(l.logged_at)} by ${l.logged_by_email || "a former member"}`;
  } else {
    last.textContent = "No entries yet";
  }
  card.append(last);
  if (logs.length > 1) {
    const list = el("ul", "history");
    logs.slice(1, 5).forEach((l) =>
      list.append(el("li", "", `${cap(l.status)}, ${when(l.logged_at)}, ${l.logged_by_email || "a former member"}`))
    );
    card.append(list);
  }
  return card;
}

// ---------- actions ----------

function addMedication(dogId) {
  openForm({
    title: "Add a medication",
    fields: [
      { name: "name", label: "Medication", required: true },
      { name: "dose", label: "Dose", placeholder: "e.g. 1 tablet" },
      { name: "schedule", label: "Schedule", placeholder: "e.g. 8am daily" },
      { name: "pills_total", label: "Pills in the bottle (optional)", type: "number", min: "0" },
      { name: "pills_per_dose", label: "Pills per dose", type: "number", min: "1", placeholder: "1" },
    ],
    submit: "Add medication",
    onSubmit: async (v) => {
      await send(`/api/dogs/${dogId}/meds`, v);
      renderDog();
    },
  });
}

$("add-dog").addEventListener("click", () => {
  openForm({
    title: "Add a dog",
    fields: [{ name: "name", label: "Dog's name", required: true }],
    submit: "Add dog",
    onSubmit: async (v) => {
      const dog = await send("/api/dogs", v);
      state.dogId = dog.id;
      await loadDogs();
    },
  });
});

$("join-btn").addEventListener("click", () => {
  openForm({
    title: "Join with a code",
    fields: [{ name: "code", label: "Invite code from the owner", required: true }],
    submit: "Join",
    onSubmit: async (v) => {
      const dog = await send("/api/invites/redeem", v);
      state.dogId = dog.id;
      await loadDogs();
    },
  });
});

// ---------- accounts ----------

async function authenticate(path) {
  $("auth-error").hidden = true;
  try {
    showApp(await send(path, Object.fromEntries(new FormData($("auth-form")))));
  } catch (err) {
    $("auth-error").textContent = err.message;
    $("auth-error").hidden = false;
  }
}

$("auth-form").addEventListener("submit", (e) => {
  e.preventDefault();
  authenticate("/api/auth/login");
});

$("signup-btn").addEventListener("click", () => {
  if (!$("auth-form").reportValidity()) return;
  authenticate("/api/auth/signup");
});

$("logout-btn").addEventListener("click", async () => {
  await send("/api/auth/logout");
  showAuth();
});

(async function init() {
  try {
    showApp(await api("/api/auth/me"));
  } catch {
    showAuth();
  }
})();
