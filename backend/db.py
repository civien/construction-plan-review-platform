#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
db.py — SQLite 持久化（审查历史 + 模型设置）
"""
import os, json, sqlite3, datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'app.db')


def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init():
    conn = _conn()
    conn.execute("""CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        type TEXT,
        type_name TEXT,
        filename TEXT,
        created_at TEXT,
        used_llm INTEGER,
        findings_json TEXT,
        report_md TEXT,
        docx_path TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")
    conn.commit()
    conn.close()


def save_review(rid, type_, type_name, filename, used_llm, findings, report_md, docx_path):
    conn = _conn()
    conn.execute(
        "INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?,?,?,?)",
        (rid, type_, type_name, filename, datetime.datetime.now().isoformat(timespec='seconds'),
         1 if used_llm else 0, json.dumps(findings, ensure_ascii=False), report_md, docx_path))
    conn.commit()
    conn.close()


def get_review(rid):
    conn = _conn()
    row = conn.execute("SELECT * FROM reviews WHERE id=?", (rid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_reviews(limit=50):
    conn = _conn()
    rows = conn.execute(
        "SELECT id,type,type_name,filename,created_at,used_llm FROM reviews "
        "ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_settings():
    conn = _conn()
    rows = conn.execute("SELECT key,value FROM settings").fetchall()
    conn.close()
    d = {}
    for r in rows:
        try:
            d[r['key']] = json.loads(r['value'])
        except Exception:
            d[r['key']] = r['value']
    return d


def save_settings(d):
    conn = _conn()
    for k, v in d.items():
        conn.execute("INSERT OR REPLACE INTO settings VALUES (?,?)",
                     (k, json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v))
    conn.commit()
    conn.close()


init()
