# -*- coding: utf-8 -*-
"""
优选资源库 - 本地下载服务
=================================
纯 Python 标准库实现，无需安装任何第三方依赖。

功能：
  - 静态站点服务（/、/library.html、/detail.html、/assets/...）
  - /api/resources  动态递归扫描资源目录，返回 JSON 资源列表（5 秒缓存）
  - /api/zip?path=  将文件夹（合集）整体打包为 ZIP 流式下载（排除「病毒」「常用」）
  - /download/...   文件下载（支持目录浏览、URL 解码、路径穿越防护、
                     正确 Content-Type / Content-Disposition、Range 断点续传）
  - assets/data/intros.json 介绍知识库：扫描生成条目时按名称关键词匹配，
    命中后覆盖该资源的展示名称（name）与详细介绍（desc）

资源目录内容发生变化时，无需修改任何代码：
  刷新页面 -> 前端请求 /api/resources -> 服务端重新扫描 -> 自动同步。
"""

import hashlib
import json
import mimetypes
import os
import socket
import time
import urllib.parse
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ==================== 配置区（可按需修改） ====================
RESOURCE_ROOT = r"C:\Users\1107\Desktop\U盘备份"   # 资源实体目录
PORT = 8000                                        # 服务端口
CACHE_SECONDS = 5                                  # 资源扫描缓存秒数
# ===============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INTROS_PATH = os.path.join(BASE_DIR, "assets", "data", "intros.json")  # 介绍知识库文件
MUSIC_ROOT = os.path.join(BASE_DIR, "音乐")  # 音乐库目录（网站文件夹内）

# 分类映射规则：按顺序匹配，命中即归入该分类（使用子串匹配，不区分大小写）。
# 注意：匹配对象为资源的相对路径（含顶层文件夹名），因此文件夹内部文件会
# 继承其所在顶层文件夹的分类；具体工具关键词优先于宽泛的「系统」。
CLASSIFY_RULES = [
    ("系统工具", ["office", "vm", "激活", "wub", "spacesniffer", "winhance", "softcnkiller", "设置工具"]),
    ("游戏相关", ["mc", "minecraft", "启动器", "整合", "steam", "游戏", "luckygame"]),
    ("系统镜像", ["系统"]),
    ("美化主题", ["灵动岛", "鼠标", "皮肤"]),
    ("常用软件", ["其他应用", "音乐"]),
    ("网络工具", ["radmin", "ndm", "下载"]),
    ("AI工具", ["马维斯", "marvis", "ai"]),
    ("文档资料", ["软件.txt", "好物", "文档"]),
]
DEFAULT_CATEGORY = "其他"

# 排除规则：这些顶层文件夹（及其整个子树）不收录
EXCLUDED_DIRS = {"病毒", "常用", "其他应用", "其他应用及文档"}

_cache = {"ts": 0, "data": None}
_music_cache = {"ts": 0, "data": None}

# 音乐库支持的音频扩展名
AUDIO_EXTS = {".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".ape", ".wma", ".opus"}

# 音频文件 MIME 映射：显式声明，避免 Windows 注册表缺省时被识别为
# application/octet-stream 导致部分浏览器拒绝内联播放
AUDIO_MIME = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".ape": "audio/ape",
    ".wma": "audio/x-ms-wma",
    ".opus": "audio/ogg",
}


# ---------------------- 工具函数 ----------------------
def classify(rel_path):
    """按相对路径（含顶层文件夹名）关键词映射分类。"""
    low = rel_path.lower()
    for cat, kws in CLASSIFY_RULES:
        for kw in kws:
            if kw in low:
                return cat
    return DEFAULT_CATEGORY


def fmt_size(n):
    """字节数格式化为人类可读大小。"""
    if n < 1024:
        return f"{n} B"
    for unit in ("KB", "MB", "GB", "TB"):
        n /= 1024.0
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}"
    return f"{n:.1f} TB"


def make_id(prefix, rel):
    """基于相对路径生成稳定 id（路径不变则 id 不变）。"""
    return hashlib.md5((prefix + ":" + rel).encode("utf-8")).hexdigest()[:12]


def default_desc(name, kind, ext=""):
    """根据名称 / 分类 / 类型生成一句话简介。"""
    cat = classify(name)
    if kind == "folder":
        return f"「{name}」资源合集，内含多个文件，可进入详情页查看内部文件并下载。"
    if cat == "系统镜像":
        return f"系统镜像文件（{ext}），可用于安装或部署对应操作系统。"
    if cat == "游戏相关":
        return "游戏相关资源，包含启动器、整合包或游戏工具。"
    if cat == "系统工具":
        return "系统工具软件，用于系统安装、激活、维护或优化。"
    if cat == "美化主题":
        return "桌面美化资源，可用于个性化定制系统外观。"
    if cat == "网络工具":
        return "网络工具软件，用于下载、加速或远程连接。"
    if cat == "AI工具":
        return "AI 工具安装包或资源。"
    if cat == "文档资料":
        return "文档或资料文件，可在线查看或下载。"
    if ext == "exe":
        return "Windows 应用程序安装包，下载后双击即可安装。"
    if ext == "msi":
        return "Windows 安装程序（MSI），下载后双击即可安装。"
    if ext == "zip":
        return "压缩包资源，下载后解压即可使用。"
    if ext == "iso":
        return "光盘镜像文件，可用于安装系统或挂载使用。"
    if ext == "txt":
        return "文本文档，包含说明或清单信息。"
    if ext in ("cur", "ani"):
        return "鼠标指针/光标皮肤资源。"
    if ext == "cmd":
        return "命令行脚本文件。"
    if ext == "mrpack":
        return "Minecraft 整合包（Modrinth 格式），可导入 PCL 等启动器使用。"
    return f"文件资源（{ext or '未知类型'}），可直接下载使用。"


def _file_item(fs_path, rel_path, name):
    """生成单个文件条目。"""
    try:
        st = os.stat(fs_path)
    except OSError:
        return None
    suffix = Path(name).suffix
    ext = suffix[1:].lower() if suffix else "文件"
    return {
        "id": make_id("file", rel_path),
        "name": name,
        "category": classify(rel_path),
        "type": ext,
        "size": st.st_size,
        "size_text": fmt_size(st.st_size),
        "mtime": int(st.st_mtime),
        "rel_path": rel_path,
        "kind": "file",
        "child_count": 0,
        "desc": default_desc(name, "file", ext),
    }


def _folder_item(fs_path, rel_path, name, child_count):
    """生成文件夹（合集）条目。"""
    try:
        st = os.stat(fs_path)
        mtime = int(st.st_mtime)
    except OSError:
        mtime = 0
    return {
        "id": make_id("dir", rel_path),
        "name": name,
        "category": classify(rel_path),
        "type": "文件夹/合集",
        "size": 0,
        "size_text": "-",
        "mtime": mtime,
        "rel_path": rel_path,
        "kind": "folder",
        "child_count": child_count,
        "desc": default_desc(name, "folder"),
    }


def _count_files(path):
    """递归统计文件夹内文件总数（跳过「病毒」「常用」子文件夹）。"""
    total = 0
    try:
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
            total += len(files)
    except OSError:
        pass
    return total


def list_children(rel_path):
    """递归列出合集文件夹内全部文件条目（跳过「病毒」「常用」子文件夹）。

    返回按路径排序的文件条目列表；目标不是文件夹或路径非法时返回 None。
    """
    rel = urllib.parse.unquote(rel_path).strip("/")
    if not rel:
        return None
    target = safe_join(RESOURCE_ROOT, rel)
    if target is None or not os.path.isdir(target):
        return None
    items = []
    try:
        for root, dirs, files in os.walk(target):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
            for fn in sorted(files):
                fp = os.path.join(root, fn)
                child_rel = os.path.relpath(fp, RESOURCE_ROOT).replace(os.sep, "/")
                it = _file_item(fp, child_rel, fn)
                if it:
                    items.append(it)
    except OSError:
        return None
    return items


def scan_dir(path, rel=""):
    """扫描资源根目录，生成资源条目列表。

    - 顶层文件夹 → 仅生成"文件夹/合集"条目，不展开内部文件为独立条目
      （内部文件通过「打包下载 ZIP」整体下载）；
    - 顶层文件 → 独立资源条目（单文件下载）；
    - 排除名为「病毒」「常用」的文件夹；空文件夹（内部无文件）不收录。
    """
    items = []
    try:
        entries = sorted(
            os.scandir(path),
            key=lambda e: (e.is_dir(follow_symlinks=False), e.name.lower()),
        )
    except OSError:
        return items

    for entry in entries:
        name = entry.name
        if entry.is_dir(follow_symlinks=False):
            if name in EXCLUDED_DIRS:
                continue
            child_rel = (rel + "/" + name) if rel else name
            child_count = _count_files(entry.path)
            if child_count == 0:
                continue  # 空文件夹不收录
            items.append(_folder_item(entry.path, child_rel, name, child_count))
        else:
            it = _file_item(entry.path, name, name)
            if it:
                items.append(it)
    return items


def build_api_payload():
    """构建 /api/resources 响应数据。"""
    items = scan_dir(RESOURCE_ROOT, "")
    apply_intros(items)
    files = [it for it in items if it["kind"] == "file"]
    max_mtime = max((it["mtime"] for it in files), default=0)
    updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(max_mtime)) if max_mtime else "-"
    return {
        "count": len(items),          # 总条目数（顶层文件夹合集 + 顶层文件）
        "file_count": len(files),     # 可下载文件数
        "updated_at": updated_at,     # 最近一次资源修改时间
        "resources": items,
    }


def scan_music():
    """扫描音乐文件夹，返回音频文件列表。

    每项包含：name（文件名）、rel_path（相对路径，形如 音乐/xxx.mp3）、
    size（字节）、size_text（可读大小）、play_url（在线播放地址）、
    download_url（下载地址）。文件夹为空时返回空列表。
    """
    items = []
    if not os.path.isdir(MUSIC_ROOT):
        return items
    try:
        for entry in sorted(os.scandir(MUSIC_ROOT), key=lambda e: e.name.lower()):
            if not entry.is_file(follow_symlinks=False):
                continue
            ext = Path(entry.name).suffix.lower()
            if ext not in AUDIO_EXTS:
                continue
            try:
                st = entry.stat()
            except OSError:
                continue
            rel = "音乐/" + entry.name
            items.append({
                "name": entry.name,
                "rel_path": rel,
                "size": st.st_size,
                "size_text": fmt_size(st.st_size),
                "play_url": "/" + urllib.parse.quote(rel),
                "download_url": "/download/" + urllib.parse.quote(rel),
            })
    except OSError:
        pass
    return items


def get_music_data():
    """带缓存的音乐列表读取（与资源扫描共用 CACHE_SECONDS 缓存时长）。"""
    now = time.time()
    if _music_cache["data"] is None or now - _music_cache["ts"] > CACHE_SECONDS:
        _music_cache["data"] = scan_music()
        _music_cache["ts"] = now
    return _music_cache["data"]


def get_api_data():
    """带缓存的资源数据读取。"""
    now = time.time()
    if _cache["data"] is None or now - _cache["ts"] > CACHE_SECONDS:
        _cache["data"] = build_api_payload()
        _cache["ts"] = now
    return _cache["data"]


_intros_cache = {"mtime": 0, "list": []}


def load_intros():
    """加载介绍知识库 assets/data/intros.json。

    文件不存在或解析失败时返回 []；按文件修改时间缓存，热更新无需重启。
    每项格式：{"match": "关键词（大小写不敏感子串匹配）", "name": "展示名", "desc": "2-4 句介绍"}
    """
    try:
        st = os.stat(INTROS_PATH)
    except OSError:
        return []
    if _intros_cache["mtime"] == st.st_mtime:
        return _intros_cache["list"]
    try:
        with open(INTROS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    result = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and isinstance(item.get("match"), str) and item["match"].strip():
                result.append({
                    "match": item["match"].strip().lower(),
                    "name": item.get("name") if isinstance(item.get("name"), str) and item["name"].strip() else None,
                    "desc": item.get("desc") if isinstance(item.get("desc"), str) and item["desc"].strip() else None,
                })
    _intros_cache["mtime"] = st.st_mtime
    _intros_cache["list"] = result
    return result


def apply_intros(items):
    """用介绍知识库覆盖资源条目的展示名称与描述（命中首个匹配项即停止）。"""
    intros = load_intros()
    if not intros:
        return items
    for it in items:
        low = (it.get("name") or "").lower()
        for intro in intros:
            if intro["match"] in low:
                if intro["name"]:
                    it["name"] = intro["name"]
                if intro["desc"]:
                    it["desc"] = intro["desc"]
                break
    return items


def get_lan_ip():
    """获取本机局域网 IP。"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def safe_join(base, rel):
    """将相对路径安全地拼接到基目录下，返回真实绝对路径；非法返回 None。"""
    base_real = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base_real, rel))
    if target == base_real or target.startswith(base_real + os.sep):
        return target
    return None


# ---------------------- HTTP Handler ----------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "ResourceSite/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---------- 响应辅助 ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text, status=200, ctype="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, fs_path):
        """发送静态文件。"""
        fs_path = urllib.parse.unquote(fs_path)
        fs_path = safe_join(BASE_DIR, fs_path)
        if fs_path is None or not os.path.isfile(fs_path):
            return self._send_text("404 Not Found", 404)
        ctype = mimetypes.guess_type(fs_path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype == "application/javascript":
            ctype += "; charset=utf-8"
        try:
            with open(fs_path, "rb") as f:
                body = f.read()
        except OSError:
            return self._send_text("404 Not Found", 404)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file_download(self, fs_path, inline=False):
        """发送文件下载（支持 Range 断点续传）。

        inline=True 时以「内联播放」方式响应（不附加下载头），供 /音乐/ 在线播放使用。
        """
        size = os.path.getsize(fs_path)
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        status = 200
        if rng and rng.startswith("bytes="):
            try:
                spec = rng[6:].split(",")[0].strip()
                if spec.startswith("-"):
                    start = max(0, size - int(spec[1:]))
                elif "-" in spec:
                    a, b = spec.split("-", 1)
                    start = int(a) if a else 0
                    end = int(b) if b else size - 1
                else:
                    start = int(spec)
                end = min(end, size - 1)
            except ValueError:
                pass
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.end_headers()
                return
            length = end - start + 1
            status = 206
            self.send_response(206)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        else:
            length = size
            self.send_response(200)

        ctype = (AUDIO_MIME.get(os.path.splitext(fs_path)[1].lower())
                 or mimetypes.guess_type(fs_path)[0]
                 or "application/octet-stream")
        fname = urllib.parse.quote(os.path.basename(fs_path))
        disposition = "inline" if inline else "attachment"
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Disposition", "%s; filename*=UTF-8''%s" % (disposition, fname))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        with open(fs_path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    # ---------- 目录浏览页 ----------
    def _render_dir_page(self, fs_path, rel_path):
        fs_real = os.path.realpath(fs_path)
        title = os.path.basename(fs_real) or "资源目录"
        rows = []
        try:
            entries = sorted(
                os.scandir(fs_real),
                key=lambda e: (e.is_file(), e.name.lower()),
            )
        except OSError:
            return self._send_text("404 Not Found", 404)
        for e in entries:
            if e.is_dir(follow_symlinks=False) and e.name in EXCLUDED_DIRS:
                continue
            child = urllib.parse.quote(e.name)
            base = "/download/" + urllib.parse.quote(rel_path.strip("/"))
            link = base + "/" + child
            if e.is_dir(follow_symlinks=False):
                rows.append('<div class="item dir"><a href="%s">&#128193; %s/</a></div>' % (link, e.name))
            else:
                try:
                    sz = fmt_size(e.stat().st_size)
                except OSError:
                    sz = "-"
                rows.append(
                    '<div class="item file"><a href="%s">&#128196; %s</a>'
                    '<span class="sz">%s</span></div>' % (link, e.name, sz)
                )
        html = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s - 资源目录</title><style>
body{font-family:'Microsoft YaHei',system-ui,sans-serif;background:linear-gradient(135deg,#ecfeff,#f0fdfa);margin:0;padding:24px;color:#1e293b}
.wrap{max-width:760px;margin:0 auto;background:rgba(255,255,255,.8);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.7);border-radius:20px;padding:28px;box-shadow:0 20px 50px rgba(45,212,191,.12)}
h1{font-size:22px;margin:0 0 6px;background:linear-gradient(90deg,#0ea5e9,#10b981);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#64748b;font-size:13px;margin-bottom:18px}
.item{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;text-decoration:none;transition:background .2s}
.item:hover{background:rgba(45,212,191,.1)}
.item a{text-decoration:none;color:#0f766e;word-break:break-all}
.item.dir a{font-weight:600;color:#0369a1}
.sz{color:#94a3b8;font-size:13px;white-space:nowrap;margin-left:12px}
a.back{display:inline-block;margin-bottom:14px;color:#0ea5e9;text-decoration:none;font-size:14px}
</style></head><body><div class="wrap">
<a class="back" href="/download/">&#8592; 返回上级</a>
<h1>&#128193; %s</h1><div class="sub">目录浏览模式：点击文件即可下载</div>
%s</div></body></html>""" % (title, title, "".join(rows))
        self._send_text(html, 200, "text/html; charset=utf-8")

    # ---------- 路由 ----------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        raw_path = urllib.parse.unquote(path)
        try:
            if path == "/api/resources":
                return self._send_json(get_api_data())
            if path == "/api/music":
                return self._send_json(get_music_data())
            if path == "/api/children":
                rel_path = urllib.parse.parse_qs(parsed.query).get("path", [""])[0]
                return self._handle_children(rel_path)
            if path == "/api/zip":
                rel_path = urllib.parse.parse_qs(parsed.query).get("path", [""])[0]
                return self._handle_zip(rel_path)
            if path.startswith("/download/"):
                return self._handle_download(path[len("/download/"):])
            if raw_path.startswith("/音乐/"):
                return self._handle_music_play(raw_path[len("/音乐/"):])
            if path == "/" or path == "":
                return self._send_static("index.html")
            if path == "/favicon.ico":
                return self._send_text("", 204)
            return self._send_static(path.lstrip("/"))
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                self._send_text("Server Error: %s" % e, 500)
            except Exception:
                pass

    def _handle_music_play(self, raw_rel):
        """处理 /音乐/<相对路径>：在线播放音乐（内联响应 + Range 断点续传）。

        目标仅限定在网站文件夹内的「音乐」目录，safe_join 做路径穿越防护。
        """
        rel = urllib.parse.unquote(raw_rel).strip("/")
        if not rel:
            return self._send_text("404 Not Found", 404)
        target = safe_join(MUSIC_ROOT, rel)
        if target is None:
            return self._send_text("403 Forbidden: 非法路径", 403)
        if not os.path.isfile(target):
            return self._send_text("404 Not Found", 404)
        return self._send_file_download(target, inline=True)

    def _handle_download(self, raw_rel):
        """处理 /download/<相对路径>：文件下载或目录浏览。

        音乐库路径（以「音乐/」开头）指向网站文件夹内的音乐目录，
        其余路径指向资源根目录（RESOURCE_ROOT）。
        """
        rel = urllib.parse.unquote(raw_rel).strip("/")
        if not rel:
            # 根目录浏览
            return self._render_dir_page(RESOURCE_ROOT, "")
        if rel == "音乐" or rel.startswith("音乐/"):
            inner = rel[len("音乐"):].strip("/")
            target = safe_join(MUSIC_ROOT, inner)
            if target is None:
                return self._send_text("403 Forbidden: 非法路径", 403)
            if not os.path.exists(target):
                return self._send_text("404 Not Found", 404)
            if os.path.isdir(target):
                return self._render_dir_page(target, rel)
            return self._send_file_download(target)
        if rel == "自制软件" or rel.startswith("自制软件/"):
            inner = rel[len("自制软件"):].strip("/")
            target = safe_join(os.path.join(BASE_DIR, "自制软件"), inner)
            if target is None:
                return self._send_text("403 Forbidden: 非法路径", 403)
            if not os.path.exists(target):
                return self._send_text("404 Not Found", 404)
            if os.path.isdir(target):
                return self._render_dir_page(target, rel)
            return self._send_file_download(target)
        root_real = os.path.realpath(RESOURCE_ROOT)
        target = safe_join(RESOURCE_ROOT, rel)
        if target is None:
            return self._send_text("403 Forbidden: 非法路径", 403)
        if not os.path.exists(target):
            return self._send_text("404 Not Found", 404)
        if os.path.isdir(target):
            return self._render_dir_page(target, rel)
        return self._send_file_download(target)

    def _handle_children(self, rel_path):
        """处理 /api/children?path=<相对路径>：返回合集内部文件列表（含子目录，跳过排除项）。"""
        items = list_children(rel_path)
        if items is None:
            return self._send_text("404 Not Found: 无效的文件夹路径", 404)
        rel = urllib.parse.unquote(rel_path).strip("/")
        return self._send_json({
            "path": rel,
            "count": len(items),
            "files": items,
        })

    def _handle_zip(self, rel_path):
        """处理 /api/zip?path=<相对路径>：将文件夹整体打包为 ZIP 流式下载。

        - 使用 zipfile 直接写入响应流（逐块写出，不占内存，大目录可用）；
        - zip 内路径保持相对资源根目录的结构（顶层文件夹名开头）；
        - 递归时跳过名为「病毒」「常用」的子文件夹；
        - 仅支持文件夹打包；文件类型请走 /download/ 单文件下载。
        """
        rel = urllib.parse.unquote(rel_path).strip("/")
        if not rel:
            return self._send_text("400 Bad Request: 缺少文件夹路径（path 参数）", 400)
        target = safe_join(RESOURCE_ROOT, rel)
        if target is None:
            return self._send_text("403 Forbidden: 非法路径", 403)
        if not os.path.exists(target):
            return self._send_text("404 Not Found", 404)
        if not os.path.isdir(target):
            return self._send_text("400 Bad Request: 仅文件夹支持打包下载，文件请直接下载", 400)

        top_name = os.path.basename(os.path.normpath(target)) or "资源合集"
        zip_name = top_name + ".zip"
        fname = urllib.parse.quote(zip_name)

        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", "attachment; filename*=UTF-8''%s" % fname)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()

        root_real = os.path.realpath(RESOURCE_ROOT)
        written = 0
        with zipfile.ZipFile(self.wfile, "w", zipfile.ZIP_STORED) as zf:
            for root, dirs, files in os.walk(target):
                # 跳过被排除的子文件夹（含其整棵子树）
                dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
                for fn in files:
                    fp = os.path.join(root, fn)
                    arc = os.path.relpath(fp, root_real).replace(os.sep, "/")
                    try:
                        zf.write(fp, arc)
                        written += 1
                    except OSError:
                        continue
        self.wfile.flush()
        print("[打包] %s -> %s.zip（%d 个文件）" % (rel, top_name, written))


# ---------------------- 主入口 ----------------------
def main():
    if not os.path.isdir(RESOURCE_ROOT):
        print("[警告] 资源目录不存在: %s" % RESOURCE_ROOT)
    else:
        print("[信息] 资源目录: %s" % RESOURCE_ROOT)

    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError as e:
        print("[错误] 端口 %d 被占用或不可用: %s" % (PORT, e))
        print("      可修改 start_server.py 顶部的 PORT 后重试。")
        return

    ip = get_lan_ip()
    print()
    print("=" * 56)
    print("  优选资源库 已启动")
    print("  - 本机访问:   http://127.0.0.1:%d" % PORT)
    print("  - 局域网访问: http://%s:%d" % (ip, PORT))
    print("  - 资源接口:   http://127.0.0.1:%d/api/resources" % PORT)
    print("  - 音乐接口:   http://127.0.0.1:%d/api/music" % PORT)
    print("  - 音乐目录:   %s" % MUSIC_ROOT)
    print("=" * 56)
    print("  提示：资源文件夹内容变更后，刷新网页即自动同步。")
    print("  公网访问方案见同目录「部署说明.md」。")
    print("  按 Ctrl+C 停止服务。")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")
        server.server_close()


if __name__ == "__main__":
    main()
