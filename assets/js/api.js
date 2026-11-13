/* api.js - 资源数据请求封装 + 下载/播放地址解析（静态化 · 外链映射版）
 *
 * 地址解析优先级（API.resolve / API.resolveAll）：
 *   1) assets/data/links.json 中有该 rel_path 的外链 → 使用外链（新窗口打开）
 *   2) 无外链，但 assets/data/available.json 声明 downloads/ 下存在该实体文件 → downloads/ 相对路径
 *   3) 两者皆无 → 返回 url = null，页面显示「待托管」，不发出任何请求（杜绝 404）
 */
const API = {
  _promises: {},
  _links: null,
  _available: null,

  /* ---------------- 基础数据请求 ---------------- */

  /**
   * 获取全部资源列表（assets/data/resources.json）
   */
  getResources() {
    if (!this._promises.resources) {
      this._promises.resources = fetch('assets/data/resources.json', { cache: 'no-store' }).then(res => {
        if (!res.ok) throw new Error('数据加载失败: HTTP ' + res.status);
        return res.json();
      });
    }
    return this._promises.resources;
  },

  /**
   * 按 id 查找单个资源
   */
  async getResourceById(id) {
    const data = await this.getResources();
    return (data.resources || []).find(r => r.id === id) || null;
  },

  /**
   * 获取各合集内部文件清单（assets/data/children.json，以合集 rel_path 为键）
   */
  getChildren() {
    if (!this._promises.children) {
      this._promises.children = fetch('assets/data/children.json', { cache: 'no-store' }).then(res => {
        if (!res.ok) throw new Error('数据加载失败: HTTP ' + res.status);
        return res.json();
      });
    }
    return this._promises.children;
  },

  /**
   * 获取音乐列表（assets/data/music.json）
   */
  getMusic() {
    if (!this._promises.music) {
      this._promises.music = fetch('assets/data/music.json', { cache: 'no-store' }).then(res => {
        if (!res.ok) throw new Error('数据加载失败: HTTP ' + res.status);
        return res.json();
      });
    }
    return this._promises.music;
  },

  /**
   * 获取外链映射表（assets/data/links.json）；文件缺失/格式错误时降级为空表
   */
  getLinks() {
    if (this._links) return Promise.resolve(this._links);
    if (!this._promises.links) {
      this._promises.links = fetch('assets/data/links.json', { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : {}))
        .catch(() => ({}))
        .then(json => {
          const map = {};
          if (json && typeof json === 'object' && !Array.isArray(json)) {
            Object.keys(json).forEach(k => {
              if (k.charAt(0) === '_') return;              // 下划线开头为说明项，忽略
              const v = json[k];
              if (typeof v === 'string' && v.trim()) map[k] = v.trim();
            });
          }
          this._links = map;
          return map;
        });
    }
    return this._promises.links;
  },

  /**
   * 获取本地实体文件清单（assets/data/available.json）；缺失时视为空，全部走「待托管」
   */
  getAvailable() {
    if (this._available) return Promise.resolve(this._available);
    if (!this._promises.available) {
      this._promises.available = fetch('assets/data/available.json', { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null)
        .then(json => {
          let list = [];
          if (Array.isArray(json)) list = json;
          else if (json && Array.isArray(json.files)) list = json.files;
          const set = new Set();
          list.forEach(p => { if (typeof p === 'string' && p.trim()) set.add(this.normalizeKey(p)); });
          this._available = set;
          return set;
        });
    }
    return this._promises.available;
  },

  /* ---------------- 地址解析 ---------------- */

  /**
   * 归一化相对路径键：反斜杠转斜杠、去掉前导 ./ 与 /、尝试解码 URI 编码
   */
  normalizeKey(relPath) {
    let key = String(relPath == null ? '' : relPath).replace(/\\/g, '/').trim();
    if (key.indexOf('./') === 0) key = key.slice(2);
    while (key.charAt(0) === '/') key = key.slice(1);
    if (key.indexOf('%') !== -1) {
      try { key = decodeURIComponent(key); } catch (e) { /* 保留原值 */ }
    }
    return key;
  },

  /**
   * 生成 downloads/ 相对 URL（逐段编码，保证中文与特殊字符安全）
   */
  downloadUrl(relPath) {
    const key = this.normalizeKey(relPath);
    const encoded = key.split('/').map(seg => encodeURIComponent(seg)).join('/');
    return 'downloads/' + encoded;
  },

  _resolveWith(relPath, links, available) {
    const key = this.normalizeKey(relPath);
    let url = links[key];
    if (url == null) {
      // 兼容键写法差异（前导斜杠、反斜杠等）
      const hit = Object.keys(links).find(k => this.normalizeKey(k) === key);
      if (hit !== undefined) url = links[hit];
    }
    if (url) return { key: key, url: url, external: true, local: false };
    if (available.has(key)) return { key: key, url: this.downloadUrl(key), external: false, local: true };
    return { key: key, url: null, external: false, local: false };
  },

  /**
   * 解析单个资源的最终地址
   * @returns {Promise<{key:string, url:string|null, external:boolean, local:boolean}>}
   */
  async resolve(relPath) {
    const [links, available] = await Promise.all([this.getLinks(), this.getAvailable()]);
    return this._resolveWith(relPath, links, available);
  },

  /**
   * 批量解析：Map<原 rel_path, 解析结果>
   */
  async resolveAll(relPaths) {
    const [links, available] = await Promise.all([this.getLinks(), this.getAvailable()]);
    const map = new Map();
    (relPaths || []).forEach(p => { map.set(p, this._resolveWith(p, links, available)); });
    return map;
  },

  /* ---------------- 可用性渲染 ---------------- */

  /**
   * 把解析结果套到元素上：有地址则写 href/target，无地址则置灰并拦截点击
   * @param {HTMLElement} el 目标元素（a / button）
   * @param {Object} res 解析结果
   * @param {Object} [opts] { label: 可用时文案, unavailableLabel: 禁用时文案 }
   */
  applyResolvedLink(el, res, opts) {
    if (!el) return;
    const o = opts || {};
    const label = el.querySelector('[data-res-label]');
    const hasUrl = !!(res && res.url);

    if (!hasUrl) {
      el.classList.add('is-unavailable');
      el.setAttribute('aria-disabled', 'true');
      el.removeAttribute('href');
      el.removeAttribute('target');
      el.removeAttribute('download');
      el.setAttribute('title', o.unavailableLabel || '该文件暂未托管，上传后可下载');
      el.style.opacity = '0.45';
      el.style.cursor = 'not-allowed';
      if (label) label.textContent = o.unavailableLabel || '待托管';
      el.onclick = ev => { ev.preventDefault(); return false; };
      return;
    }

    el.classList.remove('is-unavailable');
    el.removeAttribute('aria-disabled');
    el.style.opacity = '';
    el.style.cursor = '';
    el.onclick = null;
    el.setAttribute('href', res.url);
    if (res.external) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
      el.removeAttribute('download');
      el.setAttribute('title', '前往网盘获取');
      if (label) label.textContent = o.label || '前往网盘';
    } else {
      el.removeAttribute('target');
      el.removeAttribute('rel');
      el.setAttribute('download', '');
      el.setAttribute('title', '下载文件');
      if (label) label.textContent = o.label || '下载';
    }
  },

  /**
   * 自动绑定页面中带 data-res-path 的下载链接（index.html 自创软件等静态入口）
   */
  async bindResourceLinks(root) {
    const scope = root || document;
    const els = Array.prototype.slice.call(scope.querySelectorAll('[data-res-path]'));
    if (!els.length) return;
    const paths = els.map(el => el.getAttribute('data-res-path'));
    const map = await this.resolveAll(paths);
    els.forEach(el => {
      const p = el.getAttribute('data-res-path');
      this.applyResolvedLink(el, map.get(p), {
        label: el.dataset.label,
        unavailableLabel: el.dataset.unavailableLabel,
      });
    });
  },

  /* ---------------- 格式化工具 ---------------- */

  formatSize(size) {
    if (size == null || size === 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = size;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
  },

  formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts * 1000);
    const p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  CATEGORIES: ['系统镜像', '系统工具', '游戏相关', '常用软件', '美化主题', '网络工具', '文档资料', 'AI工具', '其他'],
};

/* 页面内静态入口（data-res-path）在 DOM 就绪后自动解析 */
document.addEventListener('DOMContentLoaded', () => {
  API.bindResourceLinks(document).catch(err => console.error('外链绑定失败:', err));
});
