// js/leave-logic.js - 排假頁面邏輯 (簡化版)

'use strict';
console.log("--- 簡化版 leave-logic.js 已載入 ---");

// --- 模組內變數 ---
let pageCurrentUser = null; // 儲存從 initLeavePage 傳入的 user
let pageDb = null;          // 儲存從 initLeavePage 傳入的 db
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let leaveRules = {};
let selectedDates = [];
let existingLeaveData = null;

// --- 初始化函數 ---
/**
 * 初始化排假頁面
 * @param {object} user - 從 requireLogin 獲取的登入使用者物件
 * @param {object} db - Firestore 實例
 */
async function initLeavePage(user, db) {
    if (!user || !db) {
        console.error("initLeavePage: Missing user or db instance.");
        document.body.innerHTML = '<p>頁面初始化錯誤，缺少必要信息。</p>';
        return;
    }
    
    // 儲存傳入的參數到模組變數
    pageCurrentUser = user;
    pageDb = db;
    console.log("Initializing Leave Page for:", pageCurrentUser?.name);
    
    // 顯示基本訊息
    const messageElement = document.getElementById('leave-message');
    if (messageElement) {
        messageElement.textContent = '請假系統正在進行維護，請稍後再試。';
        messageElement.className = 'message info-message';
    } else {
        document.body.innerHTML = '<p>請假系統正在進行維護，請稍後再試。</p>';
    }
}

/**
 * 顯示訊息到指定的元素
 * @param {string} msg - 要顯示的訊息
 * @param {string} type - 訊息類型 ('info', 'success', 'warning', 'error')
 * @param {string} elementId - 訊息元素的 ID
 */
function showMessage(msg, type = 'info', elementId = 'leave-message') {
    const elem = document.getElementById(elementId);
    if (elem) {
        elem.textContent = msg;
        elem.className = `message ${type}-message`;
    } else {
        console.warn(`showMessage: Element with ID '${elementId}' not found.`);
    }
}

// 暴露全局函數
window.initLeavePage = initLeavePage;
window.showMessage = showMessage; 