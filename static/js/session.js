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

  connectionStatus: "idle", // 'idle' | 'connecting' | 'connected' | 'error'

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
    this.loadBases().then(() => {
      // Proactively connect to 1C on startup with spinning animation & live status
      this.warmupConnection();
    });
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

  setConnectionStatus(status, message) {
    this.connectionStatus = status;
    const basePill = document.getElementById("topBasePill");
    const baseDot = document.getElementById("topBaseDot");
    const baseName = document.getElementById("topBaseName");
    const statusBase = document.getElementById("statusBarBaseName");

    if (status === "connecting") {
      if (basePill) {
        basePill.style.background = "#fffde7";
        basePill.style.borderColor = "#d4b106";
        basePill.title = "1C Serverinə qoşulur, zəhmət olmasa gözləyin...";
      }
      if (baseDot) {
        baseDot.className = "";
        baseDot.innerHTML = '<span class="conn-spinner" style="display:inline-block; width:11px; height:11px; border:2px solid #004080; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; vertical-align:middle; margin-right:3px;"></span>';
      }
      if (baseName) {
        baseName.textContent = `${this.state.server} / ${this.state.ref} (Sistemə qoşulur, gözləyin...)`;
        baseName.style.color = "#856404";
        baseName.style.fontWeight = "bold";
      }
      if (statusBase) {
        statusBase.textContent = `1C: ${this.state.server} / ${this.state.ref} (Sistemə qoşulur, gözləyin...)`;
      }
    } else if (status === "connected") {
      if (basePill) {
        basePill.style.background = "#faf8ef";
        basePill.style.borderColor = "#d0d0d0";
        basePill.title = `Aktiv 1C Bazası: ${this.state.server} / ${this.state.ref} (Dəyişmək üçün klikləyin)`;
      }
      if (baseDot) {
        baseDot.className = "dot-green";
        baseDot.innerHTML = "";
      }
      if (baseName) {
        baseName.textContent = `${this.state.server} / ${this.state.ref} (Qoşuldu, hazırdır)`;
        baseName.style.color = "#155724";
        baseName.style.fontWeight = "bold";
        // After 4 seconds, keep clean server/ref
        setTimeout(() => {
          if (this.connectionStatus === "connected" && baseName) {
            baseName.textContent = `${this.state.server} / ${this.state.ref}`;
            baseName.style.color = "#1a1a1a";
          }
        }, 4000);
      }
      if (statusBase) {
        statusBase.textContent = `${this.state.server} / ${this.state.ref} (Hazırdır)`;
      }
    } else if (status === "error") {
      if (basePill) {
        basePill.style.background = "#f8d7da";
        basePill.style.borderColor = "#f5c6cb";
        basePill.title = message || "1C Qoşulma xətası";
      }
      if (baseDot) {
        baseDot.className = "";
        baseDot.innerHTML = '<span style="display:inline-block; width:8px; height:8px; background:#dc3545; border-radius:50%; vertical-align:middle; margin-right:3px;"></span>';
      }
      if (baseName) {
        baseName.textContent = `${this.state.server} / ${this.state.ref} (Qoşulma xətası!)`;
        baseName.style.color = "#721c24";
        baseName.style.fontWeight = "bold";
      }
      if (statusBase) {
        statusBase.textContent = `1C: Qoşulma xətası!`;
      }
    }
  },

  async warmupConnection() {
    this.setConnectionStatus("connecting");
    try {
      const res = await fetch("/api/ping_connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.getCredentials())
      });
      const data = await res.json();
      if (data.success) {
        this.setConnectionStatus("connected");
      } else {
        console.warn("1C warmup connection error:", data.error);
        this.setConnectionStatus("error", data.error);
      }
    } catch (e) {
      console.error("1C warmup connection network error:", e);
      this.setConnectionStatus("error", e.message);
    }
  },

  updateUI() {
    const userPill = document.getElementById("topUserName");
    const statusUser = document.getElementById("statusBarUserName");

    if (this.connectionStatus !== "connecting") {
      const basePill = document.getElementById("topBaseName");
      const statusBase = document.getElementById("statusBarBaseName");
      if (basePill) {
        basePill.textContent = `${this.state.server} / ${this.state.ref}`;
      }
      if (statusBase) {
        statusBase.textContent = `${this.state.server} / ${this.state.ref}`;
      }
    }

    if (userPill) {
      userPill.textContent = this.state.user || "İstifadəçi";
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

  async loadBases(preferredBase) {
    try {
      const res = await fetch("/api/bases");
      const data = await res.json();
      if (data.success && data.bases) {
        const select = document.getElementById("modalBaseSelect");
        if (!select) return;

        // If backend has persistent active_base and no preferred base was explicitly passed, adopt it
        if (data.active_base && !preferredBase) {
          this.state.server = data.active_base.server || this.state.server;
          this.state.ref = data.active_base.ref || this.state.ref;
          this.state.dbTitle = data.active_base.title || this.state.dbTitle;
          if (data.active_base.user) this.state.user = data.active_base.user;
          this.save();
        }

        const targetServer = (preferredBase?.server || this.state.server || "").toLowerCase();
        const targetRef = (preferredBase?.ref || this.state.ref || "").toLowerCase();

        select.innerHTML = "";
        let selectedIdx = 0;

        data.bases.forEach((b, idx) => {
          const opt = document.createElement("option");
          opt.value = JSON.stringify(b);
          const customTag = b.is_custom ? " [Əl ilə əlavə]" : "";
          opt.textContent = `${b.title} (${b.server} / ${b.ref})${customTag}`;

          if (b.server.toLowerCase() === targetServer && b.ref.toLowerCase() === targetRef) {
            selectedIdx = idx;
          }
          select.appendChild(opt);
        });

        if (select.options.length > 0) {
          select.selectedIndex = selectedIdx;
        }

        // Just sync inputs quietly without firing redundant user/base change reloads
        this.syncInputs();
      }
    } catch (err) {
      console.error("Failed to load bases:", err);
    }
  },

  syncInputs() {
    const select = document.getElementById("modalBaseSelect");
    if (!select || !select.value) return;
    try {
      const b = JSON.parse(select.value);
      this.state.server = b.server;
      this.state.ref = b.ref;
      this.state.dbTitle = b.title;

      const tInp = document.getElementById("modalCustomTitle");
      const sInp = document.getElementById("modalCustomServer");
      const rInp = document.getElementById("modalCustomRef");
      const badge = document.getElementById("modalCustomBadge");

      if (tInp) tInp.value = b.title || "";
      if (sInp) sInp.value = b.server || "";
      if (rInp) rInp.value = b.ref || "";
      if (badge) {
        badge.textContent = b.is_custom ? "🌟 Əlavə edilmiş baza" : "💻 1C Sistem bazası";
        badge.style.color = b.is_custom ? "#1b5e20" : "#666";
      }

      this.updateUI();
    } catch (e) {}
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

  async authenticate(user, password, server, ref, title) {
    this.state.user = user || this.state.user;
    this.state.password = password !== undefined ? password : this.state.password;
    if (server) this.state.server = server;
    if (ref) this.state.ref = ref;
    if (title) this.state.dbTitle = title;

    this.setConnectionStatus("connecting");
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
        this.setConnectionStatus("connected");
        if (statusEl) statusEl.textContent = "Bağlandı!";
        return true;
      } else {
        this.setConnectionStatus("error", data.error);
        alert("1C Xətası: " + (data.error || "Giriş uğursuz oldu"));
        if (statusEl) statusEl.textContent = "Xəta";
        return false;
      }
    } catch (e) {
      this.setConnectionStatus("error", e.message);
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

async function onModalBaseChange() {
  const select = document.getElementById("modalBaseSelect");
  if (!select || !select.value) return;
  try {
    const b = JSON.parse(select.value);
    SessionManager.state.server = b.server;
    SessionManager.state.ref = b.ref;
    SessionManager.state.dbTitle = b.title;

    SessionManager.syncInputs();
    SessionManager.save();

    // Persist active database choice to backend SQLite
    await fetch("/api/bases/set_active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server: b.server,
        ref: b.ref,
        title: b.title,
        user: SessionManager.state.user
      })
    }).catch(() => {});

    SessionManager.loadUsers();
  } catch (e) {
    console.error("onModalBaseChange error:", e);
  }
}

async function addCustomBase() {
  const tInp = document.getElementById("modalCustomTitle");
  const sInp = document.getElementById("modalCustomServer");
  const rInp = document.getElementById("modalCustomRef");

  const server = sInp ? sInp.value.trim() : "";
  const ref = rInp ? rInp.value.trim() : "";
  let title = tInp ? tInp.value.trim() : "";

  if (!server || !ref) {
    alert("Zəhmət olmasa Server (Srvr) və Baza (Ref) adlarını daxil edin!");
    return;
  }
  if (!title) {
    title = `${server} / ${ref}`;
  }

  try {
    const res = await fetch("/api/bases/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, server, ref })
    });
    const data = await res.json();
    if (data.success) {
      SessionManager.state.server = server;
      SessionManager.state.ref = ref;
      SessionManager.state.dbTitle = title;
      SessionManager.save();
      await SessionManager.loadBases({ server, ref });
      alert(`✅ Baza siyahıya əlavə edildi və aktiv baza olaraq seçildi:\n${title} (${server} / ${ref})`);
    } else {
      alert("Xəta: " + (data.error || "Baza əlavə edilə bilmədi"));
    }
  } catch (err) {
    alert("Şəbəkə xətası: " + err.message);
  }
}

async function deleteCurrentBase() {
  const select = document.getElementById("modalBaseSelect");
  if (!select || !select.value) {
    alert("Silinəcək baza seçilməyib!");
    return;
  }

  let b;
  try {
    b = JSON.parse(select.value);
  } catch (e) {
    return;
  }

  const ok = confirm(`'${b.title}' (${b.server} / ${b.ref}) bazasını siyahıdan silmək istədiyinizə əminsiniz?`);
  if (!ok) return;

  try {
    const res = await fetch("/api/bases/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: b.server, ref: b.ref })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🗑️ '${b.title}' bazası siyahıdan silindi.`);
      await SessionManager.loadBases();
    } else {
      alert("Xəta: " + (data.error || "Baza silinə bilmədi"));
    }
  } catch (err) {
    alert("Şəbəkə xətası: " + err.message);
  }
}

function reloadModalUsersForCustomDb() {
  const sInp = document.getElementById("modalCustomServer");
  const rInp = document.getElementById("modalCustomRef");
  const tInp = document.getElementById("modalCustomTitle");
  if (sInp && sInp.value.trim()) SessionManager.state.server = sInp.value.trim();
  if (rInp && rInp.value.trim()) SessionManager.state.ref = rInp.value.trim();
  if (tInp && tInp.value.trim()) SessionManager.state.dbTitle = tInp.value.trim();
  SessionManager.save();

  fetch("/api/bases/set_active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server: SessionManager.state.server,
      ref: SessionManager.state.ref,
      title: SessionManager.state.dbTitle,
      user: SessionManager.state.user
    })
  }).catch(() => {});

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
  const tInp = document.getElementById("modalCustomTitle");
  const server = sInp ? sInp.value.trim() : SessionManager.state.server;
  const ref = rInp ? rInp.value.trim() : SessionManager.state.ref;
  const title = tInp ? tInp.value.trim() : SessionManager.state.dbTitle;

  const ok = await SessionManager.authenticate(user, pwd, server, ref, title);
  if (ok) {
    await fetch("/api/bases/set_active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server, ref, title, user, password: pwd })
    }).catch(() => {});

    // Invalidate caches when database session connects
    if (window.PortfolioCatalog) {
      PortfolioCatalog.cache = {};
      PortfolioCatalog.filtersLoaded = false;
      const pcWin = document.getElementById("portfolioCatalogWindow");
      if (pcWin && pcWin.style.display !== "none") {
        PortfolioCatalog.loadFilters();
      }
    }
    closeLoginModal();
  }
}
