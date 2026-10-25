/* music.js - 音乐库页面逻辑：静态数据 / 在线播放 / 下载 */
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

  function renderList(items) {
    listEl.innerHTML = '';
    items.forEach((it, idx) => {
      it.idx = idx; // 用于播放时定位条目
      const item = document.createElement('div');
      item.className = 'music-item reveal' + (idx === 0 ? ' visible' : '');
      item.dataset.index = idx;

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
      size.textContent = it.size_text || API.formatSize(it.size);
      info.appendChild(name);
      info.appendChild(size);

      const actions = document.createElement('div');
      actions.className = 'music-actions';

      const playBtn = document.createElement('button');
      playBtn.className = 'music-btn music-play';
      playBtn.title = '播放 ' + it.name;
      playBtn.setAttribute('aria-label', '播放');
      playBtn.innerHTML = ICON_PLAY;
      playBtn.addEventListener('click', () => play(it));

      const dlBtn = document.createElement('a');
      dlBtn.className = 'music-btn music-dl';
      dlBtn.href = it.download_url;
      dlBtn.title = '下载 ' + it.name;
      dlBtn.setAttribute('aria-label', '下载');
      dlBtn.setAttribute('download', '');
      dlBtn.innerHTML = ICON_DOWNLOAD;

      actions.appendChild(playBtn);
      actions.appendChild(dlBtn);

      item.appendChild(cover);
      item.appendChild(info);
      item.appendChild(actions);
      listEl.appendChild(item);
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
    currentPlay = it.rel_path;
    playerName.textContent = it.name;
    playerName.title = it.name;
    audioEl.src = it.play_url;
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

  // 加载失败时让播放按钮/播放器复位
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
      allItems = items;
      if (!items.length) {
        emptyEl.hidden = false;
        updateSearchCount(0);
        return;
      }
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
