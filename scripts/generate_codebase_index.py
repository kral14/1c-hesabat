import os
import ast
import re
import json

ROOT_DIR = r"d:\1c-hesabat"
OUTPUT_FILE = os.path.join(ROOT_DIR, "codebase_index.json")

index_data = {
    "project_name": "1C-Hesabat (1C:Enterprise Web & Electron Integration)",
    "version": "1.0",
    "description": "1C:Предприятие 8.3 veb və masaüstü inteqrasiya sistemi, universal MDI pəncərələr, kataloq seçimləri, dinamik hesabatlar və sənəd jurnalları.",
    "modules": {},
    "api_endpoints": {},
    "frontend_components": {},
    "relationships": {}
}

# 1. Python Fayllarının AST Analizi
def analyze_python_file(file_path, rel_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            code = f.read()
        tree = ast.parse(code, filename=rel_path)
    except Exception as e:
        return {"error": str(e), "file_path": rel_path}

    file_info = {
        "file_path": rel_path,
        "type": "backend_python",
        "docstring": ast.get_docstring(tree) or "",
        "imports": [],
        "functions": {},
        "classes": {},
        "endpoints": []
    }

    # Imports
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for n in node.names:
                file_info["imports"].append(n.name)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            for n in node.names:
                file_info["imports"].append(f"{mod}.{n.name}")

    # Top-level Functions & Classes
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            fn_name = node.name
            args = [a.arg for a in node.args.args]
            start_line = node.lineno
            end_line = getattr(node, "end_lineno", start_line)
            fn_doc = ast.get_docstring(node) or ""
            
            # Decorators (e.g. @app.route, @bp.route)
            decs = []
            is_endpoint = False
            endpoint_url = ""
            endpoint_methods = ["GET"]
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and hasattr(dec.func, "attr") and dec.func.attr == "route":
                    is_endpoint = True
                    if dec.args and isinstance(dec.args[0], ast.Constant):
                        endpoint_url = dec.args[0].value
                    for kw in dec.keywords:
                        if kw.arg == "methods" and isinstance(kw.value, (ast.List, ast.Tuple)):
                            endpoint_methods = [elt.value for elt in kw.value.elts if isinstance(elt, ast.Constant)]
                elif isinstance(dec, ast.Name):
                    decs.append(dec.id)
                elif isinstance(dec, ast.Attribute):
                    decs.append(f"{dec.value.id}.{dec.attr}" if hasattr(dec.value, "id") else dec.attr)

            fn_entry = {
                "name": fn_name,
                "args": args,
                "start_line": start_line,
                "end_line": end_line,
                "docstring": fn_doc.strip(),
                "decorators": decs
            }
            if is_endpoint:
                fn_entry["endpoint"] = {
                    "url": endpoint_url,
                    "methods": endpoint_methods
                }
                file_info["endpoints"].append({
                    "url": endpoint_url,
                    "methods": endpoint_methods,
                    "handler": fn_name,
                    "start_line": start_line
                })
                index_data["api_endpoints"][endpoint_url] = {
                    "handler": f"{rel_path}:{fn_name}",
                    "methods": endpoint_methods,
                    "line": start_line
                }

            file_info["functions"][fn_name] = fn_entry

        elif isinstance(node, ast.ClassDef):
            cls_name = node.name
            start_line = node.lineno
            end_line = getattr(node, "end_lineno", start_line)
            cls_methods = {}
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    m_args = [a.arg for a in item.args.args]
                    cls_methods[item.name] = {
                        "name": item.name,
                        "args": m_args,
                        "start_line": item.lineno,
                        "end_line": getattr(item, "end_lineno", item.lineno)
                    }
            file_info["classes"][cls_name] = {
                "name": cls_name,
                "start_line": start_line,
                "end_line": end_line,
                "methods": cls_methods
            }

    return file_info

# 2. JavaScript Fayllarının Analizi
def analyze_js_file(file_path, rel_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception as e:
        return {"error": str(e), "file_path": rel_path}

    total_lines = len(lines)
    file_info = {
        "file_path": rel_path,
        "type": "frontend_javascript",
        "total_lines": total_lines,
        "objects": {},
        "functions": {},
        "api_calls": [],
        "event_listeners": []
    }

    # API fetch zəngləri
    fetch_pattern = re.compile(r'fetch\(\s*["\']([^"\']+)["\']')
    # Obyekt/Modul patternləri: const CatalogSelector = { və ya class CatalogSelector
    obj_pattern = re.compile(r'^(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*\{')
    class_pattern = re.compile(r'^class\s+([A-Za-z0-9_$]+)')
    # Standart funksiya: function myFunc(a, b)
    func_pattern = re.compile(r'^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)')
    # Obyekt daxili metod: myMethod(a, b) { və ya async myMethod(a, b) {
    method_pattern = re.compile(r'^\s{2,4}(?:async\s+)?([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{')

    current_obj = None
    obj_start_line = 0

    for i, line in enumerate(lines, 1):
        # Fetch axtarışı
        for m in fetch_pattern.finditer(line):
            url = m.group(1)
            if url not in file_info["api_calls"]:
                file_info["api_calls"].append(url)

        # Class / Object axtarışı
        cls_match = class_pattern.match(line.strip())
        if cls_match:
            current_obj = cls_match.group(1)
            file_info["objects"][current_obj] = {
                "name": current_obj,
                "kind": "class",
                "start_line": i,
                "methods": {}
            }
            continue

        obj_match = obj_pattern.match(line.strip())
        if obj_match:
            current_obj = obj_match.group(1)
            file_info["objects"][current_obj] = {
                "name": current_obj,
                "kind": "object_literal",
                "start_line": i,
                "methods": {}
            }
            continue

        # Top-level Function
        fn_match = func_pattern.match(line.strip())
        if fn_match:
            fn_name = fn_match.group(1)
            fn_args = [a.strip() for a in fn_match.group(2).split(",") if a.strip()]
            file_info["functions"][fn_name] = {
                "name": fn_name,
                "args": fn_args,
                "line": i
            }
            continue

        # Metod (current_obj daxilində)
        if current_obj and current_obj in file_info["objects"]:
            m_match = method_pattern.match(line)
            if m_match:
                m_name = m_match.group(1)
                m_args = [a.strip() for a in m_match.group(2).split(",") if a.strip()]
                # filter out control flow words
                if m_name not in ["if", "for", "while", "switch", "catch"]:
                    file_info["objects"][current_obj]["methods"][m_name] = {
                        "name": m_name,
                        "args": m_args,
                        "line": i
                    }

    return file_info

# 3. Layihə Fayllarının Skalanması
def scan_project():
    target_dirs = ["services", "routes", "static/js", "templates"]
    direct_files = ["app.py", "run.py", "server.py", "database.py", "offline_service.py", "excel_generator.py"]

    # Direct root files
    for df in direct_files:
        full_p = os.path.join(ROOT_DIR, df)
        if os.path.exists(full_p):
            rel_p = df.replace("\\", "/")
            index_data["modules"][rel_p] = analyze_python_file(full_p, rel_p)

    # Directories
    for td in target_dirs:
        full_dir = os.path.join(ROOT_DIR, td)
        if not os.path.exists(full_dir):
            continue
        for root, dirs, files in os.walk(full_dir):
            # Skips
            if any(skip in root for skip in ["__pycache__", ".git", "node_modules"]):
                continue
            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, ROOT_DIR).replace("\\", "/")

                if f.endswith(".py"):
                    index_data["modules"][rel_path] = analyze_python_file(full_path, rel_path)
                elif f.endswith(".js"):
                    index_data["modules"][rel_path] = analyze_js_file(full_path, rel_path)
                elif f.endswith(".html"):
                    index_data["modules"][rel_path] = {
                        "file_path": rel_path,
                        "type": "html_template",
                        "size_bytes": os.path.getsize(full_path)
                    }

    # 4. Layihə Təyinat Xülasələrinin Zənginləşdirilməsi (Bilik bazası)
    descriptions = {
        "services/catalog_handlers.py": "1C COM sorğuları vasitəsilə Nomenklatura, Kontragentlər, Skladlar, Qiymət tipləri və bütün iyerarxik kataloqların çəkilməsi, axtarışı və naviqasiyası.",
        "services/report_handlers.py": "1C Hesabatlarının (Realizasiya, Sifarişlər, Qalıqlar) formalaşdırılması, cədvəl matrisi, filtrasiya və qruplaşdırma.",
        "services/audit_service.py": "1C Verilənlər bazası üzrə audit jurnalları, sənəd hərəkətləri və dəyişikliklərin analizi.",
        "services/common.py": "1C COM obyektləri ilə ortaq kommunikasiya və köməkçi funksiyalar.",
        "services/onec_service.py": "1C COM bağlantı hovuzu (connection pool), sessiya idarəsi və sorğuların icrası.",
        "routes/catalog_routes.py": "/api/catalog_data, /api/search_* API endpointləri və frontend-ə cavab yönləndirmələri.",
        "routes/report_routes.py": "/api/generate_report, /api/export_excel və hesabat API endpointləri.",
        "routes/base_routes.py": "Əsas səhifələr, autentifikasiya və sessiya marşrutları.",
        "static/js/catalog_selector.js": "Universal 1C Kataloq Seçim Pəncərəsi (CatalogSelector): Ağac strukturu, naviqasiya sətirləri (ana qovluq, alt qovluqlar, kökə çıxış), axtarış, seçmə və MDI inteqrasiyası.",
        "static/js/mdi_manager.js": "1C Çoxsənədli Pəncərə İdarəedicisi (MdiManager): Veb daxilində pəncərələrin açılması, bağlanması, maksimizasiyası, aktiv tabların idarəsi.",
        "static/js/report_engine.js": "1C Hesabatlarının ekranda vizuallaşdırılması, cədvəl qrafikası və filtrlərin tətbiqi.",
        "static/js/universal_journal.js": "1C Sənəd jurnallarının siyahısı, filtrlər, kolon nizamlamaları və dinamik axtarış.",
        "static/js/components/filter/filter_manager.js": "Axtarış və süzgəc sistemi: kriteriya dialoqları, çiplər, təmizləmə və tətbiq.",
        "static/js/components/filter/filter_chips_bar.js": "Aktiv süzgəclərin çip kimi göstərilməsi və silinməsi.",
        "static/js/components/filter/filter_criteria_modal.js": "1C standartında 'Bərabərdir', 'Daxildir', 'Siyahıda' süzgəc meyarları dialoqu.",
        "static/js/components/picker/catalog_picker_manager.js": "Sənəd və hesabat xanalarından kataloq pəncərəsinin açılması üçün menecer.",
        "templates/index.html": "Əsas tətbiq interfeysi: MDI iş masası, menyu, alətlər paneli və bütün komponentlərin skript birləşmələri."
    }

    for path, desc in descriptions.items():
        if path in index_data["modules"]:
            index_data["modules"][path]["role_and_purpose"] = desc

    # 5. Qarşılıqlı Əlaqələr Xəritəsi (Cross-references)
    for path, mod in index_data["modules"].items():
        if mod.get("type") == "frontend_javascript":
            calls = mod.get("api_calls", [])
            for call in calls:
                # endpoint clean
                ep_clean = call.split("?")[0]
                if ep_clean in index_data["api_endpoints"]:
                    backend_handler = index_data["api_endpoints"][ep_clean]["handler"]
                    if path not in index_data["relationships"]:
                        index_data["relationships"][path] = []
                    index_data["relationships"][path].append({
                        "calls_api": ep_clean,
                        "handled_by": backend_handler
                    })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out_f:
        json.dump(index_data, out_f, ensure_ascii=False, indent=2)

    print(f"Index successfully generated at {OUTPUT_FILE}!")
    print(f"Total indexed modules: {len(index_data['modules'])}")
    print(f"Total indexed endpoints: {len(index_data['api_endpoints'])}")

if __name__ == "__main__":
    scan_project()
