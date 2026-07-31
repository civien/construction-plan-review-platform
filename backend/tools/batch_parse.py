#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量把 施工方案评审规则/ 下 34 个 .md 解析为 backend/rules/<slug>.json。
- category 由目录名映射为简短一级大类名（见 CAT_MAP）
- type 用文件名 slug（去 .md / -SKILL / 审查要点），唯一稳定
- 复用 md_to_rule.convert()
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from md_to_rule import convert

SRC = "/Users/civien/WorkBuddy/深基坑施工方案/施工方案评审规则"
OUT = "/Users/civien/WorkBuddy/施工方案审查平台/backend/rules"

CAT_MAP = {
    "基坑工程专项施工方案的详细评审要点": "基坑工程",
    "脚手架工程方案审查要点": "脚手架工程",
    "模板及支撑体系工程审查要点": "模板及支撑体系工程",
    "起重吊装及安装拆卸工程审查要点": "起重吊装及安装拆卸工程",
    "风电工程施工方案": "风电工程",
    "光伏工程施工方案": "光伏工程",
    "人工挖孔桩工程施工方案": "人工挖孔桩工程",
    "暗挖工程施工方案审查要点": "暗挖工程",
    "临时用电工程施工方案审查要点": "临时用电工程",
    "钢结构安装工程专项施工方案评审要点": "钢结构安装工程",
}

def slug(fname):
    s = os.path.splitext(fname)[0]
    s = s.replace('-SKILL', '').replace('审查要点', '')
    return s

def main():
    os.makedirs(OUT, exist_ok=True)
    count = 0
    for root, _, files in os.walk(SRC):
        for f in sorted(files):
            if not f.endswith('.md'):
                continue
            md = os.path.join(root, f)
            rule = convert(md)
            rule['type'] = slug(f)
            cat = os.path.basename(root)
            rule['category'] = CAT_MAP.get(cat, cat)
            out = os.path.join(OUT, slug(f) + '.json')
            with open(out, 'w', encoding='utf-8') as fp:
                json.dump(rule, fp, ensure_ascii=False, indent=2)
            print('OK %s | cat=%s | severe=%d norm=%d check=%d quick=%d cross=%d' % (
                slug(f), rule['category'], len(rule['severe_defects']),
                len(rule['norm_versions']), len(rule['checklist']),
                len(rule['quick_conflict_checks']), len(rule['cross_chapter_checks'])))
            count += 1
    print('TOTAL=%d' % count)

if __name__ == '__main__':
    main()
