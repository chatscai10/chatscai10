#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
雞精補習班版本更新工具
自動更新所有HTML/JS/CSS文件中的資源鏈接版本號
支持命令行和GUI模式

使用方法:
    1. 命令行模式: python version_update.py --old 20240501v1 --new 20240516v1
    2. GUI模式: python version_update.py --gui
"""

import os
import re
import sys
import json
import argparse
import shutil
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

# 版本號正則表達式模式 - 匹配 ?v=YYYYMMDDVN 格式
VERSION_PATTERN = r'(\?v=)([0-9]{8}v[0-9]+)'
# 版本號正則表達式模式 - 匹配 "version": "YYYYMMDDVN" 格式
JSON_VERSION_PATTERN = r'("version"\s*:\s*")([0-9]{8}v[0-9]+)(")'
# 版本號正則表達式模式 - 匹配 let appVersion = "YYYYMMDDVN" 格式
JS_VERSION_PATTERN = r'(let\s+appVersion\s*=\s*[\'"])([0-9]{8}v[0-9]+)([\'"])'

class VersionUpdater:
    def __init__(self, working_dir='.'):
        self.working_dir = Path(working_dir)
        self.log_messages = []
        self.file_types = ['.html', '.js', '.css']
        self.update_count = 0
        self.file_count = 0
    
    def log(self, message):
        """添加日誌消息"""
        print(message)
        self.log_messages.append(message)
    
    def scan_files(self):
        """掃描所有HTML、JS和CSS文件"""
        result = []
        self.log(f"正在掃描目錄: {self.working_dir}")
        
        for file_type in self.file_types:
            for file_path in self.working_dir.glob(f'**/*{file_type}'):
                if not self._is_excluded(file_path):
                    result.append(file_path)
        
        self.log(f"找到 {len(result)} 個文件")
        return result
    
    def _is_excluded(self, file_path):
        """檢查文件是否應該被排除"""
        # 排除node_modules、.git等目錄
        excluded_dirs = ['node_modules', '.git', 'dist', 'build']
        
        path_str = str(file_path)
        for excluded in excluded_dirs:
            if f'/{excluded}/' in path_str.replace('\\', '/') or path_str.endswith(f'/{excluded}'):
                return True
        
        return False
    
    def backup_file(self, file_path):
        """創建文件備份"""
        backup_path = f"{file_path}.bak"
        shutil.copy2(file_path, backup_path)
        return backup_path
    
    def find_versions(self, files=None, specific_version=None):
        """查找所有版本號引用"""
        if files is None:
            files = self.scan_files()
        
        results = []
        for file_path in files:
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # 查找HTML/CSS/JS中的版本號 (?v=YYYYMMDDVN)
                html_versions = re.finditer(VERSION_PATTERN, content)
                for match in html_versions:
                    version = match.group(2)
                    if specific_version is None or version == specific_version:
                        results.append({
                            'file': file_path,
                            'version': version,
                            'pattern': VERSION_PATTERN,
                            'line': content[:match.start()].count('\n') + 1
                        })
                
                # 查找JSON文件中的版本號 ("version": "YYYYMMDDVN")
                if file_path.suffix == '.json':
                    json_versions = re.finditer(JSON_VERSION_PATTERN, content)
                    for match in json_versions:
                        version = match.group(2)
                        if specific_version is None or version == specific_version:
                            results.append({
                                'file': file_path,
                                'version': version,
                                'pattern': JSON_VERSION_PATTERN,
                                'line': content[:match.start()].count('\n') + 1
                            })
                
                # 查找JS文件中的appVersion變量 (let appVersion = "YYYYMMDDVN")
                if file_path.suffix == '.js':
                    js_versions = re.finditer(JS_VERSION_PATTERN, content)
                    for match in js_versions:
                        version = match.group(2)
                        if specific_version is None or version == specific_version:
                            results.append({
                                'file': file_path,
                                'version': version,
                                'pattern': JS_VERSION_PATTERN,
                                'line': content[:match.start()].count('\n') + 1
                            })
            
            except Exception as e:
                self.log(f"讀取文件 {file_path} 時出錯: {str(e)}")
        
        return results
    
    def update_version(self, file_info, new_version, dry_run=False):
        """更新單個文件中的版本號"""
        file_path = file_info['file']
        old_version = file_info['version']
        pattern = file_info['pattern']
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # 根據不同模式進行替換
            if pattern == VERSION_PATTERN:
                new_content = content.replace(f'?v={old_version}', f'?v={new_version}')
            elif pattern == JSON_VERSION_PATTERN:
                new_content = re.sub(JSON_VERSION_PATTERN, f'\\1{new_version}\\3', content)
            elif pattern == JS_VERSION_PATTERN:
                new_content = re.sub(JS_VERSION_PATTERN, f'\\1{new_version}\\3', content)
            else:
                return False
            
            if content != new_content:
                if not dry_run:
                    # 備份原文件
                    self.backup_file(file_path)
                    
                    # 寫入新內容
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                
                self.log(f"{'[試運行] ' if dry_run else ''}已更新: {file_path} (第 {file_info['line']} 行)")
                return True
        
        except Exception as e:
            self.log(f"更新文件 {file_path} 時出錯: {str(e)}")
        
        return False
    
    def update_all_versions(self, old_version, new_version, dry_run=False):
        """更新所有文件中的版本號"""
        self.update_count = 0
        self.file_count = 0
        
        # 查找所有匹配的版本號
        files = self.scan_files()
        version_refs = self.find_versions(files, old_version)
        
        if not version_refs:
            self.log(f"未找到版本號 {old_version} 的引用")
            return 0, 0
        
        # 按文件分組
        files_to_update = {}
        for ref in version_refs:
            file_path = ref['file']
            if file_path not in files_to_update:
                files_to_update[file_path] = []
            files_to_update[file_path].append(ref)
        
        # 更新文件
        updated_files = set()
        for file_path, refs in files_to_update.items():
            updated = False
            for ref in refs:
                if self.update_version(ref, new_version, dry_run):
                    updated = True
                    self.update_count += 1
            
            if updated:
                updated_files.add(file_path)
        
        self.file_count = len(updated_files)
        self.log(f"總計更新了 {self.file_count} 個文件中的 {self.update_count} 處版本號引用")
        
        # 更新version-info.json
        self.update_version_info(new_version, dry_run)
        
        return self.file_count, self.update_count
    
    def update_version_info(self, new_version, dry_run=False):
        """更新version-info.json文件"""
        version_info_path = self.working_dir / 'version-info.json'
        
        if not version_info_path.exists():
            self.log(f"警告: 找不到 {version_info_path} 文件")
            return False
        
        try:
            with open(version_info_path, 'r', encoding='utf-8') as f:
                version_info = json.load(f)
            
            old_version = version_info.get('version', '')
            if old_version == new_version:
                self.log(f"version-info.json 中的版本號已經是 {new_version}")
                return False
            
            version_info['version'] = new_version
            version_info['updateDate'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if not dry_run:
                # 備份原文件
                self.backup_file(version_info_path)
                
                # 寫入新內容
                with open(version_info_path, 'w', encoding='utf-8') as f:
                    json.dump(version_info, f, ensure_ascii=False, indent=2)
            
            self.log(f"{'[試運行] ' if dry_run else ''}已更新 version-info.json: {old_version} -> {new_version}")
            return True
        
        except Exception as e:
            self.log(f"更新 version-info.json 時出錯: {str(e)}")
            return False
    
    def generate_new_version(self):
        """生成新的版本號 (格式: YYYYMMDDvX)"""
        today = datetime.now()
        date_part = today.strftime("%Y%m%d")
        return f"{date_part}v1"


class VersionUpdaterGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("雞精補習班 - 版本更新工具")
        self.root.geometry("800x600")
        
        # 設置樣式
        self.style = ttk.Style()
        self.style.configure("TButton", padding=6, font=("Microsoft JhengHei", 10))
        self.style.configure("TLabel", font=("Microsoft JhengHei", 10))
        self.style.configure("TCheckbutton", font=("Microsoft JhengHei", 10))
        
        # 創建版本更新器
        self.updater = VersionUpdater()
        
        # 創建主框架
        self.main_frame = ttk.Frame(root, padding=10)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 目錄選擇
        dir_frame = ttk.Frame(self.main_frame)
        dir_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(dir_frame, text="工作目錄:").pack(side=tk.LEFT)
        
        self.dir_var = tk.StringVar(value=os.getcwd())
        dir_entry = ttk.Entry(dir_frame, textvariable=self.dir_var, width=50)
        dir_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        browse_btn = ttk.Button(dir_frame, text="瀏覽...", command=self.browse_directory)
        browse_btn.pack(side=tk.LEFT)
        
        # 版本號框架
        version_frame = ttk.LabelFrame(self.main_frame, text="版本號設定", padding=10)
        version_frame.pack(fill=tk.X, pady=10)
        
        # 舊版本號
        old_ver_frame = ttk.Frame(version_frame)
        old_ver_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(old_ver_frame, text="舊版本號:").pack(side=tk.LEFT)
        
        self.old_ver_var = tk.StringVar()
        old_ver_entry = ttk.Entry(old_ver_frame, textvariable=self.old_ver_var, width=20)
        old_ver_entry.pack(side=tk.LEFT, padx=5)
        
        scan_btn = ttk.Button(old_ver_frame, text="掃描現有版本", command=self.scan_versions)
        scan_btn.pack(side=tk.LEFT, padx=5)
        
        # 新版本號
        new_ver_frame = ttk.Frame(version_frame)
        new_ver_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(new_ver_frame, text="新版本號:").pack(side=tk.LEFT)
        
        self.new_ver_var = tk.StringVar(value=self.updater.generate_new_version())
        new_ver_entry = ttk.Entry(new_ver_frame, textvariable=self.new_ver_var, width=20)
        new_ver_entry.pack(side=tk.LEFT, padx=5)
        
        generate_btn = ttk.Button(new_ver_frame, text="生成新版本號", command=self.generate_version)
        generate_btn.pack(side=tk.LEFT, padx=5)
        
        # 版本列表
        list_frame = ttk.LabelFrame(self.main_frame, text="已找到的版本", padding=10)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        
        # 創建Treeview
        self.tree = ttk.Treeview(
            list_frame,
            columns=("version", "file", "line"),
            show="headings",
            selectmode="browse"
        )
        
        # 設置列標題
        self.tree.heading("version", text="版本號")
        self.tree.heading("file", text="文件路徑")
        self.tree.heading("line", text="行號")
        
        # 設置列寬度
        self.tree.column("version", width=100)
        self.tree.column("file", width=400)
        self.tree.column("line", width=50, anchor=tk.CENTER)
        
        # 添加滾動條
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # 綁定選擇事件
        self.tree.bind("<<TreeviewSelect>>", self.on_version_selected)
        
        # 按鈕框架
        btn_frame = ttk.Frame(self.main_frame)
        btn_frame.pack(fill=tk.X, pady=10)
        
        # 測試運行選項
        self.dry_run_var = tk.BooleanVar(value=True)
        dry_run_cb = ttk.Checkbutton(
            btn_frame, 
            text="測試運行 (不實際修改文件)",
            variable=self.dry_run_var
        )
        dry_run_cb.pack(side=tk.LEFT)
        
        # 更新按鈕
        update_btn = ttk.Button(
            btn_frame,
            text="更新版本",
            command=self.update_versions,
            style="TButton"
        )
        update_btn.pack(side=tk.RIGHT)
        
        # 日誌框架
        log_frame = ttk.LabelFrame(self.main_frame, text="日誌", padding=10)
        log_frame.pack(fill=tk.X, pady=5)
        
        self.log_text = tk.Text(log_frame, height=6, wrap=tk.WORD)
        self.log_text.pack(fill=tk.X, expand=True)
        
        log_scroll = ttk.Scrollbar(self.log_text, orient="vertical", command=self.log_text.yview)
        log_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.config(yscrollcommand=log_scroll.set)
        
        # 初始訊息
        self.log("版本更新工具已啟動，請選擇舊版本號和新版本號")
    
    def browse_directory(self):
        """瀏覽選擇工作目錄"""
        directory = filedialog.askdirectory(initialdir=self.dir_var.get())
        if directory:
            self.dir_var.set(directory)
            self.updater.working_dir = Path(directory)
            self.log(f"工作目錄已設置為: {directory}")
    
    def log(self, message):
        """添加日誌消息"""
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
    
    def scan_versions(self):
        """掃描現有版本號"""
        self.tree.delete(*self.tree.get_children())
        self.log("正在掃描文件中的版本號...")
        
        self.updater.working_dir = Path(self.dir_var.get())
        versions = self.updater.find_versions()
        
        # 按版本號分組統計
        version_stats = {}
        for v in versions:
            version = v['version']
            if version not in version_stats:
                version_stats[version] = 0
            version_stats[version] += 1
        
        # 添加到樹形視圖
        for v in versions:
            self.tree.insert("", tk.END, values=(v['version'], v['file'], v['line']))
        
        # 更新日誌
        if versions:
            self.log(f"找到 {len(versions)} 處版本號引用:")
            for version, count in version_stats.items():
                self.log(f"  - {version}: {count} 處")
            
            # 如果舊版本號為空，則自動選擇最常見的版本
            if not self.old_ver_var.get() and version_stats:
                most_common = max(version_stats.items(), key=lambda x: x[1])[0]
                self.old_ver_var.set(most_common)
                self.log(f"已自動選擇最常見的版本號: {most_common}")
        else:
            self.log("未找到任何版本號引用")
    
    def on_version_selected(self, event):
        """當版本被選中時觸發"""
        selection = self.tree.selection()
        if selection:
            item = self.tree.item(selection[0])
            version = item['values'][0]
            self.old_ver_var.set(version)
    
    def generate_version(self):
        """生成新版本號"""
        new_version = self.updater.generate_new_version()
        self.new_ver_var.set(new_version)
        self.log(f"已生成新版本號: {new_version}")
    
    def update_versions(self):
        """更新版本號"""
        old_version = self.old_ver_var.get()
        new_version = self.new_ver_var.get()
        dry_run = self.dry_run_var.get()
        
        if not old_version:
            messagebox.showerror("錯誤", "請先選擇舊版本號")
            return
        
        if not new_version:
            messagebox.showerror("錯誤", "請先設定新版本號")
            return
        
        if old_version == new_version:
            messagebox.showerror("錯誤", "新舊版本號不能相同")
            return
        
        self.log(f"開始{'測試' if dry_run else ''}更新版本: {old_version} -> {new_version}")
        
        # 更新版本號
        self.updater.working_dir = Path(self.dir_var.get())
        file_count, ref_count = self.updater.update_all_versions(old_version, new_version, dry_run)
        
        if file_count > 0:
            message = f"{'測試' if dry_run else ''}更新完成！已更新 {file_count} 個文件中的 {ref_count} 處版本號引用"
            self.log(message)
            
            if not dry_run:
                messagebox.showinfo("完成", message)
        else:
            self.log(f"未找到舊版本號 {old_version} 的引用")


def main():
    parser = argparse.ArgumentParser(description="雞精補習班版本更新工具")
    
    parser.add_argument("--old", help="要替換的舊版本號")
    parser.add_argument("--new", help="新版本號，如不指定則自動生成")
    parser.add_argument("--dir", default=".", help="工作目錄，默認為當前目錄")
    parser.add_argument("--dry-run", action="store_true", help="測試運行模式，不實際修改文件")
    parser.add_argument("--gui", action="store_true", help="啟動圖形界面")
    
    args = parser.parse_args()
    
    # 如果指定了--gui參數，則啟動GUI界面
    if args.gui:
        root = tk.Tk()
        app = VersionUpdaterGUI(root)
        root.mainloop()
        return
    
    # 命令行模式
    updater = VersionUpdater(args.dir)
    
    if not args.old:
        print("請指定舊版本號 (--old 參數)")
        return
    
    new_version = args.new or updater.generate_new_version()
    print(f"準備{'測試' if args.dry_run else ''}更新版本: {args.old} -> {new_version}")
    
    file_count, ref_count = updater.update_all_versions(args.old, new_version, args.dry_run)
    
    if file_count > 0:
        print(f"{'測試' if args.dry_run else ''}更新完成！已更新 {file_count} 個文件中的 {ref_count} 處版本號引用")
    else:
        print(f"未找到舊版本號 {args.old} 的引用")


if __name__ == "__main__":
    main() 
