#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
雞精補習班版本更新工具 (Windows優化版)
專為Windows系統設計，確保GUI顯示正常
"""

import os
import re
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from collections import Counter

# 全局變數
VERSION_PATTERN = r'(\?v=)([0-9]{8}v[0-9]+)'
JSON_VERSION_PATTERN = r'("version"\s*:\s*")([0-9]{8}v[0-9]+)(")'
JS_VERSION_PATTERN = r'(let\s+appVersion\s*=\s*[\'"])([0-9]{8}v[0-9]+)([\'"])'

def generate_new_version():
    """生成新的版本號"""
    today = datetime.now()
    date_part = today.strftime("%Y%m%d")
    return f"{date_part}v1"

def scan_files(directory="."):
    """掃描指定目錄中的HTML和JS文件"""
    file_list = []
    for ext in ['.html', '.js', '.json']:
        file_list.extend(list(Path(directory).rglob(f'*{ext}')))
    return file_list

def find_versions(files):
    """尋找所有文件中的版本號"""
    versions = []
    version_files = {}  # 追蹤每個版本在哪些文件中
    
    for file_path in files:
        try:
            if not _is_excluded(file_path):
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    file_versions = []
                    
                    # 查找HTML/JS中的版本號 (?v=YYYYMMDDVN)
                    for match in re.finditer(VERSION_PATTERN, content):
                        version = match.group(2)
                        versions.append(version)
                        file_versions.append(version)
                    
                    # 查找JSON中的版本號
                    if file_path.suffix == '.json':
                        for match in re.finditer(JSON_VERSION_PATTERN, content):
                            version = match.group(2)
                            versions.append(version)
                            file_versions.append(version)
                    
                    # 查找JS中的appVersion變量
                    if file_path.suffix == '.js':
                        for match in re.finditer(JS_VERSION_PATTERN, content):
                            version = match.group(2)
                            versions.append(version)
                            file_versions.append(version)
                    
                    # 將此文件的版本號儲存起來
                    for v in set(file_versions):
                        if v not in version_files:
                            version_files[v] = []
                        version_files[v].append(str(file_path))
        except Exception as e:
            print(f"處理文件 {file_path} 時出錯: {str(e)}")
            
    return versions, version_files

def _is_excluded(file_path):
    """檢查文件是否應該被排除"""
    excluded_dirs = ['node_modules', '.git', 'dist', 'build']
    excluded_files = ['version_update.py', 'version_update_windows.py']
    
    if file_path.name in excluded_files:
        return True
    
    path_str = str(file_path).replace('\\', '/')
    for excluded in excluded_dirs:
        if f'/{excluded}/' in path_str or path_str.endswith(f'/{excluded}'):
            return True
    
    return False

def detect_current_versions(directory="."):
    """檢測當前系統中的所有版本號及其分佈"""
    print(f"正在掃描目錄: {directory}")
    files = scan_files(directory)
    print(f"找到 {len(files)} 個文件")
    versions, version_files = find_versions(files)
    
    if not versions:
        return None, {}, {}
    
    # 使用Counter找出各版本號出現頻率
    counter = Counter(versions)
    most_common_version = counter.most_common(1)[0][0]
    
    return most_common_version, counter, version_files

def generate_newer_version(current_versions):
    """生成一個比所有現有版本都新的版本號"""
    try:
        if not current_versions:
            return generate_new_version()
            
        # 找出日期最新的版本
        latest_date = 0
        latest_version = 0
        latest_full = ""
        
        for version in current_versions:
            if re.match(r'^[0-9]{8}v[0-9]+$', version):
                date_part = version[:8]  # YYYYMMDD
                version_part = version[9:]  # X (數字部分)
                
                try:
                    date_int = int(date_part)
                    version_int = int(version_part)
                    
                    if date_int > latest_date:
                        latest_date = date_int
                        latest_version = version_int
                        latest_full = version
                    elif date_int == latest_date and version_int > latest_version:
                        latest_version = version_int
                        latest_full = version
                except:
                    continue
        
        if not latest_full:
            return generate_new_version()
            
        # 獲取今天的日期
        today = datetime.now().strftime("%Y%m%d")
        today_int = int(today)
        
        if today_int > latest_date:
            # 如果今天的日期比最新版本的日期更新，使用今天的日期和v1
            return f"{today}v1"
        else:
            # 如果日期相同，則使用最新版本號+1
            return f"{str(latest_date)}v{latest_version + 1}"
    except Exception as e:
        print(f"生成新版本號時出錯: {str(e)}")
    
    # 出錯時使用默認方式生成
    return generate_new_version()

def create_gui():
    """創建並啟動GUI界面"""
    root = tk.Tk()
    root.title("雞精補習班 - 版本更新工具")
    root.geometry("800x700")
    
    # 設定工作目錄
    working_dir = os.getcwd()
    
    # 創建主框架
    main_frame = ttk.Frame(root, padding=10)
    main_frame.pack(fill=tk.BOTH, expand=True)
    
    # 目錄選擇區域
    dir_frame = ttk.Frame(main_frame)
    dir_frame.pack(fill=tk.X, pady=5)
    
    ttk.Label(dir_frame, text="工作目錄:").pack(side=tk.LEFT)
    
    dir_var = tk.StringVar(value=working_dir)
    dir_entry = ttk.Entry(dir_frame, textvariable=dir_var, width=50)
    dir_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
    
    # 日誌區域（先建立，以便在其他函數中使用）
    log_frame = ttk.LabelFrame(main_frame, text="操作日誌", padding=10)
    log_frame.pack(fill=tk.BOTH, expand=True, pady=10)
    
    log_text = tk.Text(log_frame, height=15, wrap=tk.WORD)
    log_text.pack(fill=tk.BOTH, expand=True)
    
    scrollbar = ttk.Scrollbar(log_text, orient="vertical", command=log_text.yview)
    scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    log_text.config(yscrollcommand=scrollbar.set)
    
    log_text.config(state=tk.NORMAL)
    log_text.insert(tk.END, "版本更新工具已啟動\n")
    log_text.insert(tk.END, "正在掃描當前版本號...\n")
    log_text.see(tk.END)
    
    # 定義全局變數用於存儲所有版本號和其關聯文件
    version_counter = Counter()
    version_files_dict = {}
    
    def log(message):
        """添加日誌消息"""
        log_text.config(state=tk.NORMAL)
        log_text.insert(tk.END, message + "\n")
        log_text.see(tk.END)
        log_text.config(state=tk.DISABLED)
        
        # 同時輸出到控制台以便調試
        print(message)
    
    def browse_directory():
        """瀏覽選擇工作目錄"""
        directory = filedialog.askdirectory(initialdir=dir_var.get())
        if directory:
            dir_var.set(directory)
            log(f"已選擇工作目錄: {directory}")
            
            # 在新目錄中檢測版本號
            log("正在掃描新目錄中的版本號...")
            scan_versions()
    
    browse_btn = ttk.Button(dir_frame, text="瀏覽...", command=browse_directory)
    browse_btn.pack(side=tk.LEFT)
    
    # 版本設定區域
    version_frame = ttk.LabelFrame(main_frame, text="版本設定", padding=10)
    version_frame.pack(fill=tk.X, pady=10)
    
    # 版本選擇區域 (使用框架包含ListBox和滾動條)
    version_select_frame = ttk.Frame(version_frame)
    version_select_frame.pack(fill=tk.X, pady=5)
    
    ttk.Label(version_select_frame, text="要更新的版本:").pack(side=tk.TOP, anchor=tk.W)
    
    # 版本ListBox
    version_list_frame = ttk.Frame(version_select_frame)
    version_list_frame.pack(fill=tk.BOTH, expand=True, pady=5)
    
    version_listbox = tk.Listbox(version_list_frame, height=4, selectmode=tk.MULTIPLE)
    version_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    
    version_scrollbar = ttk.Scrollbar(version_list_frame, orient="vertical", command=version_listbox.yview)
    version_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    version_listbox.config(yscrollcommand=version_scrollbar.set)
    
    # 新版本設定
    new_ver_frame = ttk.Frame(version_frame)
    new_ver_frame.pack(fill=tk.X, pady=5)
    
    ttk.Label(new_ver_frame, text="新版本號:").pack(side=tk.LEFT)
    
    new_ver_var = tk.StringVar(value=generate_new_version())
    ttk.Entry(new_ver_frame, textvariable=new_ver_var, width=20).pack(side=tk.LEFT, padx=5)
    
    def scan_versions():
        """掃描並顯示版本號"""
        nonlocal version_counter, version_files_dict
        
        log("正在掃描當前目錄中的版本號...")
        current_version, counter, version_files = detect_current_versions(dir_var.get())
        
        # 保存結果到全局變數
        version_counter = counter
        version_files_dict = version_files
        
        if current_version:
            log(f"檢測到當前版本: {current_version}")
            
            # 清空並重新填充版本列表
            version_listbox.delete(0, tk.END)
            for version, count in counter.most_common():
                percentage = (count / sum(counter.values())) * 100
                version_listbox.insert(tk.END, f"{version} ({count}處, {percentage:.1f}%)")
                
            # 預選最常見的版本
            version_listbox.selection_set(0)
            
            # 生成一個比所有版本都新的版本號
            new_version = generate_newer_version(counter.keys())
            new_ver_var.set(new_version)
            log(f"已自動生成新版本號: {new_version}")
            
            # 展開版本分佈情況
            show_version_distribution()
        else:
            log("未檢測到任何版本號")
    
    def show_version_distribution():
        """顯示系統中的版本號分佈情況"""
        nonlocal version_counter
        
        if not version_counter:
            log("未檢測到任何版本號引用")
            return
        
        total = sum(version_counter.values())
        
        log(f"\n系統中的版本號分佈情況（共 {total} 處引用）:")
        for version, count in version_counter.most_common():
            percentage = (count / total) * 100
            log(f"  - {version}: {count} 處 ({percentage:.1f}%)")
    
    def show_version_files():
        """顯示選中版本的文件列表"""
        nonlocal version_files_dict
        
        selected_indices = version_listbox.curselection()
        if not selected_indices:
            messagebox.showinfo("提示", "請先選擇一個版本")
            return
            
        selected_versions = []
        for index in selected_indices:
            version_text = version_listbox.get(index)
            version = version_text.split(" ")[0]  # 提取版本號部分
            selected_versions.append(version)
            
        if not selected_versions:
            return
            
        # 創建新窗口顯示文件列表
        files_window = tk.Toplevel(root)
        files_window.title(f"版本 {', '.join(selected_versions)} 的文件列表")
        files_window.geometry("600x400")
        
        files_frame = ttk.Frame(files_window, padding=10)
        files_frame.pack(fill=tk.BOTH, expand=True)
        
        # 創建Text控件顯示文件列表
        files_text = tk.Text(files_frame, wrap=tk.WORD)
        files_text.pack(fill=tk.BOTH, expand=True)
        
        scrollbar = ttk.Scrollbar(files_text, orient="vertical", command=files_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        files_text.config(yscrollcommand=scrollbar.set)
        
        # 顯示文件列表
        for version in selected_versions:
            if version in version_files_dict:
                files_text.insert(tk.END, f"版本 {version} 出現在以下文件中:\n")
                for file_path in sorted(version_files_dict[version]):
                    files_text.insert(tk.END, f"  - {file_path}\n")
                files_text.insert(tk.END, "\n")
            else:
                files_text.insert(tk.END, f"找不到版本 {version} 的文件記錄\n\n")
                
        files_text.config(state=tk.DISABLED)
    
    scan_btn = ttk.Button(version_select_frame, text="掃描版本", command=scan_versions)
    scan_btn.pack(side=tk.LEFT, padx=5)
    
    show_files_btn = ttk.Button(version_select_frame, text="顯示文件", command=show_version_files)
    show_files_btn.pack(side=tk.LEFT, padx=5)
    
    def generate_version():
        """生成新版本號"""
        selected_versions = get_selected_versions()
        
        if selected_versions:
            new_version = generate_newer_version(selected_versions)
        else:
            new_version = generate_new_version()
        
        new_ver_var.set(new_version)
        log(f"已生成新版本號: {new_version}")
    
    ttk.Button(
        new_ver_frame, 
        text="生成新版本號", 
        command=generate_version
    ).pack(side=tk.LEFT, padx=5)
    
    # 操作區域
    action_frame = ttk.Frame(main_frame)
    action_frame.pack(fill=tk.X, pady=10)
    
    dry_run_var = tk.BooleanVar(value=True)
    ttk.Checkbutton(
        action_frame, 
        text="測試運行 (不實際修改文件，顯示更改細節)",
        variable=dry_run_var
    ).pack(side=tk.LEFT)
    
    def get_selected_versions():
        """獲取所選版本號列表"""
        selected_indices = version_listbox.curselection()
        selected_versions = []
        
        for index in selected_indices:
            version_text = version_listbox.get(index)
            version = version_text.split(" ")[0]  # 提取版本號部分
            selected_versions.append(version)
            
        return selected_versions
    
    def execute_update():
        """執行版本更新"""
        selected_versions = get_selected_versions()
        new_version = new_ver_var.get().strip()
        working_directory = dir_var.get()
        is_dry_run = dry_run_var.get()
        
        if not selected_versions:
            messagebox.showerror("錯誤", "請選擇至少一個要更新的版本")
            return
        
        if not new_version:
            messagebox.showerror("錯誤", "請輸入新版本號")
            return
        
        if any(v == new_version for v in selected_versions):
            messagebox.showerror("錯誤", "新版本號不能與要更新的版本相同")
            return
        
        # 確認更新
        if not is_dry_run:
            if not messagebox.askyesno("確認", f"確定要將以下版本更新為 {new_version}？\n\n{', '.join(selected_versions)}\n\n這將會實際修改文件，建議先進行測試運行。"):
                return
        
        # 執行更新
        try:
            # 記錄開始時間
            start_time = datetime.now()
            
            # 對每個選中的版本進行更新
            for old_version in selected_versions:
                log(f"\n開始{'測試' if is_dry_run else ''}更新版本：{old_version} -> {new_version}")
                
                # 掃描所有檔案
                files = scan_files(working_directory)
                
                # 更新版本號
                updated_files = 0
                updated_refs = 0
                detailed_updates = []
                
                for file_path in files:
                    try:
                        if not _is_excluded(file_path):
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            
                            # 計算原始引用數
                            original_refs_count = content.count(f'?v={old_version}')
                            json_matches = len(re.findall(JSON_VERSION_PATTERN.replace('([0-9]{8}v[0-9]+)', re.escape(old_version)), content))
                            js_matches = len(re.findall(JS_VERSION_PATTERN.replace('([0-9]{8}v[0-9]+)', re.escape(old_version)), content))
                            total_refs = original_refs_count + json_matches + js_matches
                            
                            if total_refs == 0:
                                continue
                                
                            # 記錄更新詳情
                            file_specific_updates = []
                            
                            # 逐行檢查，提供行號信息
                            lines = content.splitlines()
                            for i, line in enumerate(lines):
                                line_num = i + 1  # 1-based line numbering
                                
                                # 檢查各種模式
                                if f'?v={old_version}' in line:
                                    file_specific_updates.append(f"第 {line_num} 行")
                                    
                                # JSON模式
                                if re.search(JSON_VERSION_PATTERN.replace('([0-9]{8}v[0-9]+)', re.escape(old_version)), line):
                                    file_specific_updates.append(f"第 {line_num} 行")
                                    
                                # JS模式
                                if re.search(JS_VERSION_PATTERN.replace('([0-9]{8}v[0-9]+)', re.escape(old_version)), line):
                                    file_specific_updates.append(f"第 {line_num} 行")
                            
                            # 替換版本號
                            new_content = content.replace(f'?v={old_version}', f'?v={new_version}')
                            
                            # 修復JSON模式替換
                            json_pattern = f'"version"\\s*:\\s*"{re.escape(old_version)}"'
                            new_content = re.sub(json_pattern, f'"version": "{new_version}"', new_content)
                            
                            # 修復JS模式替換
                            js_pattern = f'let\\s+appVersion\\s*=\\s*[\'\"]{re.escape(old_version)}[\'\"]'
                            new_content = re.sub(js_pattern, f'let appVersion = "{new_version}"', new_content)
                            
                            if content != new_content:
                                updated_files += 1
                                updated_refs += total_refs
                                
                                # 記錄更新詳情
                                file_update_info = f"{file_path} ({', '.join(file_specific_updates)})"
                                detailed_updates.append(file_update_info)
                                
                                # 在測試模式下打印詳細信息，或實際更新文件
                                for line_info in file_specific_updates:
                                    log(f"{'[試運行] ' if is_dry_run else ''}已更新: {file_path} ({line_info})")
                                
                                if not is_dry_run:
                                    # 備份原文件
                                    backup_path = f"{file_path}.bak"
                                    shutil.copy2(file_path, backup_path)
                                    
                                    # 寫入新內容
                                    with open(file_path, 'w', encoding='utf-8') as f:
                                        f.write(new_content)
                    except Exception as e:
                        log(f"處理文件時出錯: {file_path} - {str(e)}")
                
                # 更新version-info.json如果存在
                try:
                    info_path = Path(working_directory) / 'version-info.json'
                    if info_path.exists():
                        try:
                            with open(info_path, 'r', encoding='utf-8') as f:
                                info_content = f.read()
                                info_data = json.loads(info_content)
                                
                            if 'version' in info_data:
                                old_info_version = info_data['version']
                                log(f"{'[試運行] ' if is_dry_run else ''}已更新 version-info.json: {old_info_version} -> {new_version}")
                                
                                if not is_dry_run:
                                    # 備份
                                    shutil.copy2(info_path, f"{info_path}.bak")
                                    
                                    # 更新版本
                                    info_data['version'] = new_version
                                    
                                    # 寫入
                                    with open(info_path, 'w', encoding='utf-8') as f:
                                        json.dump(info_data, f, indent=2)
                        except Exception as e:
                            log(f"更新 version-info.json 時出錯: {str(e)}")
                except:
                    pass
                
                result_msg = f"{'測試' if is_dry_run else ''}更新完成！已更新 {updated_files} 個文件中的 {updated_refs} 處版本號引用"
                log(result_msg)
            
            # 計算總耗時
            duration = datetime.now() - start_time
            log(f"\n總耗時: {duration.total_seconds():.2f} 秒")
            
            if not is_dry_run:
                # 更新完成後重新掃描顯示版本分佈
                log("\n更新完成後重新掃描版本分佈...")
                scan_versions()
                messagebox.showinfo("成功", f"版本更新完成！\n\n已將 {', '.join(selected_versions)} 更新為 {new_version}")
        
        except Exception as e:
            log(f"\n執行出錯：{str(e)}")
            messagebox.showerror("錯誤", f"執行出錯：{str(e)}")
    
    # 按鈕區域
    button_frame = ttk.Frame(main_frame)
    button_frame.pack(fill=tk.X, pady=10)
    
    update_btn = ttk.Button(
        button_frame,
        text="開始更新",
        command=execute_update,
    )
    update_btn.pack(side=tk.RIGHT)
    
    close_btn = ttk.Button(
        button_frame,
        text="關閉",
        command=root.destroy,
    )
    close_btn.pack(side=tk.RIGHT, padx=10)
    
    # 在啟動主循環前檢測當前版本
    root.after(500, scan_versions)
    
    # 啟動主循環
    print("正在啟動GUI視窗...")
    root.mainloop()
    print("GUI視窗已關閉")

if __name__ == "__main__":
    print("版本更新工具 - Windows優化版")
    print("正在啟動GUI介面...")
    create_gui() 