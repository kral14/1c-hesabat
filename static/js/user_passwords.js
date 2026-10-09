const UserPasswordManager = {
  escape(text) { return String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  busy: false,
  close() {
    if (this.busy) return;
    const modal = document.getElementById('userPasswordModal');
    if (modal) modal.remove();
  },
  async open(win) {
    const credentials = SessionManager.getCredentials();
    if (credentials.server.toLowerCase() !== 'test1c' || credentials.ref.toLowerCase() !== 'aztrade_test3') {
      alert('Изменение паролей доступно только в Test1C / Aztrade_test3'); return;
    }
    this.close();
    if (this.busy) return;
    const selectedName = win.querySelector('tr.selected')?.dataset.name || '';
    const modal = document.createElement('div');
    modal.id = 'userPasswordModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Изменить пароль пользователя 1C');
    modal.style.cssText = 'position:fixed;inset:0;background:#0005;z-index:2147483100;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `<form style="background:#fffbef;width:460px;max-width:95vw;padding:18px;border:1px solid #888;box-shadow:0 4px 20px #555;font:13px Arial">
      <h3 style="margin:0 0 12px">Изменить пароль пользователя 1C</h3>
      <p>База: <b>Test1C / Aztrade_test3</b></p>
      <p>Пользователь справочника: <b>${this.escape(selectedName || 'не выбран')}</b></p>
      <label style="display:block">Учетная запись 1C<select id="passwordAccount" required style="display:block;width:100%;margin:5px 0 12px"><option value="">Загрузка...</option></select></label>
      <label style="display:block">Новый пароль<input id="newUserPassword" type="password" autocomplete="new-password" required style="display:block;width:100%;box-sizing:border-box;margin:5px 0 12px"></label>
      <label style="display:block">Повторите пароль<input id="confirmUserPassword" type="password" autocomplete="new-password" required style="display:block;width:100%;box-sizing:border-box;margin:5px 0 12px"></label>
      <p id="passwordStatus" role="status">Для изменения требуется право «Администрирование» базы 1C.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px"><button id="saveUserPassword" type="submit" disabled>Изменить пароль</button><button id="cancelUserPassword" type="button">Закрыть</button></div>
    </form>`;
    document.body.appendChild(modal);
    modal.querySelector('form').onsubmit = e => { e.preventDefault(); this.submit(credentials); };
    modal.querySelector('#cancelUserPassword').onclick = () => this.close();
    modal.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.close(); } };
    try {
      const response = await fetch('/api/users/accounts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(credentials) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      if (!modal.isConnected) return;
      const select = modal.querySelector('#passwordAccount');
      select.innerHTML = '<option value="">Выберите учетную запись</option>' + data.accounts.map(account =>
        `<option value="${this.escape(account.name)}" ${account.standard_auth ? '' : 'disabled'}>${this.escape(account.name)}${account.full_name ? ' — ' + this.escape(account.full_name) : ''}${account.standard_auth ? '' : ' (аутентификация 1C отключена)'}</option>`).join('');
      const matches = data.accounts.filter(a => a.standard_auth && (a.name === selectedName || a.full_name === selectedName));
      if (matches.length === 1) select.value = matches[0].name;
      modal.querySelector('#saveUserPassword').disabled = false;
    } catch (error) {
      if (modal.isConnected) {
        modal.querySelector('#passwordStatus').textContent = error.message;
        modal.querySelector('#passwordAccount').innerHTML = '<option value="">Учетные записи недоступны</option>';
        modal.querySelectorAll('input,select').forEach(element => { element.disabled = true; });
      }
    }
  },
  async submit(credentials) {
    const modal = document.getElementById('userPasswordModal');
    if (!modal || this.busy) return;
    const latest = SessionManager.getCredentials();
    const status = modal.querySelector('#passwordStatus');
    if (latest.server !== credentials.server || latest.ref !== credentials.ref || latest.user !== credentials.user) {
      status.textContent = 'Подключение изменилось. Откройте окно заново.'; return;
    }
    const account = modal.querySelector('#passwordAccount').value;
    const password = modal.querySelector('#newUserPassword').value;
    const confirmation = modal.querySelector('#confirmUserPassword').value;
    if (!account || !password || password !== confirmation) { status.textContent = 'Выберите учетную запись и введите два одинаковых пароля.'; return; }
    this.busy = true;
    modal.querySelectorAll('button,input,select').forEach(element => { element.disabled = true; });
    status.textContent = 'Изменение пароля...';
    try {
      const response = await fetch('/api/users/change_password', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ ...credentials, target_user:account, new_password:password, confirm_password:confirmation }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      if (data.changed_current_user) SessionManager.state.password = password; // Memory only; never automatically persist the new secret.
      status.textContent = 'Пароль изменен. Для следующего входа используйте новый пароль.';
      modal.querySelector('#newUserPassword').value = '';
      modal.querySelector('#confirmUserPassword').value = '';
    } catch (error) { status.textContent = error.message; }
    finally { this.busy = false; modal.querySelectorAll('button,input,select').forEach(element => { element.disabled = false; }); }
  }
};
