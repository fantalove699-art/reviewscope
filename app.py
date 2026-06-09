import json
import uuid
import logging
from pathlib import Path
from collections import defaultdict

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import requests


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CONFIG_FILE = DATA_DIR / "config.json"
DATASET_FILE = DATA_DIR / "dataset.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder=str(BASE_DIR / "templates"), static_folder=str(BASE_DIR / "static"))
CORS(app)


DEFAULT_CONFIG = {
    "endpoint": "",
    "apiKey": "",
    "model": "",
    "temperature": 0.3,
}


def load_json(path: Path, default):
    try:
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logger.error("Failed to load %s: %s", path, e)
    if isinstance(default, (dict, list)):
        return json.loads(json.dumps(default))
    return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def mask_config(cfg):
    masked = dict(cfg)
    key = masked.get("apiKey", "")
    if isinstance(key, str) and len(key) > 6:
        masked["apiKey"] = key[:3] + "****" + key[-3:]
    elif isinstance(key, str) and key:
        masked["apiKey"] = "****"
    return masked


def has_llm_config(cfg):
    return bool(cfg.get("endpoint") and cfg.get("apiKey") and cfg.get("model"))


SYSTEM_PROMPT = (
    "你是一个严格的产品评论分析助手。你必须只输出合法的 JSON，不输出任何额外文字。"
)

USER_PROMPT_TEMPLATE = (
    "请分析下面这条用户评论，严格按 JSON 输出结果，不要输出任何额外文字。\n"
    "输出结构：\n"
    "{{\"products\": [{{\"name\": string, \"attributes\": [{{\"name\": string, \"granularity\": string|null, \"sentiment\": \"pos\"|\"neg\"|\"neu\"}}] }}] }}\n"
    "字段说明：\n"
    "- products: 每个产品包含 name (产品名) 和 attributes 数组\n"
    "- attributes: 每个属性包含 name (属性名), granularity (可选，细粒度属性名，没有则为 null), sentiment (pos/neg/neu)\n"
    "要求：\n"
    "1. 只提取评论中明确提到的产品和属性\n"
    "2. sentiment: pos 正面，neg 负面，neu 中性/未体现情感\n"
    "3. 只输出一个 JSON 对象，不要任何 markdown、反引号、解释文字\n\n"
    "评论内容：\n\"\"\"{text}\"\"\""
)


def normalize_item(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return s.strip().lower().replace(" ", "")


def call_llm(cfg, text: str, rounds: int) -> dict:
    payload = {
        "model": cfg["model"],
        "temperature": float(cfg.get("temperature", 0.3)),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(text=text)},
        ],
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cfg['apiKey']}",
    }

    last_error = None
    last_raw = ""
    for i in range(max(1, int(rounds))):
        try:
            logger.info(
                "LLM call %d/%d: model=%s endpoint=%s",
                i + 1, rounds, cfg["model"], cfg["endpoint"],
            )
            resp = requests.post(cfg["endpoint"], headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            last_raw = content
            parsed = parse_llm_json(content)
            return normalize_parsed(parsed)
        except Exception as e:
            last_error = e
            logger.warning("LLM round %d failed: %s", i + 1, e)

    raise RuntimeError(f"LLM 调用失败: {last_error}; 最后输出: {last_raw!r}")


def parse_llm_json(content: str) -> dict:
    if not isinstance(content, str):
        return {}
    text = content.strip()
    if text.startswith("```"):
        text = text[3:]
        if text.lower().startswith("json"):
            text = text[4:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    idx_start = text.find("{")
    idx_end = text.rfind("}")
    if idx_start >= 0 and idx_end > idx_start:
        text = text[idx_start:idx_end + 1]
    if not text:
        return {}
    return json.loads(text)


def normalize_parsed(obj) -> dict:
    out = {"products": []}
    if not isinstance(obj, dict):
        return out
    products = obj.get("products") or []
    if not isinstance(products, list):
        products = []
    for p in products:
        if not isinstance(p, dict):
            continue
        pname = p.get("name") or ""
        if not isinstance(pname, str) or not pname.strip():
            continue
        attrs = p.get("attributes") or []
        if not isinstance(attrs, list):
            attrs = []
        norm_attrs = []
        for a in attrs:
            if not isinstance(a, dict):
                continue
            aname = a.get("name") or ""
            if not isinstance(aname, str) or not aname.strip():
                continue
            gran = a.get("granularity")
            if isinstance(gran, str) and not gran.strip():
                gran = None
            sent = a.get("sentiment")
            if not isinstance(sent, str) or sent not in ("pos", "neg", "neu"):
                sent = "neu"
            norm_attrs.append({"name": aname.strip(), "granularity": gran, "sentiment": sent})
        out["products"].append({"name": pname.strip(), "attributes": norm_attrs})
    return out


def collect_product_names(result):
    names = set()
    for p in (result.get("products") or []):
        n = normalize_item(p.get("name"))
        if n:
            names.add(n)
    return names


def collect_attribute_map(result):
    m = {}
    for p in (result.get("products") or []):
        for a in (p.get("attributes") or []):
            key = normalize_item(a.get("name"))
            if not key:
                continue
            if key not in m:
                m[key] = a.get("sentiment") or "neu"
    return m


def safe_div(num, den):
    if den == 0:
        return 0.0
    return num / den


def evaluate_sample(gold, pred):
    gold_products = collect_product_names(gold)
    pred_products = collect_product_names(pred)
    p_tp = len(gold_products & pred_products)
    product_p = safe_div(p_tp, len(pred_products))
    product_r = safe_div(p_tp, len(gold_products))
    product_f1 = (2 * product_p * product_r / (product_p + product_r)) if (product_p + product_r) else 0.0

    gold_attrs = collect_attribute_map(gold)
    pred_attrs = collect_attribute_map(pred)
    gold_keys = set(gold_attrs.keys())
    pred_keys = set(pred_attrs.keys())
    a_tp = len(gold_keys & pred_keys)
    attr_p = safe_div(a_tp, len(pred_keys))
    attr_r = safe_div(a_tp, len(gold_keys))
    attr_f1 = (2 * attr_p * attr_r / (attr_p + attr_r)) if (attr_p + attr_r) else 0.0

    if gold_keys:
        sent_match = sum(1 for k in gold_keys if gold_attrs[k] == pred_attrs.get(k))
        sent_acc = sent_match / len(gold_keys)
    else:
        sent_acc = 1.0 if not pred_keys else 0.0

    return {
        "products": {"precision": product_p, "recall": product_r, "f1": product_f1},
        "attributes": {"precision": attr_p, "recall": attr_r, "f1": attr_f1},
        "sentiment_accuracy": sent_acc,
    }


def empty_eval():
    return {
        "products": {"precision": 0.0, "recall": 0.0, "f1": 0.0},
        "attributes": {"precision": 0.0, "recall": 0.0, "f1": 0.0},
        "sentiment_accuracy": 0.0,
    }


def mean(lst):
    return sum(lst) / len(lst) if lst else 0.0


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/config", methods=["GET"])
def api_get_config():
    cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return jsonify(mask_config(cfg))


@app.route("/api/config", methods=["POST"])
def api_set_config():
    body = request.get_json(force=True, silent=True) or {}
    cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    for k in ("endpoint", "apiKey", "model"):
        if k in body:
            cfg[k] = str(body[k])
    if "temperature" in body:
        try:
            cfg["temperature"] = float(body["temperature"])
        except (TypeError, ValueError):
            return jsonify({"error": "temperature 必须是数字"}), 400
    save_json(CONFIG_FILE, cfg)
    return jsonify(mask_config(cfg))


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    body = request.get_json(force=True, silent=True) or {}
    text = body.get("text") or ""
    rounds = int(body.get("rounds", 1))
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "text 不能为空"}), 400
    cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    if not has_llm_config(cfg):
        return jsonify({"error": "尚未配置 LLM，请先在配置页面填写 endpoint / apiKey / model"}), 400
    try:
        result = call_llm(cfg, text.strip(), rounds)
    except Exception as e:
        logger.error("analyze error: %s", e)
        return jsonify({"error": f"LLM 调用失败: {e}"}), 400
    return jsonify({"text": text, "rounds": rounds, "result": result})


@app.route("/api/dataset", methods=["GET"])
def api_get_dataset():
    ds = load_json(DATASET_FILE, {"samples": []})
    return jsonify(ds)


@app.route("/api/dataset", methods=["POST"])
def api_set_dataset():
    body = request.get_json(force=True, silent=True) or {}
    samples = body.get("samples")
    if not isinstance(samples, list):
        return jsonify({"error": "samples 必须是数组"}), 400
    for s in samples:
        if not isinstance(s, dict):
            return jsonify({"error": "每条样本必须是对象"}), 400
        if "id" not in s or not str(s["id"]).strip():
            s["id"] = str(uuid.uuid4())
        else:
            s["id"] = str(s["id"])
    save_json(DATASET_FILE, {"samples": samples})
    return jsonify({"samples": samples})


@app.route("/api/dataset/sample", methods=["POST"])
def api_upsert_sample():
    body = request.get_json(force=True, silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "样本必须是 JSON 对象"}), 400
    sid = body.get("id")
    ds = load_json(DATASET_FILE, {"samples": []})
    samples = ds["samples"]
    if sid:
        for i, s in enumerate(samples):
            if str(s.get("id")) == str(sid):
                body["id"] = str(sid)
                samples[i] = body
                save_json(DATASET_FILE, {"samples": samples})
                return jsonify(body)
    body["id"] = str(uuid.uuid4())
    samples.append(body)
    save_json(DATASET_FILE, {"samples": samples})
    return jsonify(body)


@app.route("/api/dataset/sample/<sid>", methods=["DELETE"])
def api_delete_sample(sid):
    ds = load_json(DATASET_FILE, {"samples": []})
    samples = [s for s in ds["samples"] if str(s.get("id")) != str(sid)]
    save_json(DATASET_FILE, {"samples": samples})
    return jsonify({"deleted": sid, "samples": samples})


@app.route("/api/benchmark", methods=["POST"])
def api_benchmark():
    body = request.get_json(force=True, silent=True) or {}
    rounds = int(body.get("rounds", 1))
    cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    if not has_llm_config(cfg):
        return jsonify({"error": "尚未配置 LLM，请先填写 endpoint / apiKey / model"}), 400
    ds = load_json(DATASET_FILE, {"samples": []})
    samples = ds.get("samples") or []
    if not samples:
        return jsonify({"error": "数据集为空，没有标注样本可评测"}), 400

    per_sample = []
    agg_keys = ("product_p", "product_r", "product_f1", "attr_p", "attr_r", "attr_f1", "sent_acc")
    totals = defaultdict(list)
    for s in samples:
        review = s.get("review") or ""
        gold = {"products": s.get("products") or []}
        item = {"id": s.get("id"), "review": review}
        try:
            pred = call_llm(cfg, review, rounds)
            stats = evaluate_sample(gold, pred)
            item["prediction"] = pred
            item["metrics"] = stats
            totals["product_p"].append(stats["products"]["precision"])
            totals["product_r"].append(stats["products"]["recall"])
            totals["product_f1"].append(stats["products"]["f1"])
            totals["attr_p"].append(stats["attributes"]["precision"])
            totals["attr_r"].append(stats["attributes"]["recall"])
            totals["attr_f1"].append(stats["attributes"]["f1"])
            totals["sent_acc"].append(stats["sentiment_accuracy"])
        except Exception as e:
            logger.error("benchmark sample %s error: %s", s.get("id"), e)
            item["prediction"] = None
            item["error"] = str(e)
            item["metrics"] = empty_eval()
        per_sample.append(item)

    overall = {
        "samples": len(per_sample),
        "products": {
            "precision": mean(totals["product_p"]),
            "recall": mean(totals["product_r"]),
            "f1": mean(totals["product_f1"]),
        },
        "attributes": {
            "precision": mean(totals["attr_p"]),
            "recall": mean(totals["attr_r"]),
            "f1": mean(totals["attr_f1"]),
        },
        "sentiment_accuracy": mean(totals["sent_acc"]),
    }
    return jsonify({"overall": overall, "samples": per_sample})


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "not found"}), 404


@app.errorhandler(500)
def server_error(e):
    logger.exception("server error")
    return jsonify({"error": f"server error: {e}"}), 500


if __name__ == "__main__":
    print("=" * 60)
    print(" Flask Backend Started")
    print(" Data dir: " + str(DATA_DIR))
    print(" Visit: http://localhost:8000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=8000, debug=True)
