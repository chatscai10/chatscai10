#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
统一版本号更新工具
自动扫描并更新所有HTML文件中的资源链接版本号

依赖：
    - requests (用于API调用，可选): pip install requests
"""

import os
import re
import argparse
from pathlib import Path
from datetime import datetime
import shutil
import sys
import json

# 可选依赖：requests (用于更新Firebase版本信息)
try:
    import requests
except ImportError:
    requests = None

# 版本号正则表达式模式
VERSION_PATTERN = r'([\?]v=)([0-9]{8}v[0-9]+)'

def scan_html_files(directory='.'):
    """扫描给定目录中的所有HTML文件"""
    print(f"正在扫描目录: {directory}")
    html_files = []
    
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.html'):
                full_path = os.path.join(root, file)
                html_files.append(full_path)
    
    print(f"找到 {len(html_files)} 个HTML文件")
    return html_files

def backup_file(file_path):
    """创建文件备份"""
    backup_path = f"{file_path}.bak"
    shutil.copy2(file_path, backup_path)
    return backup_path

def analyze_versions(html_files):
    """分析所有HTML文件中的版本号"""
    version_stats = {}
    
    for file_path in html_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
                versions = re.findall(VERSION_PATTERN, content)
                
                for _, version in versions:
                    if version not in version_stats:
                        version_stats[version] = {'count': 0, 'files': []}
                    
                    version_stats[version]['count'] += 1
                    if file_path not in version_stats[version]['files']:
                        version_stats[version]['files'].append(file_path)
        except Exception as e:
            print(f"分析文件 {file_path} 时出错: {str(e)}")
    
    return version_stats

def update_versions(html_files, old_version, new_version, dry_run=False):
    """更新所有HTML文件中的版本号"""
    updated_files = 0
    updated_refs = 0
    
    for file_path in html_files:
        file_updated = False
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # 检查文件中是否包含旧版本号
            if f"?v={old_version}" in content:
                # 替换旧版本号为新版本号
                new_content = content.replace(f"?v={old_version}", f"?v={new_version}")
                
                # 计算替换数量
                count = new_content.count(f"?v={new_version}") - content.count(f"?v={new_version}")
                updated_refs += count
                
                if not dry_run:
                    # 备份原文件
                    backup_file(file_path)
                    
                    # 写入新内容
                    with open(file_path, 'w', encoding='utf-8') as file:
                        file.write(new_content)
                
                file_updated = True
                updated_files += 1
                
                print(f"{'[DRY RUN] ' if dry_run else ''}已更新文件: {file_path} (替换了 {count} 处引用)")
        except Exception as e:
            print(f"更新文件 {file_path} 时出错: {str(e)}")
    
    return updated_files, updated_refs

def update_init_js(new_version, dry_run=False):
    """更新init.js中的appVersion变量"""
    init_js_path = os.path.join("js", "init.js")
    
    if not os.path.exists(init_js_path):
        print(f"警告: 找不到 {init_js_path} 文件")
        return False
    
    try:
        with open(init_js_path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # 使用正则表达式匹配appVersion变量
        pattern = r"(let\s+appVersion\s*=\s*['\"])([^'\"]+)(['\"])"
        match = re.search(pattern, content)
        
        if match:
            old_version = match.group(2)
            new_content = re.sub(pattern, f"\\1{new_version}\\3", content)
            
            if not dry_run:
                # 备份原文件
                backup_file(init_js_path)
                
                # 写入新内容
                with open(init_js_path, 'w', encoding='utf-8') as file:
                    file.write(new_content)
            
            print(f"{'[DRY RUN] ' if dry_run else ''}已更新 init.js 中的版本号: {old_version} -> {new_version}")
            return True
        else:
            print("警告: 在 init.js 中找不到 appVersion 变量")
            return False
    except Exception as e:
        print(f"更新 init.js 时出错: {str(e)}")
        return False

def update_version_updater_js(new_version, dry_run=False):
    """更新version-updater.js中的currentVersion变量"""
    js_path = os.path.join("js", "version-updater.js")
    
    if not os.path.exists(js_path):
        print(f"警告: 找不到 {js_path} 文件")
        return False
    
    try:
        with open(js_path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # 使用正则表达式匹配currentVersion变量
        pattern = r"(currentVersion\s*:\s*['\"])([^'\"]+)(['\"])"
        match = re.search(pattern, content)
        
        if match:
            old_version = match.group(2)
            new_content = re.sub(pattern, f"\\1{new_version}\\3", content)
            
            if not dry_run:
                # 备份原文件
                backup_file(js_path)
                
                # 写入新内容
                with open(js_path, 'w', encoding='utf-8') as file:
                    file.write(new_content)
            
            print(f"{'[DRY RUN] ' if dry_run else ''}已更新 version-updater.js 中的版本号: {old_version} -> {new_version}")
            return True
        else:
            print("警告: 在 version-updater.js 中找不到 currentVersion 变量")
            return False
    except Exception as e:
        print(f"更新 version-updater.js 时出错: {str(e)}")
        return False

def generate_version():
    """生成新的版本号 (格式: YYYYMMDDvX)"""
    today = datetime.now()
    date_part = today.strftime("%Y%m%d")
    return f"{date_part}v1"

def update_firebase_version(new_version, notes=None, dry_run=False):
    """调用管理员API更新Firebase中的版本信息"""
    if requests is None:
        print("警告: 无法更新Firebase版本信息 - 缺少requests模块")
        print("请先安装: pip install requests")
        return False
        
    api_url = "http://localhost:5000/api/version-update"  # 根据实际API地址调整
    
    if not notes:
        notes = [f"更新到版本 {new_version}"]
    
    try:
        payload = {
            "newVersion": new_version,
            "updateNotes": notes,
            "token": os.environ.get("ADMIN_API_TOKEN", "")  # 从环境变量获取令牌
        }
        
        if dry_run:
            print(f"[DRY RUN] 将调用API更新Firestore版本信息: {json.dumps(payload, ensure_ascii=False)}")
            return True
        
        response = requests.post(api_url, json=payload)
        
        if response.status_code == 200:
            result = response.json()
            print(f"Firestore版本信息更新成功: {result.get('message', '操作成功')}")
            return True
        else:
            print(f"Firestore版本信息更新失败: HTTP {response.status_code}")
            try:
                error = response.json()
                print(f"错误信息: {error.get('error', '未知错误')}")
            except:
                print(f"服务器响应: {response.text}")
            return False
            
    except Exception as e:
        print(f"调用API更新版本信息时出错: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description="统一更新HTML文件中的资源链接版本号")
    parser.add_argument("--dir", default=".", help="扫描目录，默认为当前目录")
    parser.add_argument("--old", help="要替换的旧版本号")
    parser.add_argument("--new", help="新版本号，如不指定则自动生成")
    parser.add_argument("--dry-run", action="store_true", help="试运行模式，不实际修改文件")
    parser.add_argument("--analyze", action="store_true", help="仅分析版本号使用情况，不更新文件")
    parser.add_argument("--notes", nargs="+", help="版本更新说明，可提供多个")
    parser.add_argument("--update-firebase", action="store_true", help="更新Firebase中的版本信息")
    
    args = parser.parse_args()
    
    # 扫描HTML文件
    html_files = scan_html_files(args.dir)
    
    if not html_files:
        print("未找到HTML文件，程序退出")
        sys.exit(1)
    
    # 分析版本号使用情况
    version_stats = analyze_versions(html_files)
    
    if not version_stats:
        print("未找到任何版本号标记，程序退出")
        sys.exit(1)
    
    print("\n当前版本号使用情况:")
    for version, stats in sorted(version_stats.items(), key=lambda x: x[1]['count'], reverse=True):
        print(f"版本 {version}: 使用 {stats['count']} 次，涉及 {len(stats['files'])} 个文件")
    
    if args.analyze:
        # 如果只是分析模式，不执行更新
        sys.exit(0)
    
    # 确定新旧版本号
    if not args.old:
        # 使用最常用的版本号作为旧版本
        args.old = max(version_stats.items(), key=lambda x: x[1]['count'])[0]
        print(f"\n自动选择最常用的版本号作为旧版本: {args.old}")
    
    if not args.new:
        args.new = generate_version()
        print(f"自动生成新版本号: {args.new}")
    
    # 确认操作
    if not args.dry_run:
        confirm = input(f"确认将版本号从 {args.old} 更新到 {args.new}? (y/n): ")
        if confirm.lower() != 'y':
            print("操作已取消")
            sys.exit(0)
    
    # 执行更新
    updated_files, updated_refs = update_versions(html_files, args.old, args.new, args.dry_run)
    
    # 更新init.js
    init_updated = update_init_js(args.new, args.dry_run)
    
    # 更新version-updater.js
    updater_updated = update_version_updater_js(args.new, args.dry_run)
    
    # 如果需要，更新Firebase中的版本信息
    firebase_updated = False
    if args.update_firebase:
        firebase_updated = update_firebase_version(args.new, args.notes, args.dry_run)
    
    # 输出结果
    print("\n更新摘要:")
    print(f"{'[DRY RUN] ' if args.dry_run else ''}已更新 {updated_files} 个文件中的 {updated_refs} 处版本引用")
    print(f"{'[DRY RUN] ' if args.dry_run else ''}init.js 更新{'成功' if init_updated else '失败'}")
    print(f"{'[DRY RUN] ' if args.dry_run else ''}version-updater.js 更新{'成功' if updater_updated else '失败'}")
    if args.update_firebase:
        print(f"{'[DRY RUN] ' if args.dry_run else ''}Firestore版本信息更新{'成功' if firebase_updated else '失败'}")
    
    if not args.dry_run:
        print("\n版本更新已完成！")
        print(f"所有资源引用已从 {args.old} 更新到 {args.new}")
        print("请记得重新部署项目以应用更改")

if __name__ == "__main__":
    main() 