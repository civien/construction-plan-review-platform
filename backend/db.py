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
        docx_path TEXT,
        rating TEXT DEFAULT '',
        is_re_review INTEGER DEFAULT 0,
        prev_rating TEXT DEFAULT '',
        prev_total INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")
    # 迁移：旧表缺列时自动添加（兼容历史库）
    cols = {r[1] for r in conn.execute("PRAGMA table_info(reviews)").fetchall()}
    for col, ddl in [
        ("rating", "ALTER TABLE reviews ADD COLUMN rating TEXT DEFAULT ''"),
        ("is_re_review", "ALTER TABLE reviews ADD COLUMN is_re_review INTEGER DEFAULT 0"),
        ("prev_rating", "ALTER TABLE reviews ADD COLUMN prev_rating TEXT DEFAULT ''"),
        ("prev_total", "ALTER TABLE reviews ADD COLUMN prev_total INTEGER DEFAULT 0"),
        ("total", "ALTER TABLE reviews ADD COLUMN total INTEGER DEFAULT 0"),
    ]:
        if col not in cols:
            try:
                conn.execute(ddl)
            except sqlite3.OperationalError:
                pass
    conn.commit()
    conn.close()


def save_review(rid, type_, type_name, filename, used_llm, findings, report_md, docx_path,
                rating='', is_re_review=0, prev_rating='', prev_total=0, total=0):
    conn = _conn()
    conn.execute(
        "INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (rid, type_, type_name, filename, datetime.datetime.now().isoformat(timespec='seconds'),
         1 if used_llm else 0, json.dumps(findings, ensure_ascii=False), report_md, docx_path,
         rating, 1 if is_re_review else 0, prev_rating, prev_total, total))
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
        "SELECT id,type,type_name,filename,created_at,used_llm,rating,"
        "is_re_review,prev_rating,prev_total,total FROM reviews "
        "ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_review(rid):
    conn = _conn()
    conn.execute("DELETE FROM reviews WHERE id=?", (rid,))
    conn.commit()
    conn.close()


def find_previous_review(type_, filename, before_iso=None):
    """查找同一 (type, filename) 的上一条历史记录（用于二次审查判定与对比）。
    before_iso 传入当前时间可排除自身；不传则取最新一条。"""
    conn = _conn()
    if before_iso:
        row = conn.execute(
            "SELECT * FROM reviews WHERE type=? AND filename=? AND created_at<? "
            "ORDER BY created_at DESC LIMIT 1",
            (type_, filename, before_iso)).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM reviews WHERE type=? AND filename=? "
            "ORDER BY created_at DESC LIMIT 1",
            (type_, filename)).fetchone()
    conn.close()
    return dict(row) if row else None


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
