# 施工方案审查平台 — 部署到 Cloud Studio

Cloud Studio 是腾讯云提供的云端 Linux 工作空间（在线 IDE + 运行环境），适合跑本项目这种
「FastAPI 后端 + 同源托管前端」的全栈应用。部署后可通过 Cloud Studio 的「端口预览」拿到公网 URL，
在任意设备的浏览器打开使用。

---

## 一、创建工作空间

1. 打开 https://cloudstudio.net 并登录（微信 / 腾讯云账号）。
2. 「新建工作空间」→ 来源选择 **Git 仓库**，填写：
   ```
   https://github.com/civien/construction-plan-review-platform.git
   ```
3. 环境模板选 **Python** 或 **全栈（Python + Node）**。
4. 确认创建，等待工作空间初始化完成（首次会 clone 仓库）。

> 如果你还没有把仓库推到 GitHub，请先在本地执行：
> `git push -u origin v2.0 && git push --tags`

---

## 二、在工作空间终端部署运行

打开工作空间底部的**终端**，执行：

```bash
bash run_cloud.sh
```

脚本会自动完成：
- 安装 Python 依赖（fastapi / uvicorn / python-docx / lxml / requests，见 `backend/requirements.txt`）；
- 启动后端，监听 `0.0.0.0:8000`；
- 同源托管已随仓库入库的前端 `frontend/dist`。

看到如下日志即成功：
```
Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

---

## 三、访问应用

- 点击 Cloud Studio 顶部的 **「预览」/「访问」** 按钮，选择端口 **8000**，会生成一个公网 URL。
- 用浏览器打开该 URL 即可使用完整功能（规则管理、方案上传、AI 审查、历史记录等）。

---

## 四、配置大模型 API Key

1. 进入平台「模型设置」页面，填入你的大模型 API Key（如 DeepSeek 的 key）。
2. 密钥保存在工作空间的 `backend/data/app.db`（已 gitignore，不会入库）。
3. 点「测试连接」应返回「连接成功」。

> 注意：Cloud Studio 工作空间若被回收/重置，`backend/data/` 可能清空，Key 需重新填报。
> 建议将工作空间设为「常驻 / 持久化」，或定期备份 `backend/data/` 目录。

---

## 五、修改代码后重新构建（可选）

若你改动了前端源码，需 Node 环境重新构建（后端会自动托管新产物）：

```bash
cd frontend
npm install
npm run build
```

后端无需重启（StaticFiles 直接读 dist 目录）；如改动涉及后端 Python，重启 `bash run_cloud.sh` 即可。

---

## 六、停止 / 重启

- 终端 `Ctrl+C` 停止服务；
- 重新运行 `bash run_cloud.sh` 启动；
- 数据在 `backend/data/`，不在 git 中，迁移时请单独备份该目录。

---

## 与本地运行的差异

| 项目 | 本地（macOS） | Cloud Studio |
|------|---------------|--------------|
| 启动脚本 | `bash run.sh` | `bash run_cloud.sh` |
| Python 解释器 | WorkBuddy 内置 python3 路径 | 系统 `python3` |
| 监听地址 | `127.0.0.1:8000` | `0.0.0.0:8000`（供预览） |
| 访问方式 | `http://127.0.0.1:8000` | Cloud Studio 端口预览生成的公网 URL |
| 前端 | 已构建 dist 入库 | 同左，无需额外构建 |
