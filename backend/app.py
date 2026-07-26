#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
app.py — 施工方案审查平台 后端 API (FastAPI)
启动: uvicorn app:app --host 0.0.0.0 --port 8000
"""
import os, json, uuid, datetime, shutil
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from engine import extract_docx, analyze, build_annotated_docx, build_markdown_report
from llm import build_review_messages, call_llm, parse_findings, test_connection, PROVIDERS
import rules_store, db

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')
UPLOADS = os.path.join(DATA, 'uploads')
HISTORY = os.path.join(DATA, 'history')
EXAMPLE = os.path.join(DATA, 'example')
for d in (UPLOADS, HISTORY, EXAMPLE):
    os.makedirs(d, exist_ok=True)

app = FastAPI(title="施工方案审查平台")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


# ---------------- 规则 ----------------
@app.get("/api/types")
def api_types():
    return {"types": rules_store.list_types()}


@app.get("/api/rules/{type_}")
def api_get_rule(type_):
    r = rules_store.get_rule(type_)
    if not r:
        raise HTTPException(404, "规则不存在")
    return r


@app.put("/api/rules/{type_}")
def api_save_rule(type_, payload: dict):
    ok = rules_store.save_rule(type_, payload)
    return {"ok": ok, "type": type_}


@app.post("/api/rules")
def api_new_rule(payload: dict):
    type_ = (payload.get("type") or "").strip()
    if not type_ or "/" in type_ or ".." in type_:
        raise HTTPException(400, "type 非法")
    if rules_store.get_rule(type_):
        raise HTTPException(409, "该类型已存在")
    tpl = rules_store.new_rule_template(type_)
    tpl["name"] = payload.get("name", tpl["name"])
    tpl["description"] = payload.get("description", tpl["description"])
    rules_store.save_rule(type_, tpl)
    return tpl


@app.delete("/api/rules/{type_}")
def api_delete_rule(type_):
    ok = rules_store.delete_rule(type_)
    return {"ok": ok}


# ---------------- 设置 ----------------
@app.get("/api/settings")
def api_get_settings():
    s = db.get_settings()
    has_key = bool(s.get("api_key"))
    return {
        "provider": s.get("provider", "deepseek"),
        "base_url": s.get("base_url", ""),
        "model": s.get("model", ""),
        "temperature": s.get("temperature", 0.2),
        "has_key": has_key,
        "providers": [{"id": k, "label": v["label"],
                       "default_model": v["default_model"],
                       "models": v.get("models", [])} for k, v in PROVIDERS.items()],
    }


@app.put("/api/settings")
def api_save_settings(payload: dict):
    s = db.get_settings()
    new = {
        "provider": payload.get("provider", s.get("provider", "deepseek")),
        "base_url": payload.get("base_url", s.get("base_url", "")),
        "model": payload.get("model", s.get("model", "")),
        "temperature": payload.get("temperature", s.get("temperature", 0.2)),
    }
    ak = payload.get("api_key", "")
    if ak and ak != "***":
        new["api_key"] = ak
    else:
        new["api_key"] = s.get("api_key", "")
    db.save_settings(new)
    return {"ok": True, "has_key": bool(new["api_key"])}


@app.post("/api/llm/test")
def api_test_llm(payload: dict):
    return test_connection(payload)


# ---------------- 审查 ----------------
@app.post("/api/review")
async def api_review(file: UploadFile = File(...), type_: str = Form(...)):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(400, "仅支持 .docx 文件")
    rules = rules_store.get_rule(type_)
    if not rules:
        raise HTTPException(400, f"未找到类型[{type_}]的规则，请先在规则管理创建")

    rid = uuid.uuid4().hex[:12]
    work = os.path.join(HISTORY, rid)
    os.makedirs(work, exist_ok=True)
    src = os.path.join(UPLOADS, f"{rid}_{file.filename}")
    with open(src, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 1. 抽取
    full_text, structure = extract_docx(src, work)
    # 2. 机械分析
    skeleton = analyze(full_text, structure, rules, rules.get("directory_template", ""))

    # 3. 大模型判读（需配置 key）
    settings = db.get_settings()
    used_llm = False
    findings = []
    if settings.get("api_key"):
        try:
            system, user = build_review_messages(rules, full_text, skeleton)
            raw = call_llm(settings, system, user, expect_json=True)
            findings = parse_findings(raw)
            used_llm = True
        except Exception as e:  # noqa
            raise HTTPException(502, f"大模型调用失败：{e}")
    else:
        raise HTTPException(400, "未配置大模型 API，无法审查。请到【模型设置】配置后重试，"
                                  "或点击工作台【示例演示】查看效果。")

    # 4. 生成批注 docx + 报告
    out_docx = os.path.join(work, "annotated.docx")
    gen = build_annotated_docx(src, out_docx, findings)
    meta = {
        "type": type_, "type_name": rules.get("name", type_),
        "filename": file.filename,
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    report = build_markdown_report(meta, skeleton, findings, used_llm)
    db.save_review(rid, type_, rules.get("name", type_), file.filename,
                   used_llm, findings, report, out_docx)

    return {
        "id": rid, "used_llm": used_llm,
        "findings": findings, "skeleton": skeleton,
        "report": report, "gen": gen,
    }


# ---------------- 示例演示（无需 key）----------------
@app.get("/api/example")
def api_example():
    fp = os.path.join(EXAMPLE, "example_findings.json")
    if not os.path.exists(fp):
        raise HTTPException(404, "示例数据缺失")
    findings = json.load(open(fp, encoding="utf-8"))
    report = open(os.path.join(EXAMPLE, "example_report.md"), encoding="utf-8").read()
    return {"findings": findings, "report": report,
            "type_name": "深基坑（开挖、支护）专项施工方案",
            "filename": "深基坑（深基坑开挖、支护）专项施工方案.docx",
            "note": "内置示例结果（未接入大模型），仅供演示 UI 与批注效果。"}


@app.get("/api/example/docx")
def api_example_docx():
    fp = os.path.join(EXAMPLE, "example_annotated.docx")
    if not os.path.exists(fp):
        raise HTTPException(404, "示例 docx 缺失")
    return FileResponse(fp, filename="深基坑方案_审查批注版_示例.docx")


# ---------------- 历史 / 下载 ----------------
@app.get("/api/history")
def api_history():
    return {"items": db.list_reviews()}


@app.get("/api/history/{rid}")
def api_history_get(rid):
    row = db.get_review(rid)
    if not row:
        raise HTTPException(404, "记录不存在")
    row["findings"] = json.loads(row["findings_json"])
    return row


@app.get("/api/download/{rid}")
def api_download(rid):
    row = db.get_review(rid)
    if not row or not row.get("docx_path") or not os.path.exists(row["docx_path"]):
        raise HTTPException(404, "批注稿不存在")
    return FileResponse(row["docx_path"], filename=f"{rid}_审查批注版.docx")


@app.get("/api/report/{rid}")
def api_report(rid):
    row = db.get_review(rid)
    if not row:
        raise HTTPException(404, "记录不存在")
    return PlainTextResponse(row["report_md"] or "", media_type="text/markdown")


@app.get("/api/health")
def root():
    return {"name": "施工方案审查平台", "status": "ok"}


# 同源托管前端构建产物（frontend/dist），单 URL 访问，免代理/CORS
_DIST = os.path.join(os.path.dirname(BASE), 'frontend', 'dist')
if os.path.exists(_DIST):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="static")


# 缓存策略：index.html(及/)禁止缓存，带内容哈希的 /assets/* 长缓存。
# 避免浏览器长期缓存「上线前」旧构建导致界面“丢功能/资源 404”。
@app.middleware("http")
async def cache_control(request: Request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p == "/" or p.endswith(".html"):
        resp.headers["Cache-Control"] = "no-cache"
    elif p.startswith("/assets/"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
