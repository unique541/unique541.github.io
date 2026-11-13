/* music.js - 音乐库页面逻辑：静态数据 / 在线播放 / 下载
 * 地址统一由 API.resolve 解析（外链 > downloads/ 实体 > 待托管），
 * 无可用地址的曲目不发出任何播放/下载请求，避免 404。 */
(function () {
  'use strict';

  const listEl = document.getElementById('musicList');
  const loadingEl = document.getElementById('loadingWrap');
  const emptyEl = document.getElementById('emptyState');
  const searchInput = document.getElementById('musicSearchInput');
  const searchCount = document.getElementById('musicSearchCount');
  const playerBar = document.getElementById('musicPlayerBar');
  const playerName = document.getElementById('musicPlayerName');
  const audioEl = document.getElementById('musicAudio');
  const closeBtn = document.getElementById('musicPlayerClose');

  let currentPlay = null; // 当前正在播放的歌曲相对路径
  let allItems = [];      // 静态数据中的完整音乐列表（供搜索过滤）

  // 图标（与站点风格一致的描边 SVG）
  const ICON_PLAY =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8 5 19 12 8 19 8 5"/></svg>';
  const ICON_DOWNLOAD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const ICON_MUSIC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

  const TIP_UNAVAILABLE = '该曲目暂未托管';

  function isReady(it) {
    return !!(it && it._res && it._res.url);
  }

  // 在条目副标题处闪示一次提示（不改样式主题，仅临时替换文本）
  function flashTip(it, msg) {
    const row = listEl.querySelector('.music-item[data-index="' + it.idx + '"]');
    if (!row) return;
    const tip = row.querySelector('.music-size');
    if (!tip || tip.dataset.locked === '1') return;
    const original = tip.textContent;
    tip.dataset.locked = '1';
    tip.textContent = msg;
    setTimeout(() => {
      tip.textContent = original;
      delete tip.dataset.locked;
    }, 1800);
  }

  function renderList(items) {
    listEl.innerHTML = '';
    items.forEach((it, idx) => {
      it.idx = idx; // 用于播放时定位条目
      const row = document.createElement('div');
      row.className = 'music-item reveal' + (idx === 0 ? ' visible' : '');
      row.dataset.index = idx;

      const cover = document.createElement('div');
      cover.className = 'music-cover';
      cover.innerHTML = ICON_MUSIC;

      const info = document.createElement('div');
      info.className = 'music-info';
      const name = document.createElement('div');
      name.className = 'music-name';
      name.textContent = it.name;
      const size = document.createElement('div');
      size.className = 'music-size';
      const sizeText = it.size_text || API.formatSize(it.size);
      // 无可用地址时在副标题直接标注，让用户明确知道原因
      size.textContent = isReady(it) ? sizeText : sizeText + ' · ' + TIP_UNAVAILABLE;
      info.appendChild(name);
      info.appendChild(size);

      const actions = document.createElement('div');
      actions.className = 'music-actions';

      // 播放按钮：无可用地址则禁用并拦截点击，绝不向不存在的地址发起请求
      const playBtn = document.createElement('button');
      playBtn.className = 'music-btn music-play';
      playBtn.setAttribute('aria-label', '播放');
      playBtn.innerHTML = ICON_PLAY;
      if (isReady(it)) {
        playBtn.title = '播放 ' + it.name;
        playBtn.addEventListener('click', () => play(it));
      } else {
        playBtn.title = TIP_UNAVAILABLE + '，无法播放：' + it.name;
        playBtn.setAttribute('aria-disabled', 'true');
        playBtn.disabled = true;
        playBtn.style.opacity = '0.45';
        playBtn.style.cursor = 'not-allowed';
        playBtn.addEventListener('click', ev => {
          ev.preventDefault();
          flashTip(it, TIP_UNAVAILABLE + '，无法播放');
        });
      }

      // 下载按钮：外链新窗口打开，本地实体走 downloads/，缺失则禁用
      const dlBtn = document.createElement('a');
      dlBtn.className = 'music-btn music-dl';
      dlBtn.setAttribute('aria-label', '下载');
      dlBtn.innerHTML = ICON_DOWNLOAD;
      if (isReady(it)) {
        dlBtn.href = it._res.url;
        if (it._res.external) {
          dlBtn.target = '_blank';
          dlBtn.rel = 'noopener noreferrer';
          dlBtn.title = '前往网盘获取 ' + it.name;
        } else {
          dlBtn.setAttribute('download', '');
          dlBtn.title = '下载 ' + it.name;
        }
      } else {
        dlBtn.removeAttribute('href');
        dlBtn.setAttribute('aria-disabled', 'true');
        dlBtn.setAttribute('role', 'button');
        dlBtn.title = TIP_UNAVAILABLE + '，无法下载：' + it.name;
        dlBtn.style.opacity = '0.45';
        dlBtn.style.cursor = 'not-allowed';
        dlBtn.addEventListener('click', ev => {
          ev.preventDefault();
          flashTip(it, TIP_UNAVAILABLE + '，无法下载');
        });
      }

      actions.appendChild(playBtn);
      actions.appendChild(dlBtn);

      row.appendChild(cover);
      row.appendChild(info);
      row.appendChild(actions);
      listEl.appendChild(row);
    });

    // reveal 交错入场
    const reveals = listEl.querySelectorAll('.reveal:not(.visible)');
    reveals.forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), 60 * i + 60);
    });
  }

  function updateSearchCount(count) {
    if (searchCount) searchCount.textContent = count + ' / ' + allItems.length;
  }

  // 搜索过滤：按歌曲名实时匹配，无匹配时显示空状态
  function applyFilter() {
    const kw = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const filtered = kw
      ? allItems.filter(it => it.name.toLowerCase().includes(kw))
      : allItems.slice();
    if (!filtered.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.querySelector('.empty-title').textContent = '未找到相关歌曲';
      emptyEl.querySelector('.empty-sub').textContent = '换个关键词试试，例如歌手名或歌曲名';
      updateSearchCount(0);
      return;
    }
    emptyEl.hidden = true;
    renderList(filtered);
    updateSearchCount(filtered.length);
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
  }

  function play(it) {
    if (!isReady(it)) {
      flashTip(it, TIP_UNAVAILABLE + '，无法播放');
      return;
    }
    currentPlay = it.rel_path;
    playerName.textContent = it.name;
    playerName.title = it.name;
    audioEl.src = it._res.url;
    playerBar.hidden = false;
    audioEl.play().catch(() => { /* 用户后续可手动点击播放 */ });

    // 高亮当前播放条目
    listEl.querySelectorAll('.music-item.playing').forEach(el => el.classList.remove('playing'));
    const cur = listEl.querySelector('.music-item[data-index="' + it.idx + '"]');
    if (cur) cur.classList.add('playing');
  }

  closeBtn.addEventListener('click', () => {
    audioEl.pause();
    audioEl.removeAttribute('src');
    playerBar.hidden = true;
    listEl.querySelectorAll('.music-item.playing').forEach(el => el.classList.remove('playing'));
    currentPlay = null;
  });

  // 加载失败时让播放按钮/播放器复位（并提示原因，指向网盘或等待上传）
  audioEl.addEventListener('error', () => {
    listEl.querySelectorAll('.music-item.playing').forEach(el => el.classList.remove('playing'));
    currentPlay = null;
  });

  async function load() {
    loadingEl.hidden = false;
    emptyEl.hidden = true;
    try {
      const data = await API.getMusic();
      loadingEl.hidden = true;
      const raw = (data && data.music !== undefined) ? data.music : data;
      const items = Array.isArray(raw) ? raw : [];
      if (!items.length) {
        allItems = [];
        emptyEl.hidden = false;
        updateSearchCount(0);
        return;
      }
      // 统一解析每首曲目的可用地址（外链 > downloads/ 实体 > 待托管）
      const map = await API.resolveAll(items.map(it => it.rel_path));
      items.forEach(it => { it._res = map.get(it.rel_path) || { url: null }; });
      allItems = items;
      renderList(items);
      updateSearchCount(items.length);
    } catch (err) {
      loadingEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.querySelector('.empty-title').textContent = '音乐列表加载失败';
      emptyEl.querySelector('.empty-sub').textContent = '请确认音乐数据文件存在后刷新重试';
      console.error('加载音乐列表失败:', err);
    }
  }

  load();
})();
