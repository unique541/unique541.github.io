/* api.js - 资源数据请求封装（静态化版：读取 assets/data 静态 JSON，适配 GitHub Pages） */
const API = {
  /**
   * 获取全部资源列表（读取静态数据快照 assets/data/resources.json）
   * @returns {Promise<{count:number, file_count:number, updated_at:string, resources:Array}>}
   */
  async getResources() {
    const res = await fetch('assets/data/resources.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('数据加载失败: HTTP ' + res.status);
    return res.json();
  },

  /**
   * 按 id 查找单个资源
   */
  async getResourceById(id) {
    const data = await this.getResources();
    return data.resources.find(r => r.id === id) || null;
  },

  /**
   * 获取各合集内部文件清单（读取静态数据快照 assets/data/children.json）
   * @returns {Promise<Object>} 以合集相对路径为键的 Map
   */
  async getChildren() {
    const res = await fetch('assets/data/children.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('数据加载失败: HTTP ' + res.status);
    return res.json();
  },

  /**
   * 获取音乐列表（读取静态数据快照 assets/data/music.json）
   */
  async getMusic() {
    const res = await fetch('assets/data/music.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('数据加载失败: HTTP ' + res.status);
    return res.json();
  },

  /**
   * 生成下载 URL（相对 downloads/ 路径逐段编码，保证中文与特殊字符安全）
   */
  downloadUrl(relPath) {
    const encoded = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    return 'downloads/' + encoded;
  },

  /**
   * 格式化文件大小
   */
  formatSize(size) {
    if (size == null || size === 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = size;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
  },

  /**
   * 格式化时间戳
   */
  formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts * 1000);
    const p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  /**
   * 分类展示顺序
   */
  CATEGORIES: ['系统镜像', '系统工具', '游戏相关', '常用软件', '美化主题', '网络工具', '文档资料', 'AI工具', '其他'],
};
