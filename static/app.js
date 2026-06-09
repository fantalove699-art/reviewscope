(function () {
  'use strict';

  // =========================================================================
  //  STATE
  // =========================================================================
  const state = {
    config: { endpoint: '', apiKey: '', model: '', temperature: 0.3 },
    dataset: { samples: [] },
    activeSampleId: null,
    benchmarkResults: null,
    activeBenchmarkSampleId: null,
  };

  // =========================================================================
  //  DOM HELPERS
  // =========================================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, opts = {}) => {
    const n = document.createElement(tag);
    if (opts.className) n.className = opts.className;
    if (opts.text != null) n.textContent = opts.text;
    if (opts.attrs) for (const k in opts.attrs) n.setAttribute(k, opts.attrs[k]);
    return n;
  };

  // =========================================================================
  //  API CLIENT
  // =========================================================================
  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    if (abortCtrl) opts.signal = abortCtrl.signal;
    const timeoutMs = 60000;
    const timer = setTimeout(() => {
      if (abortCtrl) try { abortCtrl.abort(); } catch (e) {}
    }, timeoutMs);
    try {
      const resp = await fetch(path, opts);
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error('HTTP ' + resp.status + ' — ' + (errText || resp.statusText));
      }
      const ct = resp.headers.get('content-type') || '';
      return ct.includes('application/json') ? resp.json() : resp.text();
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('请求已取消或超时');
      throw e;
    }
  }

  async function loadConfig() {
    try {
      state.config = await api('GET', '/api/config');
    } catch (e) {
      console.log('config load failed:', e);
      state.config = { endpoint: '', apiKey: '', model: '', temperature: 0.3 };
    }
  }
  async function saveConfig(cfg) {
    state.config = await api('POST', '/api/config', cfg);
  }
  async function loadDataset() {
    try {
      const ds = await api('GET', '/api/dataset');
      state.dataset = ds && Array.isArray(ds.samples) ? ds : { samples: [] };
    } catch (e) {
      console.log('dataset load failed:', e);
      state.dataset = { samples: [] };
    }
  }
  async function createSample(sample) {
    return api('POST', '/api/dataset/sample', sample);
  }
  async function deleteSample(id) {
    return api('DELETE', '/api/dataset/sample/' + encodeURIComponent(id));
  }
  async function analyzeText(text, rounds) {
    return api('POST', '/api/analyze', { text, rounds: Number(rounds) || 1 });
  }
  async function runBenchmark() {
    return api('POST', '/api/benchmark');
  }

  // =========================================================================
  //  UTILITIES
  // =========================================================================
  function sentimentZh(s) {
    const map = { pos: '正面', positive: '正面', neg: '负面', negative: '负面', neu: '中性', neutral: '中性', mixed: '混合' };
    return map[s] || '中性';
  }
  function sentimentClass(s) {
    const map = { pos: 'positive', positive: 'positive', neg: 'negative', negative: 'negative', neu: 'neutral', neutral: 'neutral', mixed: 'mixed' };
    return map[s] || 'neutral';
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function uuid() {
    return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function setStatus(text, color) {
    const st = $('#statusText'); if (st) st.textContent = text;
    const dot = $('#statusDot');
    if (dot) {
      dot.style.background = color || '#c6ff3d';
      dot.style.boxShadow = '0 0 10px ' + (color || '#c6ff3d');
    }
  }
  function updateChips() {
    $('#chipModel').textContent = state.config.model ? state.config.model : '未配置 LLM';
    const total = state.dataset.samples.length;
    const prodCount = state.dataset.samples.reduce((a, s) => a + (s.products?.length || 0), 0);
    const attrCount = state.dataset.samples.reduce((a, s) => a + (s.attributes?.length || 0), 0);
    $('#chipDataset').textContent = total + ' 条 / ' + prodCount + ' 产品 / ' + attrCount + ' 属性';
  }

  // =========================================================================
  //  LOADER OVERLAY
  // =========================================================================
  let abortCtrl = null;
  function showLoader(inf) {
    const ov = $('#loader'); ov.hidden = false;
    $('#loaderTitle').textContent = inf?.title || '运行中';
    $('#loaderSub').textContent = inf?.sub || '...';
    $('#loaderFill').style.width = '0%';
    $('#loaderLog').innerHTML = '';
    try { abortCtrl = new AbortController(); } catch (e) { abortCtrl = null; }
  }
  function hideLoader() {
    $('#loader').hidden = true;
    if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} abortCtrl = null; }
  }
  function setProgress(pct, sub) {
    $('#loaderFill').style.width = pct + '%';
    if (sub) $('#loaderSub').textContent = sub;
  }
  function logLine(text, reset) {
    const log = $('#loaderLog');
    if (reset) log.innerHTML = '';
    const l = el('span', { className: 'log-line', text });
    log.appendChild(l);
    log.scrollTop = log.scrollHeight;
  }

  // =========================================================================
  //  TAB NAV
  // =========================================================================
  function initTabs() {
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
        $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.tab === tab));
      });
    });
  }

  // =========================================================================
  //  TAB 1 — QUICK ANALYZE
  // =========================================================================
  function initQuickAnalyze() {
    $('#azSampleBtn').addEventListener('click', () => {
      $('#azReviews').value = '这款索尼 WH-1000XM5 耳机的降噪效果真的绝了，地铁里几乎听不到任何噪音。但耳罩有点紧，戴久了耳朵疼。音质方面低音下潜不错，高音稍微有点刺耳。';
    });
    $$('#azSeg .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        $$('#azSeg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      });
    });
    $('#azRunBtn').addEventListener('click', async () => {
      const text = $('#azReviews').value.trim();
      if (!text) { alert('请先输入评论内容'); return; }
      const rounds = parseInt($$('#azSeg .seg-btn.active')[0].dataset.rounds, 10) || 1;

      showLoader({ title: '剖析中', sub: '调用后端 API ...' });
      logLine('目标：分析 ' + (text.length > 40 ? text.slice(0, 40) + '…' : text), true);
      $('#azRunBtn').disabled = true;

      try {
        setProgress(30, '提交到 /api/analyze ...');
        const result = await analyzeText(text, rounds);
        setProgress(80, '渲染结果');
        renderQuickAnalyze(result, text);
        setProgress(100, '完成');
        setStatus('分析完成', '#7dffa8');
      } catch (err) {
        alert('分析失败：' + err.message);
        console.log(err);
        setStatus('失败', '#ff5d5d');
        logLine(err.message);
      } finally {
        $('#azRunBtn').disabled = false;
        setTimeout(hideLoader, 300);
      }
    });
  }

  function renderQuickAnalyze(result, rawText) {
    $('#azEmpty').hidden = true;
    const out = $('#azResult');
    out.hidden = false;
    out.innerHTML = '';

    const root = result && result.result ? result.result : (result || {});
    const products = Array.isArray(root.products) ? root.products : [];

    const ringBlock = el('div', { className: 'score-ring-block' });
    ringBlock.innerHTML =
      '<div class="score-ring-wrap">' +
        '<svg class="score-ring" viewBox="0 0 120 120">' +
          '<circle cx="60" cy="60" r="50" class="ring-bg"></circle>' +
          '<circle cx="60" cy="60" r="50" class="ring-fg" id="azRing" style="stroke-dashoffset:' +
            (products.length > 0 ? 314.16 * 0.3 : 314.16 * 0.85) + '"></circle>' +
        '</svg>' +
        '<div class="ring-center">' +
          '<div class="ring-value" id="azScore">' + (products.length > 0 ? Math.min(99, 60 + products.length * 8) : 30) + '</div>' +
          '<div class="ring-label">分析完成</div>' +
        '</div>' +
      '</div>' +
      '<div class="score-breakdown">' +
        '<div class="score-row"><span class="score-row-label">产品实体</span>' +
          '<span class="score-bar-wrap"><span class="score-bar" style="width:' + Math.min(100, products.length * 25) + '%"></span></span>' +
          '<span class="score-row-score">' + products.length + '</span></div>' +
        '<div class="score-row"><span class="score-row-label">文本长度</span>' +
          '<span class="score-bar-wrap"><span class="score-bar" style="width:' + Math.min(100, Math.round(rawText.length / 5)) + '%"></span></span>' +
          '<span class="score-row-score">' + rawText.length + '</span></div>' +
        '<div class="score-row"><span class="score-row-label">分析轮次</span>' +
          '<span class="score-bar-wrap"><span class="score-bar" style="width:' + ((result.rounds || 1) * 25) + '%"></span></span>' +
          '<span class="score-row-score">' + (result.rounds || 1) + '</span></div>' +
      '</div>';
    out.appendChild(ringBlock);

    const prodSec = el('div', { className: 'result-section' });
    prodSec.innerHTML = '<div class="result-section-title">识别产品 / 属性（' + products.length + '）</div>';
    if (products.length === 0) {
      prodSec.innerHTML += '<div class="empty-state small" style="padding:20px"><p style="margin:0">未识别到明确产品</p></div>';
    } else {
      products.forEach((p) => {
        const card = el('div', { className: 'attribute-card' });
        card.innerHTML =
          '<div class="attribute-head" style="grid-template-columns: 1fr 130px;">' +
            '<span class="attribute-name">◎ ' + escapeHtml(p.name || '(未命名)') + '</span>' +
            '<span class="attribute-conf" style="text-align:right">产品</span>' +
          '</div>';
        const attrs = Array.isArray(p.attributes) ? p.attributes : [];
        if (attrs.length) {
          const sub = el('div', { className: 'sub-rows' });
          attrs.forEach((a) => {
            const row = el('div', { className: 'sub-row' });
            const gran = a.granularity ? ' · ' + escapeHtml(String(a.granularity)) : '';
            row.innerHTML =
              '<span class="dash">—</span>' +
              '<span>' + escapeHtml(a.name || '(属性)') + gran + '</span>' +
              '<span class="sentiment-tag ' + sentimentClass(a.sentiment) + '" style="padding:3px 6px;font-size:10px">' +
                sentimentZh(a.sentiment) + '</span>';
            sub.appendChild(row);
          });
          card.appendChild(sub);
        } else {
          const note = el('div', { className: 'quote' });
          note.textContent = '无属性明细';
          card.appendChild(note);
        }
        prodSec.appendChild(card);
      });
    }
    out.appendChild(prodSec);

    $('#azMeta').textContent = products.length + ' 产品 · ' +
      products.reduce((a, x) => a + ((x.attributes || []).length), 0) + ' 属性';
  }

  // =========================================================================
  //  TAB 2 — ANNOTATION
  // =========================================================================
  function initAnnotation() {
    $('#anNewBtn').addEventListener('click', async () => {
      const s = { review: '在此粘贴评论 ...', products: [], attributes: [] };
      showLoader({ title: '创建样本', sub: 'POST /api/dataset/sample ...' });
      try {
        const saved = await createSample(s);
        state.dataset.samples.push(saved);
        state.activeSampleId = saved.id;
        renderSampleList();
        renderEditor();
        updateChips();
        setStatus('新样本已创建', '#7dffa8');
      } catch (e) {
        alert('创建失败：' + e.message); console.log(e);
      } finally {
        setTimeout(hideLoader, 200);
      }
    });

    $('#anSeedBtn').addEventListener('click', async () => {
      if (state.dataset.samples.length > 0 && !confirm('将追加示例样本到现有数据中，继续？')) return;
      const seeds = [
        {
          review: '这款索尼 WH-1000XM5 耳机的降噪效果真的绝了，地铁里几乎听不到任何噪音。但耳罩有点紧，戴久了耳朵疼。音质方面低音下潜不错，高音稍微有点刺耳。',
          products: [{ name: 'Sony WH-1000XM5' }],
          attributes: [
            { name: '降噪', granularity: '环境类型', sentiment: 'pos' },
            { name: '佩戴舒适度', granularity: '耳罩压力', sentiment: 'neg' },
            { name: '音质', granularity: '低音', sentiment: 'pos' },
            { name: '音质', granularity: '高音', sentiment: 'neg' },
          ],
        },
        {
          review: '购买的 iPhone 15 Pro 用了两个月，A17 Pro 芯片性能没得说，游戏全程流畅。但是电池续航比我之前的 14 Pro 还差。',
          products: [{ name: 'iPhone 15 Pro' }],
          attributes: [
            { name: '性能', granularity: '芯片', sentiment: 'pos' },
            { name: '续航', granularity: '对比前代', sentiment: 'neg' },
          ],
        },
        {
          review: '我买的戴尔 XPS 13 笔记本电脑做工非常不错，CNC 一体成型手感很好。键盘手感有点软，键程太短了。价格有点偏高了。',
          products: [{ name: 'Dell XPS 13' }],
          attributes: [
            { name: '做工', granularity: '材质工艺', sentiment: 'pos' },
            { name: '键盘', granularity: '键程', sentiment: 'neg' },
            { name: '价格', granularity: null, sentiment: 'neg' },
          ],
        },
      ];
      showLoader({ title: '插入演示样本', sub: 'POST /api/dataset/sample ...' });
      try {
        for (let i = 0; i < seeds.length; i++) {
          setProgress(Math.round((i / seeds.length) * 80), '第 ' + (i + 1) + ' / ' + seeds.length + ' 条');
          const saved = await createSample(seeds[i]);
          state.dataset.samples.push(saved);
        }
        state.activeSampleId = state.dataset.samples[state.dataset.samples.length - 1].id;
        setProgress(100, '完成');
        renderSampleList();
        renderEditor();
        updateChips();
        setStatus('已插入 ' + seeds.length + ' 条演示样本', '#7dffa8');
      } catch (e) {
        alert('插入失败：' + e.message); console.log(e);
      } finally {
        setTimeout(hideLoader, 250);
      }
    });

    $('#anSaveBtn').addEventListener('click', async () => {
      const current = state.dataset.samples.find((s) => s.id === state.activeSampleId);
      if (!current) { alert('请先选择或新建一条样本'); return; }
      const prodInputs = $$('#anProducts .product-row-edit');
      const products = prodInputs.map((row) => {
        const inputs = $$('input', row);
        return { name: (inputs[0]?.value || '').trim() };
      }).filter((p) => p.name);

      const attrs = $$('#anAttrs .attr-editor-card').map((card) => {
        const nameInput = $('input.attr-name-input', card);
        const sentSelect = $('select', card);
        const granInput = $('input.granularity-input', card);
        const name = (nameInput?.value || '').trim();
        if (!name) return null;
        const gran = (granInput?.value || '').trim();
        return {
          name,
          granularity: gran || null,
          sentiment: (sentSelect?.value || 'neu'),
        };
      }).filter(Boolean);

      const updated = {
        id: current.id,
        review: $('#anReview').value || '',
        products,
        attributes: attrs,
      };

      showLoader({ title: '保存样本', sub: 'POST /api/dataset/sample ...' });
      try {
        const saved = await createSample(updated);
        const idx = state.dataset.samples.findIndex((s) => s.id === current.id);
        if (idx >= 0) state.dataset.samples[idx] = saved;
        state.activeSampleId = saved.id;
        renderSampleList();
        renderEditor();
        updateChips();
        setStatus('已保存样本', '#7dffa8');
      } catch (e) {
        alert('保存失败：' + e.message); console.log(e);
      } finally {
        setTimeout(hideLoader, 200);
      }
    });

    $('#anDeleteBtn').addEventListener('click', async () => {
      const current = state.dataset.samples.find((s) => s.id === state.activeSampleId);
      if (!current) return;
      if (!confirm('确定删除此样本？')) return;
      showLoader({ title: '删除中', sub: 'DELETE /api/dataset/sample ...' });
      try {
        await deleteSample(current.id);
        state.dataset.samples = state.dataset.samples.filter((s) => s.id !== current.id);
        state.activeSampleId = state.dataset.samples[0]?.id || null;
        renderSampleList();
        renderEditor();
        updateChips();
        setStatus('样本已删除', '#7dffa8');
      } catch (e) {
        alert('删除失败：' + e.message); console.log(e);
      } finally {
        setTimeout(hideLoader, 200);
      }
    });

    renderSampleList();
    renderEditor();
  }

  function renderSampleList() {
    const list = $('#anList');
    const count = state.dataset.samples.length;
    $('#anCount').textContent = count + ' 条样本';
    if (!count) {
      list.innerHTML = '<div class="empty-state small" style="padding:24px 16px"><p style="margin:0;font-size:12px">尚无样本 · 点击【+ 新建样本】或【插入演示 3 条】开始</p></div>';
      return;
    }
    list.innerHTML = '';
    state.dataset.samples.forEach((s) => {
      const card = el('div', {
        className: 'sample-card' + (state.activeSampleId === s.id ? ' active' : ''),
      });
      const title = el('div', { className: 'sample-card-title' });
      title.textContent = s.review.slice(0, 140) || '(空评论)';
      const meta = el('div', { className: 'sample-card-meta' });
      meta.textContent = (s.products?.length || 0) + ' 产品 · ' + (s.attributes?.length || 0) + ' 属性 · ID ' + String(s.id).slice(0, 8);
      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener('click', () => {
        state.activeSampleId = s.id;
        renderSampleList();
        renderEditor();
      });
      list.appendChild(card);
    });
  }

  function renderEditor() {
    const current = state.dataset.samples.find((s) => s.id === state.activeSampleId);
    if (!current) {
      $('#anEmpty').hidden = false;
      $('#anEditor').hidden = true;
      $('#anEditorMeta').textContent = '选择或新建一条样本';
      return;
    }
    $('#anEmpty').hidden = true;
    $('#anEditor').hidden = false;
    $('#anEditorMeta').textContent = '编辑中 · ID ' + String(current.id).slice(0, 10);

    $('#anReview').value = current.review || '';

    const prodArea = $('#anProducts');
    prodArea.innerHTML = '';
    const existingProds = (current.products || []).slice();
    if (existingProds.length === 0) existingProds.push({ name: '' });
    existingProds.forEach((p) => prodArea.appendChild(renderProductRow(p)));
    const addProdBtn = el('button', { className: 'add-sub', text: '+ 添加产品' });
    addProdBtn.addEventListener('click', () => {
      prodArea.insertBefore(renderProductRow({ name: '' }), addProdBtn);
    });
    prodArea.appendChild(addProdBtn);

    const attrArea = $('#anAttrs');
    attrArea.innerHTML = '';
    const existingAttrs = (current.attributes || []).slice();
    if (existingAttrs.length === 0) existingAttrs.push({ name: '', granularity: null, sentiment: 'neu' });
    existingAttrs.forEach((a) => attrArea.appendChild(renderAttrCard(a)));
    const addAttrBtn = el('button', { className: 'add-sub', text: '+ 添加属性' });
    addAttrBtn.addEventListener('click', () => {
      attrArea.insertBefore(renderAttrCard({ name: '', granularity: null, sentiment: 'neu' }), addAttrBtn);
    });
    attrArea.appendChild(addAttrBtn);
  }

  function renderProductRow(p) {
    const row = el('div', { className: 'product-row-edit' });
    row.innerHTML =
      '<input type="text" placeholder="产品名（如：Sony WH-1000XM5）" value="' + escapeHtml(p.name || '') + '" />' +
      '<div></div>' +
      '<button class="row-remove" type="button">×</button>';
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    return row;
  }

  function renderAttrCard(a) {
    const card = el('div', { className: 'attr-editor-card' });
    const sent = sentimentClass(a.sentiment);
    card.innerHTML =
      '<div class="attr-head-edit">' +
        '<input class="attr-name-input" type="text" placeholder="属性名（如：降噪 / 续航 / 音质）" value="' + escapeHtml(a.name || '') + '" />' +
        '<select>' +
          ['pos', 'neu', 'neg'].map((v) =>
            '<option value="' + v + '"' + (sent === v ? ' selected' : '') + '>' + sentimentZh(v) + '</option>'
          ).join('') +
        '</select>' +
        '<button class="row-remove" type="button">×</button>' +
      '</div>' +
      '<div class="sub-edit-list">' +
        '<input class="granularity-input" type="text" placeholder="颗粒度（可选）" value="' + escapeHtml(a.granularity || '') + '" />' +
      '</div>';
    card.querySelector('.row-remove').addEventListener('click', () => card.remove());
    return card;
  }

  // =========================================================================
  //  TAB 3 — BENCHMARK
  // =========================================================================
  function initBenchmark() {
    $('#bmRunBtn').addEventListener('click', async () => {
      if (!state.dataset.samples.length) { alert('先在【样本标注】中添加样本'); return; }
      showLoader({ title: '基准评测', sub: 'POST /api/benchmark ...' });
      logLine('目标样本数：' + state.dataset.samples.length, true);
      $('#bmRunBtn').disabled = true;
      try {
        setProgress(10, '提交评测任务 ...');
        const result = await runBenchmark();
        setProgress(70, '计算 P/R/F1 ...');
        state.benchmarkResults = result;
        state.activeBenchmarkSampleId = (result.samples && result.samples[0] && result.samples[0].id) || null;
        setProgress(95, '渲染结果');
        renderBenchSummary(result);
        renderBenchTable(result);
        renderBenchDetail(result, state.activeBenchmarkSampleId);
        setProgress(100, '完成');
        setStatus('评测完成', '#7dffa8');
      } catch (err) {
        alert('评测失败：' + err.message);
        console.log(err);
        setStatus('评测失败', '#ff5d5d');
        logLine(err.message);
      } finally {
        $('#bmRunBtn').disabled = false;
        setTimeout(hideLoader, 300);
      }
    });

    $('#bmClearBtn').addEventListener('click', () => {
      if (!confirm('清除评测结果？')) return;
      state.benchmarkResults = null;
      state.activeBenchmarkSampleId = null;
      $('#bmSummary').hidden = true;
      $('#bmDetail').hidden = true;
      renderBenchTable(null);
    });

    renderBenchTable(null);
  }

  function pct(v) {
    if (v === undefined || v === null || isNaN(v)) return '—';
    return Math.round(Number(v) * 100);
  }
  function scoreCellClass(v) {
    if (v === undefined || v === null || isNaN(v)) return '';
    const n = Number(v);
    return n < 0.6 ? ' danger' : n < 0.8 ? ' amber' : '';
  }

  function renderBenchSummary(result) {
    if (!result) return;
    const overall = result.overall || {};
    const prod = overall.products || { p: 0, r: 0, f1: 0 };
    const attr = overall.attributes || { p: 0, r: 0, f1: 0 };
    const avgF1 = (Number(prod.f1 || 0) + Number(attr.f1 || 0)) / 2;
    $('#bmSummary').hidden = false;
    $('#smF1').textContent = pct(avgF1);
    $('#smProdP').textContent = pct(prod.p);
    $('#smProdR').textContent = pct(prod.r);
    $('#smProdF1').textContent = pct(prod.f1);
    $('#smAttrP').textContent = pct(attr.p);
    $('#smAttrR').textContent = pct(attr.r);
    $('#smAttrF1').textContent = pct(attr.f1);
    $('#smSent').textContent = pct(overall.sentiment_accuracy);
    const sampleCount = (result.samples || []).length;
    $('#smMeta').textContent = sampleCount + ' 条样本 · F1 使用宏平均';
    $('#bmStatusLine').textContent = '产品 F1 ' + pct(prod.f1) + '% · 属性 F1 ' + pct(attr.f1) + '%';
  }

  function renderBenchTable(result) {
    const tbody = $('#bmTbody');
    tbody.innerHTML = '';
    if (!result || !result.samples || !result.samples.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">尚未运行评测。先在【样本标注】中添加样本，再点击"运行评测"。</td></tr>';
      return;
    }
    result.samples.forEach((item, idx) => {
      const m = item.metrics || {};
      const tr = el('tr');
      if (state.activeBenchmarkSampleId === item.id) tr.classList.add('selected');
      tr.innerHTML =
        '<td>' + (idx + 1) + '</td>' +
        '<td style="max-width:420px">' + escapeHtml((item.review || '').slice(0, 140)) + '</td>' +
        '<td class="score-cell' + scoreCellClass(m.products && m.products.f1) + '">' + pct(m.products && m.products.f1) + '</td>' +
        '<td class="score-cell' + scoreCellClass(m.attributes && m.attributes.f1) + '">' + pct(m.attributes && m.attributes.f1) + '</td>' +
        '<td class="score-cell">' + pct(m.sentiment_accuracy) + '</td>' +
        '<td class="status-cell done">OK</td>';
      tr.addEventListener('click', () => renderBenchDetail(result, item.id));
      tbody.appendChild(tr);
    });
  }

  function renderBenchDetail(result, sampleId) {
    if (!result) return;
    state.activeBenchmarkSampleId = sampleId;
    const item = (result.samples || []).find((x) => x.id === sampleId);
    const detail = $('#bmDetail');
    if (!item) { detail.hidden = true; return; }
    detail.hidden = false;
    renderBenchTable(result);

    $('#bmDetailTitle').textContent = '样本详细对比 · GOLD 标注 vs 模型输出';
    const body = $('#bmDetailBody');
    body.innerHTML = '';

    const goldCol = el('div', { className: 'detail-col gold' });
    goldCol.innerHTML = '<h4>人工标注 — GOLD</h4>';
    const goldList = el('div', { className: 'detail-list' });
    const sample = item;
    (sample.products || []).forEach((p) => {
      const row = el('div', { className: 'detail-row match' });
      row.innerHTML = '<span>产品：' + escapeHtml(p.name || '(未命名)') + '</span><span class="tag-small">PRODUCT</span>';
      goldList.appendChild(row);
    });
    (sample.attributes || []).forEach((a) => {
      const row = el('div', { className: 'detail-row match' });
      const gran = a.granularity ? ' · ' + escapeHtml(String(a.granularity)) : '';
      row.innerHTML =
        '<span>' + escapeHtml(a.name || '(属性)') + gran + ' · ' + sentimentZh(a.sentiment) + '</span>' +
        '<span class="tag-small">ATTRIBUTE</span>';
      goldList.appendChild(row);
    });
    if (!(sample.products?.length) && !(sample.attributes?.length)) {
      goldList.innerHTML = '<div class="detail-row"><span style="color:var(--ink-mute)">空标注</span><span class="tag-small">EMPTY</span></div>';
    }
    goldCol.appendChild(goldList);
    body.appendChild(goldCol);

    const aiCol = el('div', { className: 'detail-col ai' });
    aiCol.innerHTML = '<h4>模型输出 — PREDICTION</h4>';
    const aiList = el('div', { className: 'detail-list' });
    const pred = item.prediction || {};
    const predProds = Array.isArray(pred.products) ? pred.products : [];
    const goldProdSet = new Set((sample.products || []).map((p) => String(p.name || '').trim().toLowerCase()));
    predProds.forEach((p) => {
      const matched = goldProdSet.has(String(p.name || '').trim().toLowerCase());
      const row = el('div', { className: 'detail-row ' + (matched ? 'match' : 'extra') });
      row.innerHTML = '<span>产品：' + escapeHtml(p.name || '(未命名)') + '</span><span class="tag-small">' + (matched ? 'MATCH ✓' : 'EXTRA ⚠') + '</span>';
      aiList.appendChild(row);
    });
    (sample.products || []).forEach((p) => {
      if (!predProds.find((x) => String(x.name || '').trim().toLowerCase() === String(p.name || '').trim().toLowerCase())) {
        const row = el('div', { className: 'detail-row miss' });
        row.innerHTML = '<span style="color:var(--ink-mute)">产品：' + escapeHtml(p.name || '(未命名)') + '</span><span class="tag-small">MISSING</span>';
        aiList.appendChild(row);
      }
    });
    const predAttrs = predProds.reduce((acc, pp) => acc.concat((pp.attributes || []).map((aa) => ({ product: pp.name, ...aa }))), []);
    const goldAttrMap = new Map();
    (sample.attributes || []).forEach((a) => goldAttrMap.set(String(a.name || '').trim().toLowerCase(), a));
    predAttrs.forEach((a) => {
      const key = String(a.name || '').trim().toLowerCase();
      const matched = goldAttrMap.has(key);
      const row = el('div', { className: 'detail-row ' + (matched ? 'match' : 'extra') });
      const gran = a.granularity ? ' · ' + escapeHtml(String(a.granularity)) : '';
      row.innerHTML =
        '<span>' + escapeHtml(a.name || '(属性)') + gran + ' · ' + sentimentZh(a.sentiment) + '</span>' +
        '<span class="tag-small">' + (matched ? 'MATCH ✓' : 'EXTRA ⚠') + '</span>';
      aiList.appendChild(row);
    });
    (sample.attributes || []).forEach((a) => {
      if (!predAttrs.find((x) => String(x.name || '').trim().toLowerCase() === String(a.name || '').trim().toLowerCase())) {
        const row = el('div', { className: 'detail-row miss' });
        row.innerHTML = '<span style="color:var(--ink-mute)">' + escapeHtml(a.name || '(属性)') + ' · ' + sentimentZh(a.sentiment) + '</span><span class="tag-small">MISSING</span>';
        aiList.appendChild(row);
      }
    });
    aiCol.appendChild(aiList);
    body.appendChild(aiCol);
  }

  // =========================================================================
  //  TAB 4 — DATA
  // =========================================================================
  function initData() {
    $('#cfgEndpoint').value = state.config.endpoint || '';
    $('#cfgKey').value = state.config.apiKey || '';
    $('#cfgModel').value = state.config.model || '';
    $('#cfgTemp').value = state.config.temperature || 0.3;

    $('#cfgSaveBtn').addEventListener('click', async () => {
      const cfg = {
        endpoint: $('#cfgEndpoint').value.trim(),
        apiKey: $('#cfgKey').value.trim(),
        model: $('#cfgModel').value.trim(),
        temperature: Number($('#cfgTemp').value || 0.3),
      };
      showLoader({ title: '保存配置', sub: 'POST /api/config ...' });
      try {
        const saved = await saveConfig(cfg);
        state.config = saved;
        $('#cfgKey').value = saved.apiKey || '';
        updateChips();
        setStatus('LLM 配置已保存', '#7dffa8');
        alert('配置已保存');
      } catch (e) {
        alert('保存失败：' + e.message); console.log(e);
      } finally {
        setTimeout(hideLoader, 200);
      }
    });

    refreshDatasetStats();

    $('#dsExportBtn').addEventListener('click', async () => {
      try {
        const ds = await api('GET', '/api/dataset');
        const blob = new Blob([JSON.stringify(ds, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'reviewsope-dataset-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) { alert('导出失败：' + e.message); console.log(e); }
    });

    $('#dsImportBtn').addEventListener('click', () => $('#dsFileInput').click());
    $('#dsFileInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const obj = JSON.parse(ev.target.result);
          if (!obj || !Array.isArray(obj.samples)) throw new Error('格式不正确：缺少 samples 数组');
          if (!confirm('将覆盖当前数据集（共 ' + obj.samples.length + ' 条样本），确定导入？')) return;
          showLoader({ title: '导入数据集', sub: 'POST /api/dataset/sample ...' });
          try {
            for (let i = 0; i < state.dataset.samples.length; i++) {
              try { await deleteSample(state.dataset.samples[i].id); } catch (_) {}
            }
            for (let i = 0; i < obj.samples.length; i++) {
              setProgress(Math.round((i / obj.samples.length) * 90), '第 ' + (i + 1) + ' / ' + obj.samples.length + ' 条');
              await createSample(obj.samples[i]);
            }
            await loadDataset();
            setProgress(100, '完成');
            renderSampleList();
            renderEditor();
            refreshDatasetStats();
            updateChips();
            setStatus('导入完成', '#7dffa8');
            alert('导入成功');
          } catch (e) {
            alert('导入失败：' + e.message); console.log(e);
          } finally {
            setTimeout(hideLoader, 250);
          }
        } catch (err) { alert('解析失败：' + err.message); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#dsClearBtn').addEventListener('click', async () => {
      if (!confirm('将清空所有样本，确定？')) return;
      showLoader({ title: '清空数据集', sub: 'DELETE ...' });
      try {
        const ids = state.dataset.samples.map((s) => s.id);
        for (let i = 0; i < ids.length; i++) {
          try { await deleteSample(ids[i]); } catch (_) {}
        }
        await loadDataset();
        state.activeSampleId = null;
        renderSampleList();
        renderEditor();
        refreshDatasetStats();
        updateChips();
        setStatus('数据集已清空', '#7dffa8');
      } catch (e) {
        alert('清空失败：' + e.message); console.log(e);
      } finally {
        setTimeout(hideLoader, 200);
      }
    });
  }

  function refreshDatasetStats() {
    const ds = state.dataset;
    const total = (ds.samples || []).length;
    const prods = (ds.samples || []).reduce((a, s) => a + (s.products?.length || 0), 0);
    const attrs = (ds.samples || []).reduce((a, s) => a + (s.attributes?.length || 0), 0);
    const stats = $('#dsStats');
    stats.innerHTML =
      '<b>' + total + '</b> 条样本 · <b>' + prods + '</b> 个产品实体 · <b>' + attrs + '</b> 条属性<br>' +
      '数据来源：/api/dataset';
    updateChips();
  }

  // =========================================================================
  //  BOOT
  // =========================================================================
  document.addEventListener('DOMContentLoaded', async function boot() {
    initTabs();
    const cancelBtn = document.getElementById('loaderCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => hideLoader());
    showLoader({ title: '初始化', sub: '加载配置与数据集 ...' });
    try {
      await Promise.all([loadConfig(), loadDataset()]);
    } catch (e) {
      console.log('boot load error:', e);
    }
    hideLoader();
    initQuickAnalyze();
    initAnnotation();
    initBenchmark();
    initData();
    setStatus('就绪', '#c6ff3d');
    updateChips();
    
    if (!state.config.endpoint || !state.config.apiKey || !state.config.model) {
      $$('.tab-btn')[3].click();
      alert('请先在「数据管理」页面配置您的 LLM API，然后再进行分析');
    }
  });
})();
