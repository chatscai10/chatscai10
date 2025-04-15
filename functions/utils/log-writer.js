/**
 * log-writer.js - 統一的日誌記錄處理模組
 * 
 * 此模組提供統一的日誌記錄函數，用於在系統各處記錄操作日誌
 * 符合數據分析與數據紀錄模組的擴充計畫
 */

const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

/**
 * 記錄操作活動日誌
 * @param {Object} logData - 日誌數據，包含以下字段:
 * @param {string} logData.userId - 操作者的用戶ID
 * @param {string} [logData.userName] - 操作者的姓名(可選)
 * @param {number} [logData.userLevel] - 操作者的權限等級(可選)
 * @param {string} logData.feature - 操作的功能模組
 * @param {string} logData.action - 執行的動作
 * @param {string} [logData.targetId] - 操作對象的ID(可選)
 * @param {Object} [logData.details] - 操作的詳細信息(可選)
 * @param {string} [logData.ipAddress] - 操作者的IP地址(可選)
 * @param {boolean} [logData.success] - 操作是否成功(可選)
 * @param {string} [logData.errorMessage] - 如果失敗，錯誤信息(可選)
 * @returns {Promise<string>} - 寫入的日誌文檔ID
 */
async function logActivity(logData) {
    try {
        // 驗證必要字段
        if (!logData.userId || !logData.feature || !logData.action) {
            logger.warn('logActivity called with missing required fields', { 
                providedFields: Object.keys(logData)
            });
        }

        // 準備日誌記錄對象
        const logEntry = {
            timestamp: getFirestore().FieldValue.serverTimestamp(),
            userId: logData.userId || 'anonymous',
            userName: logData.userName || null,
            userLevel: logData.userLevel !== undefined ? Number(logData.userLevel) : null,
            feature: logData.feature || 'Unknown',
            action: logData.action || 'UnknownAction',
            targetId: logData.targetId || null,
            details: logData.details || null,
            ipAddress: logData.ipAddress || null,
            status: logData.success === undefined ? null : (logData.success ? 'Success' : 'Failure'),
            errorMessage: (!logData.success && logData.errorMessage) ? logData.errorMessage : null
        };

        // 寫入Firestore
        const docRef = await getFirestore().collection('activity_logs').add(logEntry);
        logger.debug('Activity log recorded successfully', { docId: docRef.id, feature: logData.feature, action: logData.action });
        return docRef.id;
    } catch (error) {
        // 錯誤處理 - 僅記錄錯誤但不影響主程序流程
        logger.error('Failed to write activity log:', { 
            error: error.message, 
            errorCode: error.code,
            logData
        });
        return null;
    }
}

/**
 * 記錄系統活動日誌
 * 這是logActivity的簡化版本，專門用於系統自動化任務
 * 
 * @param {string} feature - 功能模組名稱
 * @param {string} action - 執行的動作
 * @param {Object} [details] - 操作詳細信息
 * @param {boolean} [success=true] - 操作是否成功
 * @param {string} [errorMessage] - 如果失敗，錯誤信息
 * @returns {Promise<string>} - 寫入的日誌文檔ID
 */
async function logSystemActivity(feature, action, details = null, success = true, errorMessage = null) {
    return logActivity({
        userId: 'system',
        userName: '系統任務',
        userLevel: 10, // 系統操作視為最高權限
        feature,
        action,
        details,
        success,
        errorMessage
    });
}

module.exports = {
    logActivity,
    logSystemActivity
}; 