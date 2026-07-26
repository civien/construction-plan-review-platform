// 与后端 API 交互的封装（相对路径，由 vite dev proxy 转发到 :8000）
const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
  })
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`
    try { const d = await res.json(); msg = d.detail || msg } catch (e) {}
    throw new Error(msg)
  }
  if (res.headers.get('content-type')?.includes('application/json')) return res.json()
  return res
}

export const api = {
  types: () => req('/types'),
  getRule: (t) => req(`/rules/${t}`),
  saveRule: (t, data) => req(`/rules/${t}`, { method: 'PUT', body: JSON.stringify(data) }),
  newRule: (data) => req('/rules', { method: 'POST', body: JSON.stringify(data) }),
  deleteRule: (t) => req(`/rules/${t}`, { method: 'DELETE' }),
  getSettings: () => req('/settings'),
  saveSettings: (data) => req('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  testLlm: (data) => req('/llm/test', { method: 'POST', body: JSON.stringify(data) }),
  review: (file, type) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type_', type)
    return req('/review', { method: 'POST', body: fd })
  },
  example: () => req('/example'),
  exampleDocx: () => `${BASE}/example/docx`,
  history: () => req('/history'),
  download: (id) => `${BASE}/download/${id}`,
  report: (id) => `${BASE}/report/${id}`,
}
