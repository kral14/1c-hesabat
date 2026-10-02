# -*- coding: utf-8 -*-
r"""
Export Antigravity Conversation Transcript to clean, human-readable Markdown
Destination: sohbet_tarixcesi.md
"""
import json
import os
import re

LOG_PATH = r"C:\Users\nesib\.gemini\antigravity-ide\brain\341ef589-19fa-445b-b72f-0daf1761feb2\.system_generated\logs\transcript.jsonl"
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sohbet_tarixcesi.md")

def clean_user_message(content):
    if not content:
        return ""
    # Extract from <USER_REQUEST>...</USER_REQUEST> if present
    m = re.search(r"<USER_REQUEST>(.*?)</USER_REQUEST>", content, re.DOTALL)
    if m:
        return m.group(1).strip()
    return content.strip()

def export_conversation():
    if not os.path.exists(LOG_PATH):
        print(f"Log faylı tapılmadı: {LOG_PATH}")
        return

    dialogue = []
    
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except Exception:
                continue

            item_type = item.get("type")
            source = item.get("source")
            content = item.get("content") or ""

            if item_type == "USER_INPUT" and source == "USER_EXPLICIT":
                msg = clean_user_message(content)
                if msg:
                    dialogue.append(("👤 İSTİFADƏÇİ", msg))
            elif item_type == "PLANNER_RESPONSE" and source == "MODEL":
                if content and content.strip():
                    dialogue.append(("🤖 ANTIGRAVITY KÖMƏKÇİ", content.strip()))

    with open(OUT_PATH, "w", encoding="utf-8") as out:
        out.write("# 1C Enterprise & Hesabat Layihəsi - Söhbət Tarixçəsi\n\n")
        out.write(f"**Tarix:** 02 Oktyabr 2026\n")
        out.write(f"**Söhbət ID:** `341ef589-19fa-445b-b72f-0daf1761feb2`\n")
        out.write(f"**Cəmi mesaj sayı:** {len(dialogue)}\n\n")
        out.write("---\n\n")

        for role, text in dialogue:
            if role == "👤 İSTİFADƏÇİ":
                out.write(f"### {role}:\n\n> {text.replace(chr(10), chr(10) + '> ')}\n\n")
            else:
                out.write(f"### {role}:\n\n{text}\n\n")
            out.write("---\n\n")

    print(f"Uğurla export edildi: {OUT_PATH}")
    print(f"Cəmi dialoq mesajı: {len(dialogue)}")

if __name__ == "__main__":
    export_conversation()
