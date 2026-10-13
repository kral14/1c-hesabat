# -*- coding: utf-8 -*-
"""
1C Klaster Sessiyaları və Lisenziya İdarəetmə GUI Pəncərəsi (Tkinter).
Server işə düşərkən ekrana gəlir:
- Aktiv sessiyaları və asılı qalmış COM bağlantılarını göstərir.
- İstifadəçiyə lisenziyanı bloklayan sessiyanı seçib 'Sonlandır' etməyə imkan verir.
- Əgər ehtiyac yoxdursa, istifadəçi sadəcə 'Keç / Davam Et' düyməsinə klikləyir və server davam edir.
"""
import sys
import tkinter as tk
from tkinter import ttk, messagebox
import json
import threading
import queue
import urllib.request

try:
    from services.cluster_service import get_cluster_sessions, terminate_cluster_session, auto_cleanup_hanging_sessions
except ImportError:
    # Home mode administers the office backend over HTTP and needs no local COM installation.
    get_cluster_sessions = terminate_cluster_session = auto_cleanup_hanging_sessions = None


class ClusterSessionsGUI:
    def __init__(self, server_agent="Test1C:1540", target_base="aztrade_test3", backend_url=None, parent=None):
        self.server_agent = server_agent
        self.target_base = target_base
        self.backend_url = backend_url
        self.action = None
        self.parent = parent
        self.root = tk.Toplevel(parent) if parent is not None else tk.Tk()
        self.root.title("1C Klaster - Sessiya və Lisenziya İdarəetməsi")
        
        # Pəncərə ölçüləri və mərkəzləşdirmə
        win_w, win_h = 780, 520
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = max(0, int((screen_w - win_w) / 2))
        y = max(0, int((screen_h - win_h) / 2))
        self.root.geometry(f"{win_w}x{win_h}+{x}+{y}")
        self.root.minsize(700, 420)

        # Üstə çıxartmaq (fokuslanma üçün)
        self.root.attributes("-topmost", True)
        self.root.after(800, lambda: self.root.attributes("-topmost", False))

        self._apply_styles()
        self._build_ui()
        self._load_sessions()

    def _apply_styles(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure("Treeview", 
                        font=("Segoe UI", 10),
                        rowheight=28)
        style.configure("Treeview.Heading", 
                        font=("Segoe UI", 10, "bold"),
                        background="#e2e8f0", 
                        foreground="#1e293b")
        style.map("Treeview", 
                  background=[("selected", "#3b82f6")], 
                  foreground=[("selected", "#ffffff")])

    def _build_ui(self):
        # 1. Başlıq Paneli
        header_frame = tk.Frame(self.root, bg="#1e293b", padx=16, pady=12)
        header_frame.pack(fill=tk.X)

        title_lbl = tk.Label(
            header_frame, 
            text="🏢 1C:Enterprise Klaster - Sessiyalar və Lisenziya", 
            font=("Segoe UI", 14, "bold"), 
            fg="#f8fafc", 
            bg="#1e293b"
        )
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(
            header_frame, 
            text=f"Server: {self.server_agent}  |  Baza: {self.target_base}", 
            font=("Segoe UI", 9), 
            fg="#94a3b8", 
            bg="#1e293b"
        )
        sub_lbl.pack(anchor="w", pady=(2, 0))

        # 2. İzah / Təlimat Paneli
        info_frame = tk.Frame(self.root, bg="#f1f5f9", padx=14, pady=8)
        info_frame.pack(fill=tk.X)

        info_text = (
            "📌 Bazada lisenziya yerini boşaltmaq üçün istədiyiniz sessiyanı seçib 'Sonlandır' sıxın.\n"
            "   Ehtiyac yoxdursa, birbaşa 'Keç / Davam Et' düyməsinə klikləyin."
        )
        if self.backend_url:
            info_text = "Mövcud bağlantı ilə davam etmək serverin saxladığı COM sessiyasını istifadə edir.\nAsılı sessiyanı təmizləmək onu sonlandırır; başqa prosesin sessiya ID-si ilə qoşulma edilmir."
        info_lbl = tk.Label(info_frame, text=info_text, font=("Segoe UI", 9), fg="#334155", bg="#f1f5f9", justify=tk.LEFT)
        info_lbl.pack(anchor="w")

        # 3. Cədvəl (Treeview)
        table_frame = tk.Frame(self.root, padx=14, pady=8)
        table_frame.pack(fill=tk.BOTH, expand=True)

        columns = ("id", "user", "app", "host", "started", "status")
        self.tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="browse")

        self.tree.heading("id", text="Sessiya ID")
        self.tree.heading("user", text="İstifadəçi")
        self.tree.heading("app", text="Tətbiq Tipi")
        self.tree.heading("host", text="Kompüter (Host)")
        self.tree.heading("started", text="Başlama Vaxtı")
        self.tree.heading("status", text="Vəziyyət")

        self.tree.column("id", width=80, anchor="center")
        self.tree.column("user", width=140, anchor="w")
        self.tree.column("app", width=130, anchor="w")
        self.tree.column("host", width=130, anchor="w")
        self.tree.column("started", width=150, anchor="w")
        self.tree.column("status", width=110, anchor="center")

        # Scrollbar
        scrollbar = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 4. Düymələr Paneli
        btn_frame = tk.Frame(self.root, padx=14, pady=12, bg="#f8fafc")
        btn_frame.pack(fill=tk.X)

        # Sol tərəf: Əməliyyat düymələri
        self.btn_terminate = tk.Button(
            btn_frame, 
            text="🔴 Seçiləni Sonlandır", 
            font=("Segoe UI", 10, "bold"), 
            bg="#ef4444", 
            fg="white", 
            activebackground="#dc2626", 
            activeforeground="white",
            padx=12, 
            pady=6, 
            relief=tk.FLAT, 
            cursor="hand2",
            command=self._on_terminate
        )
        self.btn_terminate.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_clean_com = tk.Button(
            btn_frame, 
            text="🧹 Asılı Qalmışları Təmizlə", 
            font=("Segoe UI", 9), 
            bg="#e2e8f0", 
            fg="#1e293b", 
            padx=10, 
            pady=6, 
            relief=tk.FLAT, 
            cursor="hand2",
            command=self._on_auto_clean
        )
        self.btn_clean_com.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_refresh = tk.Button(
            btn_frame, 
            text="🔄 Yenilə", 
            font=("Segoe UI", 9), 
            bg="#e2e8f0", 
            fg="#1e293b", 
            padx=10, 
            pady=6, 
            relief=tk.FLAT, 
            cursor="hand2",
            command=self._load_sessions
        )
        self.btn_refresh.pack(side=tk.LEFT)

        # Sağ tərəf: Keç / Davam Et düyməsi
        self.btn_skip = tk.Button(
            btn_frame, 
            text="Bağlantını hazırla və davam et" if self.backend_url else "🟢 Keç / Davam Et ➔",
            font=("Segoe UI", 10, "bold"), 
            bg="#10b981", 
            fg="white", 
            activebackground="#059669", 
            activeforeground="white",
            padx=16, 
            pady=6, 
            relief=tk.FLAT, 
            cursor="hand2",
            command=self._on_skip
        )
        self.btn_skip.pack(side=tk.RIGHT)

        if self.backend_url:
            reuse_frame = tk.Frame(self.root, padx=14, pady=4, bg='#f8fafc')
            reuse_frame.pack(fill=tk.X)
            tk.Button(reuse_frame, text="Mövcud bağlantı ilə davam et", command=self._on_reuse,
                      font=("Segoe UI", 10, 'bold'), padx=8, pady=6).pack(fill=tk.X)

        # 5. Status Bar
        self.status_bar = tk.Label(
            self.root, 
            text="Sessiyalar oxunur...", 
            font=("Segoe UI", 9), 
            fg="#475569", 
            bg="#e2e8f0", 
            anchor="w", 
            padx=14, 
            pady=4
        )
        self.status_bar.pack(fill=tk.X, side=tk.BOTTOM)

    def _load_sessions(self):
        self._load_token = getattr(self, '_load_token', 0) + 1
        token = self._load_token
        self.status_bar.config(text='Sessiyalar oxunur...')
        results = queue.Queue()
        def worker():
            try:
                sessions = self._backend('api/cluster/sessions').get('sessions', []) if self.backend_url else get_cluster_sessions(server_agent=self.server_agent, target_base=self.target_base, raise_errors=True)
                results.put((sessions, None))
            except Exception as error:
                results.put((None, str(error)))
        def poll():
            if not self.root.winfo_exists() or token != self._load_token: return
            try:
                sessions, error = results.get_nowait()
            except queue.Empty:
                self.root.after(100, poll)
                return
            if error:
                self.status_bar.config(text='⚠️ Xəta: ' + error)
            else:
                self._display_sessions(sessions)
        threading.Thread(target=worker, daemon=True).start()
        self.root.after(100, poll)

    def _display_sessions(self, sessions):
        for item in self.tree.get_children(): self.tree.delete(item)
        if not sessions:
            self.status_bar.config(text="✅ Aktiv sessiya yoxdur. Bütün lisenziyalar tam sərbəstdir.")
            return

        hanging_count = 0
        for s in sessions:
            sid = s.get("session_id", "")
            user = s.get("user_name", "")
            app = s.get("app_id", "")
            host = s.get("host", "")
            started = s.get("started_at", "")
            if len(started) > 19:
                started = started[:19]

            is_hanging = s.get("is_hanging", False)
            if is_hanging:
                hanging_count += 1
                status = "⚠️ Asılı (Qopmuş)"
            else:
                status = "Aktiv"

            item_id = self.tree.insert("", tk.END, values=(sid, user, app, host, started, status))
            if is_hanging:
                self.tree.item(item_id, tags=("hanging",))

        self.tree.tag_configure("hanging", background="#fef2f2", foreground="#b91c1c")

        msg = f"Cəmi {len(sessions)} aktiv sessiya tapıldı."
        if hanging_count > 0:
            msg += f" (Bunlardan {hanging_count} ədədi lisenziyanı bloklayan asılı sessiyadır!)"
        self.status_bar.config(text=msg)


    def _on_terminate(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showinfo("Məlumat", "Zəhmət olmasa siyahıdan sonlandırmaq istədiyiniz sessiyanı seçin.", parent=self.root)
            return

        values = self.tree.item(selected[0], "values")
        sid = values[0]
        user = values[1]

        confirm = messagebox.askyesno(
            "Təsdiq", 
            f"Sessiya #{sid} ({user}) sonlandırılsın və lisenziya azad edilsin?",
            parent=self.root
        )
        if not confirm:
            return

        if self.backend_url:
            try:
                self._backend('api/cluster/terminate', {'session_id':sid})
                ok, err = True, None
            except Exception as error:
                ok, err = False, str(error)
        else:
            ok, err = terminate_cluster_session(sid, server_agent=self.server_agent, target_base=self.target_base)
        if ok:
            messagebox.showinfo("Uğurlu", f"Sessiya #{sid} uğurla sonlandırıldı və lisenziya azad edildi!", parent=self.root)
            self._load_sessions()
        else:
            messagebox.showerror("Xəta", f"Sessiyanı sonlandırmaq alınmadı:\n{err}", parent=self.root)

    def _on_auto_clean(self):
        if not messagebox.askyesno('Təsdiq', 'Yalnız qopmuş COM sessiyaları sonlandırılsın?', parent=self.root):
            return
        if self.backend_url:
            try:
                sessions = self._backend('api/cluster/sessions').get('sessions', [])
                targets = [s for s in sessions if s.get('is_hanging') and s.get('app_id') == 'COMConnection']
                cleaned = 0
                for session in targets:
                    self._backend('api/cluster/terminate', {'session_id': session['session_id'], 'only_hanging': True})
                    cleaned += 1
            except Exception as error:
                messagebox.showerror('Xəta', str(error), parent=self.root)
                self._load_sessions()
                return
        else:
            cleaned = auto_cleanup_hanging_sessions(server_agent=self.server_agent, target_base=self.target_base)
        messagebox.showinfo('Sessiyalar', f'{cleaned} qopmuş COM sessiyası təmizləndi.', parent=self.root)
        self._load_sessions()

    def _backend(self, path, extra=None):
        body = {'server': self.server_agent.rsplit(':',1)[0], 'ref':self.target_base, **(extra or {})}
        req = urllib.request.Request(self.backend_url.rstrip('/') + '/' + path,
              data=json.dumps(body).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.load(response)
        if not result.get('success'): raise RuntimeError(result.get('error') or 'Sessiya əməliyyatı alınmadı.')
        return result

    def _on_reuse(self):
        try:
            self._backend('api/connection/resume')
            self.action = 'reuse'
            self.root.destroy()
        except Exception as error:
            messagebox.showerror('Mövcud bağlantı', str(error), parent=self.root)

    def _on_skip(self):
        self.action = "connect"
        self.root.destroy()

    def show(self):
        if self.parent is not None:
            self.root.grab_set()
            self.root.wait_window()
        else:
            self.root.mainloop()
        return self.action

def open_cluster_gui(server_agent="Test1C:1540", target_base="aztrade_test3", backend_url=None, parent=None):
    """Pəncərəni açır və istifadəçi bağlayana və ya 'Keç' edənə qədər gözləyir."""
    try:
        app = ClusterSessionsGUI(server_agent=server_agent, target_base=target_base, backend_url=backend_url, parent=parent)
        return app.show()
    except Exception as e:
        if backend_url: raise
        print(f"⚠️ [CLUSTER GUI] GUI pəncərəsi açıla bilmədi: {e}", flush=True)

if __name__ == "__main__":
    open_cluster_gui()
