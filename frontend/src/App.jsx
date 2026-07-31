import React, { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', ico: '🧠' },
  { id: 'qwen', name: '通义千问', ico: '🌟' },
  { id: 'zhipu', name: '智谱 AI', ico: '📐' },
  { id: 'kimi', name: 'Kimi', ico: '🌙' },
];

function useToast() {
  const [msg, setMsg] = useState('');
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  return [msg, show];
}

/* 二级树组件：categories=[{category, sub_types:[{type,name,display_name}]}] */
function TypeTree({ categories, active, onPick, filter }) {
  const [collapsed, setCollapsed] = useState({});
  const low = (filter || '').trim();
  const cats = categories
    .map((c) => ({ ...c, sub_types: c.sub_types.filter((s) => !low || (s.display_name || s.name || s.type).includes(low)) }))
    .filter((c) => c.sub_types.length);
  return (
    <div>
      <input className="tree-search" placeholder="搜索方案类型…" value={filter} onChange={(e) => onPick.setFilter(e.target.value)} />
      {cats.map((c) => (
        <div className={'cat' + (collapsed[c.category] ? ' collapsed' : '')} key={c.category}>
          <div className="cat-h" onClick={() => setCollapsed((s) => ({ ...s, [c.category]: !s[c.category] }))}>
            <span className="arr">▾</span><span>{c.category}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--muted-l)', fontSize: 11 }}>{c.sub_types.length}</span>
          </div>
          <div className="subs">
            {c.sub_types.map((s) => (
              <div key={s.type} className={'sub' + (active === s.type ? ' active' : '')}
                onClick={() => onPick.pick(s.type, s.display_name || s.name)}>
                <span className="dot" />{s.display_name || s.name}
              </div>
            ))}
          </div>
        </div>
      ))}
      {cats.length === 0 && <div style={{ color: 'var(--muted-l)', padding: 12 }}>无匹配类型</div>}
    </div>
  );
}

/* ---------------- 审查工作台 ---------------- */
function ReviewPage({ selectedType, setSelectedType, matchedName, setMatchedName, onJumpToRule }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState('deepseek-v4-flash');
  const [provider, setProvider] = useState('deepseek');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [types, setTypes] = useState([]);
  const [filter, setFilter] = useState('');
  const [toast, showToast] = useToast();

  useEffect(() => {
    api.getTypes().then((d) => setTypes(d.types || [])).catch(() => showToast('加载方案类型失败'));
  }, []);

  const pick = useCallback((type, name) => { setSelectedType(type); setMatchedName(name); }, []);
  const onFile = (e) => setFile(e.target.files[0]);

  const start = async () => {
    if (!selectedType) return showToast('请先选择方案类型');
    if (!file) return showToast('请先上传施工方案 .docx');
    setBusy(true); setResult(null);
    try {
      const r = await api.review(selectedType, file);
      setResult(r);
      showToast('审查完成 ✔');
    } catch (err) {
      showToast('审查失败：' + err.message);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-title">审查工作台</div>
      <div className="page-sub">选择方案类型（自动匹配规则）→ 上传方案 → 启动审查。覆盖严重缺陷核查、详细核查清单、快速矛盾检测（2.0 新增）、跨章节一致性、规范版本核查。</div>
      <div className="work">
        <div className="tree">
          <TypeTree categories={types} active={selectedType} filter={filter}
            onPick={{ pick, setFilter }} />
        </div>
        <div>
          <div className={'matchbar' + (selectedType ? '' : ' empty') + (selectedType && onJumpToRule ? ' clickable' : '')}
               onClick={() => { if (selectedType && onJumpToRule) onJumpToRule(selectedType); }}>
            <span className="ok">●</span>
            <span>{selectedType
              ? <><b>已匹配规则：</b>{matchedName}<span className="jump-hint">查看规则 ›</span></>
              : '请先在左侧选择二级方案类型，系统将自动匹配对应审查规则'}</span>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-h"><h3>📄 上传施工方案</h3><span className="tag">支持 .docx</span></div>
            <label className={'upload' + (selectedType ? '' : ' disabled')}>
              <div className="big">⬆</div>
              {file ? `已选择：${file.name}` : '点击或拖拽施工方案文件到此处'}
              <input type="file" accept=".docx" hidden onChange={onFile} />
            </label>
            <div className="field">
              <label>审查模型</label>
              <div className="row2">
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="text" value={model} list="models" onChange={(e) => setModel(e.target.value)} />
                <datalist id="models">
                  <option value="deepseek-v4-flash" /><option value="deepseek-v4-pro" /><option value="deepseek-chat" />
                </datalist>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button className="btn" disabled={!selectedType || busy} onClick={start}>
                {busy ? <><span className="spin" /> 审查中…</> : '🚀 启动审查'}
              </button>
            </div>
          </div>

          <div className="card">
            {!result ? (
              <div className="empty-state"><div className="big">🗂</div>
                选择方案类型并上传文件后，审查结果将在此展示<br />
                <span style={{ fontSize: 12.5 }}>结果含：严重缺陷核查 · 详细核查清单 · 快速矛盾检测 · 跨章节一致性 · 规范版本核查</span>
              </div>
            ) : (
              <>
                <div className="card-h"><h3>📋 审查结果</h3>
                  <span style={{display:'flex',alignItems:'center',gap:8}}>
                    {result.rating && <GradeBadge rating={result.rating} />}
                    <span className="tag">{result.used_llm ? '大模型判读' : '机械分析'}</span>
                  </span></div>
                {result.findings?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    {result.findings.map((f, i) => (
                      <div className="find" key={i}>
                        <span className={'sev sev-' + (f.severity || '轻')}>{f.severity || '轻'}</span>
                        <div>{f.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                {result.report && (
                  <div>
                    <div className="card-h" style={{ marginTop: 6 }}><h3>📝 审查报告</h3></div>
                    <pre className="report">{result.report}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- 规则管理 ---------------- */
function RulesPage({ focusType }) {
  const [types, setTypes] = useState([]);
  const [filter, setFilter] = useState('');
  const [activeType, setActiveType] = useState('');
  const [rule, setRule] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const loadTypes = () => api.getTypes().then((d) => setTypes(d.types || [])).catch(() => showToast('加载类型失败'));
  useEffect(() => { loadTypes(); }, []);

  const pick = useCallback((type) => {
    setActiveType(type); setEditing(false);
    api.getRule(type).then(setRule).catch(() => showToast('加载规则失败'));
  }, []);

  // 从审查工作台点击「已匹配规则」跳转过来时，自动打开并定位该规则
  useEffect(() => {
    if (focusType && types.length) {
      pick(focusType);
      const el = document.querySelector('.content');
      if (el) el.scrollTop = 0;
    }
  }, [focusType, types, pick]);

  // 进入编辑：复制为可编辑对象，规范版本对象→数组便于逐条编辑
  const startEdit = () => {
    const r = JSON.parse(JSON.stringify(rule || {}));
    r.norm_versions = Object.entries(r.norm_versions || {}).map(([name, v]) => ({
      name, latest: v?.latest || '', wrong: v?.wrong || '', note: v?.note || '',
    }));
    if (!Array.isArray(r.severe_defects)) r.severe_defects = [];
    if (!Array.isArray(r.checklist)) r.checklist = [];
    if (!Array.isArray(r.quick_conflict_checks)) r.quick_conflict_checks = [];
    if (!Array.isArray(r.cross_chapter_checks)) r.cross_chapter_checks = [];
    setDraft(r); setEditing(true);
  };

  const save = async () => {
    try {
      setBusy(true);
      const out = JSON.parse(JSON.stringify(draft));
      // 规范版本：数组 → 对象（以规范名为 key）
      out.norm_versions = Object.fromEntries(
        (draft.norm_versions || [])
          .map((n) => [(n.name || '').trim(), { latest: n.latest || '', wrong: n.wrong || '', note: n.note || '' }])
          .filter(([k]) => k)
      );
      // 关键词：逗号字符串 → 数组
      for (const it of (out.severe_defects || [])) it.keywords = toArr(it.keywords);
      for (const it of (out.quick_conflict_checks || [])) it.keywords = toArr(it.keywords);
      await api.saveRule(activeType, out);
      const fresh = await api.getRule(activeType);
      setRule(fresh); setEditing(false);
      showToast('已保存 ✔');
    } catch (e) { showToast('保存失败：' + e.message); }
    finally { setBusy(false); }
  };

  const addNew = async () => {
    // type 即唯一 ID，同时作为 backend/rules/ 下的文件名；可为中文或拼音
    const type = prompt('新规则 type（唯一 ID，同时作为文件名，如「卸料平台专项施工方案-落地盘扣」或 smw-gongfa-zhuang）：');
    if (!type) return;
    const name = prompt('请输入规则显示名称：', type) || type;
    // 预填：沿用当前正在查看的规则所属一级大类，少打一次
    const category = prompt('请输入一级大类（如 基坑工程 / 脚手架）：', rule?.category || '未分类') || '未分类';
    // 若正在查看某条规则，提供「以当前规则为模板」的克隆选项
    const clone = rule && confirm(`是否以当前规则「${rule.display_name || rule.name}」的内容作为模板？\n（确定=复制其全部章节内容，只需改差异；取消=空白模板）`);
    try {
      // 先建（含 type 唯一性 409 校验 + 空白模板落盘）
      await api.newRule({ type, name, category });
      if (clone) {
        const payload = JSON.parse(JSON.stringify(rule));
        payload.type = type; payload.name = type; payload.display_name = name; payload.category = category;
        await api.saveRule(type, payload);
      }
      await loadTypes();
      pick(type);
      showToast(clone ? '已基于当前规则克隆，可编辑' : '已新增空白规则，可编辑');
    } catch (e) { showToast('新增失败：' + e.message); }
  };

  const del = async () => {
    if (!confirm(`确认删除规则「${activeType}」？`)) return;
    try {
      await api.deleteRule(activeType);
      setActiveType(''); setRule(null); await loadTypes();
      showToast('已删除');
    } catch (e) { showToast('删除失败：' + e.message); }
  };

  return (
    <div>
      <div className="page-title">规则管理</div>
      <div className="page-sub">按「一级大类 → 二级子类型」组织。点击子类型查看规则详情，长内容以可折叠分区呈现，支持编辑 / 新增 / 删除（2.0 新增快速矛盾检测等字段）。</div>
      <div className="work">
        <div className="tree">
          <TypeTree categories={types} active={activeType} filter={filter}
            onPick={{ pick, setFilter }} />
        </div>
        <div className="card">
          <div className="card-h">
            <h3>{rule ? (rule.display_name || rule.name) : '规则详情'}</h3>
            <span className="tag">{rule ? '大类：' + (rule.category || '—') : '选择左侧子类型查看'}</span>
          </div>
          {!rule ? (
            <div className="empty-state"><div className="big">📚</div>从左侧选择一项审查规则以查看详情</div>
          ) : (
            <div className="rule-scroll">
              {editing ? (
                <RuleEditor draft={draft} onChange={setDraft} />
              ) : (
                <RuleView rule={rule} onEdit={startEdit} />
              )}
            </div>
          )}
          {rule && !editing && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button className="btn ghost" onClick={startEdit}>✎ 编辑规则</button>
              <button className="btn ghost" onClick={addNew}>＋ 新增规则</button>
              <button className="btn danger" onClick={del}>🗑 删除</button>
            </div>
          )}
          {rule && editing && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button className="btn" onClick={save} disabled={busy}>{busy ? '保存中…' : '💾 保存'}</button>
              <button className="btn ghost" onClick={() => setEditing(false)}>取消</button>
            </div>
          )}
          {!rule && (
            <div style={{ marginTop: 14 }}>
              <button className="btn ghost" onClick={addNew}>＋ 新增规则</button>
            </div>
          )}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Acc({ icon, color, title, count, badge, children, def = true }) {
  const [open, setOpen] = useState(def);
  return (
    <div className={'acc' + (open ? ' open' : '')}>
      <div className="acc-h" onClick={() => setOpen((o) => !o)}>
        <span className={'acc-ico ' + color}>{icon}</span>{title}
        {count != null && <span className={'badge ' + (badge || 'b-mut')} style={{ marginLeft: 8 }}>{count}</span>}
        <span className="arr">▶</span>
      </div>
      <div className="acc-b">{children}</div>
    </div>
  );
}

function RuleView({ rule }) {
  const sevs = rule.severe_defects || [];
  const norms = Object.entries(rule.norm_versions || {});
  const quick = rule.quick_conflict_checks || [];
  const cross = rule.cross_chapter_checks || [];
  const chk = rule.checklist || [];
  return (
    <>
      {rule.applicable_scope && <div className="hint" style={{ marginTop: 0, marginBottom: 14 }}>适用范围：{rule.applicable_scope}</div>}
      <Acc icon="!" color="ic-red" title="专用严重缺陷清单" count={sevs.length} badge="b-warn" def>
        <table><thead><tr><th style={{ width: 34 }}>#</th><th>缺陷情形</th><th>定位章节</th><th>关键词（机器定位）</th></tr></thead>
          <tbody>{sevs.map((s) => (
            <tr key={s.no}><td><span className="sev-no">{s.no}</span></td><td>{s.desc}</td>
              <td style={{ color: 'var(--muted)' }}>{s.location}</td><td>{(s.keywords || []).map((k) => <span className="kw" key={k}>{k}</span>)}</td></tr>
          ))}</tbody></table>
      </Acc>
      <Acc icon="✓" color="ic-yellow" title="规范版本有效性核查" count={norms.length} badge="b-ok">
        <table><thead><tr><th>规范名称</th><th>最新版本</th><th>已废止/旧版</th><th>说明</th></tr></thead>
          <tbody>{norms.map(([n, v]) => (
            <tr key={n}><td>{n}</td><td><span className="badge b-ok">{v.latest}</span></td>
              <td>{v.wrong ? <span className="badge b-warn">{v.wrong}</span> : <span style={{ color: 'var(--muted-l)' }}>—</span>}</td>
              <td style={{ color: 'var(--muted)' }}>{v.note}</td></tr>
          ))}</tbody></table>
      </Acc>
      <Acc icon="☰" color="ic-blue" title="详细核查清单（2.2–2.10）" count={chk.length} badge="b-ver">
        <div className="hint">共 {chk.length} 条「是否…」核查项（工程概况 / 编制依据 / 施工计划 / 工艺技术 / 保证措施 / 管理分工 / 验收 / 应急 / 计算书图纸）。编辑模式下可见完整 JSON。</div>
      </Acc>
      <Acc icon="⚡" color="ic-orange" title="快速矛盾检测（2.1.1 · 2.0 新增）" count={quick.length} badge="b-warn">
        <table><thead><tr><th>检测项</th><th>搜索关键词</th><th>一致性检查要点</th></tr></thead>
          <tbody>{quick.map((q, i) => (
            <tr key={i}><td>{q.item}</td><td>{(q.keywords || []).map((k) => <span className="kw" key={k}>{k}</span>)}</td>
              <td style={{ color: 'var(--muted)' }}>{q.check}</td></tr>
          ))}</tbody></table>
      </Acc>
      <Acc icon="⇄" color="ic-green" title="跨章节一致性检查（2.11）" count={cross.length} badge="b-ok">
        <table><thead><tr><th>一致性检查项</th><th>关联章节</th><th>常见问题示例</th></tr></thead>
          <tbody>{cross.map((x, i) => (
            <tr key={i}><td>{x.key}</td><td style={{ color: 'var(--muted)' }}>{x.chapters}</td><td style={{ color: 'var(--muted)' }}>{x.problem}</td></tr>
          ))}</tbody></table>
      </Acc>
    </>
  );
}

/* 结构化规则编辑器：各章节逐条「改/增/删」，顶层字段可改 */
function kwStr(k) { return Array.isArray(k) ? k.join('，') : (k || ''); }
const toArr = (v) => (typeof v === 'string' ? v.split(/[，,]/).map((s) => s.trim()).filter(Boolean) : (Array.isArray(v) ? v : []));

function RuleEditor({ draft, onChange }) {
  const setField = (section, idx, field, value) => {
    const next = { ...draft };
    if (section === 'norm_versions') {
      next.norm_versions = (draft.norm_versions || []).map((n, i) => (i === idx ? { ...n, [field]: value } : n));
    } else {
      next[section] = (draft[section] || []).map((it, i) => (i === idx ? { ...it, [field]: value } : it));
    }
    onChange(next);
  };
  const delItem = (section, idx) => {
    const next = { ...draft };
    if (section === 'norm_versions') {
      next.norm_versions = (draft.norm_versions || []).filter((_, i) => i !== idx);
    } else {
      next[section] = (draft[section] || []).filter((_, i) => i !== idx);
    }
    onChange(next);
  };
  const addItem = (section, blank) => {
    const next = { ...draft };
    if (section === 'norm_versions') {
      next.norm_versions = [...(draft.norm_versions || []), blank];
    } else {
      next[section] = [...(draft[section] || []), blank];
    }
    onChange(next);
  };

  const severe = draft.severe_defects || [];
  const norms = draft.norm_versions || [];
  const chk = draft.checklist || [];
  const quick = draft.quick_conflict_checks || [];
  const cross = draft.cross_chapter_checks || [];

  const meta = (k, v) => onChange({ ...draft, [k]: v });

  return (
    <div className="editor">
      {/* 基本信息 */}
      <div className="acc open">
        <div className="acc-h"><span className="acc-ico ic-blue">⚙</span>规则基本信息<span className="arr">▶</span></div>
        <div className="acc-b">
          <div className="ef-grid">
            <label>显示名称<input value={draft.display_name || ''} onChange={(e) => meta('display_name', e.target.value)} /></label>
            <label>一级大类<input value={draft.category || ''} onChange={(e) => meta('category', e.target.value)} /></label>
          </div>
          <label>适用范围<textarea rows={2} value={draft.applicable_scope || ''} onChange={(e) => meta('applicable_scope', e.target.value)} /></label>
          <label>涵盖章节<textarea rows={2} value={draft.cover_chapters || ''} onChange={(e) => meta('cover_chapters', e.target.value)} /></label>
          <label>规则说明<textarea rows={2} value={draft.description || ''} onChange={(e) => meta('description', e.target.value)} /></label>
        </div>
      </div>

      {/* 严重缺陷 */}
      <div className="acc open">
        <div className="acc-h"><span className="acc-ico ic-red">!</span>专用严重缺陷清单 <span className="badge b-warn">{severe.length}</span><span className="arr">▶</span></div>
        <div className="acc-b">
          {severe.map((s, i) => (
            <div className="erow" key={i}>
              <div className="erow-h"><b>缺陷 {s.no || i + 1}</b><button className="btn xs danger" onClick={() => delItem('severe_defects', i)}>🗑 删除</button></div>
              <div className="ef-grid">
                <label>类别<input value={s.category || ''} onChange={(e) => setField('severe_defects', i, 'category', e.target.value)} /></label>
                <label>定位章节<input value={s.location || ''} onChange={(e) => setField('severe_defects', i, 'location', e.target.value)} /></label>
              </div>
              <label>缺陷描述<textarea rows={2} value={s.desc || ''} onChange={(e) => setField('severe_defects', i, 'desc', e.target.value)} /></label>
              <label>关键词（逗号分隔）<input value={kwStr(s.keywords)} onChange={(e) => setField('severe_defects', i, 'keywords', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn sm ghost add" onClick={() => addItem('severe_defects', { no: String(severe.length + 1), category: '', desc: '', location: '', keywords: '' })}>＋ 新增缺陷</button>
        </div>
      </div>

      {/* 规范版本 */}
      <div className="acc open">
        <div className="acc-h"><span className="acc-ico ic-yellow">✓</span>规范版本有效性核查 <span className="badge b-ok">{norms.length}</span><span className="arr">▶</span></div>
        <div className="acc-b">
          {norms.map((n, i) => (
            <div className="erow" key={i}>
              <div className="erow-h"><b>规范 {i + 1}</b><button className="btn xs danger" onClick={() => delItem('norm_versions', i)}>🗑 删除</button></div>
              <label>规范名称<input value={n.name || ''} onChange={(e) => setField('norm_versions', i, 'name', e.target.value)} /></label>
              <div className="ef-grid">
                <label>最新版本<input value={n.latest || ''} onChange={(e) => setField('norm_versions', i, 'latest', e.target.value)} /></label>
                <label>已废止/旧版<input value={n.wrong || ''} onChange={(e) => setField('norm_versions', i, 'wrong', e.target.value)} /></label>
              </div>
              <label>说明<input value={n.note || ''} onChange={(e) => setField('norm_versions', i, 'note', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn sm ghost add" onClick={() => addItem('norm_versions', { name: '', latest: '', wrong: '', note: '' })}>＋ 新增规范</button>
        </div>
      </div>

      {/* 详细核查清单 */}
      <div className="acc open">
        <div className="acc-h"><span className="acc-ico ic-blue">☰</span>详细核查清单 <span className="badge b-ver">{chk.length}</span><span className="arr">▶</span></div>
        <div className="acc-b">
          {chk.map((c, i) => (
            <div className="erow" key={i}>
              <div className="erow-h"><b>清单 {i + 1}</b><button className="btn xs danger" onClick={() => delItem('checklist', i)}>🗑 删除</button></div>
              <div className="ef-grid">
                <label>章节<input value={c.chapter || ''} onChange={(e) => setField('checklist', i, 'chapter', e.target.value)} /></label>
                <label>子标签<input value={c.subtag || ''} onChange={(e) => setField('checklist', i, 'subtag', e.target.value)} /></label>
              </div>
              <label>核查要求<textarea rows={2} value={c.req || ''} onChange={(e) => setField('checklist', i, 'req', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn sm ghost add" onClick={() => addItem('checklist', { chapter: '', subtag: '', req: '' })}>＋ 新增清单项</button>
        </div>
      </div>

      {/* 快速矛盾检测 */}
      <div className="acc open">
        <div className="acc-h"><span className="acc-ico ic-orange">⚡</span>快速矛盾检测 <span className="badge b-warn">{quick.length}</span><span className="arr">▶</span></div>
        <div className="acc-b">
          {quick.map((q, i) => (
            <div className="erow" key={i}>
              <div className="erow-h"><b>检测 {i + 1}</b><button className="btn xs danger" onClick={() => delItem('quick_conflict_checks', i)}>🗑 删除</button></div>
              <label>检测项<input value={q.item || ''} onChange={(e) => setField('quick_conflict_checks', i, 'item', e.target.value)} /></label>
              <label>关键词（逗号分隔）<input value={kwStr(q.keywords)} onChange={(e) => setField('quick_conflict_checks', i, 'keywords', e.target.value)} /></label>
              <label>一致性检查要点<textarea rows={2} value={q.check || ''} onChange={(e) => setField('quick_conflict_checks', i, 'check', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn sm ghost add" onClick={() => addItem('quick_conflict_checks', { item: '', keywords: '', check: '' })}>＋ 新增检测项</button>
        </div>
      </div>

      {/* 跨章节一致性 */}
      <div className="acc open">
        <div className="acc-h"><span className="acc-ico ic-green">⇄</span>跨章节一致性检查 <span className="badge b-ok">{cross.length}</span><span className="arr">▶</span></div>
        <div className="acc-b">
          {cross.map((x, i) => (
            <div className="erow" key={i}>
              <div className="erow-h"><b>检查 {i + 1}</b><button className="btn xs danger" onClick={() => delItem('cross_chapter_checks', i)}>🗑 删除</button></div>
              <label>一致性检查项<input value={x.key || ''} onChange={(e) => setField('cross_chapter_checks', i, 'key', e.target.value)} /></label>
              <label>关联章节<input value={x.chapters || ''} onChange={(e) => setField('cross_chapter_checks', i, 'chapters', e.target.value)} /></label>
              <label>常见问题示例<textarea rows={2} value={x.problem || ''} onChange={(e) => setField('cross_chapter_checks', i, 'problem', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn sm ghost add" onClick={() => addItem('cross_chapter_checks', { key: '', chapters: '', problem: '' })}>＋ 新增检查项</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 审查结果（历史留痕） ---------------- */
const RATING_CFG = {
  excellent: { label: '优秀方案', cls: 'grade-excellent', icon: '✅' },
  pass:     { label: '合格方案', cls: 'grade-pass',     icon: '🔵' },
  warn:      { label: '待优化方案', cls: 'grade-warn',   icon: '🟠' },
  fail:      { label: '不合格方案', cls: 'grade-fail',   icon: '❌' },
};

function GradeBadge({ rating }) {
  const c = RATING_CFG[rating] || { label: '未评级', cls: '', icon: '⚪' };
  return <span className={'grade ' + c.cls}>{c.icon} {c.label}</span>;
}

/* 二次审查对比文案：返回「较上次 ↓N 个问题（已改进）/ ↑N / 持平」 */
function reCompare(it) {
  const prev = it.prev_total || 0;
  const cur = it.total || 0;
  if (!prev) return '首次审查后复审';
  const d = prev - cur;
  if (d > 0) return `较上次 ↓${d} 个问题（已改进）`;
  if (d < 0) return `较上次 ↑${-d} 个问题`;
  return '较上次持平';
}

function ReviewHistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);       // 当前查看的详情
  const [reportMd, setReportMd] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    api.getHistory().then((d) => { setItems(d.items || []); setLoading(false); })
      .catch(() => { showToast('加载历史失败'); setLoading(false); });
  }, []);

  const viewReport = async (item) => {
    try {
      const d = await api.getHistoryDetail(item.id);
      setDetail(d);
      setReportMd(d.report_md || '');
      setShowReport(true);
    } catch (e) { showToast('加载报告失败：' + e.message); }
  };

  const exportDocx = (id) => {
    try { api.downloadDocx(id); showToast('正在下载带批注的 docx…'); }
    catch (e) { showToast('下载失败：' + e.message); }
  };

  const delItem = async (it) => {
    if (!confirm(`确认删除「${it.filename}」的审查记录？删除后不可恢复。`)) return;
    try {
      await api.deleteHistory(it.id);
      setItems((arr) => arr.filter((x) => x.id !== it.id));
      if (detail && detail.id === it.id) setShowReport(false);
      showToast('已删除 ✔');
    } catch (e) { showToast('删除失败：' + e.message); }
  };

  /* findings 统计 */
  const sevSummary = (findings) => {
    if (!findings || !findings.length) return '—';
    const m = { 严重:0, 中:0, 轻:0 };
    (Array.isArray(findings) ? findings : []).forEach(f => {
      const s = (f.severity || '轻'); m[s] = (m[s]||0)+1;
    });
    return Object.entries(m).filter(([,v])=>v).map(([k,v])=>`${k}${v}`).join(' / ');
  };

  if (loading) return <div className="empty-state"><div className="big">⏳</div>加载中…</div>;

  return (
    <div>
      <div className="page-title">审查结果</div>
      <div className="page-sub">所有已审查方案的历史留痕。可查看审查报告、导出带批注的 Word 文档（批注直接定位到问题位置）。</div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="big">📋</div>
          暂无审查记录<br />
          <span style={{ fontSize: 12.5 }}>前往「审查工作台」上传施工方案进行审查</span>
        </div>
      ) : (
        <div className="hist-list">
          {items.map((it) => (
            <div className="hist-item" key={it.id}>
              <div className="hist-grade">
                <GradeBadge rating={it.rating || ''} />
                {it.is_re_review ? <span className="re-badge" title="同一方案修改后再次审查">🔁 二次</span> : null}
              </div>
              <div className="hist-info">
                <div className="fname">{it.filename}</div>
                <div className="meta">
                  <span>{it.type_name || it.type}</span>
                  <span>{(it.created_at || '').replace('T',' ')}</span>
                  <span>{it.used_llm ? '大模型判读' : '机械分析'}</span>
                  {it.is_re_review ? <span className="re-cmp">{reCompare(it)}</span> : null}
                </div>
              </div>
              <div className="hist-actions">
                <button className="btn sm ghost" onClick={() => viewReport(it)}>📝 查看报告</button>
                <button className="btn sm ghost" onClick={() => exportDocx(it.id)}>📥 导出批注</button>
                <button className="btn sm danger" onClick={() => delItem(it)}>🗑 删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 报告弹窗 */}
      {showReport && detail && (
        <div className="modal-overlay" onClick={(e) => { if(e.target===e.currentTarget)setShowReport(false) }}>
          <div className="modal">
            <div className="modal-h">
              <h3>📋 审查报告 — {detail.filename}</h3>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <GradeBadge rating={detail.rating || ''} />
                <button className="modal-close" onClick={() => setShowReport(false)}>✕</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom:12 }}>
                <GradeBadge rating={detail.rating || ''} />
                <span style={{ marginLeft:10,color:'var(--muted)',fontSize:12.5 }}>
                  问题分布：{sevSummary(detail.findings)}
                </span>
                {detail.is_re_review ? (
                  <span style={{ marginLeft:10,color:'var(--orange)',fontSize:12.5 }}>
                    🔁 二次审查 · {reCompare(detail)}
                    {detail.prev_rating ? ` · 上次：${RATING_CFG[detail.prev_rating]?.label || detail.prev_rating}` : ''}
                  </span>
                ) : null}
              </div>
              {/* findings 列表 */}
              {detail.findings && detail.findings.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  {detail.findings.map((f, i) => (
                    <div className="find" key={i}>
                      <span className={'sev sev-' + (f.severity || '轻')}>{f.severity || '轻'}</span>
                      <div>{f.text}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* 报告 markdown */}
              <pre className="report" style={{ maxHeight: '50vh' }}>{reportMd}</pre>
            </div>
            <div style={{ padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button className="btn sm ghost" onClick={() => exportDocx(detail.id)}>📥 导出带批注 Word</button>
              <button className="btn sm" onClick={() => setShowReport(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- 模型设置 ---------------- */
function SettingsPage() {
  const [prov, setProv] = useState('deepseek');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    api.getSettings().then((s) => {
      setProv(s.provider || 'deepseek');
      setModel(s.model || 'deepseek-v4-flash');
      setKey(s.has_key ? '••••••••' : '');
    }).catch(() => {});
  }, []);

  const test = async () => {
    setTesting(true); setStatus(null);
    try {
      const r = await api.testLLM({ provider: prov, model, api_key: key === '••••••••' ? '' : key });
      setStatus(r);
      showToast(r.ok ? '连接成功' : '连接失败');
    } catch (e) { setStatus({ ok: false, message: e.message }); }
    finally { setTesting(false); }
  };

  const save = async () => {
    try {
      await api.saveSettings({ provider: prov, model, api_key: key === '••••••••' ? '' : key });
      showToast('设置已保存 ✔');
    } catch (e) { showToast('保存失败：' + e.message); }
  };

  return (
    <div>
      <div className="page-title">模型设置</div>
      <div className="page-sub">配置国产大模型供应商与 API 密钥，用于驱动 LLM 审查。</div>
      <div className="card">
        <div className="card-h"><h3>🔌 选择供应商</h3></div>
        <div className="prov-grid">
          {PROVIDERS.map((p) => (
            <div key={p.id} className={'prov' + (prov === p.id ? ' active' : '')} onClick={() => setProv(p.id)}>
              <div className="pv-ico">{p.ico}</div><div className="pv-name">{p.name}</div>
            </div>
          ))}
        </div>
        <div className="field">
          <label>模型名称</label>
          <input type="text" value={model} list="models2" onChange={(e) => setModel(e.target.value)} />
          <datalist id="models2"><option value="deepseek-v4-flash" /><option value="deepseek-v4-pro" /><option value="deepseek-chat" /></datalist>
        </div>
        <div className="field">
          <label>API Key</label>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-********************" />
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" onClick={test} disabled={testing}>{testing ? '测试中…' : '✓ 测试连接'}</button>
          <button className="btn ghost" onClick={save}>💾 保存设置</button>
          {status && <span className={'badge ' + (status.ok ? 'b-ok' : 'b-warn')}>● {status.ok ? '连接正常' : '连接失败'}</span>}
        </div>
        <div className="hint">提示：默认模型已设为 <b>deepseek-v4-flash</b>。密钥仅保存在本地数据库，不会上传。</div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- 主框架 ---------------- */
export default function App() {
  const [page, setPage] = useState('review');
  const [selectedType, setSelectedType] = useState('');
  const [matchedName, setMatchedName] = useState('');
  const [focusRule, setFocusRule] = useState('');

  const nav = [
    { id: 'review',   ico: '🔍', label: '审查工作台' },
    { id: 'history',  ico: '📋', label: '审查结果' },
    { id: 'rules',    ico: '📚', label: '规则管理' },
    { id: 'model',    ico: '⚙️', label: '模型设置' },
  ];

  // 审查工作台点击「已匹配规则」→ 跳转规则管理并定位该规则
  const jumpToRule = (type) => { setFocusRule(type); setPage('rules'); };

  return (
    <>
      <div className="topbar">
        <div className="logo">审</div>
        <div className="brand">施工方案审查平台 <small>2.0</small></div>
        <div className="spacer" />
        <div className="pill">v2.0</div>
      </div>
      <div className="layout">
        <div className="nav">
          {nav.map((n) => (
            <div key={n.id} className={'nav-item' + (page === n.id ? ' active' : '')} onClick={() => setPage(n.id)}>
              <span className="ico">{n.ico}</span>{n.label}
            </div>
          ))}
        </div>
        <div className="content">
          {page === 'review'  && <ReviewPage selectedType={selectedType} setSelectedType={setSelectedType} matchedName={matchedName} setMatchedName={setMatchedName} onJumpToRule={jumpToRule} />}
          {page === 'history' && <ReviewHistoryPage />}
          {page === 'rules'   && <RulesPage focusType={focusRule} />}
          {page === 'model'   && <SettingsPage />}
        </div>
      </div>
    </>
  );
}
