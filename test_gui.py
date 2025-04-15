#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
測試tkinter GUI是否正常工作
"""

import tkinter as tk
from tkinter import messagebox

# 建立最基本的視窗
root = tk.Tk()
root.title("GUI測試")
root.geometry("300x200")

# 建立標籤
label = tk.Label(root, text="如果你能看到這個視窗，表示tkinter正常工作！", wraplength=250)
label.pack(pady=20)

# 建立按鈕
button = tk.Button(root, text="點擊我", command=lambda: messagebox.showinfo("成功", "GUI正常運作！"))
button.pack(pady=10)

# 啟動視窗
if __name__ == "__main__":
    print("正在嘗試啟動GUI視窗...")
    root.mainloop()
    print("GUI視窗已關閉") 