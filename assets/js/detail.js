/* detail.js - 资源详情页渲染逻辑 */

(function () {
  const $ = sel => document.querySelector(sel);
  const CATEGORIES = API.CATEGORIES;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 生成详细介绍（2-3 句） ---------- */
  function buildIntro(it) {
    const paras = [];
    const cat = CATEGORIES.includes(it.category) ? it.category : '其他';

    const catText = {
      '系统镜像': '本资源属于系统镜像类别，镜像文件可用于制作启动盘、安装操作系统或进行系统恢复与部署。',
      '系统工具': '本资源属于系统工具类别，主要用于系统安装、激活、维护、优化或安全清理等场景。',
      '游戏相关': '本资源属于游戏相关类别，可能是游戏启动器、整合包或游戏辅助工具，下载后按说明使用即可。',
      '常用软件': '本资源属于常用软件类别，为日常使用的应用或工具安装包，下载后双击即可安装。',
      '美化主题': '本资源属于美化主题类别，可用于个性化定制桌面外观、鼠标指针或界面风格。',
      '网络工具': '本资源属于网络工具类别，用于文件下载、网络加速、远程连接或内网穿透等场景。',
      '文档资料': '本资源属于文档资料类别，为文本、清单或说明性文档，可在线查看或下载保存。',
      'AI工具': '本资源属于 AI 工具类别，为人工智能相关应用或工具。',
    };
    paras.push(catText[cat] || '本资源为breezebox收录的资源项目，可直接下载使用。');

    if (it.kind === 'folder') {
      paras.push(`该资源为文件夹合集，内部包含 ${it.child_count} 项内容，可通过下方「文件夹内部文件」逐个下载全部文件。`);
    } else {
      const ext = (it.type || '').toLowerCase();
      if (ext === 'exe') paras.push('该文件为 Windows 可执行程序安装包，下载完成后双击运行，按安装向导提示即可完成安装。');
      else if (ext === 'msi') paras.push('该文件为 MSI 安装程序，下载后双击即可按向导安装，适合需要静默参数或企业批量部署的场景。');
      else if (ext === 'zip') paras.push('该文件为 ZIP 压缩包，下载后使用解压软件（如 WinRAR、7-Zip）解压即可使用。');
      else if (ext === 'iso') paras.push('该文件为 ISO 光盘镜像，可刻录到 U 盘制作启动盘，或使用虚拟光驱工具挂载后访问内部文件。');
      else if (ext === 'mrpack') paras.push('该文件为 Minecraft 整合包（Modrinth 格式），可直接导入 PCL2、HMCL 等支持 Modrinth 的启动器使用。');
      else if (ext === 'txt') paras.push('该文件为纯文本文档，可直接下载后使用记事本等工具打开查看。');
      else if (['cur', 'ani'].includes(ext)) paras.push('该文件为鼠标指针 / 光标皮肤资源，配合右键安装脚本或系统鼠标设置即可应用。');
      else paras.push(`该文件为 ${ext ? ext.toUpperCase() : '未知'} 格式资源，下载后按文件类型选择合适工具打开或安装。`);
    }
    paras.push('请通过下方按钮下载，下载后请核对文件完整性与安全性后再使用。');

    return paras.map(p => `<p>${escapeHtml(p)}</p>`).join('');
  }

  /* ---------- 下载区 ---------- */
  function buildDownloadZone(it) {
    const zone = $('#dDownloadZone');
    if (it.kind === 'folder') {
      zone.innerHTML = `
        <a class="btn btn-primary btn-glow" href="${API.zipUrl(it.rel_path)}">
          打包下载 ZIP
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
        <div class="download-size">合集包含 <strong>${it.child_count}</strong> 项文件，点击一键打包下载（自动排除敏感子文件夹）</div>`;
    } else {
      zone.innerHTML = `
        <a class="btn btn-primary btn-glow" href="${API.downloadUrl(it.rel_path)}">
          立即下载
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
        <div class="download-size">文件大小 <strong>${it.size_text}</strong></div>`;
    }
  }

  /* ---------- 文件夹内部文件列表（单文件下载） ---------- */
  async function buildInnerList(it) {
    if (it.kind !== 'folder') return;
    const box = $('#dInnerFiles');
    box.innerHTML = '<p class="inner-hint">正在加载内部文件…</p>';
    $('#dInnerList').hidden = false;

    let files = [];
    try {
      const childrenData = await API.getChildren();
      const entry = childrenData[it.rel_path];
      files = (entry && entry.files) ? entry.files : [];
    } catch (e) {
      box.innerHTML = '<p class="inner-hint">内部文件加载失败，请刷新重试</p>';
      console.error(e);
      return;
    }

    if (files.length === 0) {
      box.innerHTML = '<p class="inner-hint">该合集暂无可单独下载的文件</p>';
      return;
    }

    box.innerHTML = '';
    files.forEach(f => {
      const row = document.createElement('a');
      row.className = 'inner-file';
      row.href = API.downloadUrl(f.rel_path);
      row.innerHTML = `
        <span class="inner-file-name">${escapeHtml(f.name)}</span>
        <span class="inner-file-meta">
          <span class="tag tag-type">${f.type}</span>
          <span class="inner-file-size">${f.size_text}</span>
          <span class="inner-file-dl">下载</span>
        </span>`;
      box.appendChild(row);
    });
  }

  /* ---------- 相关推荐 ---------- */
  function buildRelated(it, all) {
    const sameCat = all.filter(x => x.id !== it.id && x.category === it.category);
    const related = sameCat.slice(0, 4);
    if (related.length === 0) return;
    $('#relatedWrap').hidden = false;
    const box = $('#relatedList');
    box.innerHTML = '';
    related.forEach(r => {
      const a = document.createElement('a');
      a.className = 'res-card';
      a.href = `detail.html?id=${encodeURIComponent(r.id)}`;
      a.innerHTML = `
        <div class="res-meta">
          ${r.kind === 'folder' ? `<span class="res-kind">合集 · ${r.child_count} 项</span>` : `<span class="tag tag-type">${r.type}</span>`}
          <span class="tag tag-category">${r.category}</span>
        </div>
        <h3 class="res-card-name">${escapeHtml(r.name)}</h3>
        <div class="res-card-foot"><span class="res-size">${r.size_text || '-'}</span></div>`;
      box.appendChild(a);
    });
  }

  /* ---------- 主流程 ---------- */
  async function init() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    try {
      const data = await API.getResources();
      const it = data.resources.find(x => x.id === id);
      if (!it) {
        $('#loadingWrap').hidden = true;
        $('#notFound').hidden = false;
        document.title = '资源不存在 - breezebox';
        return;
      }
      document.title = it.name + ' - breezebox';
      $('#dCategory').textContent = it.category;
      $('#dType').textContent = it.kind === 'folder' ? '文件夹/合集' : it.type;
      $('#dName').textContent = it.name;
      $('#dDesc').textContent = it.desc;
      $('#dSize').textContent = it.kind === 'folder' ? it.child_count + ' 项' : it.size_text;
      $('#dType2').textContent = it.kind === 'folder' ? '文件夹/合集' : (it.type || '-');
      $('#dMtime').textContent = API.formatTime(it.mtime);
      $('#dPath').textContent = it.rel_path;
      $('#dIntro').innerHTML = buildIntro(it);
      buildDownloadZone(it);
      await buildInnerList(it);
      buildRelated(it, data.resources || []);

      $('#loadingWrap').hidden = true;
      $('#detailContent').hidden = false;
      // 触发 reveal 动画
      requestAnimationFrame(() => {
        document.querySelectorAll('#detailContent .reveal').forEach(el => el.classList.add('visible'));
      });
    } catch (e) {
      $('#loadingWrap').hidden = true;
      $('#notFound').hidden = false;
      $('#notFound .empty-sub').textContent = '数据加载失败，请刷新重试';
      console.error(e);
    }
  }

  init();
})();
