/* api.js - 资源数据请求封装 */
const API = {
  /**
   * 获取全部资源列表（实时请求服务端动态扫描结果）
   * @returns {Promise<{root:string, count:number, file_count:number, updated_at:string, resources:Array}>}
   */
  async getResources() {
    const res = await fetch('/api/resources', { cache: 'no-store' });
    if (!res.ok) throw new Error('API 请求失败: HTTP ' + res.status);
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
   * 生成下载 URL（相对路径逐段编码，保证中文与特殊字符安全）
   */
  downloadUrl(relPath) {
    const encoded = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    return '/download/' + encoded;
  },

  /**
   * 生成文件夹整体打包 ZIP 下载 URL
   */
  zipUrl(relPath) {
    const encoded = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    return '/api/zip?path=' + encoded;
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
