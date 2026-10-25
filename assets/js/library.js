/* library.js - 资源集合库渲染逻辑 */

(function () {
  const state = {
    data: null,
    items: [],
    keyword: '',
  };

  const $ = sel => document.querySelector(sel);
  const CATEGORIES = API.CATEGORIES;

  /* ---------- 初始化 ---------- */
  async function init() {
    try {
      state.data = await API.getResources();
      state.items = state.data.resources || [];
      $('#loadingWrap').hidden = true;
      if (state.items.length === 0) {
        $('#emptyState').hidden = false;
        return;
      }
      render();
    } catch (e) {
      $('#loadingWrap').hidden = true;
      $('#emptyState').hidden = false;
      $('#emptyState .empty-title').textContent = '资源加载失败';
      $('#emptyState .empty-sub').textContent = '请确认资源数据文件存在后刷新页面';
      console.error(e);
    }
  }

  /* ---------- 过滤 ---------- */
  function filterItems() {
    const kw = state.keyword.trim().toLowerCase();
    if (!kw) return state.items;
    return state.items.filter(it => {
      return (it.name && it.name.toLowerCase().includes(kw)) ||
             (it.category && it.category.toLowerCase().includes(kw)) ||
             (it.type && it.type.toLowerCase().includes(kw)) ||
             (it.desc && it.desc.toLowerCase().includes(kw));
    });
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const matched = filterItems();
    $('#searchCount').textContent = `${matched.length} / ${state.items.length}`;

    if (matched.length === 0) {
      $('#emptyState').hidden = false;
      $('#categorySections').innerHTML = '';
      return;
    }
    $('#emptyState').hidden = true;

    const wrap = $('#categorySections');
    wrap.innerHTML = '';

    const grouped = {};
    CATEGORIES.forEach(c => (grouped[c] = []));
    matched.forEach(it => {
      const c = CATEGORIES.includes(it.category) ? it.category : '其他';
      grouped[c].push(it);
    });

    CATEGORIES.forEach((cat, idx) => {
      const list = grouped[cat];
      if (!list || list.length === 0) return;
      const sec = document.createElement('section');
      sec.className = 'category-section reveal';
      sec.style.transitionDelay = (idx % 3) * 0.08 + 's';
      sec.innerHTML = `
        <h2 class="category-title">${cat} <span class="category-count">${list.length}</span></h2>
        <div class="cards-grid"></div>`;
      const grid = sec.querySelector('.cards-grid');
      list.forEach(it => grid.appendChild(buildCard(it)));
      wrap.appendChild(sec);
    });

    // 渲染完成后立即隐藏加载提示
    $('#loadingWrap').hidden = true;
    // 触发新渲染区域的 reveal 动画
    requestAnimationFrame(() => {
      wrap.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    });
  }

  /* ---------- 资源卡片 ---------- */
  function buildCard(it) {
    const a = document.createElement('a');
    a.className = 'res-card';
    a.href = `detail.html?id=${encodeURIComponent(it.id)}`;

    const kindTag = it.kind === 'folder'
      ? `<span class="res-kind">合集 · ${it.child_count} 项</span>`
      : `<span class="tag tag-type">${it.type}</span>`;

    a.innerHTML = `
      <div class="res-meta">${kindTag}<span class="tag tag-category">${it.category}</span></div>
      <h3 class="res-card-name">${escapeHtml(it.name)}</h3>
      <p class="res-card-desc">${escapeHtml(it.desc)}</p>
      <div class="res-card-foot">
        <span class="res-size">${it.size_text || '-'}</span>
        <span class="res-kind">${it.kind === 'folder' ? '进入合集' : '立即下载'}</span>
      </div>`;
    return a;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 搜索事件 ---------- */
  const input = $('#searchInput');
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.keyword = input.value;
      render();
    }, 160);
  });

  init();
})();
