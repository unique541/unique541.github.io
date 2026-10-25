/* main.js - 全局交互与动画特效 */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- 滚动进度条 ---------- */
  const progress = document.getElementById('scrollProgress');
  if (progress) {
    const updateProgress = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  /* ---------- Hero 视差：背景光斑随滚动缓慢上移 ---------- */
  const blobs = document.getElementById('bgBlobs');
  if (blobs) {
    const els = blobs.querySelectorAll('.blob');
    const speeds = [0.06, 0.10, 0.04];
    const origins = [];
    els.forEach((el, i) => {
      origins.push({ y: 0, speed: speeds[i % speeds.length] });
    });
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      els.forEach((el, i) => {
        el.style.transform = `translateY(${y * origins[i].speed}px)`;
      });
    }, { passive: true });
  }

  /* ---------- Reveal 滚动动画（IntersectionObserver） ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = parseInt(entry.target.dataset.delay || '0', 10);
          entry.target.style.transitionDelay = delay * 0.12 + 's';
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('visible'));
  }

  /* ---------- 页脚资源统计（主页） ---------- */
  const footerStats = document.getElementById('footerStats');
  if (footerStats) {
    API.getResources()
      .then(data => {
        footerStats.innerHTML = `当前收录 <strong>${data.count}</strong> 项资源（${data.file_count} 个可下载文件） · 最近更新 ${data.updated_at || '-'}`;
      })
      .catch(() => {
        footerStats.textContent = '资源统计加载失败，请确认服务已启动（python start_server.py）';
      });
  }
});
