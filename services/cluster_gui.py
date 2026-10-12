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

from services.cluster_service import (
    get_cluster_sessions,
    terminate_cluster_session,
    auto_cleanup_hanging_sessions,
    terminate_all_com_sessions
)

class ClusterSessionsGUI:
    def __init__(self, server_agent="Test1C:1540", target_base="aztrade_test3"):
        self.server_agent = server_agent
        self.target_base = target_base
        self.root = tk.Tk()
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
            text="🟢 Keç / Davam Et ➔", 
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
        for item in self.tree.get_children():
            self.tree.delete(item)

        try:
            sessions = get_cluster_sessions(server_agent=self.server_agent, target_base=self.target_base)
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

        except Exception as e:
            self.status_bar.config(text=f"⚠️ Xəta: {e}")

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

        ok, err = terminate_cluster_session(sid, server_agent=self.server_agent, target_base=self.target_base)
        if ok:
            messagebox.showinfo("Uğurlu", f"Sessiya #{sid} uğurla sonlandırıldı və lisenziya azad edildi!", parent=self.root)
            self._load_sessions()
        else:
            messagebox.showerror("Xəta", f"Sessiyanı sonlandırmaq alınmadı:\n{err}", parent=self.root)

    def _on_auto_clean(self):
        cleaned = auto_cleanup_hanging_sessions(server_agent=self.server_agent, target_base=self.target_base)
        if cleaned > 0:
            messagebox.showinfo("Təmizləndi", f"{cleaned} ədəd asılı qalmış COM sessiyası bağlandı və lisenziya azad edildi!", parent=self.root)
        else:
            messagebox.showinfo("Məlumat", "Bazada asılı qalmış COM sessiyası tapılmadı.", parent=self.root)
        self._load_sessions()

    def _on_skip(self):
        self.root.destroy()

    def show(self):
        self.root.mainloop()

def open_cluster_gui(server_agent="Test1C:1540", target_base="aztrade_test3"):
    """Pəncərəni açır və istifadəçi bağlayana və ya 'Keç' edənə qədər gözləyir."""
    try:
        app = ClusterSessionsGUI(server_agent=server_agent, target_base=target_base)
        app.show()
    except Exception as e:
        print(f"⚠️ [CLUSTER GUI] GUI pəncərəsi açıla bilmədi: {e}", flush=True)

if __name__ == "__main__":
    open_cluster_gui()
