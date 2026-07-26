import React, { useEffect, useState } from 'react'
import { api } from './api.js'

const SEV_ORDER = { 严重: 0, 中: 1, 轻: 2, 待核: 3, 总评: 4 }

function FindingList({ findings }) {
  const sorted = [...(findings || [])].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
  return (
    <div>
      {sorted.map((f, i) => (
        <div className="finding" key={i}>
          <div className="head">
            <span className={`badge ${f.severity}`}>{f.severity}</span>
            {f.anchor ? <span className="muted">定位：{f.anchor.slice(0, 40)}</span> : null}
          </div>
          <div className="text">{f.text}</div>
        </div>
      ))}
    </div>
  )
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function ReviewPage({ types, type, setType, refreshTypes }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [exampleMode, setExampleMode] = useState(false)
  const [history, setHistory] = useState([])

  async function loadHistory() {
    try { const h = await api.history(); setHistory(h.items) } catch (e) {}
  }
  useEffect(() => { loadHistory() }, [])

  async function handleReview() {
    if (!file) { setError('请先选择 docx 文件'); return }
    if (!type) { setError('请选择方案类型'); return }
    setLoading(true); setError(''); setResult(null); setExampleMode(false)
    try {
      const r = await api.review(file, type)
      setResult(r)
    } catch (e) { setError(e.message) }
    finally { setLoading(false); loadHistory() }
  }

  async function handleExample() {
    setLoading(true); setError(''); setExampleMode(true)
    try {
      const r = await api.example()
      setResult({ ...r, id: null })
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div className="panel">
        <h2>审查工作台</h2>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>方案类型</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 280 }}>
            <label>施工方案文件（.docx）</label>
            <div className="filebox">
              <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files[0])} />
              {file ? <div style={{ marginTop: 8 }}>已选择：<b>{file.name}</b></div> : <div className="hint">拖入或点击选择 docx 方案</div>}
            </div>
          </div>
        </div>
        <div className="btnrow">
          <button className="btn" disabled={loading} onClick={handleReview}>开始审查</button>
          <button className="btn ghost" disabled={loading} onClick={handleExample}>示例演示（无需大模型）</button>
        </div>
        {loading && <div className="loading">正在抽取→分析→调用大模型判读，请稍候…</div>}
        {error && <div className="msg err">{error}</div>}
        {exampleMode && result && <div className="msg info">{result.note}</div>}
      </div>

      {result && (
        <div className="panel">
          <div className="row between">
            <h2>审查结果（{result.findings?.length || 0} 条）</h2>
            <div className="btnrow" style={{ marginTop: 0 }}>
              {exampleMode ? (
                <a className="btn" href={api.exampleDocx()} download>下载批注 docx（示例）</a>
              ) : (
                <>
                  <a className="btn" href={api.download(result.id)} download>下载批注 docx</a>
                  <button className="btn ghost" onClick={() => downloadText(result.report, '审查报告.md')}>下载报告</button>
                </>
              )}
            </div>
          </div>
          <FindingList findings={result.findings} />
        </div>
      )}

      <div className="panel">
        <h2>历史记录</h2>
        {history.length === 0 && <div className="muted">暂无审查记录</div>}
        {history.map((h) => (
          <div className="history-item" key={h.id}>
            <div>
              <b>{h.type_name}</b> <span className="muted">· {h.filename}</span><br />
              <span className="muted">{h.created_at} · {h.used_llm ? '大模型判读' : '机械分析'}</span>
            </div>
            <div className="btnrow" style={{ marginTop: 0 }}>
              <a className="btn gray" href={api.download(h.id)} download>批注稿</a>
              <a className="btn ghost" href={api.report(h.id)} target="_blank" rel="noreferrer">报告</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RulesPage({ types, type, setType, refreshTypes }) {
  const [rule, setRule] = useState(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // 当前选中的方案类型变化时，加载对应规则（type 为 App 级共享状态，保证与审查工作台一一对应）
  useEffect(() => {
    if (!type) { setRule(null); return }
    let alive = true
    setLoading(true); setMsg('')
    api.getRule(type).then((r) => { if (alive) setRule(r) }).catch((e) => { if (alive) setMsg(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [type])

  function update(patch) { setRule({ ...rule, ...patch }) }
  function updateList(key, idx, field, val) {
    const arr = [...rule[key]]; arr[idx] = { ...arr[idx], [field]: val }; update({ [key]: arr })
  }
  function addItem(key, item) { update({ [key]: [...(rule[key] || []), item] }) }
  function removeItem(key, idx) { const a = [...rule[key]]; a.splice(idx, 1); update({ [key]: a }) }

  // norm_versions object <-> array
  const normArr = rule ? Object.entries(rule.norm_versions || {}).map(([code, v]) => ({ code, name: v.name, note: v.note, wrong: v.wrong || '' })) : []
  function setNormArr(arr) {
    const obj = {}; arr.forEach((x) => { if (x.code) obj[x.code] = { name: x.name || '', note: x.note || '', wrong: x.wrong || '' } })
    update({ norm_versions: obj })
  }

  async function save() {
    if (!type) { setMsg('请先选择方案类型'); return }
    setMsg(''); setLoading(true)
    try { await api.saveRule(type, rule); setMsg('已保存'); }
    catch (e) { setMsg(e.message) } finally { setLoading(false) }
  }
  async function createNew() {
    const t = prompt('新规则类型标识（英文，如 scaffold）：')
    if (!t) return
    const name = prompt('显示名称：') || t
    setLoading(true)
    try { const r = await api.newRule({ type: t, name }); await refreshTypes(); setType(r.type); setMsg('已新建') }
    catch (e) { setMsg(e.message) } finally { setLoading(false) }
  }
  async function del() {
    if (!type) return
    if (!confirm(`确认删除类型【${type}】及其规则？`)) return
    setLoading(true)
    try { await api.deleteRule(type); await refreshTypes(); setType(''); setRule(null); setMsg('已删除') }
    catch (e) { setMsg(e.message) } finally { setLoading(false) }
  }

  // 章节列表（供清单章节输入联想）
  const chapterList = Array.from(new Set((rule?.checklist || []).map((c) => c.chapter).filter(Boolean)))
  const checklistGroups = (rule?.checklist || []).map((c, i) => ({ i, c })).reduce((acc, { i, c }) => {
    let g = acc.find((x) => x.chapter === c.chapter)
    if (!g) { g = { chapter: c.chapter || '（未分类）', rows: [] }; acc.push(g) }
    g.rows.push({ i, c }); return acc
  }, [])

  if (!rule) return <div className="panel"><div className="loading">{loading ? '加载中…' : '请选择上方方案类型'}</div></div>

  return (
    <div>
      <div className="panel">
        <div className="row between">
          <h2>规则管理</h2>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className="btn gray" onClick={createNew}>新增类型</button>
            <button className="btn danger" onClick={del}>删除当前</button>
          </div>
        </div>
        <div className="cards">
          {types.map((t) => (
            <div key={t.type} className={`card ${t.type === type ? 'active' : ''}`} onClick={() => setType(t.type)}>
              <h3>{t.name}</h3>
              <p>{t.description || '（无描述）'}</p>
            </div>
          ))}
        </div>
        <div className="hint">当前选中类型与「审查工作台」联动，保持一致（一一对应）。</div>
      </div>

      <div className="panel">
        <h2>编辑：{type}</h2>
        <label>显示名称</label>
        <input value={rule.name || ''} onChange={(e) => update({ name: e.target.value })} />
        <label>描述</label>
        <input value={rule.description || ''} onChange={(e) => update({ description: e.target.value })} />

        <h3 style={{ marginTop: 18 }}>严重缺陷清单（一票否决）</h3>
        {(rule.severe_defects || []).map((s, i) => (
          <div className="sublist" key={i}>
            <div className="item">
              <input className="k" value={s.no} onChange={(e) => updateList('severe_defects', i, 'no', e.target.value)} placeholder="编号" />
              <input className="k" value={s.category} onChange={(e) => updateList('severe_defects', i, 'category', e.target.value)} placeholder="分类" />
              <input value={s.desc} onChange={(e) => updateList('severe_defects', i, 'desc', e.target.value)} placeholder="缺陷情形" />
            </div>
            <div className="item">
              <input className="k" value={s.location} onChange={(e) => updateList('severe_defects', i, 'location', e.target.value)} placeholder="常见位置（章节）" />
              <input value={s.skill} onChange={(e) => updateList('severe_defects', i, 'skill', e.target.value)} placeholder="检查技巧" />
              <button className="btn danger" onClick={() => removeItem('severe_defects', i)}>×</button>
            </div>
          </div>
        ))}
        <button className="btn gray" onClick={() => addItem('severe_defects', { no: '', category: '', desc: '', location: '', skill: '' })}>+ 添加严重缺陷</button>

        <h3 style={{ marginTop: 18 }}>规范版本有效性表</h3>
        {normArr.map((n, i) => (
          <div className="sublist" key={i}>
            <div className="item">
              <input className="k" value={n.code} onChange={(e) => { const a = [...normArr]; a[i] = { ...a[i], code: e.target.value }; setNormArr(a) }} placeholder="编号-年份" />
              <input value={n.name} onChange={(e) => { const a = [...normArr]; a[i] = { ...a[i], name: e.target.value }; setNormArr(a) }} placeholder="规范名称" />
              <input value={n.wrong} onChange={(e) => { const a = [...normArr]; a[i] = { ...a[i], wrong: e.target.value }; setNormArr(a) }} placeholder="常见错误版本" />
            </div>
            <div className="item">
              <input style={{ flex: 1 }} value={n.note} onChange={(e) => { const a = [...normArr]; a[i] = { ...a[i], note: e.target.value }; setNormArr(a) }} placeholder="备注" />
              <button className="btn danger" onClick={() => { const a = [...normArr]; a.splice(i, 1); setNormArr(a) }}>×</button>
            </div>
          </div>
        ))}
        <button className="btn gray" onClick={() => setNormArr([...normArr, { code: '', name: '', note: '', wrong: '' }])}>+ 添加规范</button>

        <h3 style={{ marginTop: 18 }}>核查清单要点（按章节分类）</h3>
        {checklistGroups.map((g) => (
          <div className="clgroup" key={g.chapter}>
            <div className="clgroup-head">{g.chapter}</div>
            {g.rows.map(({ i, c }) => (
              <div className="sublist" key={i}>
                <div className="item">
                  <input className="k" list="chapter-list" value={c.chapter} onChange={(e) => updateList('checklist', i, 'chapter', e.target.value)} placeholder="章节(如2.2 工程概况)" />
                  <input className="k" value={c.subtag} onChange={(e) => updateList('checklist', i, 'subtag', e.target.value)} placeholder="子项标签" />
                  <input value={c.req} onChange={(e) => updateList('checklist', i, 'req', e.target.value)} placeholder="审查要点" />
                  <button className="btn danger" onClick={() => removeItem('checklist', i)}>×</button>
                </div>
              </div>
            ))}
          </div>
        ))}
        <datalist id="chapter-list">{chapterList.map((c) => <option key={c} value={c} />)}</datalist>
        <button className="btn gray" onClick={() => addItem('checklist', { chapter: '', subtag: '', req: '' })}>+ 添加要点</button>

        <h3 style={{ marginTop: 18 }}>跨章节一致性检查项</h3>
        {(rule.cross_chapter_checks || []).map((c, i) => (
          <div className="sublist" key={i}>
            <div className="item">
              <input className="k" value={c.key} onChange={(e) => updateList('cross_chapter_checks', i, 'key', e.target.value)} placeholder="检查项" />
              <input value={(c.keywords || []).join('、')} onChange={(e) => updateList('cross_chapter_checks', i, 'keywords', e.target.value.split('、').map((s) => s.trim()).filter(Boolean))} placeholder="关键词（顿号分隔）" />
            </div>
            <div className="item">
              <input className="k" value={c.chapters} onChange={(e) => updateList('cross_chapter_checks', i, 'chapters', e.target.value)} placeholder="需比对章节" />
              <input style={{ flex: 1 }} value={c.problem} onChange={(e) => updateList('cross_chapter_checks', i, 'problem', e.target.value)} placeholder="常见问题类型" />
              <button className="btn danger" onClick={() => removeItem('cross_chapter_checks', i)}>×</button>
            </div>
          </div>
        ))}
        <button className="btn gray" onClick={() => addItem('cross_chapter_checks', { key: '', keywords: [], chapters: '', problem: '' })}>+ 添加检查项</button>

        <h3 style={{ marginTop: 18 }}>目录模板（结构完整性对照）</h3>
        <textarea style={{ minHeight: 160 }} value={rule.directory_template || ''} onChange={(e) => update({ directory_template: e.target.value })} />
        <div className="hint">用于结构完整性检查，列出期望的“第X章 / 一、”章节骨架。</div>

        <div className="btnrow">
          <button className="btn" disabled={loading} onClick={save}>保存规则</button>
          {msg && <span className="msg ok" style={{ padding: '8px 12px' }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

function SettingsPage() {
  const [s, setS] = useState({ provider: 'deepseek', base_url: '', model: '', temperature: 0.2, api_key: '', has_key: false, providers: [] })
  const [testMsg, setTestMsg] = useState('')
  const [testLoad, setTestLoad] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => { (async () => { try { setS(await api.getSettings()) } catch (e) {} })() }, [])

  function set(patch) { setS({ ...s, ...patch }) }
  function onProvider(p) {
    const def = (s.providers.find((x) => x.id === p) || {}).default_model || ''
    set({ provider: p, model: def, base_url: '' })
  }
  async function test() {
    setTestLoad(true); setTestMsg('')
    try { const r = await api.testLlm({ provider: s.provider, base_url: s.base_url, model: s.model, api_key: s.api_key, temperature: s.temperature }); setTestMsg(r.ok ? '✓ ' + r.message : '✗ ' + r.message) }
    catch (e) { setTestMsg('✗ ' + e.message) } finally { setTestLoad(false) }
  }
  async function save() {
    setSaveMsg('')
    try { const r = await api.saveSettings({ provider: s.provider, base_url: s.base_url, model: s.model, api_key: s.api_key, temperature: s.temperature }); setS({ ...s, has_key: r.has_key }); setSaveMsg('已保存') }
    catch (e) { setSaveMsg(e.message) }
  }

  return (
    <div className="panel">
      <h2>模型设置（国产大模型 API）</h2>
      <div className="row">
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>供应商</label>
          <select value={s.provider} onChange={(e) => onProvider(e.target.value)}>
            {s.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>模型名</label>
          <input list="model-presets" value={s.model}
                 onChange={(e) => set({ model: e.target.value })}
                 placeholder="留空用供应商默认" />
          <datalist id="model-presets">
            {(s.providers.find((x) => x.id === s.provider) || {}).models?.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>
      <label>API Base URL（留空用内置地址）</label>
      <input value={s.base_url} onChange={(e) => set({ base_url: e.target.value })} placeholder="如 https://api.deepseek.com/v1" />
      <label>API Key {s.has_key ? '（已保存，留空则不修改）' : ''}</label>
      <input type="password" value={s.api_key} onChange={(e) => set({ api_key: e.target.value })} placeholder={s.has_key ? '已配置，重新输入可覆盖' : '请输入'} />
      <label>温度（0~1，越低越稳）</label>
      <input type="number" step="0.1" min="0" max="1" value={s.temperature} onChange={(e) => set({ temperature: parseFloat(e.target.value) })} />

      <div className="btnrow">
        <button className="btn ghost" disabled={testLoad} onClick={test}>{testLoad ? '测试中…' : '测试连接'}</button>
        <button className="btn" onClick={save}>保存设置</button>
        {testMsg && <span className={testMsg.startsWith('✓') ? 'msg ok' : 'msg err'} style={{ padding: '8px 12px' }}>{testMsg}</span>}
        {saveMsg && <span className="msg ok" style={{ padding: '8px 12px' }}>{saveMsg}</span>}
      </div>
      <div className="hint">平台走 OpenAI 兼容协议，默认 DeepSeek，可在下拉切换通义千问 / 智谱 GLM / Kimi。若你用的是代理/网关（如部分平台把 DeepSeek 命名为 deepseek-v4-flash / deepseek-v4-pro），请在“模型名”里填该端点实际支持的模型（切换供应商会自动带出默认模型，可手动改成下拉中的其它选项）。配置后点“测试连接”，出现可用模型名提示即说明模型名写错，按提示改即可。</div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('review')
  const [types, setTypes] = useState([])
  const [type, setType] = useState('') // 共享的“当前方案类型”，审查工作台与规则管理联动一致（一一对应）

  async function refreshTypes() {
    try {
      const t = await api.types()
      setTypes(t.types)
      if (!type && t.types.length) setType(t.types[0].type)
    } catch (e) {}
  }
  useEffect(() => { refreshTypes() }, [])

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>施工方案审查平台</h1>
          <div className="sub">多类型专项施工方案符合性审查 · 国产大模型判读 · 规则可在线增改</div>
        </div>
        <div className="tabs">
          <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>审查工作台</button>
          <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>规则管理</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>模型设置</button>
        </div>
      </header>
      {tab === 'review' && <ReviewPage types={types} type={type} setType={setType} refreshTypes={refreshTypes} />}
      {tab === 'rules' && <RulesPage types={types} type={type} setType={setType} refreshTypes={refreshTypes} />}
      {tab === 'settings' && <SettingsPage />}
    </div>
  )
}
