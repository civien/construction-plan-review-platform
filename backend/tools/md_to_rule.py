#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P0 POC: 把 2.0 规则 .md 解析为平台规则 JSON。

支持两类格式：
  - 普通 .md：以 `# 标题` + `**适用范围**` 开头
  - -SKILL.md：额外带 YAML 风格 frontmatter（name: / ## description:）

解析目标字段（与 2.0 扩展 schema 对齐）：
  name / type / display_name / category / applicable_scope / cover_chapters /
  description / severe_defects / norm_versions / checklist /
  quick_conflict_checks / cross_chapter_checks

用法: python md_to_rule.py <input.md> [output.json]
"""
import os, re, json, sys

# ---------- 基础工具 ----------

def read_text(p):
    with open(p, encoding='utf-8', errors='ignore') as f:
        return f.read()

def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()

def split_sections(text):
    lines = text.splitlines()
    secs = []
    for i, l in enumerate(lines):
        m = re.match(r'^(#{1,4})\s+(.*)', l)
        if m:
            secs.append({'level': len(m.group(1)), 'title': m.group(2).strip(), 'start': i})
    for k, s in enumerate(secs):
        end = len(lines)
        for s2 in secs[k+1:]:
            if s2['level'] <= s['level']:
                end = s2['start']
                break
        s['lines'] = lines[s['start']:end]
    return secs

def find_tables(section_lines):
    tables, i, n = [], 0, len(section_lines)
    while i < n:
        l = section_lines[i]
        if l.strip().startswith('|') and i+1 < n and re.match(r'^\s*\|[\s:|-]+\|\s*$', section_lines[i+1].strip()):
            header = [c.strip() for c in l.strip().strip('|').split('|')]
            rows, j = [], i+2
            while j < n and section_lines[j].strip().startswith('|'):
                rows.append([c.strip() for c in section_lines[j].strip().strip('|').split('|')])
                j += 1
            tables.append({'header': header, 'rows': rows})
            i = j
        else:
            i += 1
    return tables

def extract_kw(s):
    # 兼容中文引号“”与 ASCII 引号" "
    ks = re.findall(r'[“"]([^”"]+)[”"]', s)
    if ks:
        return [k.strip() for k in ks]
    return [k.strip() for k in re.split(r'[、，,；;]\s*', s) if k.strip() and len(k) < 25]

# ---------- 各字段解析 ----------

def parse_frontmatter(text):
    name = desc = None
    m = re.search(r'^name:\s*["\']?([^"\'\n]+)["\']?', text, re.M)
    if m:
        name = m.group(1).strip().strip('"\'')
    m = re.search(r'description:\s*"([^"]+)"', text)
    if m:
        desc = m.group(1).strip()
    return name, desc

def parse_severe(secs):
    severe_tbl = guide_tbl = None
    for s in secs:
        if s['level'] == 2 and '严重缺陷清单' in s['title'] and '定位' not in s['title']:
            t = find_tables(s['lines'])
            if t:
                severe_tbl = t[0]
        if '定位指南' in s['title']:
            t = find_tables(s['lines'])
            if t:
                guide_tbl = t[0]
    severe = []
    if severe_tbl:
        for r in severe_tbl['rows']:
            if len(r) >= 3 and re.match(r'^\d+$', r[0].strip()):
                severe.append({'no': r[0].strip(), 'category': r[1], 'desc': clean(r[2])})
    if guide_tbl and severe:
        for i, r in enumerate(guide_tbl['rows']):
            if i < len(severe) and len(r) >= 4:
                severe[i]['location'] = r[2]
                severe[i]['keywords'] = extract_kw(r[3])
    return severe

def parse_norm(secs):
    out = {}
    for s in secs:
        if '规范版本' in s['title']:
            for t in find_tables(s['lines']):
                for r in t['rows']:
                    if len(r) >= 3:
                        out[r[0]] = {
                            'latest': r[1] if len(r) > 1 else '',
                            'wrong': r[2] if len(r) > 2 else '',
                            'note': r[3] if len(r) > 3 else '',
                        }
    return out

def parse_cross(secs):
    out = []
    for s in secs:
        if '跨章节一致性' in s['title']:
            for t in find_tables(s['lines']):
                for r in t['rows']:
                    if len(r) >= 3:
                        out.append({'key': r[0], 'chapters': r[1], 'problem': clean(r[2])})
    return out

def parse_checklist(secs):
    out = []
    for s in secs:
        if re.match(r'^2\.\d+', s['title']) and not any(
            k in s['title'] for k in ('快速矛盾', '跨章节', '规范版本')):
            chapter = s['title']
            for l in s['lines'][1:]:
                m = re.match(r'^\s*-\s*\**【([^】]+)】\**\s*(.*)', l)
                if m:
                    out.append({'chapter': chapter, 'subtag': m.group(1), 'req': clean(m.group(2))})
    return out

def parse_quick(secs):
    out = []
    for s in secs:
        if '快速矛盾' in s['title']:
            cur = None
            for l in s['lines'][1:]:
                m = re.match(r'^\s*-?\s*\**检测项\d+[：:]\s*(.*)', l)
                if m:
                    if cur:
                        out.append(cur)
                    item = re.sub(r'^\*+|\*+$', '', clean(m.group(1)))
                    cur = {'item': item, 'keywords': [], 'check': ''}
                    continue
                if cur:
                    if '关键词' in l:
                        tail = re.sub(r'^.*关键词[：:]\s*', '', l)
                        cur['keywords'].extend(extract_kw(tail))
                    elif '检查要点' in l:
                        cur['check'] = clean(re.sub(r'^.*检查要点[：:]\s*', '', l))
            if cur:
                out.append(cur)
    return out

# ---------- 主转换 ----------

def convert(md_path):
    text = read_text(md_path)
    secs = split_sections(text)
    name, desc = parse_frontmatter(text)
    h1 = ''
    for s in secs:
        if s['level'] == 1:
            h1 = s['title']
            break
    scope = re.search(r'\*{0,2}适用范围\*{0,2}\s*[:：]\s*(.*)', text)
    cover = re.search(r'\*{0,2}覆盖章节\*{0,2}\s*[:：]\s*(.*)', text)
    category = os.path.basename(os.path.dirname(md_path))
    fname = os.path.splitext(os.path.basename(md_path))[0]
    type_id = name if name else fname
    return {
        'name': name,
        'type': type_id,
        'display_name': h1,
        'category': category,
        'applicable_scope': clean(scope.group(1)) if scope else '',
        'cover_chapters': clean(cover.group(1)) if cover else '',
        'description': desc,
        'severe_defects': parse_severe(secs),
        'norm_versions': parse_norm(secs),
        'checklist': parse_checklist(secs),
        'quick_conflict_checks': parse_quick(secs),
        'cross_chapter_checks': parse_cross(secs),
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: md_to_rule.py <input.md> [output.json]')
        sys.exit(1)
    rule = convert(sys.argv[1])
    js = json.dumps(rule, ensure_ascii=False, indent=2)
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(js)
        print('wrote %s | severe=%d norm=%d checklist=%d quick=%d cross=%d' % (
            sys.argv[2], len(rule['severe_defects']), len(rule['norm_versions']),
            len(rule['checklist']), len(rule['quick_conflict_checks']),
            len(rule['cross_chapter_checks'])))
    else:
        print(js)
