# -*- coding: utf-8 -*-
"""
build_static.py - breezebox 静态数据生成器
==========================================
用于 GitHub Pages 纯静态部署前生成数据快照（不复制任何实体文件）：

  - assets/data/resources.json  顶层资源列表（对齐原 /api/resources 输出）
  - assets/data/children.json   各合集内部文件清单（对齐原 /api/children 输出，
                                 以合集相对路径为键的 Map）
  - assets/data/music.json      音乐列表（对齐原 /api/music 输出，
                                 play_url / download_url 指向相对 downloads/ 路径）
  - assets/data/available.json  downloads/ 目录下【实际存在】的文件相对路径清单，
                                 供前端静态判断本地实体是否存在（不存在则按钮置灰，
                                 不再发出会 404 的请求）

运行方式：
  python build_static.py

数据来源：
  - 桌面「U盘备份」：顶层资源与各合集内部文件清单
  - 网站内「自制软件」：作为合集纳入资源列表与 children 清单
  - 网站内「音乐」：音乐列表

实体文件不复制到 downloads/，用户需自行将对应文件放入 downloads/ 目录
（结构需与 rel_path 一致），或在 assets/data/links.json 中登记网盘外链，
站点在 GitHub Pages 上才能正常下载/播放。
"""
import json
import os
import sys
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "assets", "data")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")

# 扫描 downloads/ 时忽略的占位文件（非真实资源实体）
IGNORED_DOWNLOAD_FILES = {".gitkeep", ".gitignore", "README.md", "readme.md"}

# 复用 start_server 的扫描/分类/格式化逻辑（__main__ 有保护，import 不启动服务）
sys.path.insert(0, BASE_DIR)
import start_server as ss  # noqa: E402


def build_resources():
    """生成顶层资源列表（对齐 /api/resources，额外并入网站内「自制软件」合集）。"""
    items = ss.scan_dir(ss.RESOURCE_ROOT, "")

    # 网站内「自制软件」目录作为合集纳入资源列表
    soft_dir = os.path.join(BASE_DIR, "自制软件")
    if os.path.isdir(soft_dir):
        soft_count = ss._count_files(soft_dir)
        if soft_count:
            items.append(ss._folder_item(soft_dir, "自制软件", "自制软件", soft_count))

    ss.apply_intros(items)

    files = [it for it in items if it["kind"] == "file"]
    max_mtime = max((it["mtime"] for it in files), default=0)
    updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(max_mtime)) if max_mtime else "-"
    return {
        "count": len(items),
        "file_count": len(files),
        "updated_at": updated_at,
        "resources": items,
    }


def list_children_for(rel):
    """按合集相对路径列出内部文件；「自制软件」位于网站根目录，需单独处理。"""
    if rel == "自制软件":
        soft_dir = os.path.join(BASE_DIR, "自制软件")
        if not os.path.isdir(soft_dir):
            return None
        items = []
        try:
            for root, dirs, files in os.walk(soft_dir):
                dirs[:] = [d for d in dirs if d not in ss.EXCLUDED_DIRS]
                for fn in sorted(files):
                    fp = os.path.join(root, fn)
                    child_rel = os.path.relpath(fp, BASE_DIR).replace(os.sep, "/")
                    it = ss._file_item(fp, child_rel, fn)
                    if it:
                        items.append(it)
        except OSError:
            return None
        return items
    return ss.list_children(rel)


def build_children(resources):
    """生成各合集内部文件清单（对齐 /api/children，键为合集 rel_path）。"""
    children = {}
    for it in resources:
        if it["kind"] != "folder":
            continue
        rel = it["rel_path"]
        files = list_children_for(rel)
        if files is None:
            continue
        children[rel] = {
            "path": rel,
            "count": len(files),
            "files": files,
        }
    return children


def build_music():
    """生成音乐列表（对齐 /api/music，URL 改写为相对 downloads/ 路径）。"""
    items = ss.scan_music()
    for it in items:
        it["play_url"] = "downloads/" + it["rel_path"]
        it["download_url"] = "downloads/" + it["rel_path"]
    return items


def scan_downloads():
    """扫描 downloads/ 下实际存在的实体文件，返回相对 downloads/ 的 POSIX 路径清单。"""
    found = []
    if not os.path.isdir(DOWNLOADS_DIR):
        return found
    for root, dirs, files in os.walk(DOWNLOADS_DIR):
        dirs[:] = [d for d in dirs if d not in ss.EXCLUDED_DIRS and not d.startswith(".")]
        for fn in sorted(files):
            # 隐藏文件与占位文件不计入可用实体
            if fn.startswith(".") or fn in IGNORED_DOWNLOAD_FILES:
                continue
            fp = os.path.join(root, fn)
            if not os.path.isfile(fp):
                continue
            found.append(os.path.relpath(fp, DOWNLOADS_DIR).replace(os.sep, "/"))
    return sorted(found)


def build_available():
    """生成 downloads/ 实际存在文件清单（供前端静态判断，避免 404）。"""
    files = scan_downloads()
    return {
        "count": len(files),
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "files": files,
    }


def write_json(path, obj):
    """写入 UTF-8 JSON（中文不转义，带缩进便于人工核对）。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    print("[写出] %s" % path)


def main():
    print("== 生成静态数据快照 ==")
    resources = build_resources()
    write_json(os.path.join(DATA_DIR, "resources.json"), resources)

    children = build_children(resources["resources"])
    write_json(os.path.join(DATA_DIR, "children.json"), children)

    music = build_music()
    write_json(os.path.join(DATA_DIR, "music.json"), music)

    available = build_available()
    write_json(os.path.join(DATA_DIR, "available.json"), available)

    print()
    print("== 汇总 ==")
    print("resources.json : %d 项（%d 个合集 / %d 个顶层文件）" % (
        resources["count"],
        sum(1 for it in resources["resources"] if it["kind"] == "folder"),
        resources["file_count"],
    ))
    print("children.json  : %d 个合集" % len(children))
    print("music.json     : %d 首" % len(music))
    print("available.json : downloads/ 下实际存在 %d 个文件" % available["count"])
    print()
    print("说明：downloads/ 中缺失的实体，可在 assets/data/links.json 中登记网盘外链；")
    print("两者都没有的资源，页面会显示「待托管」且不发出任何请求。")
    print("脚本仅生成数据，不复制任何实体。")


if __name__ == "__main__":
    main()
