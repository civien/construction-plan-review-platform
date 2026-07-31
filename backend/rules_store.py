#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rules_store.py — 规则仓库（与类型无关，每种方案类型一个 JSON 文件）
文件: rules/<type>.json
"""
import os, json, glob

RULES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rules')


def _path(type_):
    return os.path.join(RULES_DIR, f"{type_}.json")


def list_types():
    out = []
    for fp in sorted(glob.glob(os.path.join(RULES_DIR, '*.json'))):
        try:
            d = json.load(open(fp, encoding='utf-8'))
        except Exception:
            continue
        out.append({
            'type': d.get('type', os.path.splitext(os.path.basename(fp))[0]),
            'name': d.get('name', ''),
            'description': d.get('description', ''),
        })
    return out


def get_rule(type_):
    fp = _path(type_)
    if not os.path.exists(fp):
        return None
    return json.load(open(fp, encoding='utf-8'))


def save_rule(type_, data):
    os.makedirs(RULES_DIR, exist_ok=True)
    data['type'] = type_
    with open(_path(type_), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return True


def delete_rule(type_):
    fp = _path(type_)
    if os.path.exists(fp):
        os.remove(fp)
        return True
    return False


def types_tree():
    """返回二级树：[{category, sub_types:[{type,name,display_name}]}]"""
    tree, order = {}, []
    for fp in sorted(glob.glob(os.path.join(RULES_DIR, '*.json'))):
        try:
            d = json.load(open(fp, encoding='utf-8'))
        except Exception:
            continue
        cat = d.get('category', '未分类')
        if cat not in tree:
            tree[cat] = []
            order.append(cat)
        tree[cat].append({
            'type': d.get('type', os.path.splitext(os.path.basename(fp))[0]),
            'name': d.get('name', ''),
            'display_name': d.get('display_name', d.get('name', '')),
        })
    return [{'category': c, 'sub_types': tree[c]} for c in order]


def new_rule_template(type_):
    return {
        "type": type_,
        "name": type_,
        "display_name": "新方案类型",
        "category": "",
        "applicable_scope": "",
        "cover_chapters": "",
        "description": "请填写该类型方案的审查要点说明",
        "severe_defects": [
            {"no": "1", "category": "通用", "desc": "未明确主要施工工艺。", "location": "", "keywords": []}
        ],
        "norm_versions": {
            "GB 55003-2021": {"latest": "GB 55003-2021", "wrong": "", "note": "强制性通用规范，必含"}
        },
        "checklist": [
            {"chapter": "2.1 整体评审", "subtag": "文本针对性", "req": "方案是否结合本工程特点编制专属措施？"}
        ],
        "quick_conflict_checks": [
            {"item": "示例矛盾检测项", "keywords": ["关键词A", "关键词B"], "check": "相关描述应保持一致"}
        ],
        "cross_chapter_checks": [
            {"key": "开挖深度", "chapters": "概况↔计算书", "problem": ""}
        ],
    }
