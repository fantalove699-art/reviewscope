# ReviewScope

**LLM 产品评论评测工作台** —— 从用户评论中提取产品/属性/颗粒度属性，并计算 Precision / Recall / F1。

## 功能

- **快速分析**：单条评论 → LLM 提取产品、属性、颗粒度、情感
- **样本标注**：构建 Gold Standard 标注集（JSON 持久化）
- **模型评测**：批量跑 LLM，计算 P/R/F1（产品 & 属性）+ 情感准确率
- **数据管理**：LLM 配置、导入/导出 JSON 数据集

## 技术栈

- 后端：Flask + Flask-CORS + requests
- 前端：原生 JS + 暗色主题 SPA
- 持久化：本地 JSON 文件（`data/config.json`、`data/dataset.json`）

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python app.py
```

或 Windows 双击 `run.bat`。

### 3. 打开浏览器

```
http://localhost:8000
```

### 4. 配置 LLM

进入「数据管理」Tab，填写：
- Endpoint（例如 `https://api.openai.com/v1/chat/completions`）
- API Key
- Model（例如 `gpt-4o-mini`）

保存后即可开始使用。

## 项目结构

```
├── app.py                # Flask 后端
├── requirements.txt      # Python 依赖
├── run.bat               # Windows 启动脚本
├── templates/
│   └── index.html        # 主页面
├── static/
│   ├── styles.css        # 样式
│   └── app.js            # 前端逻辑
└── data/                 # 运行时自动创建
    ├── config.json       # LLM 配置
    └── dataset.json      # 标注数据
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/config` | 获取 LLM 配置（apiKey 已脱敏） |
| POST | `/api/config` | 保存 LLM 配置 |
| POST | `/api/analyze` | 分析单条评论 |
| GET  | `/api/dataset` | 获取标注数据集 |
| POST | `/api/dataset` | 全量替换数据集 |
| POST | `/api/dataset/sample` | 新增/更新单条样本 |
| DELETE | `/api/dataset/sample/<id>` | 删除样本 |
| POST | `/api/benchmark` | 批量评测 |

## License

MIT
