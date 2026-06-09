# 农产品感知质量知识图谱三元组提取与评估方案

## Design Document: LLM-Driven Triple Extraction & Evaluation

---

## 1. 项目概述

### 1.1 背景

本方案对应论文 **第3.1节"Construction of the Agricultural Product Perceived Quality Knowledge Graph"**，实现基于大语言模型（LLM）的农产品感知质量知识图谱三元组提取，并使用 **Precision / Recall / F1-score** 进行评估。

### 1.2 核心任务

从农产品在线评论中提取结构化三元组 `<p, d, u>`：
- **p** ∈ P：产品实体（如 rice, 大米）
- **d** ∈ D：感知维度（如 taste, aroma, appearance）
- **u** ∈ U：属性词（如 soft, fragrant, white）

### 1.3 评估目标

使用标准信息检索指标评估LLM提取效果：
- **Precision（精确率）**：提取正确的三元组 / 提取的所有三元组
- **Recall（召回率）**：提取正确的三元组 / 标注的所有三元组
- **F1-Score**：Precision和Recall的调和平均

---

## 2. 系统架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Triple Extraction System                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Prompt     │───▶│     LLM      │───▶│   Parser     │  │
│  │  Engineering │    │    (API)     │    │              │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                  │          │
│                                                  ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Ground     │◀───│  Evaluation  │◀───│   Triple     │  │
│  │   Truth      │    │   Metrics    │    │   Output     │  │
│  │  (Annotated) │    │ P / R / F1   │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 四层提示工程策略（Prompt Engineering）

基于论文第3.1节设计，采用四层提示工程策略：

| 层级 | 名称 | 功能 | 内容示例 |
|------|------|------|----------|
| a) | **Role Prompt Layer** | 角色设定 | "You are an expert in agricultural product sensory evaluation" |
| b) | **Task Prompt Layer** | 任务定义 | 提取 `<p,d,u>` 三元组，指定输出格式 |
| c) | **Domain Knowledge Prompt Layer** | 领域知识 | 10个预定义维度及其代表性术语 |
| d) | **Extraction Demonstration Prompt Layer** | 示例引导 | 提供In-context Learning示例 |

**预定义感知维度：**

```python
# 内源维度（内在属性）
ENDOGENOUS_DIMENSIONS = [
    "taste", "aroma", "appearance", "nutrition", "quality"
]

# 外源维度（外在属性）
EXOGENOUS_DIMENSIONS = [
    "logistics", "service", "price", "packaging", "brand"
]
```

### 3.2 三元组数据模型

```python
@dataclass(frozen=True)
class Triple:
    product: str      # 产品实体
    dimension: str    # 感知维度
    attribute: str    # 属性词
    
    def normalized(self) -> 'Triple':
        """标准化：小写 + 去空格"""
        return Triple(
            product=self.product.strip().lower(),
            dimension=self.dimension.strip().lower(),
            attribute=self.attribute.strip().lower()
        )
```

**设计要点：**
- 使用 `frozen=True` 确保不可变性，可作为集合元素
- 实现 `normalized()` 方法支持大小写不敏感匹配
- 自动实现 `__eq__` 和 `__hash__`，支持集合操作

### 3.3 三元组解析器

使用正则表达式从LLM输出中提取三元组：

```python
pattern = r'<\s*([^,>]+?)\s*,\s*([^,>]+?)\s*,\s*([^>]+?)\s*>'
```

**支持格式：**
- `<rice, taste, soft>` — 标准格式
- `< rice , taste , soft >` — 带空格
- `<大米, 口感, 软糯>` — 中文
- 多个三元组用分号分隔

### 3.4 评估指标计算

#### 3.4.1 单样本评估

```
Precision = TP / (TP + FP)
Recall    = TP / (TP + FN)
F1        = 2 * (Precision * Recall) / (Precision + Recall)
```

其中：
- **TP（True Positive）**：预测和标注中都存在的三元组
- **FP（False Positive）**：预测中有但标注中没有的三元组
- **FN（False Negative）**：标注中有但预测中没有的三元组

#### 3.4.2 宏平均 Macro-F1

对每个样本分别计算F1后取平均：

```python
Macro-F1 = (F1_sample1 + F1_sample2 + ... + F1_sampleN) / N
```

---

## 4. 测试驱动开发（TDD）流程

### 4.1 RED → GREEN → REFACTOR 循环

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│   RED   │────▶│  GREEN  │────▶│ REFACTOR│
│Write    │     │Minimal  │     │Clean up │
│Failing  │     │Code to  │     │Keep     │
│Test     │     │Pass     │     │Green    │
└─────────┘     └─────────┘     └────┬────┘
     ▲───────────────────────────────┘
```

### 4.2 测试覆盖

| 测试类别 | 测试用例数 | 覆盖内容 |
|----------|-----------|----------|
| 三元组解析 | 6 | 单/多个三元组、中文、带空格、含额外文本、空输出 |
| 三元组标准化 | 2 | 大小写转换、空格去除 |
| 评估指标 | 7 | 完全匹配、部分匹配、无匹配、空预测、空标注、高P低R、大小写不敏感 |
| Prompt构建 | 4 | 角色、评论、维度、示例 |
| 边界情况 | 2 | 相等性、哈希值 |

**总计：21个测试用例，全部通过 ✓**

---

## 5. 使用指南

### 5.1 快速开始

```python
from triple_extractor import (
    Triple, 
    parse_triples_from_llm_output,
    calculate_precision_recall_f1,
    build_extraction_prompt
)

# 1. 构建Prompt
review = "This rice is soft and fragrant."
prompt = build_extraction_prompt(review)

# 2. 调用LLM获取输出（需替换为实际API调用）
llm_output = "<rice, taste, soft>;<rice, aroma, fragrant>"

# 3. 解析三元组
triples = parse_triples_from_llm_output(llm_output)

# 4. 计算评估指标
ground_truth = [
    Triple("rice", "taste", "soft"),
    Triple("rice", "aroma", "fragrant")
]
metrics = calculate_precision_recall_f1(triples, ground_truth)
print(f"Precision: {metrics['precision']}")
print(f"Recall: {metrics['recall']}")
print(f"F1: {metrics['f1']}")
```

### 5.2 接入真实LLM

```python
from triple_extractor import TripleExtractor

# 初始化提取器
extractor = TripleExtractor(
    api_key="your-api-key",
    model_name="gpt-3.5-turbo",
    temperature=0.1  # 低温度确保输出稳定
)

# 提取三元组
triples = extractor.extract(
    review_text="This rice tastes great!",
    product_name="rice",
    language="en"
)
```

### 5.3 批量评估

```python
# 准备测试数据
reviews = ["review1", "review2", "review3"]
ground_truths = [
    [Triple("rice", "taste", "soft")],
    [Triple("rice", "aroma", "fragrant")],
    [Triple("rice", "appearance", "white")]
]

# 运行评估
metrics = extractor.evaluate(reviews, ground_truths)
print(f"Macro Precision: {metrics['macro_precision']}")
print(f"Macro Recall: {metrics['macro_recall']}")
print(f"Macro F1: {metrics['macro_f1']}")
```

---

## 6. 文件清单

| 文件 | 说明 |
|------|------|
| `triple_extractor.py` | 核心模块：三元组提取、解析、评估 |
| `test_triple_extractor.py` | 测试模块：21个TDD测试用例 |
| `design_document.md` | 设计方案文档（本文档） |

---

## 7. 扩展建议

1. **语义对齐优化**：实现论文3.1节第(3)部分的语义对齐算法，使用BERT编码计算属性词相似度
2. **多模型对比**：支持GPT-4、Claude、文心一言等多种LLM的对比评估
3. **增量学习**：收集错误案例，通过Few-shot Learning持续优化Prompt
4. **可视化**：添加三元组网络可视化功能

---

## 8. 参考文献

本方案基于论文第3.1节设计：

> "Knowledge Graph Construction Based on Large Language Models" — 采用四层提示工程策略，包括角色提示层、任务提示层、领域知识提示层和提取示例提示层。
