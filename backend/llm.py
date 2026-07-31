#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
llm.py — 国产大模型客户端（OpenAI 兼容 Chat Completions）
支持 DeepSeek / 通义千问 / 智谱 GLM / Kimi，base_url+api_key+model 可配置。
"""
import json
import requests

PROVIDERS = {
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-v4-flash",
        "models": ["deepseek-chat", "deepseek-reasoner",
                   "deepseek-v4-flash", "deepseek-v4-pro"],
    },
    "qwen": {
        "label": "通义千问 Qwen",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-plus",
        "models": ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long"],
    },
    "zhipu": {
        "label": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "models": ["glm-4-flash", "glm-4-plus", "glm-4-air", "glm-4-long"],
    },
    "kimi": {
        "label": "Kimi 月之暗面",
        "base_url": "https://api.moonshot.cn/v1",
        "default_model": "moonshot-v1-8k",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    },
}

# 全文送入大模型的最大字符数（约 3~4 万 token，按模型上下文调整）
MAX_FULLTEXT_CHARS = 100000


def resolve_base_url(provider, base_url):
    if base_url and base_url.strip():
        return base_url.strip().rstrip('/')
    info = PROVIDERS.get(provider, {})
    return info.get('base_url', '')


def call_llm(settings, system_prompt, user_prompt, expect_json=True, timeout=180):
    """调用 OpenAI 兼容 /chat/completions，返回模型文本。"""
    provider = settings.get('provider', 'deepseek')
    api_key = (settings.get('api_key') or '').strip()
    model = (settings.get('model') or '').strip() or PROVIDERS.get(provider, {}).get('default_model', '')
    base_url = resolve_base_url(provider, settings.get('base_url', ''))
    if not api_key:
        raise ValueError("未配置 api_key")
    if not base_url:
        raise ValueError("未配置 base_url 且供应商无内置地址")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": float(settings.get('temperature', 0.2)),
    }
    if expect_json:
        payload["response_format"] = {"type": "json_object"}

    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    if resp.status_code != 200:
        body = resp.text[:400]
        # 解析端点返回的“可用模型名”提示，便于前端直接告知用户
        m = __import__('re').search(
            r"supported[^.]*?model[^.]*?are\s*([^,\"\._]+)", body, __import__('re').I)
        hint = f"；该端点支持的模型名可能为：{m.group(1).strip()}" if m else ""
        raise RuntimeError(f"大模型返回 {resp.status_code}: {body}{hint}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def test_connection(settings):
    """返回 {'ok': bool, 'message': str}"""
    try:
        system = "你是施工方案审查助手。请只回复：连接正常。"
        user = "ping"
        text = call_llm(settings, system, user, expect_json=False, timeout=30)
        return {"ok": True, "message": f"连接成功，模型回复：{text[:60]}"}
    except Exception as e:  # noqa
        return {"ok": False, "message": f"连接失败：{e}"}


def build_review_messages(rules, full_text, skeleton):
    """组装审查 Prompt：系统提示 + 规则 + 全文 + 机械分析骨架。"""
    severe = "\n".join(
        f"{s.get('no','')}. {s.get('desc','')}"
        + (f"（常见位置：{s.get('location','')}；定位关键词：{','.join(s.get('keywords',[]))}）"
           if s.get('location') or s.get('keywords') else "")
        for s in rules.get('severe_defects', []))
    norm = "\n".join(
        f"- {c}：有效版本 {v.get('latest', c)}"
        + (f"（{v.get('name','')}）" if v.get('name') else "")
        + (f"，常见错误版本：{v.get('wrong','')}" if v.get('wrong') else "")
        + (f"；{v.get('note','')}" if v.get('note') else "")
        for c, v in (rules.get('norm_versions', {}) or {}).items())
    cross = "\n".join(
        f"- {item.get('key','')}：需比对章节 {item.get('chapters','')}"
        + (f"；常见问题：{item.get('problem','')}" if item.get('problem') else "")
        for item in rules.get('cross_chapter_checks', []))
    quick = "\n".join(
        f"- {item.get('item','')}：搜索关键词 {item.get('keywords',[])}"
        + (f"；检查要点：{item.get('check','')}" if item.get('check') else "")
        for item in rules.get('quick_conflict_checks', []))
    # 核查清单按章节分组
    chapters = {}
    for c in rules.get('checklist', []) or []:
        chapters.setdefault(c.get('chapter', '其它'), []).append(c)
    checklist_parts = []
    for ch, items in chapters.items():
        checklist_parts.append(f"### {ch}")
        for c in items:
            tag = c.get('subtag', '')
            checklist_parts.append(f"- {('【'+tag+'】') if tag else ''}{c.get('req','')}")
    checklist = "\n".join(checklist_parts)

    system = (
        "你是一位资深的建设工程施工方案审查专家，熟悉《危险性较大的分部分项工程安全管理规定》"
        "及住建部专项施工方案严重缺陷清单。你的任务是依据给定的【审查规则】对【施工方案全文】做符合性审查，"
        "逐条给出专业、可落地的审查意见。\n"
        "要求：\n"
        "1. 严格基于规则与文档事实，不臆造；对‘是否满足’给出明确判定。\n"
        "2. 每条意见需能定位到原文：anchor 必须是文档中真实存在的【连续子串】（建议取 6~20 字的关键句），"
        "用于在高亮批注中锚定。若无法定位到具体句，可给出章节名作为 anchor（可能追加到文末）。\n"
        "3. severity 取值：严重 / 中 / 轻 / 待核 / 总评。严重缺陷（一票否决）命中时标‘严重’。\n"
        "4. text 为批注正文，可含换行，说明问题、依据与整改建议，简洁专业。\n"
        "5. 必须包含一条 severity='总评' 的全局结论。\n"
        "6. 对【快速矛盾检测项】中的每组关键词，请在全文交叉比对，若同一参数前后描述不一致（如深度、强度、荷载、尺寸），"
        "给出 severity='中' 的 finding 并指出矛盾点；对【规范版本有效性表】请核对文档引用版本是否过期；"
        "对【跨章节一致性检查项】请核对关联章节数值是否一致。\n"
        "7. 只输出 JSON 对象，格式：{\"findings\": [ {\"anchor\": \"...\", \"severity\": \"...\", \"text\": \"...\"} ]}，"
        "不要输出任何额外说明文字。"
    )

    user = (
        f"# 审查规则（{rules.get('name','')}）\n"
        f"## 严重缺陷清单（一票否决，逐条确认是否触发）\n{severe}\n\n"
        f"## 规范版本有效性表（有效版本须据此核对）\n{norm}\n\n"
        f"## 跨章节一致性检查项\n{cross}\n\n"
        f"## 快速矛盾检测项（请交叉比对文档中这些关键词，判定前后是否矛盾）\n{quick}\n\n"
        f"## 核查清单要点（按章节分类）\n{checklist}\n\n"
        f"# 机械分析骨架（结构缺口/规范版本/快速矛盾命中，供你参考，最终判定以你结合全文为准）\n"
        f"{json.dumps(skeleton, ensure_ascii=False, indent=2)[:6000]}\n\n"
        f"# 施工方案全文\n{full_text[:MAX_FULLTEXT_CHARS]}\n\n"
        "请按上述要求输出 findings JSON。"
    )
    if len(full_text) > MAX_FULLTEXT_CHARS:
        user += f"\n（注：原文过长已截断至 {MAX_FULLTEXT_CHARS} 字，如需完整审查请分章节处理。）"
    return system, user


def parse_findings(text):
    """从模型返回中解析 findings 列表，失败抛异常。"""
    text = text.strip()
    if text.startswith('```'):
        text = text.strip('`')
        if text.startswith('json'):
            text = text[4:]
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        # 尝试抽取第一个 {...}
        m = __import__('re').search(r'\{.*\}', text, __import__('re').S)
        if not m:
            raise ValueError("无法解析大模型返回的 JSON")
        obj = json.loads(m.group(0))
    findings = obj.get('findings')
    if not isinstance(findings, list):
        raise ValueError("返回结构缺少 findings 数组")
    out = []
    for f in findings:
        if not isinstance(f, dict):
            continue
        out.append({
            'anchor': str(f.get('anchor', '')),
            'severity': str(f.get('severity', '轻')),
            'text': str(f.get('text', '')),
        })
    return out


if __name__ == '__main__':
    print("providers:", list(PROVIDERS.keys()))
