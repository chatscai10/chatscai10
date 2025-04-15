import os
import re
import tkinter as tk
from tkinter import messagebox, ttk
from pathlib import Path
import concurrent.futures
import traceback

class VersionUpdaterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("版本號更新工具")
        self.root.geometry("700x600")
        self.root.resizable(True, True)
        
        # 設定字體和顏色
        self.bg_color = "#f5f5f5"
        self.accent_color = "#4CAF50"
        self.font = ("Microsoft JhengHei", 12)
        self.root.configure(bg=self.bg_color)
        
        # 創建主框架
        self.main_frame = tk.Frame(root, bg=self.bg_color, padx=20, pady=20)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 標題
        self.title_label = tk.Label(
            self.main_frame, 
            text="不早系統版本更新工具", 
            font=("Microsoft JhengHei", 16, "bold"),
            bg=self.bg_color
        )
        self.title_label.pack(pady=(0, 10))
        
        # 當前工作目錄
        self.dir_frame = tk.Frame(self.main_frame, bg=self.bg_color)
        self.dir_frame.pack(fill=tk.X, pady=5)
        
        self.dir_label = tk.Label(
            self.dir_frame, 
            text="工作目錄:", 
            font=self.font,
            bg=self.bg_color,
            width=10,
            anchor="w"
        )
        self.dir_label.pack(side=tk.LEFT)
        
        self.working_dir_var = tk.StringVar()
        self.working_dir_var.set("D:/chicken-tw")
        
        self.dir_entry = tk.Entry(
            self.dir_frame, 
            textvariable=self.working_dir_var,
            font=self.font
        )
        self.dir_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # 頂部控制框架
        self.control_frame = tk.Frame(self.main_frame, bg=self.bg_color)
        self.control_frame.pack(fill=tk.X, pady=5)
        
        # 檔案類型
        file_types_frame = tk.LabelFrame(self.control_frame, text="檔案類型", bg=self.bg_color, font=self.font)
        file_types_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))
        
        self.file_types = {
            "HTML (.html)": tk.BooleanVar(value=True),
            "JS (.js)": tk.BooleanVar(value=True),
            "CSS (.css)": tk.BooleanVar(value=False)
        }
        
        for i, (file_type, var) in enumerate(self.file_types.items()):
            cb = tk.Checkbutton(
                file_types_frame,
                text=file_type,
                variable=var,
                font=("Microsoft JhengHei", 10),
                bg=self.bg_color
            )
            cb.pack(anchor="w", padx=5)
        
        # 版本號設定框架
        version_frame = tk.LabelFrame(self.control_frame, text="版本號", bg=self.bg_color, font=self.font)
        version_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # 目前版本號
        current_ver_frame = tk.Frame(version_frame, bg=self.bg_color)
        current_ver_frame.pack(fill=tk.X, pady=5, padx=5)
        
        self.current_ver_label = tk.Label(
            current_ver_frame,
            text="目前版本號:",
            font=self.font,
            bg=self.bg_color
        )
        self.current_ver_label.pack(side=tk.LEFT)
        
        self.current_ver_var = tk.StringVar()
        self.current_ver_entry = tk.Entry(
            current_ver_frame,
            textvariable=self.current_ver_var,
            font=self.font,
            width=15
        )
        self.current_ver_entry.pack(side=tk.LEFT, padx=5)
        
        # 新版本號
        new_ver_frame = tk.Frame(version_frame, bg=self.bg_color)
        new_ver_frame.pack(fill=tk.X, pady=5, padx=5)
        
        self.new_ver_label = tk.Label(
            new_ver_frame,
            text="新版本號:",
            font=self.font,
            bg=self.bg_color
        )
        self.new_ver_label.pack(side=tk.LEFT)
        
        self.new_ver_var = tk.StringVar()
        self.new_ver_entry = tk.Entry(
            new_ver_frame,
            textvariable=self.new_ver_var,
            font=self.font,
            width=15
        )
        self.new_ver_entry.pack(side=tk.LEFT, padx=5)
        
        # 按鈕框架
        button_frame = tk.Frame(self.control_frame, bg=self.bg_color)
        button_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.scan_button = tk.Button(
            button_frame,
            text="掃描版本",
            font=self.font,
            bg=self.accent_color,
            fg="white",
            padx=10,
            pady=5,
            command=self.scan_versions
        )
        self.scan_button.pack(pady=5)
        
        self.update_button = tk.Button(
            button_frame,
            text="更新版本",
            font=self.font,
            bg=self.accent_color,
            fg="white",
            padx=10,
            pady=5,
            command=self.update_versions
        )
        self.update_button.pack(pady=5)
        
        # 版本列表框架
        list_frame = tk.LabelFrame(self.main_frame, text="找到的版本", bg=self.bg_color, font=self.font)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        
        # 版本列表工具列
        toolbar = tk.Frame(list_frame, bg=self.bg_color)
        toolbar.pack(fill=tk.X, padx=5, pady=5)
        
        self.select_all_var = tk.BooleanVar(value=True)
        self.select_all_check = tk.Checkbutton(
            toolbar,
            text="全選",
            variable=self.select_all_var,
            font=self.font,
            bg=self.bg_color,
            command=self.toggle_select_all
        )
        self.select_all_check.pack(side=tk.LEFT)
        
        # 創建Treeview
        self.tree_frame = tk.Frame(list_frame)
        self.tree_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.tree_yscroll = ttk.Scrollbar(self.tree_frame, orient="vertical")
        self.tree_yscroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.tree_xscroll = ttk.Scrollbar(self.tree_frame, orient="horizontal")
        self.tree_xscroll.pack(side=tk.BOTTOM, fill=tk.X)
        
        self.versions_tree = ttk.Treeview(
            self.tree_frame,
            columns=("selected", "version", "file", "line"),
            show="headings",
            yscrollcommand=self.tree_yscroll.set,
            xscrollcommand=self.tree_xscroll.set
        )
        
        self.tree_yscroll.config(command=self.versions_tree.yview)
        self.tree_xscroll.config(command=self.versions_tree.xview)
        
        # 設定列標題
        self.versions_tree.heading("selected", text="選擇")
        self.versions_tree.heading("version", text="版本號")
        self.versions_tree.heading("file", text="檔案路徑")
        self.versions_tree.heading("line", text="行號")
        
        # 設定列寬度
        self.versions_tree.column("selected", width=50, anchor=tk.CENTER)
        self.versions_tree.column("version", width=120)
        self.versions_tree.column("file", width=300)
        self.versions_tree.column("line", width=60, anchor=tk.CENTER)
        
        # 綁定點擊事件用於切換選擇狀態
        self.versions_tree.bind("<ButtonRelease-1>", self.on_tree_click)
        
        self.versions_tree.pack(fill=tk.BOTH, expand=True)
        
        # 日誌框
        self.log_frame = tk.Frame(self.main_frame, bg=self.bg_color)
        self.log_frame.pack(fill=tk.X, pady=5)
        
        self.log_text = tk.Text(
            self.log_frame,
            font=("Consolas", 10),
            height=4,
            wrap=tk.WORD
        )
        self.log_text.pack(fill=tk.X)
        
        # 滾動條
        self.log_scrollbar = ttk.Scrollbar(self.log_text, command=self.log_text.yview)
        self.log_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.config(yscrollcommand=self.log_scrollbar.set)
        
        # 初始化工作目錄和版本列表
        self.working_dir = Path(self.working_dir_var.get())
        self.version_entries = []
        
        # 初始化日誌
        self.log("請先設定目前版本號或直接掃描搜尋所有版本")
        
        # 嘗試檢測版本號 (不阻塞UI)
        self.root.after(100, self.detect_version)
    
    def log(self, message):
        """新增日誌訊息"""
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
    
    def detect_version(self):
        """嘗試檢測版本號 (簡化版)"""
        try:
            # 優先從version-check.js檢查
            paths_to_check = [
                (self.working_dir / "js" / "version-check.js", 
                 r"const\s+CURRENT_VERSION\s*=\s*[\"'](\d+v\d+)[\"']"),
                (self.working_dir / "index.html", 
                 r"[?&]v=(\d+v\d+)")
            ]
            
            for path, pattern in paths_to_check:
                if path.exists():
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read(10000)  # 只讀取前10000字符提高速度
                        match = re.search(pattern, content)
                        if match:
                            version = match.group(1)
                            self.current_ver_var.set(version)
                            
                            # 設定下一個版本號建議
                            parts = version.split("v")
                            if len(parts) == 2:
                                date_part = parts[0]
                                version_num = int(parts[1])
                                next_version = f"{date_part}v{version_num + 1}"
                                self.new_ver_var.set(next_version)
                            return
        except Exception:
            pass  # 靜默失敗，不影響用戶體驗
    
    def get_selected_file_types(self):
        """獲取選中的檔案類型列表"""
        patterns = []
        
        if self.file_types["HTML (.html)"].get():
            patterns.extend(["**/*.html", "**/*.htm"])
        
        if self.file_types["JS (.js)"].get():
            patterns.append("**/*.js")
        
        if self.file_types["CSS (.css)"].get():
            patterns.append("**/*.css")
        
        return patterns
    
    def scan_versions(self):
        """掃描工作目錄中所有檔案尋找版本號"""
        try:
            # 禁用按鈕，防止重複操作
            self.scan_button.config(state=tk.DISABLED)
            self.update_button.config(state=tk.DISABLED)
            
            # 更新UI
            self.root.update()
            
            try:
                # 檢查是否有選擇檔案類型
                file_patterns = self.get_selected_file_types()
                if not file_patterns:
                    messagebox.showerror("錯誤", "請至少選擇一種檔案類型進行掃描")
                    return
                
                # 更新工作目錄
                dir_path = self.working_dir_var.get()
                if not os.path.isdir(dir_path):
                    messagebox.showerror("錯誤", f"工作目錄無效: {dir_path}")
                    return
                    
                self.working_dir = Path(dir_path)
                
                # 是否搜尋特定版本
                specific_version = self.current_ver_var.get()
                search_specific = bool(specific_version)
                
                self.log(f"開始掃描 {self.working_dir}")
                
                # 清空版本列表
                self.versions_tree.delete(*self.versions_tree.get_children())
                self.version_entries = []
                
                # 獲取所有符合條件的檔案
                all_files = []
                for pattern in file_patterns:
                    all_files.extend(list(self.working_dir.glob(pattern)))
                
                # 去除重複檔案並限制數量
                all_files = list(set(all_files))[:1000]  # 限制最多掃描1000個檔案
                self.log(f"找到 {len(all_files)} 個檔案")
                
                # 更新UI
                self.root.update()
                
                # 使用線程池加速掃描
                results = []
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                    future_to_file = {}
                    for file in all_files:
                        future = executor.submit(self.find_versions_in_file, file, specific_version)
                        future_to_file[future] = file
                        
                    total = len(future_to_file)
                    done = 0
                    
                    for future in concurrent.futures.as_completed(future_to_file):
                        file_results = future.result()
                        if file_results:
                            results.extend(file_results)
                        
                        # 更新進度
                        done += 1
                        if done % 10 == 0:  # 每掃描10個檔案更新一次進度
                            self.log(f"掃描進度: {done}/{total}")
                            self.root.update()
                
                # 對結果進行去重和排序
                unique_versions = set()
                sorted_results = []
                
                for result in results:
                    version_key = (result["file"], result["line"], result["version"])
                    if version_key not in unique_versions:
                        unique_versions.add(version_key)
                        sorted_results.append(result)
                
                # 按版本號排序
                sorted_results.sort(key=lambda x: x["version"])
                
                # 填充樹狀列表
                for result in sorted_results:
                    rel_path = os.path.relpath(result["file"], self.working_dir)
                    item_id = self.versions_tree.insert("", tk.END, values=("✓", result["version"], rel_path, result["line"]))
                    # 儲存額外資訊以供後續更新使用
                    self.version_entries.append({
                        "id": item_id,
                        "selected": True,
                        "version": result["version"],
                        "file": result["file"],
                        "line": result["line"]
                    })
                
                # 設定建議的新版本號 (如果未設定)
                if sorted_results and not self.new_ver_var.get():
                    # 使用第一個版本號作為基礎
                    first_version = sorted_results[0]["version"]
                    parts = first_version.split("v")
                    if len(parts) == 2:
                        date_part = parts[0]
                        version_num = int(parts[1])
                        next_version = f"{date_part}v{version_num + 1}"
                        self.new_ver_var.set(next_version)
                
                self.log(f"掃描完成，找到 {len(sorted_results)} 個版本號")
                
            except Exception as e:
                self.log(f"掃描過程中發生錯誤: {str(e)}")
                messagebox.showerror("錯誤", f"掃描過程中發生錯誤: {str(e)}")
                
        finally:
            # 重新啟用按鈕
            self.scan_button.config(state=tk.NORMAL)
            self.update_button.config(state=tk.NORMAL)
    
    def find_versions_in_file(self, file_path, specific_version=None):
        """在單一檔案中尋找版本號 (簡化版)"""
        try:
            results = []
            
            # 使用更簡單快速的方式先篩選檔案
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(50000)  # 只讀取前50000字符提高速度
                
                # 如果是特定版本搜尋，先快速檢查
                if specific_version and specific_version not in content:
                    return []
                
                # 如果是搜尋所有版本，先快速檢查是否包含可能的版本格式
                if not specific_version and not re.search(r"\d{6,8}v\d+", content):
                    return []
            
            # 如果初步檢查通過，再進行詳細的行搜尋
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                
            # 減少正則表達式模式，提高速度
            patterns = [
                r"[?&]v=(\d+v\d+)",
                r"const\s+\w*VERSION\w*\s*=\s*[\"'](\d+v\d+)[\"']",
                r"version[\"']?\s*[:=]\s*[\"'](\d+v\d+)[\"']",
                r"(\d{8}v\d+)"
            ]
            
            for line_num, line in enumerate(lines, 1):
                # 如果是特定版本搜尋，快速檢查
                if specific_version:
                    if specific_version in line:
                        for pattern in patterns:
                            matches = re.finditer(pattern, line)
                            for match in matches:
                                version = match.group(1)
                                if version == specific_version:
                                    results.append({
                                        "file": str(file_path),
                                        "line": line_num,
                                        "version": version
                                    })
                else:
                    # 搜尋所有版本
                    for pattern in patterns:
                        matches = re.finditer(pattern, line)
                        for match in matches:
                            version = match.group(1)
                            if re.match(r"^\d+v\d+$", version):
                                results.append({
                                    "file": str(file_path),
                                    "line": line_num,
                                    "version": version
                                })
            
            return results
        except Exception:
            return []  # 靜默失敗，提高穩定性
    
    def toggle_select_all(self):
        """切換全選/取消全選"""
        select_all = self.select_all_var.get()
        
        for entry in self.version_entries:
            entry["selected"] = select_all
            self.versions_tree.item(entry["id"], values=("✓" if select_all else "□", entry["version"], 
                                                      os.path.relpath(entry["file"], self.working_dir), 
                                                      entry["line"]))
    
    def on_tree_click(self, event):
        """處理樹狀列表點擊事件"""
        region = self.versions_tree.identify_region(event.x, event.y)
        if region == "cell":
            column = self.versions_tree.identify_column(event.x)
            item_id = self.versions_tree.identify_row(event.y)
            
            # 只處理第一列（選擇欄）的點擊
            if column == "#1" and item_id:
                # 找到對應的條目
                for entry in self.version_entries:
                    if entry["id"] == item_id:
                        # 切換選擇狀態
                        entry["selected"] = not entry["selected"]
                        self.versions_tree.item(item_id, values=("✓" if entry["selected"] else "□", 
                                                              entry["version"], 
                                                              os.path.relpath(entry["file"], self.working_dir), 
                                                              entry["line"]))
                        break
                
                # 更新全選狀態
                all_selected = all(entry["selected"] for entry in self.version_entries)
                self.select_all_var.set(all_selected)
    
    def update_file_version(self, file_path, line_num, old_version, new_version):
        """更新單一檔案中的特定版本號 (簡化版)"""
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            
            if 1 <= line_num <= len(lines):
                line = lines[line_num - 1]
                
                # 直接替換版本號，簡化處理
                updated_line = line.replace(old_version, new_version)
                
                # 如果有變更，更新檔案
                if updated_line != line:
                    lines[line_num - 1] = updated_line
                    with open(file_path, "w", encoding="utf-8", errors="ignore") as f:
                        f.writelines(lines)
                    return True
            
            return False
        except Exception:
            return False  # 靜默失敗
    
    def update_versions(self):
        """更新所有選定的版本號"""
        try:
            # 禁用按鈕，防止重複操作
            self.scan_button.config(state=tk.DISABLED)
            self.update_button.config(state=tk.DISABLED)
            
            new_version = self.new_ver_var.get()
            
            if not new_version:
                messagebox.showerror("錯誤", "請輸入新版本號")
                return
                
            # 確認版本格式
            if not re.match(r"^\d+v\d+$", new_version):
                messagebox.showerror("錯誤", "新版本號格式錯誤，請使用類似 YYYYMMDDv1 的格式")
                return
            
            # 獲取選定的項目
            selected_entries = [entry for entry in self.version_entries if entry["selected"]]
            
            if not selected_entries:
                messagebox.showinfo("提示", "請至少選擇一個版本號進行更新")
                return
            
            # 確認用戶是否要更新
            if not messagebox.askyesno("確認", f"確定要將選定的 {len(selected_entries)} 個版本號更新為 {new_version} 嗎？"):
                return
            
            self.log(f"開始更新 {len(selected_entries)} 個版本號")
            
            # 使用線程池加速更新
            updated_count = 0
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = []
                
                for entry in selected_entries:
                    futures.append(
                        executor.submit(
                            self.update_file_version, 
                            entry["file"], 
                            entry["line"], 
                            entry["version"], 
                            new_version
                        )
                    )
                
                total = len(futures)
                done = 0
                
                for future in concurrent.futures.as_completed(futures):
                    if future.result():
                        updated_count += 1
                    
                    # 更新進度
                    done += 1
                    if done % 10 == 0:  # 每更新10個檔案更新一次進度
                        self.log(f"更新進度: {done}/{total}")
                        self.root.update()
            
            # 更新當前版本
            self.current_ver_var.set(new_version)
            
            # 設定下一個版本號建議
            parts = new_version.split("v")
            if len(parts) == 2:
                date_part = parts[0]
                version_num = int(parts[1])
                next_version = f"{date_part}v{version_num + 1}"
                self.new_ver_var.set(next_version)
            
            # 完成訊息
            self.log(f"更新完成！成功更新 {updated_count} 個版本號")
            messagebox.showinfo("完成", f"版本更新完成！\n成功更新 {updated_count} 個版本號")
            
            # 重新掃描
            self.scan_versions()
            
        finally:
            # 重新啟用按鈕
            self.scan_button.config(state=tk.NORMAL)
            self.update_button.config(state=tk.NORMAL)

if __name__ == "__main__":
    try:
        root = tk.Tk()
        app = VersionUpdaterApp(root)
        root.mainloop()
    except Exception as e:
        print(f"程式發生未預期錯誤: {str(e)}")
        try:
            messagebox.showerror("錯誤", f"程式發生未預期錯誤:\n{str(e)}")
        except:
            pass