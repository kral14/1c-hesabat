/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - SESSION MANAGEMENT
   session.js
   ======================================================== */

const SessionManager = {
  STORAGE_KEY: "1c_universal_report_session",

  // Default connection state
  state: {
    server: "Test1C",
    ref: "Aztrade_test3",
    user: "Nesib",
    password: "15963",
    dbTitle: "Aztrade Test Bazası #1",
    isAuthenticated: false
  },

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state = Object.assign(this.state, parsed);
        this.state.isAuthenticated = true;
      } catch (e) {
        console.error("Error restoring session:", e);
      }
    }
    this.updateUI();
    this.loadBases();
  },

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
      server: this.state.server,
      ref: this.state.ref,
      user: this.state.user,
      password: this.state.password,
      dbTitle: this.state.dbTitle
    }));
    this.updateUI();
  },

  getCredentials() {
    return {
      server: this.state.server,
      ref: this.state.ref,
      user: this.state.user,
      password: this.state.password
    };
  },

  updateUI() {
    const basePill = document.getElementById("topBaseName");
    const userPill = document.getElementById("topUserName");
    const statusBase = document.getElementById("statusBarBaseName");
    const statusUser = document.getElementById("statusBarUserName");

    if (basePill) {
      basePill.textContent = `${this.state.server} / ${this.state.ref}`;
    }
    if (userPill) {
      userPill.textContent = this.state.user || "İstifadəçi";
    }
    if (statusBase) {
      statusBase.textContent = `${this.state.server} / ${this.state.ref}`;
    }
    if (statusUser) {
      statusUser.textContent = this.state.user || "İstifadəçi";
    }

    if (window.MdiManager && typeof MdiManager.updateWindowTitlebar === "function") {
      MdiManager.updateWindowTitlebar(MdiManager.activeWindowId || "mdiWindow-1");
    }

    const modalActiveDb = document.getElementById("modalActiveDbText");
    if (modalActiveDb) {
      modalActiveDb.textContent = `${this.state.server} / ${this.state.ref} (${this.state.user})`;
    }
  },

  async loadBases() {
    try {
      const res = await fetch("/api/bases");
      const data = await res.json();
      if (data.success && data.bases) {
        const select = document.getElementById("modalBaseSelect");
        if (!select) return;
        select.innerHTML = "";
        data.bases.forEach((b) => {
          const opt = document.createElement("option");
          opt.value = JSON.stringify(b);
          opt.textContent = `${b.title} (${b.server} / ${b.ref})`;
          if (b.server.toLowerCase() === this.state.server.toLowerCase() &&
              b.ref.toLowerCase() === this.state.ref.toLowerCase()) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
        this.loadUsers();
      }
    } catch (err) {
      console.error("Failed to load bases:", err);
    }
  },

  async loadUsers() {
    const select = document.getElementById("modalUserSelect");
    if (select) select.innerHTML = "<option value=''>İstifadəçilər yüklənir...</option>";

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.getCredentials())
      });
      const data = await res.json();
      if (data.success && data.users) {
        if (!select) return;
        select.innerHTML = "";

        // Add active Nesib option first
        const optActive = document.createElement("option");
        optActive.value = "Nesib";
        optActive.textContent = "Nesib (Aktiv / Əsas İstifadəçi)";
        optActive.selected = true;
        select.appendChild(optActive);

        data.users.forEach((u) => {
          const uName = (typeof u === "object" && u !== null) ? (u.name || "") : String(u || "");
          if (!uName || uName.toLowerCase() === "nesib") return;
          const opt = document.createElement("option");
          if (uName.toLowerCase() === "nesib admin") {
            opt.value = "Nesib";
            opt.textContent = `${uName} -> (Nesib)`;
          } else {
            opt.value = uName;
            opt.textContent = uName;
          }
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Failed to load users:", err);
      if (select) select.innerHTML = `<option value="Nesib" selected>Nesib (Aktiv)</option>`;
    }
  },

  async authenticate(user, password, server, ref) {
    this.state.user = user || this.state.user;
    this.state.password = password !== undefined ? password : this.state.password;
    if (server) this.state.server = server;
    if (ref) this.state.ref = ref;

    const statusEl = document.getElementById("modalConnStatus");
    if (statusEl) statusEl.textContent = "Bağlanılır...";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.getCredentials())
      });
      const data = await res.json();
      if (data.success) {
        this.state.isAuthenticated = true;
        this.save();
        if (statusEl) statusEl.textContent = "Bağlandı!";
        return true;
      } else {
        alert("1C Xətası: " + (data.error || "Giriş uğursuz oldu"));
        if (statusEl) statusEl.textContent = "Xəta";
        return false;
      }
    } catch (e) {
      alert("Şəbəkə xətası: " + e.message);
      if (statusEl) statusEl.textContent = "Xəta";
      return false;
    }
  }
};

function openLoginModal() {
  const overlay = document.getElementById("loginModalOverlay");
  if (overlay) {
    overlay.style.display = "flex";
    overlay.classList.add("active");
    if (window.MdiManager && typeof MdiManager.bringModalToFront === "function") {
      MdiManager.bringModalToFront(overlay, {
        title: "Подключение к базе",
        icon: "🔐",
        closeFn: () => closeLoginModal()
      });
    }
  }

  const pwdInput = document.getElementById("modalPasswordInput");
  if (pwdInput) {
    pwdInput.value = SessionManager.state.password || "15963";
  }

  const userSelect = document.getElementById("modalUserSelect");
  if (userSelect && SessionManager.state.user) {
    for (let i = 0; i < userSelect.options.length; i++) {
      if (userSelect.options[i].value.toLowerCase() === SessionManager.state.user.toLowerCase()) {
        userSelect.selectedIndex = i;
        break;
      }
    }
  }
}

function closeLoginModal() {
  const overlay = document.getElementById("loginModalOverlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }
  if (window.MdiManager && typeof MdiManager.removeModalTaskbarTab === "function") {
    MdiManager.removeModalTaskbarTab("loginModalOverlay");
  }
}

function onModalBaseChange() {
  const select = document.getElementById("modalBaseSelect");
  if (!select || !select.value) return;
  try {
    const b = JSON.parse(select.value);
    SessionManager.state.server = b.server;
    SessionManager.state.ref = b.ref;
    SessionManager.state.dbTitle = b.title;

    const sInp = document.getElementById("modalCustomServer");
    const rInp = document.getElementById("modalCustomRef");
    if (sInp) sInp.value = b.server;
    if (rInp) rInp.value = b.ref;

    SessionManager.loadUsers();
  } catch (e) {}
}

function reloadModalUsersForCustomDb() {
  const sInp = document.getElementById("modalCustomServer");
  const rInp = document.getElementById("modalCustomRef");
  if (sInp) SessionManager.state.server = sInp.value.trim();
  if (rInp) SessionManager.state.ref = rInp.value.trim();
  SessionManager.loadUsers();
}

async function submitLoginModal() {
  const userSelect = document.getElementById("modalUserSelect");
  const pwdInput = document.getElementById("modalPasswordInput");
  let user = userSelect ? userSelect.value : SessionManager.state.user;
  if (!user || user.toLowerCase() === "nesib admin") {
    user = "Nesib";
  }
  let pwd = pwdInput ? pwdInput.value : SessionManager.state.password;
  if (user.toLowerCase() === "nesib" && !pwd) {
    pwd = "15963";
  }

  const sInp = document.getElementById("modalCustomServer");
  const rInp = document.getElementById("modalCustomRef");
  const server = sInp ? sInp.value.trim() : SessionManager.state.server;
  const ref = rInp ? rInp.value.trim() : SessionManager.state.ref;

  const ok = await SessionManager.authenticate(user, pwd, server, ref);
  if (ok) {
    closeLoginModal();
  }
}
