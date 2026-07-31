// 2.0 前端 API 封装（fetch，无额外依赖；dev 由 vite 代理 /api，生产同源）
const enc = encodeURIComponent;

async function req(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
}

export const getTypes = () => req('/api/types');
export const getRule = (t) => req('/api/rules/' + enc(t));
export const saveRule = (t, data) =>
  req('/api/rules/' + enc(t), { method: 'PUT', body: JSON.stringify(data) });
export const newRule = (data) =>
  req('/api/rules', { method: 'POST', body: JSON.stringify(data) });
export const deleteRule = (t) =>
  req('/api/rules/' + enc(t), { method: 'DELETE' });

export const getSettings = () => req('/api/settings');
export const saveSettings = (data) =>
  req('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
export const testLLM = (data) =>
  req('/api/llm/test', { method: 'POST', body: JSON.stringify(data) });

export const review = async (type, file) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type_', type);
  const r = await fetch('/api/review', { method: 'POST', body: fd });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
};

export const getExample = () => req('/api/example');
export const getHistory = () => req('/api/history');
export const getHistoryDetail = (rid) => req('/api/history/' + rid);
export const deleteHistory = (rid) =>
  req('/api/history/' + rid, { method: 'DELETE' });

/* 下载带批注的 docx（直接触发浏览器下载） */
export const downloadDocx = (rid) => {
  const a = document.createElement('a');
  a.href = '/api/download/' + rid;
  a.download = '';
  a.click();
};

/* 查看报告（返回 markdown 文本） */
export const getReport = (rid) => fetch('/api/report/' + rid).then(r => r.text());
