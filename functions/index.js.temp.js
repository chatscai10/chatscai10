// functions/index.js - 測試版 (修正 checkMissedClockIn 為 v2，並加入詳細 Log)

// --- 引入 ---
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");"
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");"
const { onSchedule } = require("firebase-functions/v2/scheduler"); // <--- 確保引入 v2 scheduler"
const { defineString, defineSecret } = require("firebase-functions/params");"
const { logger } = require("firebase-functions");"
const functions = require("firebase-functions"); // 保留 v1 SDK (可能某些輔助函數仍依賴)"
const admin = require("firebase-admin");"
const axios = require("axios");
const line = require('@line/bot-sdk');'
const TelegramBot = require('node-telegram-bot-api');"
const { getMessaging } = require("firebase-admin/messaging");'
const cors = require('cors')({ origin: true }); // <-- 引入並配置 CORS
// ADDED: Import FieldValue for timestamp operations"
const { FieldValue } = require("firebase-admin/firestore");

// --- 初始化 Firebase Admin SDK ---
try {
    if (!admin.apps.length) {
        admin.initializeApp();"
        logger.info("Firebase Admin SDK Initialized.");
    }"
} catch (e) { logger.error("Firebase Admin Init Error:", e); }
const db = admin.firestore();
const auth = admin.auth();

// --- 參數定義 ---"
const LINE_CHANNEL_ID_PARAM = defineString("LINE_CHANNEL_ID");"
const LINE_OA_TOKEN_PARAM = defineSecret("LINE_OA_TOKEN");"
const TELEGRAM_BOT_TOKEN_PARAM = defineSecret("TELEGRAM_BOT_TOKEN");

// --- API Clients 變數宣告 ---
let lineClient = null;
let telegramBot = null;

// --- 常量定義 ---'
const NOTIFICATION_CONFIG_PATH = 'settings/notification_config';'
const USER_NOTIFICATION_PREFS_PATH = 'user_notification_preferences';
const MAX_NOTIFICATION_ATTEMPTS = 3; // 重試次數
const NOTIFICATION_RETRY_DELAY = 5000; // 重試間隔(ms)

// --- 輔助函數 ---

/**
 * 初始化並獲取 Line Client
 */
function getLineClient() {
  if (!lineClient) {
    try {
      const lineConfig = {
        channelId: LINE_CHANNEL_ID_PARAM.value(),
        channelAccessToken: LINE_OA_TOKEN_PARAM.value()
      };
      if (!lineConfig.channelId || !lineConfig.channelAccessToken) {"
        logger.error("LINE Channel ID or Access Token parameter is missing.");
        return null;
      }
      lineClient = new line.Client(lineConfig);
    } catch (error) {
      logger.error(`Error initializing LINE client: ${error.message}`);
      return null;
    }
  }
  return lineClient;
}

/**
 * 初始化並獲取 Telegram Bot
 */
function getTelegramBot() {
  if (!telegramBot) {
    try {
      const token = TELEGRAM_BOT_TOKEN_PARAM.value();
      if (!token) {"
        logger.error("Telegram Bot Token parameter is missing.");
        return null;
      }
      telegramBot = new TelegramBot(token, { polling: false });
    } catch (error) {
      logger.error(`Error initializing Telegram bot: ${error.message}`);
      return null;
    }
  }
  return telegramBot;
}

/**
 * 格式化時間戳 (輔助函數)
 */'
function formatTimestamp(timestamp, format = 'YYYY-MM-DD HH:mm') {'
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        // 簡單的格式化，可以考慮引入 date-fns 或 moment.js
        const year = date.getFullYear();'
        const month = (date.getMonth() + 1).toString().padStart(2, '0');'
        const day = date.getDate().toString().padStart(2, '0');'
        const hours = date.getHours().toString().padStart(2, '0');'
        const minutes = date.getMinutes().toString().padStart(2, '0');'
        if (format === 'YYYY-MM-DD HH:mm') {
            return `${year}-${month}-${day} ${hours}:${minutes}`;'
        } else if (format === 'YYYY-MM-DD') {
            return `${year}-${month}-${day}`;
        }
        return date.toLocaleString();
    } catch (e) {"
        logger.warn("Error formatting timestamp:", e);'
        return 'Invalid Date';
    }
}

/**
 * 統一的通知發送函數 - 支持多平台和模板'
 * @param {string} type - 通知類型 (e.g., 'leave', 'schedule', 'clockin_reminder')'
 * @param {object} data - 要替換模板變數的數據 (e.g., { userName: '...', date: '...', message: '...' })
 * @param {object} [options={}] - 其他選項
 * @param {string} [options.userId] - 目標個人用戶ID (用於個人通知)
 * @param {boolean} [options.skipGlobal=false] - 是否跳過發送全局通知
 * @param {boolean} [options.skipPersonal=false] - 是否跳過發送個人通知
 * @param {boolean} [options.isAdminTarget=false] - 是否發送到管理員目標ID
 * @param {number} [attempt=1] - 當前重試次數
 */
async function sendNotification(type, data, options = {}, attempt = 1) {
    logger.info(`Attempt ${attempt}: Preparing notification type: ${type}`, { data, options });

    try {
        // 獲取全局通知設定'
        const configDoc = await db.collection('settings').doc(NOTIFICATION_CONFIG_PATH).get();
        if (!configDoc.exists) {'
            logger.warn('Notification config not found, aborting sendNotification.');'
            return { success: false, error: 'Notification config not found' };
        }
        const config = configDoc.data();
        const templates = config.templates || {};
        const defaultTemplate = templates[type] || {
            line: `${type} notification: ${data.message || JSON.stringify(data)}`,
            telegram: `${type} notification: ${data.message || JSON.stringify(data)}`,
            // email: { subject: `${type} notification`, body: `${data.message || JSON.stringify(data)}` }
        };

        // 處理變數替換
        const replacePlaceholders = (text, contextData) => {'
            if (!text) return '';
            return text.replace(/\${([^}]+)}/g, (match, key) => {
                return contextData[key] !== undefined ? contextData[key] : match;
            });
        };

        const results = {
            globalLine: { sent: false, skipped: false },
            globalTelegram: { sent: false, skipped: false },
            // globalEmail: { sent: false, skipped: false },
            personalLine: { sent: false, skipped: false },
            personalTelegram: { sent: false, skipped: false },
            // personalEmail: { sent: false, skipped: false },
        };

        const lineClientInstance = getLineClient();
        const telegramBotInstance = getTelegramBot();
        // const emailTransporterInstance = getEmailTransporter();

        // --- 發送全局通知 ---
        if (!options.skipGlobal) {
            // 全局 LINE 通知
            const lineTargetId = options.isAdminTarget ? config.line?.adminTargetId : config.line?.targetId;
            if (config.line?.enabled && lineTargetId && (!config.line.notifyOn || config.line.notifyOn[type])) {
                if (lineClientInstance) {
                    try {
                        const lineMessage = replacePlaceholders(defaultTemplate.line, data);'
                        await lineClientInstance.pushMessage(lineTargetId, { type: 'text', text: lineMessage });
                        results.globalLine = { sent: true };
                        logger.info(`Global LINE notification sent for type: ${type} to ${lineTargetId}`);
                    } catch (error) {
                        results.globalLine = { sent: false, error: error.message };
                        logger.error(`Error sending global LINE notification: ${error.message}`);
                    }
                } else {'
                    results.globalLine = { sent: false, error: 'LINE client init failed' };
                }
            } else {
                results.globalLine.skipped = true;
            }

            // 全局 Telegram 通知
            const telegramTargetId = options.isAdminTarget ? config.telegram?.adminChatId : config.telegram?.chatId;
            if (config.telegram?.enabled && telegramTargetId && (!config.telegram.notifyOn || config.telegram.notifyOn[type])) {
                if (telegramBotInstance) {
                    try {
                        const telegramMessage = replacePlaceholders(defaultTemplate.telegram, data);
                        await telegramBotInstance.sendMessage(telegramTargetId, telegramMessage);
                        results.globalTelegram = { sent: true };
                        logger.info(`Global Telegram notification sent for type: ${type} to ${telegramTargetId}`);
                    } catch (error) {
                        results.globalTelegram = { sent: false, error: error.message };
                        logger.error(`Error sending global Telegram notification: ${error.message}`);
                    }
                } else {'
                    results.globalTelegram = { sent: false, error: 'Telegram bot init failed' };
                }
            } else {
                results.globalTelegram.skipped = true;
            }

            // TODO: Add Global Email Notification
        } else {
             results.globalLine.skipped = true;
             results.globalTelegram.skipped = true;
             // results.globalEmail.skipped = true;
        }

        // --- 發送個人通知 ---
        if (options.userId && !options.skipPersonal) {
            let userData = null;
            let prefs = null;

            try {'
                // MODIFIED: Query 'employees' collection instead of 'users' for userData'
                // ASSUMPTION: The userId passed in options IS the document ID in 'employees' OR we need to query by authUid again.'
                // Let's assume for notification purposes, the document ID IS the user ID (needs verification if options.userId comes from Auth UID).'
                const userDoc = await db.collection('employees').doc(options.userId).get(); 
                const prefsDoc = await db.collection(USER_NOTIFICATION_PREFS_PATH).doc(options.userId).get();

                // MODIFIED: Check userDoc.exists property
                if (userDoc.exists) { 
                    userData = userDoc.data();
                } else {
                     logger.warn(`User data not found for personal notification: ${options.userId}`);
                     options.skipPersonal = true; // Skip if user data missing
                }

                if (prefsDoc.exists) {
                    prefs = prefsDoc.data();
                } else {
                    // Use default preferences if not set (e.g., allow LINE by default)
                    prefs = { platforms: { line: true }, subscriptions: {} }; // Assuming all types allowed if no specific subscription found
                    logger.info(`User preferences not found for ${options.userId}, using defaults.`);
                }

            } catch (fetchError) {
                 logger.error(`Failed to fetch user data or preferences for ${options.userId}:`, fetchError);
                 options.skipPersonal = true; // Skip if data fetching fails
            }


            if (!options.skipPersonal && userData) {
                // 檢查用戶是否訂閱此類通知
                const isSubscribed = (prefs.subscriptions && prefs.subscriptions[type] !== false);

                if (isSubscribed) {
                    // 檢查是否在靜音時間
                    let inQuietHours = false;
                    if (prefs.quiet_hours?.enabled && prefs.quiet_hours.start && prefs.quiet_hours.end) {
                       try {
                            const now = new Date();
                            const currentHour = now.getHours();
                            const currentMinute = now.getMinutes();
                            const currentTimeMinutes = currentHour * 60 + currentMinute;
'
                            const startParts = prefs.quiet_hours.start.split(':');'
                            const endParts = prefs.quiet_hours.end.split(':');

                            const startTimeMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                            const endTimeMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

                            if (!isNaN(startTimeMinutes) && !isNaN(endTimeMinutes)) {
                                if (startTimeMinutes <= endTimeMinutes) {
                                    inQuietHours = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes; // End is exclusive
                                } else { // Handles overnight quiet hours (e.g., 22:00 to 07:00)
                                    inQuietHours = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
                                }
                             } else {
                                logger.warn(`Invalid quiet hours format for user ${options.userId}: ${prefs.quiet_hours.start}-${prefs.quiet_hours.end}`);
                             }
                       } catch (quietHoursError) {
                           logger.error(`Error checking quiet hours for user ${options.userId}:`, quietHoursError);
                           inQuietHours = false; // Default to not in quiet hours if error
                       }
                    }

                    if (!inQuietHours) {'
                        const personalDataContext = { ...data, name: userData.name || '使用者' };

                        // 個人 LINE 通知
                        if (prefs.platforms?.line !== false && userData.lineUserId) {
                            if (lineClientInstance) {
                                try {
                                    const personalLineMessage = replacePlaceholders(defaultTemplate.line, personalDataContext);'
                                    await lineClientInstance.pushMessage(userData.lineUserId, { type: 'text', text: personalLineMessage });
                                    results.personalLine = { sent: true };
                                    logger.info(`Personal LINE notification sent to user: ${options.userId}`);
                                } catch (error) {
                                    results.personalLine = { sent: false, error: error.message };
                                    logger.error(`Error sending personal LINE notification to ${options.userId}: ${error.message}`);
                                }
                             } else {'
                                results.personalLine = { sent: false, error: 'LINE client init failed' };
                            }
                        } else {
                           results.personalLine.skipped = true;
                        }

                        // 個人 Telegram 通知
                        if (prefs.platforms?.telegram === true && userData.telegramChatId) {
                             if (telegramBotInstance) {
                                try {
                                    const personalTelegramMessage = replacePlaceholders(defaultTemplate.telegram, personalDataContext);
                                    await telegramBotInstance.sendMessage(userData.telegramChatId, personalTelegramMessage);
                                    results.personalTelegram = { sent: true };
                                    logger.info(`Personal Telegram notification sent to user: ${options.userId}`);
                                } catch (error) {
                                    results.personalTelegram = { sent: false, error: error.message };
                                    logger.error(`Error sending personal Telegram notification to ${options.userId}: ${error.message}`);
                                }
                             } else {'
                                 results.personalTelegram = { sent: false, error: 'Telegram bot init failed' };
                             }
                        } else {
                            results.personalTelegram.skipped = true;
                        }

                        // TODO: Add Personal Email Notification

                    } else {'
                        results.personalLine.skipped = true; results.personalLine.reason = 'Quiet hours';'
                        results.personalTelegram.skipped = true; results.personalTelegram.reason = 'Quiet hours';'
                        // results.personalEmail.skipped = true; results.personalEmail.reason = 'Quiet hours';
                        logger.info(`Skipped personal notification to user ${options.userId} due to quiet hours`);
                    }
                } else {'
                     results.personalLine.skipped = true; results.personalLine.reason = 'Not subscribed';'
                     results.personalTelegram.skipped = true; results.personalTelegram.reason = 'Not subscribed';'
                     // results.personalEmail.skipped = true; results.personalEmail.reason = 'Not subscribed';
                    logger.info(`Skipped personal notification to user ${options.userId} as they are not subscribed to ${type}`);
                }
            } else {'
                 results.personalLine.skipped = true; results.personalLine.reason = 'User data missing or skipPersonal flag';'
                 results.personalTelegram.skipped = true; results.personalTelegram.reason = 'User data missing or skipPersonal flag';'
                 // results.personalEmail.skipped = true; results.personalEmail.reason = 'User data missing or skipPersonal flag';
                 if (!userData) logger.warn(`Personal notification skipped because user data was missing for ${options.userId}`);
            }
        } else {'
             results.personalLine.skipped = true; results.personalLine.reason = 'No userId provided or skipPersonal flag';'
             results.personalTelegram.skipped = true; results.personalTelegram.reason = 'No userId provided or skipPersonal flag';'
             // results.personalEmail.skipped = true; results.personalEmail.reason = 'No userId provided or skipPersonal flag';
        }

        // Check if any notification failed and needs retry
        const needsRetry = Object.values(results).some(res => res.sent === false && res.error && !res.skipped);

        if (needsRetry && attempt < MAX_NOTIFICATION_ATTEMPTS) {
            logger.warn(`Notification attempt ${attempt} had failures for type ${type}, retrying in ${NOTIFICATION_RETRY_DELAY}ms...`, { results });
            await new Promise(resolve => setTimeout(resolve, NOTIFICATION_RETRY_DELAY));
            // Only retry failed parts? Or retry all? Simpler to retry all for now.
            return sendNotification(type, data, options, attempt + 1);
        } else if (needsRetry) {
            logger.error(`Notification type ${type} failed after ${MAX_NOTIFICATION_ATTEMPTS} attempts.`, { data, options, results });
        }

        return { success: !needsRetry, results };

    } catch (error) {
        logger.error(`Critical error in sendNotification (Attempt ${attempt}) for type ${type}: ${error.message}`, { error });
        if (attempt < MAX_NOTIFICATION_ATTEMPTS) {
            logger.warn(`Retrying critical error in ${NOTIFICATION_RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, NOTIFICATION_RETRY_DELAY));
            return sendNotification(type, data, options, attempt + 1);
        } else {
            logger.error(`Notification type ${type} failed critically after ${MAX_NOTIFICATION_ATTEMPTS} attempts.`);
            return { success: false, error: `Critical error after ${MAX_NOTIFICATION_ATTEMPTS} attempts: ${error.message}`, results: {} };
        }
    }
}

// 【保留修改後的 verifyLineToken】
async function verifyLineToken(idToken) {"
    logger.info("Entering verifyLineToken function.");
    if (!idToken) {"
        logger.error("verifyLineToken called with null or empty idToken.");'
        throw new functions.https.HttpsError('invalid-argument', 'ID Token 不可為空');
    }

    let channelId;
    try {
        channelId = LINE_CHANNEL_ID_PARAM.value();
        // 確保只使用基本ID部分，不包含後綴'
        if (channelId && channelId.includes('-')) {'
            channelId = channelId.split('-')[0]; // 提取基本ID部分 (2007075778)
            logger.info(`Using base channel ID: ${channelId} for LINE API verification`);
        }
    } catch (e) {"
        logger.error("Failed to get LINE_CHANNEL_ID from params inside verifyLineToken:", e);'
        throw new functions.https.HttpsError('internal', '無法讀取 LINE Channel ID 設定。請檢查環境變數或 Secret Manager 配置。', { detail: e.message });
    }
    if (!channelId) {"
        logger.error("LINE Login Channel ID is configured but value is empty inside verifyLineToken.");'
        throw new functions.https.HttpsError('internal', 'LINE Login Channel ID 未設定值。');
    }

    const params = new URLSearchParams();'
    params.append('id_token', idToken);'
    params.append('client_id', channelId); // 現在使用修改過的channelId

    try {'
        const response = await axios.post('https://api.line.me/oauth2/v2.1/verify', params, {'
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });

        if (response.data && response.data.aud !== channelId) {"
            logger.error("Token verification failed: Audience mismatch.", {
                expectedAud: channelId,
                actualAud: response.data.aud,
                lineUserId: response.data.sub
            });
            throw new Error(`Token audience (aud: ${response.data.aud}) does not match configured Channel ID (${channelId}).`);
        }

        return response.data;

    } catch (error) {
        let errorDetails = {
            message: error.message,
            requestConfig: {
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers,
            }
        };"
        let logMessage = "Error during LINE verify API call";
        let lineErrorMsg = error.message;'
        let statusCode = 'UNKNOWN';

        if (axios.isAxiosError(error)) {"
            logMessage = "Axios error during LINE verify API call";'
            statusCode = error.response?.status || 'Network/Timeout';
            errorDetails.axiosError = {
                status: statusCode,
                statusText: error.response?.statusText,
                responseData: error.response?.data // ** 非常重要 **
            };
            lineErrorMsg = error.response?.data?.error_description || error.response?.data?.message || error.message;
        }

        logger.error(logMessage, errorDetails);
        throw new Error(`與 LINE 驗證伺服器通信失敗或 Token 無效 (Status: ${statusCode} - ${lineErrorMsg})`);
    }
}

// 【保留 findOrCreateUser 函數】
async function findOrCreateUser(lineUserId, lineDisplayName, linePictureUrl) {
    logger.info(`findOrCreateUser started for LINE User ID: ${lineUserId}`);
    let authUid = null;
    let employeeData = null;
    let employeeDocId = null;
    let isNewUser = false;'
    const employeesRef = db.collection('employees');

    // 1. 嘗試用 lineUserId 尋找 Firestore 中的員工記錄'
    const querySnapshot = await employeesRef.where('lineUserId', '==', lineUserId).limit(1).get();

    if (!querySnapshot.empty) {
        // --- 找到現有員工記錄 ---
        const doc = querySnapshot.docs[0];
        employeeDocId = doc.id;
        employeeData = doc.data();
        authUid = employeeData.authUid; // 取得記錄中的 Firebase Auth UID

        // 確保 employeeData 有基本欄位 (相容舊資料)
        if (!employeeData.name) employeeData.name = lineDisplayName;
        if (employeeData.level === undefined) employeeData.level = 0;
        if (employeeData.isActive === undefined) employeeData.isActive = true; // 假設找到就預設是 active

        if (authUid) {
            // --- 有 Auth UID，檢查 Auth 帳號是否存在且同步資訊 ---
            try {
                const userRecord = await auth.getUser(authUid);
                let updatePayload = {};
                if (lineDisplayName && userRecord.displayName !== lineDisplayName) {
                    updatePayload.displayName = lineDisplayName;
                }
                if (linePictureUrl && userRecord.photoURL !== linePictureUrl) {
                    updatePayload.photoURL = linePictureUrl;
                }
                if (Object.keys(updatePayload).length > 0) {
                    await auth.updateUser(authUid, updatePayload);
                }
                // 同步 Firestore (如果 Firestore 的資料比較舊)
                let firestoreUpdatePayload = {};
                if(employeeData.name !== lineDisplayName) firestoreUpdatePayload.name = lineDisplayName;
                if(employeeData.pictureUrl !== linePictureUrl) firestoreUpdatePayload.pictureUrl = linePictureUrl || null;
                if(Object.keys(firestoreUpdatePayload).length > 0) {
                    await employeesRef.doc(employeeDocId).update(firestoreUpdatePayload);
                    employeeData = { ...employeeData, ...firestoreUpdatePayload };
                }

            } catch (error) {'
                if (error.code === 'auth/user-not-found') {
                    logger.warn(`Auth user ${authUid} linked to ${employeeDocId} not found. Attempting to recreate/relink...`);
                    try {
                        await auth.createUser({
                            uid: authUid,
                            displayName: lineDisplayName,
                            photoURL: linePictureUrl
                        });
                    } catch (recreateError) {
                        logger.warn(`Recreating Auth user with old UID ${authUid} failed. Creating NEW Auth user...`, recreateError);
                        try {
                            const newUserRecord = await auth.createUser({
                                displayName: lineDisplayName,
                                photoURL: linePictureUrl
                            });
                            const newAuthUid = newUserRecord.uid;
                            await employeesRef.doc(employeeDocId).update({ authUid: newAuthUid });
                            authUid = newAuthUid;
                            employeeData.authUid = newAuthUid;
                        } catch (finalCreateError) {
                            logger.error(`Failed to create new Auth user after previous one was missing for ${employeeDocId}:`, finalCreateError);'
                            throw new functions.https.HttpsError('internal', '處理用戶認證關聯時發生錯誤。');
                        }
                    }
                } else {
                    logger.error(`Error fetching auth user ${authUid} for employee ${employeeDocId}:`, error);
                    throw error;
                }
            }
        } else {
            logger.warn(`Firestore record ${employeeDocId} exists but is missing authUid. Creating and linking Auth user...`);
            try {
                const newUserRecord = await auth.createUser({
                    displayName: lineDisplayName,
                    photoURL: linePictureUrl
                });
                authUid = newUserRecord.uid;
                await employeesRef.doc(employeeDocId).update({ authUid: authUid });
                employeeData.authUid = authUid;
            } catch (linkError) {
                logger.error(`Error creating/linking Auth user for existing record ${employeeDocId}:`, linkError);'
                throw new functions.https.HttpsError('internal', '關聯新認證到現有記錄時出錯。');
            }
        }

    } else {
        // --- 全新使用者，Firestore 和 Auth 都沒有 ---
        isNewUser = true;
        logger.info(`New user detected with LINE User ID: ${lineUserId}. Creating Firestore record and Auth user.`);
        try {
            // 1. 創建 Firebase Auth 帳號
            const newUserRecord = await auth.createUser({
                displayName: lineDisplayName,
                photoURL: linePictureUrl
            });
            authUid = newUserRecord.uid;

            // 2. 準備 Firestore 員工資料
            employeeData = {
                authUid: authUid,
                lineUserId: lineUserId,
                name: lineDisplayName,
                pictureUrl: linePictureUrl || null,
                level: 0,
                registrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                isActive: true,
                store: null,
                phone: null,
            };

            // 3. 創建 Firestore 員工記錄
            const docRef = await employeesRef.add(employeeData);
            employeeDocId = docRef.id;

        } catch (error) {"
            logger.error("New user creation failed (Auth or Firestore):", error);
            if (authUid && !employeeDocId) {
                logger.warn(`Deleting orphaned Auth user ${authUid} because Firestore record creation failed.`);
                await auth.deleteUser(authUid).catch(delErr => logger.error(`Failed to delete orphaned Auth user ${authUid}:`, delErr));
            }'
            throw new functions.https.HttpsError('internal', '創建新用戶記錄時失敗。');
        }
    }

    if (!authUid || !employeeData || !employeeDocId) {"
        logger.error("User data incomplete after findOrCreate process. This should not happen.", { authUid, employeeDocId, hasData: !!employeeData });'
        throw new functions.https.HttpsError('internal', '無法完整獲取或建立用戶資訊。');
    }

    // --- ADDED: Set Custom Claim for level --- 
    const userLevel = employeeData.level ?? 0; // Get level from employeeData, default to 0 if missing
    try {
        await admin.auth().setCustomUserClaims(authUid, { level: userLevel });
        logger.info(`Successfully set custom claim level=${userLevel} for user ${authUid}`);
    } catch (claimError) {
        logger.error(`Failed to set custom claim level=${userLevel} for user ${authUid}:`, claimError);
        // Decide if this should be a critical error. For now, log and continue.
        // Depending on the application, maybe throw an error here.
    }
    // --- END: Set Custom Claim --- 

    employeeData.id = employeeDocId; // Add docId to returned data
    return { authUid, employeeData, employeeDocId, isNewUser };
}

// --- 輔助函數 mapHttpsErrorCodeToHttpStatus 保持不變 ---
function mapHttpsErrorCodeToHttpStatus(code) {
    // ... (mapHttpsErrorCodeToHttpStatus 函數邏輯保持不變) ...
    switch (code) {'
        case 'unauthenticated': return 401;'
        case 'permission-denied': return 403;'
        case 'invalid-argument': return 400;'
        case 'not-found': return 404;'
        case 'already-exists': return 409;'
        case 'failed-precondition': return 400;'
        case 'aborted': return 409;'
        case 'out-of-range': return 400;'
        case 'unavailable': return 503;'
        case 'deadline-exceeded': return 504;'
        case 'internal':'
        case 'unknown':
        default: return 500;
    }
}

// ===========================================
// == 導出函數 ==
// ===========================================

/**
 * 記錄活動日誌到 Firestore
 * @param {object} logData - 日誌數據'
 * @param {string} logData.userId - 執行操作的用戶 Firebase Auth UID (或 'system' 代表系統操作)
 * @param {string} [logData.userName] - 執行操作的用戶名 (可選，用於顯示方便)'
 * @param {string} logData.feature - 功能模塊 (e.g., 'Auth', 'EmployeeAdmin', 'ClockIn', 'ScheduledTask')'
 * @param {string} logData.action - 執行的具體操作 (e.g., 'LoginSuccess', 'LoginFail', 'CreateEmployee', 'UpdateEmployee', 'DeleteEmployee', 'RunCheckMissedClockIn')
 * @param {string|object} [logData.details] - 操作詳情 (可以是簡單的訊息字串，或包含更複雜數據的對象，例如更改前後的值)
 * @param {boolean} [logData.success] - 操作是否成功 (可選)
 */
async function logActivity(logData) {
    try {
        const logEntry = {
            timestamp: admin.firestore.FieldValue.serverTimestamp(), // 自動記錄時間戳'
            userId: logData.userId || 'anonymous', // 記錄用戶 ID，若無則為 anonymous
            userName: logData.userName || null, // 記錄用戶名 (可選)'
            feature: logData.feature || 'Unknown', // 功能模塊'
            action: logData.action || 'UnknownAction', // 具體操作
            details: logData.details || null, // 操作詳情
            success: logData.success === undefined ? null : Boolean(logData.success) // 操作結果 (可選)
        };
'
        await db.collection('activity_logs').add(logEntry);"
        // logger.info("Activity logged successfully:", logEntry); // 可以取消註解以在日誌中查看
    } catch (error) {"
        logger.error("Failed to write activity log:", { error: error.message, logData });
        // 通常記錄失敗不應阻斷主流程
    }
}

/**
 * LIFF登入處理函數 (Cloud Function v2 onRequest)
 * 接受來自前端 fetch 的 POST 請求，包含 LINE ID Token。
 * 驗證 Token，查找或創建用戶，生成 Firebase 自定義 Token 返回給前端。
 */
exports.handleLiffLogin = onRequest(
    {
        // Optional: configure CORS, memory, timeout, secrets, etc.'
        // MODIFIED: Removed LINE_CHANNEL_ID_PARAM from secrets array as it's not a secret
        // secrets: [LINE_CHANNEL_ID_PARAM], // <--- REMOVED THIS LINE
        maxInstances: 10,
        // CORS is now handled manually using the cors middleware
    },
    (req, res) => {
        // --- 使用 CORS 中間件 --- 
        cors(req, res, async () => {"
            logger.info("handleLiffLogin (onRequest) function invoked.", { method: req.method });'
            let userIdForLog = 'anonymous'; // Default log user
            let userNameForLog = null;
            let logDetails = {};
            let loginSuccess = false;

            try {
                // 0. 檢查請求方法和 Body'
                if (req.method !== 'POST') {'
                    logDetails = { error: 'Method Not Allowed', method: req.method };'
                    throw new Error('Method Not Allowed'); // Trigger catch block for logging
                }
                if (!req.body || !req.body.idToken) {'
                    logDetails = { error: 'Missing idToken in request body', bodyKeys: Object.keys(req.body || {}) };'
                    throw new Error('Request body missing idToken'); // Trigger catch block for logging
                }
                const lineIdToken = req.body.idToken;"
                logger.info("Received idToken in request body.");

                // 1. 驗證 LINE ID Token"
                logger.info("Calling verifyLineToken with received token...");
                const lineProfile = await verifyLineToken(lineIdToken);"
                logger.info("LINE Token verified successfully.", { lineUserId: lineProfile.sub });
                userNameForLog = lineProfile.name; // Get name from LINE profile early
                logDetails.lineUserId = lineProfile.sub;

                const { sub: lineUserId, name: lineDisplayName, picture: linePictureUrl } = lineProfile;

                // 2. 查找或創建用戶 (Firestore & Auth)"
                logger.info("Calling findOrCreateUser...");
                const { authUid, employeeData, employeeDocId, isNewUser } = await findOrCreateUser(lineUserId, lineDisplayName, linePictureUrl);
                userIdForLog = authUid; // Now we have the Firebase Auth UID
                userNameForLog = employeeData.name || lineDisplayName; // Use name from employee data if available
                logDetails.authUid = authUid;
                logDetails.employeeDocId = employeeDocId;
                logDetails.isNewUser = isNewUser;"
                logger.info("findOrCreateUser completed.", { authUid, employeeDocId, isNewUser });

                // 3. 檢查用戶狀態
                if (!employeeData.isActive) {
                    logger.warn(`Login attempt by inactive user: ${authUid} (Employee: ${employeeDocId})`);'
                    logDetails.error = 'Inactive user login attempt';'
                    throw new Error('Inactive user'); // Trigger catch block for logging
                }

                // 4. 生成 Firebase 自定義 Token
                logger.info(`Creating Firebase custom token for UID: ${authUid}`);
                const firebaseToken = await auth.createCustomToken(authUid);"
                logger.info("Firebase custom token created successfully.");
                loginSuccess = true; // Mark login as successful before sending response

                // 5. 準備回傳資料 (確保包含 level 和 store)
                const roles = {
                    level: employeeData.level ?? 0, // Default to 0 if missing
                    store: employeeData.store || null
                };

                // Optionally trigger a welcome notification for new users
                if (isNewUser) {
                    logger.info(`Sending welcome notification for new user ${authUid}`);'
                    sendNotification('newUserWelcome','
                        { userName: lineDisplayName || '新用戶' },
                        { userId: authUid } // Send personal welcome"
                    ).catch(e => logger.error("Failed to send welcome notification:", e));
                    logDetails.sentWelcomeNotification = true;
                }

                // 6. 成功回應 (Log before sending)"
                logger.info("Sending successful login response back to client.");
                // Log successful login attempt
                await logActivity({
                    userId: userIdForLog,
                    userName: userNameForLog,'
                    feature: 'Auth','
                    action: 'LoginSuccess',
                    details: logDetails,
                    success: true
                });
                return res.status(200).send({
                    success: true,
                    firebaseToken: firebaseToken,
                    userInfo: {
                        authUid: authUid,
                        employeeDocId: employeeDocId,
                        name: employeeData.name || lineDisplayName,
                        pictureUrl: employeeData.pictureUrl || linePictureUrl || null,
                        roles: roles, // Pass roles object
                        isNewUser: isNewUser,
                        phone: employeeData.phone || null // Include phone if available
                    }
                });

            } catch (error) {"
                logger.error("Error processing handleLiffLogin request: ", {
                    errorMessage: error.message,
                    // stack: error.stack,
                });

                // Log failed login attempt
                // Add error message to details
                logDetails.error = error.message;
                await logActivity({', userId: userIdForLog, // Might still be 'anonymous' if error happened early
                    userName: userNameForLog,'
                    feature: 'Auth','
                    action: 'LoginFail',
                    details: logDetails,
                    success: false
                });

                // 根據錯誤類型返回不同的 HTTP 狀態碼
                let statusCode = 500;'
                let errorCode = 'internal';
                let errorMessage = `登入處理時發生未預期的錯誤: ${error.message}`;
'
                if (error.message === 'Method Not Allowed') {'
                    statusCode = 405; errorCode = 'method-not-allowed'; errorMessage = 'Method Not Allowed';'
                } else if (error.message === 'Request body missing idToken') {'
                    statusCode = 400; errorCode = 'invalid-argument'; errorMessage = '請求中缺少 LINE ID Token';'
                } else if (error.message === 'Inactive user') {'
                    statusCode = 403; errorCode = 'permission-denied'; errorMessage = '您的帳號已被停用，請聯繫管理員。';'
                } else if (error.message.includes('LINE Token 驗證失敗') || error.message.includes('與 LINE 驗證伺服器通信失敗') || error.message.includes('Token audience')) {'
                    statusCode = 401; errorCode = 'unauthenticated'; errorMessage = `LINE Token 驗證失敗或無效: ${error.message}`;'
                } else if (error.message.includes('用戶資料處理錯誤') || error.message.includes('創建新用戶記錄時失敗') || error.message.includes('關聯新認證到現有記錄時出錯') || error.message.includes('無法完整獲取或建立用戶資訊')) {'
                    statusCode = 500; errorCode = 'internal'; errorMessage = `伺服器處理用戶資料時發生錯誤: ${error.message}`;
                } else if (error instanceof HttpsError) {
                    statusCode = mapHttpsErrorCodeToHttpStatus(error.code); errorCode = error.code; errorMessage = error.message;
                }

                return res.status(statusCode).send({
                    success: false,
                    error: { code: errorCode, message: errorMessage }
                });
            }
        }); // <-- End of CORS middleware wrapper
    }
);

/**
 * 新增假單時觸發通知
 */'
exports.sendLeaveNotification = onDocumentCreated('leave_requests/{docId}', async (event) => {
    const leaveRequest = event.data.data();
    const docId = event.params.docId;
    if (!leaveRequest || !leaveRequest.userId) {"
         logger.warn("Leave request created without data or userId", { docId });
         return;
    };
try {'
        const userDoc = await db.collection('users').doc(leaveRequest.userId).get();
        if (!userDoc.exists) {
            logger.warn(`User not found for leave request: ${leaveRequest.userId} (Doc: ${docId})`);
            return;
        }

        const userData = userDoc.data();
        const notificationData = {'
            title: '新排假申請','
            userName: userData.name || '員工',
            userId: leaveRequest.userId,'
            startDate: formatTimestamp(leaveRequest.startDate, 'YYYY-MM-DD'),'
            endDate: formatTimestamp(leaveRequest.endDate, 'YYYY-MM-DD'),'
            reason: leaveRequest.reason || '未說明',
            leaveDocId: docId,'
            message: `${userData.name || '員工'} 申請了從 ${formatTimestamp(leaveRequest.startDate, 'YYYY-MM-DD')} 到 ${formatTimestamp(leaveRequest.endDate, 'YYYY-MM-DD')} 的假期。\n原因: ${leaveRequest.reason || '未說明'}`
        };

        // Send to global admin target'
        await sendNotification('leave', notificationData, { isAdminTarget: true });
        logger.info(`Leave notification sent for doc ${docId}`);

    } catch (error) {
        logger.error(`Error in sendLeaveNotification for doc ${docId}: ${error.message}`, { error });
    }
});

/**
 * 新人註冊完成後觸發通知 (當 level > 0 時)
 */'
exports.sendRegistrationCompleteNotification = onDocumentUpdated('users/{userId}', async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const userId = event.params.userId;

    // 檢查是否是從 level 0 變為 > 0
    if (beforeData && beforeData.level === 0 && afterData && afterData.level > 0) {
        logger.info(`User ${userId} registration approved (Level ${beforeData.level} -> ${afterData.level}). Sending notification.`);

        const notificationData = {'
             title: '新人註冊完成','
             userName: afterData.name || '新員工',
             userId: userId,'
             store: afterData.store || '未分配',
             approvedLevel: afterData.level,'
             message: `新員工 ${afterData.name || '未知'} (${afterData.store || '未分配門店'}) 的註冊已審核通過，等級設為 ${afterData.level}。`
        };

        try {
            // 發送全局通知給管理員'
            await sendNotification('registerComplete', notificationData, { isAdminTarget: true });

            // 同時也發送個人通知給該員工'
            await sendNotification('registrationApproved', {'
                 title: '註冊審核通過','
                 name: afterData.name || '員工',
                 message: `恭喜！您的帳號註冊已審核通過。您現在可以使用系統的完整功能了。`
            }, { userId: userId });

        } catch (error) {
             logger.error(`Error sending registration complete notification for user ${userId}: ${error.message}`, { error });
        }
    }
});

/**
 * 排班變更時觸發通知'
 * 監聽 'schedule_changes' 集合的新文件
 */'
exports.sendScheduleChangeNotification = onDocumentCreated('schedule_changes/{docId}', async (event) => {
    const change = event.data.data();
    const docId = event.params.docId;
    if (!change || !change.userId || !change.date) {"
         logger.warn("Schedule change created without required data", { docId });
         return;
    };
try {'
        const userDoc = await db.collection('users').doc(change.userId).get();
        if (!userDoc.exists) {
            logger.warn(`User not found for schedule change: ${change.userId} (Doc: ${docId})`);
            return;
        }

        const userData = userDoc.data();
        const notificationData = {'
            title: '排班變更通知','
            userName: userData.name || '員工',
            userId: change.userId,
            date: change.date, // Assuming date is stored as YYYY-MM-DD string'
            oldShift: change.oldShift || '未排班','
            newShift: change.newShift || '取消排班','
            store: userData.store || 'N/A','
            changer: change.changerName || '系統', // Who made the change'
            note: change.note || '','
            message: `【排班變更】\n員工: ${userData.name || '未知'} (${userData.store || 'N/A'})\n日期: ${change.date}\n原班別: ${change.oldShift || '未排班'}\n新班別: ${change.newShift || '取消排班'}\n操作者: ${change.changerName || '系統'}\n${change.note ? '備註: ' + change.note : ''}`
        };

        // 發送個人通知給相關員工'
        await sendNotification('scheduleChangePersonal', notificationData, { userId: change.userId });

        // 根據設定決定是否發送全局通知 (可能不需要，或者發給店長？)'
        // Example: sendNotification('scheduleChangeGlobal', notificationData, { skipPersonal: true });

        logger.info(`Schedule change notification sent for user ${change.userId} (Doc: ${docId})`);

    } catch (error) {
        logger.error(`Error in sendScheduleChangeNotification for doc ${docId}: ${error.message}`, { error });
    }
});

/**
 * 收到新訂單時觸發通知
 */'
exports.sendOrderNotification = onDocumentCreated('orders/{docId}', async (event) => {
    const order = event.data.data();
    const docId = event.params.docId;
    if (!order || !order.userId || !order.store) {"
         logger.warn("Order created without required data", { docId });
         return;
    };
try {'
        const userDoc = await db.collection('users').doc(order.userId).get();
        if (!userDoc.exists) {
            logger.warn(`User not found for order: ${order.userId} (Doc: ${docId})`);
            return;
        }
        const userData = userDoc.data();
'
        const orderItemsSummary = order.items?.map(item => `${item.name} x${item.quantity}`).join(', ') || '無品項';'
        const totalAmount = order.totalAmount ? `總計: ${order.totalAmount}` : '';

        const notificationData = {
             title: `新叫貨單 (${order.store})`,
             store: order.store,
             orderUser: userData.name || order.userId,
             orderTime: formatTimestamp(order.timestamp),
             itemsSummary: orderItemsSummary,
             totalAmount: totalAmount,
             orderDocId: docId,'
             message: `【新叫貨單】\n門店: ${order.store}\n填寫人: ${userData.name || order.userId}\n時間: ${formatTimestamp(order.timestamp)}\n品項: ${orderItemsSummary}\n${totalAmount}\n${order.notes ? '備註: ' + order.notes : ''}`
        };

        // 發送全局通知 (可能給供應商或管理員)'
        await sendNotification('newOrder', notificationData, { isAdminTarget: true }); // Example: send to admin target

        logger.info(`New order notification sent for doc ${docId}`);

    } catch (error) {
        logger.error(`Error in sendOrderNotification for doc ${docId}: ${error.message}`, { error });
    }
});
// TODO: Implement updateProductSoldCount function
// This function should trigger on order creation (or completion)
// and update the sold count for each product item in the order.'
// Example trigger: onDocumentCreated('orders/{docId}') or onDocumentUpdated if checking status.'
// It needs to read order items and update corresponding documents in the 'products' collection.
/**
 * 定期檢查未打卡員工並發送提醒
 * Runs every weekday (Monday to Friday) at 9:00 AM Asia/Taipei.
 */
exports.checkMissedClockIn = onSchedule({'
    schedule: '0 9 * * 1-5', // 週一至週五上午9點'
    timeZone: 'Asia/Taipei',
    // secrets: [LINE_OA_TOKEN_PARAM, TELEGRAM_BOT_TOKEN_PARAM] // Secrets needed by sendNotification
}, async (event) => {"
    logger.info("Running scheduled job: checkMissedClockIn");
    const systemLogDetails = { executionTime: event.timestamp };
    let successCount = 0;
    let failureCount = 0;

    try {'
        // 1. 獲取今天的班表 (假設班表存儲在 'schedules' 集合，文檔ID為 'YYYY-MM-DD')'
        const scheduleDoc = await db.collection('schedules').doc(new Date().toISOString().split('T')[0]).get();
        if (!scheduleDoc.exists) {'
            logger.info(`No schedule found for today (${new Date().toISOString().split('T')[0]}). Skipping clock-in check.`);
            return;
        }
        const scheduleData = scheduleDoc.data();
        const scheduledEmployees = scheduleData.shifts || {}; // Assuming shifts is an object { userId: shiftInfo, ... }

        // 2. 獲取今天已打卡的員工'
        const clockInSnapshot = await db.collection('clockin_records')'
            .where('date', '==', new Date().toISOString().split('T')[0])
            .get();
        const clockedInUserIds = new Set(clockInSnapshot.docs.map(doc => doc.data().userId));

        // 3. 找出今天有班但未打卡的員工
        const missedClockInUserIds = [];
        for (const userId in scheduledEmployees) {
            // 檢查是否有班 (shiftInfo 不為 null 或空) 且 未打卡
            if (scheduledEmployees[userId] && !clockedInUserIds.has(userId)) {
                missedClockInUserIds.push(userId);
            }
        }

        if (missedClockInUserIds.length === 0) {"
            logger.info("All scheduled employees have clocked in today.");
            return;
        }

        logger.info(`Found ${missedClockInUserIds.length} employees who missed clock-in today:`, missedClockInUserIds);

        // 4. 發送提醒通知
        for (const userId of missedClockInUserIds) {
            try {'
                const userDoc = await db.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const notificationData = {'
                        title: '打卡提醒','
                        name: userData.name || '員工','
                        date: new Date().toISOString().split('T')[0],'
                        message: `提醒您，今天是 ${new Date().toISOString().split('T')[0]}，您尚未完成打卡。請盡快打卡！`
                    };
                    // 發送個人通知'
                    await sendNotification('clockinReminder', notificationData, { userId: userId });
                } else {
                    logger.warn(`User ${userId} found in schedule but user document does not exist.`);
                }
            } catch (userError) {
                logger.error(`Error processing or notifying user ${userId} for missed clock-in: ${userError.message}`);
            }
        }
"
        logger.info("Finished sending clock-in reminders.");
        successCount = 1; // Replace with actual count if iterating"
        systemLogDetails.result = "Check completed (example: found X missed clock-ins)";'
        await logActivity({ userId: 'system', feature: 'ScheduledTask', action: 'RunCheckMissedClockIn', details: systemLogDetails, success: true });"
        logger.info("checkMissedClockIn finished successfully.");

    } catch (error) {"
        logger.error("Error during checkMissedClockIn execution:", error);
        failureCount = 1;
        systemLogDetails.error = error.message;'
        await logActivity({ userId: 'system', feature: 'ScheduledTask', action: 'RunCheckMissedClockIn', details: systemLogDetails, success: false });
    }
});

// TODO: Add other scheduled tasks like generating salary reports, etc.
// TODO: Add Backup Scheduled Task (`scheduledFirestoreBackup` from previous response)

// --- Other potential triggers or functions ---

// Example: Function to handle leave request approval/rejection and notify user'
exports.handleLeaveStatusChange = onDocumentUpdated('leave_requests/{docId}', async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const docId = event.params.docId;
    const userId = afterData.userId;

    // Check if status changed and the user ID exists
    if (!userId || beforeData.status === afterData.status || !afterData.status) {
        return; // No status change or missing data
    }

    logger.info(`Leave request ${docId} status changed from ${beforeData.status} to ${afterData.status} for user ${userId}`);

    try {'
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
             logger.warn(`User ${userId} not found for leave status notification.`);
             return;
        }
        const userData = userDoc.data();
'
        let notificationType = '';
        let notificationData = {'
             title: '請假申請狀態更新','
             name: userData.name || '員工','
             startDate: formatTimestamp(afterData.startDate, 'YYYY-MM-DD'),'
             endDate: formatTimestamp(afterData.endDate, 'YYYY-MM-DD'),'
             status: afterData.status === 'approved' ? '已批准' : (afterData.status === 'rejected' ? '已拒絕' : afterData.status),'
             reason: afterData.rejectionReason || '', // Include rejection reason if available'
             message: `您的請假申請 (從 ${formatTimestamp(afterData.startDate, 'YYYY-MM-DD')} 到 ${formatTimestamp(afterData.endDate, 'YYYY-MM-DD')}) `
        };
'
        if (afterData.status === 'approved') {'
            notificationType = 'leaveApproved';
            notificationData.message += `已被批准。`;'
        } else if (afterData.status === 'rejected') {'
            notificationType = 'leaveRejected';
            notificationData.message += `已被拒絕。`;
            if(afterData.rejectionReason) {
                 notificationData.message += `\n拒絕原因: ${afterData.rejectionReason}`;
            }
        } else {
            // Handle other statuses if needed
            return;
        }

        // Send personal notification to the employee
        await sendNotification(notificationType, notificationData, { userId: userId });

    } catch (error) {
        logger.error(`Error sending leave status change notification for doc ${docId}: ${error.message}`, { error });
    }
});

// Cloud Function: Get current scheduling system status
// MODIFIED: Use v2 syntax'
exports.getScheduleSystemStatus = onCall({ region: 'asia-east1' }, async (request) => { 
    if (!request.auth) { // Use request.auth
        // ... (unauthenticated error) ...'
        throw new HttpsError('unauthenticated', '需要用戶認證才能獲取排班狀態。'); // Use imported HttpsError
    }
    const uid = request.auth.uid; // Use request.auth.uid
    
    // --- Use correct collection paths ---'
    const configRef = db.collection('settings').doc('schedule_config');'
    const userRef = db.collection('users').doc(uid);
    // --- End correct collection paths ---

    try {
        // Read config and user data
        let [configDoc, userDoc] = await Promise.all([
            configRef.get(),
            userRef.get()
        ]);

        if (!configDoc.exists) {
            // Log error?'
            throw new HttpsError('not-found', 'Schedule configuration not found.'); // Use imported HttpsError
        }
        if (!userDoc.exists) {
            // Log error?'
            throw new HttpsError('not-found', 'User data not found.'); // Use imported HttpsError
        }

        let configData = configDoc.data();
        const userData = userDoc.data();
        const now = new Date();
        const nowTimestamp = admin.firestore.Timestamp.now();

        // Initialize variables based on configData'
        let currentStatus = configData.systemStatus || 'DISABLED';
        let isLocked = configData.isLocked || false;
        let lockedBy = configData.lockedBy || null;
        let lockExpiresAt = configData.lockExpiresAt || null;
        let remainingSeconds = null;

        // --- ADDED: Check for Force Open Expiration ---
        if (configData.forceOpenUntil && configData.forceOpenUntil instanceof admin.firestore.Timestamp) {
            if (nowTimestamp.toMillis() > configData.forceOpenUntil.toMillis()) {
                // MODIFIED: console.log -> logger.info
                logger.info(`Force open period expired at ${configData.forceOpenUntil.toDate().toISOString()}. Reverting status.`);
                try {
                    await configRef.update({'
                        systemStatus: 'CLOSED',
                        forceOpenUntil: admin.firestore.FieldValue.delete(),
                        lastForcedOpenBy: admin.firestore.FieldValue.delete(),
                        lastForcedOpenAt: admin.firestore.FieldValue.delete()
                    });
                    // MODIFIED: console.log -> logger.info"
                    logger.info("System status reverted to CLOSED after force open expiration.");
                    configDoc = await configRef.get(); // Re-fetch needed
                    configData = configDoc.data();'
                    currentStatus = configData.systemStatus || 'CLOSED';
                } catch (revertError) {
                    // MODIFIED: console.error -> logger.error"
                    logger.error("Error reverting status after force open expiration:", revertError);'
                    currentStatus = 'CLOSED';
                }
            } else {
                 // MODIFIED: console.log -> logger.info
                logger.info(`System is force-opened until ${configData.forceOpenUntil.toDate().toISOString()}.`);'
                currentStatus = 'IDLE'; // Override status
            }
        }
        // --- End Force Open Check ---

        // --- Normal Status Check (Only if not forced open) ---'
        if (currentStatus !== 'IDLE' && currentStatus !== 'IN_USE' && !(configData.forceOpenUntil && nowTimestamp.toMillis() <= configData.forceOpenUntil.toMillis())) {'
             if (currentStatus === 'ENABLED' || currentStatus === 'CLOSED') { 
                 const openTimeStr = configData.openTime;
                 const closeTimeStr = configData.closeTime;
                 if (openTimeStr && closeTimeStr) {'
                     const [openH, openM] = openTimeStr.split(':').map(Number);'
                     const [closeH, closeM] = closeTimeStr.split(':').map(Number);
                     const openDate = new Date(now); openDate.setHours(openH, openM, 0, 0);
                     const closeDate = new Date(now); closeDate.setHours(closeH, closeM, 0, 0);
                     if (closeDate <= openDate) closeDate.setDate(closeDate.getDate() + 1);'
                     currentStatus = (now >= openDate && now < closeDate) ? 'IDLE' : 'CLOSED';
                 } else {'
                     currentStatus = 'CLOSED';
                 }
             }
        }
        // --- End Normal Status Check ---

        // --- Check Lock Status (using configRef) ---
        if (isLocked && lockExpiresAt && lockExpiresAt.toMillis() < nowTimestamp.toMillis()) {
            // MODIFIED: console.log -> logger.info"
            logger.info("Lock expired. Releasing automatically.");
            try {
                await configRef.update({
                    isLocked: false,
                    lockedBy: null,
                    lockExpiresAt: null
                });
                isLocked = false;
                lockedBy = null;
                lockExpiresAt = null;
                // MODIFIED: console.log -> logger.info"
                logger.info("Expired lock released.");'
                 if (currentStatus === 'IN_USE') {
                     // Re-evaluate status after lock release
                     if (configData.forceOpenUntil && nowTimestamp.toMillis() <= configData.forceOpenUntil.toMillis()) {'
                         currentStatus = 'IDLE';
                     } else {
                         // Re-run time check logic
                         const openTimeStr = configData.openTime; 
                         const closeTimeStr = configData.closeTime;
                         if (openTimeStr && closeTimeStr) {'
                            const [openH, openM] = openTimeStr.split(':').map(Number);'
                            const [closeH, closeM] = closeTimeStr.split(':').map(Number);
                            const openDate = new Date(now); openDate.setHours(openH, openM, 0, 0);
                            const closeDate = new Date(now); closeDate.setHours(closeH, closeM, 0, 0);
                            if (closeDate <= openDate) closeDate.setDate(closeDate.getDate() + 1);'
                            currentStatus = (now >= openDate && now < closeDate) ? 'IDLE' : 'CLOSED';
                         } else {'
                             currentStatus = 'CLOSED';
                         }
                     }
                     // MODIFIED: console.log -> logger.info"
                     logger.info("System status updated after lock expiry:", currentStatus);
                 }
            } catch (releaseError) {
                // MODIFIED: console.error -> logger.error"
                logger.error("Error releasing expired lock:", releaseError);
            }
        }

        // Update status to IN_USE if still locked 
        if (isLocked) {'
            currentStatus = 'IN_USE';
            if (lockExpiresAt) {
                 remainingSeconds = Math.max(0, Math.floor((lockExpiresAt.toMillis() - nowTimestamp.toMillis()) / 1000));
            }
        }
        // --- End Lock Status Check ---

        // Get Forbidden/Holiday Dates
        // Assuming helper functions exist later in the file
        const forbiddenDates = getForbiddenDates(configData, userData); 
        const holidayDates = getHolidayDates(configData);

        // Return final result
        return {
            systemStatus: currentStatus,
            isLocked: isLocked,
            lockedBy: isLocked ? { id: lockedBy.id, name: lockedBy.name } : null,
            lockExpiresAt: lockExpiresAt ? lockExpiresAt.toDate().toISOString() : null,
            remainingSeconds: remainingSeconds,
            forbiddenDates: forbiddenDates, 
            holidayDates: holidayDates 
        };

    } catch (error) {
        // MODIFIED: console.error -> logger.error"
        logger.error("Error in getScheduleSystemStatus:", error);
        // Log error?
        if (error instanceof HttpsError) { // Check imported HttpsError
            throw error; 
        }'
        throw new HttpsError('internal', 'Failed to get schedule system status.', error.message); // Use imported HttpsError
    }
});

/**
 * Cloud Function: 嘗試為當前用戶鎖定排班系統
 * ...
 */
// MODIFIED: Use v2 syntax'
exports.requestScheduleLock = onCall({ region: 'asia-east1' }, async (request) => {
    if (!request.auth) { // Use request.auth'
        await logActivity('System', 'requestScheduleLock', 'Unauthorized', 'Error', { message: 'User not authenticated.' });'
        throw new HttpsError('unauthenticated', '需要用戶認證才能請求鎖定排班系統。'); // Use imported HttpsError
    }
    const uid = request.auth.uid; // Use request.auth.uid
    const now = new Date(); // Current server time
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp(); // For setting timestamps
    // ... rest of the logic remains largely the same, use request.auth.uid ...
    // ... (inside the function logic where uid or employeeName is needed) ...
    // MODIFIED: Removed declaration of settingsRef, statusRef, employeeRef as they seem unused here (mistake?)
    // Re-adding declarations as they ARE used.'
    const configRef = db.collection('system_config').doc('schedule_config'); // Assuming system_config is correct'
    const userRef = db.collection('users').doc(uid); // Assuming users collection holds employee data


     try {
            // 1. 讀取設定與員工資料
            // MODIFIED: Fetch config and user data, not settings/status/employee
            const [configSnap, userSnap] = await Promise.all([
                configRef.get(),
                userRef.get() // Use userRef from declaration
            ]);

            if (!configSnap.exists) {'
                 await logActivity(uid, 'requestScheduleLock', 'System', 'Failure', { reason: 'Config not found' });'
                throw new HttpsError('failed-precondition', '找不到排班系統設定，無法請求鎖定。'); // Use imported HttpsError
            }
            if (!userSnap.exists) { // Check userSnap'
                 await logActivity(uid, 'requestScheduleLock', 'System', 'Failure', { reason: 'User not found' }); // Log User not found'
                throw new HttpsError('not-found', '找不到您的用戶資料，無法請求鎖定。'); // Use imported HttpsError, clarify user data
            }

            const config = configSnap.data();
            const userData = userSnap.data(); // Use userData
            const employeeName = userData.name || uid; // Use name from userData

            // 2. 檢查系統狀態 (從 config 讀取)'
             const systemStatus = config.systemStatus || 'DISABLED';
             const isLocked = config.isLocked || false;
             const lockedBy = config.lockedBy || null;
             const lockExpiresAt = config.lockExpiresAt || null; // Firestore Timestamp
             const forceOpenUntil = config.forceOpenUntil || null; // Firestore Timestamp
             const nowTimestamp = admin.firestore.Timestamp.now();

             let effectiveStatus = systemStatus;
             let isForceOpenActive = false;

             // Check Force Open
             if (forceOpenUntil && nowTimestamp.toMillis() <= forceOpenUntil.toMillis()) {'
                 effectiveStatus = 'IDLE'; // Force open overrides normal status
                 isForceOpenActive = true;
                 // MODIFIED: console.log -> logger.info"
                 logger.info("Request lock: System is force-opened.");
             } else if (forceOpenUntil) {
                 // Force open expired, should have been reverted by getStatus, but double-check
                 // MODIFIED: console.warn -> logger.warn"
                 logger.warn("Request lock: Found expired forceOpenUntil, system should be CLOSED/DISABLED.");
                 // Assume it should be CLOSED if not explicitly ENABLED'
                 effectiveStatus = (systemStatus === 'ENABLED') ? 'CLOSED' : systemStatus; // Revert logic might be complex
             }

             // Check normal window if not forced open'
             if (!isForceOpenActive && (effectiveStatus === 'ENABLED' || effectiveStatus === 'CLOSED')) {
                 const openTimeStr = config.openTime;
                 const closeTimeStr = config.closeTime;
                 if (openTimeStr && closeTimeStr) {'
                     const [openH, openM] = openTimeStr.split(':').map(Number);'
                     const [closeH, closeM] = closeTimeStr.split(':').map(Number);
                     const openDate = new Date(now); openDate.setHours(openH, openM, 0, 0);
                     const closeDate = new Date(now); closeDate.setHours(closeH, closeM, 0, 0);
                     if (closeDate <= openDate) closeDate.setDate(closeDate.getDate() + 1);'
                     effectiveStatus = (now >= openDate && now < closeDate) ? 'IDLE' : 'CLOSED';
                 } else {'
                     effectiveStatus = 'CLOSED'; // Default to closed if window times missing
                 }
             }

             // Check if lock expired
             if (isLocked && lockExpiresAt && lockExpiresAt.toMillis() < nowTimestamp.toMillis()) {
                 // MODIFIED: console.warn -> logger.warn
                 logger.warn(`Found expired lock during request by ${uid}. System should be IDLE/CLOSED now.`);
                 // Assume status is IDLE/CLOSED based on time window check above'
                 // The lock should be released automatically by getStatus, but we proceed assuming it's available
             } else if (isLocked) {
                 // Still locked by someone'
                 effectiveStatus = 'IN_USE';
             }


            // 3. 檢查最終狀態是否允許鎖定'
            if (effectiveStatus !== 'IDLE') {'
                let reason = 'closed';'
                let message = '目前非排班系統開放時間或系統不可用。';'
                if (effectiveStatus === 'IN_USE' && lockedBy?.id !== uid) {'
                    reason = 'locked';'
                    message = `系統目前正由 ${lockedBy?.name || '其他使用者'} 使用中，請稍後再試。`;'
                     await logActivity(employeeName, 'requestScheduleLock', 'System', 'Failure', { reason: 'Already locked', lockedBy: lockedBy?.name || lockedBy?.id });'
                } else if (effectiveStatus === 'DISABLED') {'
                     reason = 'disabled';'
                     message = '排班系統目前已禁用。';'
                     await logActivity(employeeName, 'requestScheduleLock', 'System', 'Failure', { reason: 'System disabled' });'
                } else if (effectiveStatus === 'CLOSED') {'
                     await logActivity(employeeName, 'requestScheduleLock', 'System', 'Failure', { reason: 'Outside window' });
                }
                return { success: false, reason: reason, message: message };
            }


            // 4. 嘗試使用事務鎖定 (更新 config 文件)
            let lockAcquired = false;
            let finalLockExpiresAt = null;

            await db.runTransaction(async (transaction) => { // Use db.runTransaction
                const freshConfigSnap = await transaction.get(configRef);
                if (!freshConfigSnap.exists) {'
                     throw new HttpsError('failed-precondition', '讀取設定失敗 (事務中)'); // Use imported HttpsError
                }
                const freshConfigData = freshConfigSnap.data();
                const freshIsLocked = freshConfigData.isLocked || false;
                const freshLockExpiresAt = freshConfigData.lockExpiresAt || null;

                // Re-check lock status within transaction
                if (freshIsLocked && freshLockExpiresAt && freshLockExpiresAt.toMillis() >= nowTimestamp.toMillis()) {
                    // Locked by someone else within transaction
                    lockAcquired = false;
                } else {
                    // Available to lock
                    const sessionDurationMillis = (config.lockDurationSeconds || 300) * 1000; // Use config.lockDurationSeconds
                    const newExpiresAtDate = new Date(now.getTime() + sessionDurationMillis);
                    finalLockExpiresAt = newExpiresAtDate; // Store for return value

                    const lockPayload = {
                        isLocked: true,
                        lockedBy: { id: uid, name: employeeName }, // Store ID and name
                        lockAcquiredAt: serverTimestamp, // Use server timestamp
                        lockExpiresAt: admin.firestore.Timestamp.fromDate(newExpiresAtDate) // Convert JS Date to Firestore Timestamp
                    };
                    transaction.update(configRef, lockPayload);
                    lockAcquired = true;
                }
            });

            // 5. 根據事務結果返回
            if (lockAcquired && finalLockExpiresAt) {'
                 await logActivity(employeeName, 'requestScheduleLock', 'System', 'Success', { expiresAt: finalLockExpiresAt.toISOString() });
                return {
                    success: true,
                    lockExpiresAt: finalLockExpiresAt.toISOString() // 返回 ISO 格式時間戳給前端
                };
            } else {
                // 鎖定失敗 (已被他人鎖定 - 在事務中被搶先)'
                 const lockedByOtherName = (await configRef.get()).data()?.lockedBy?.name || '其他使用者'; // Read again to get current holder name'
                 await logActivity(employeeName, 'requestScheduleLock', 'System', 'Failure', { reason: 'Locked during transaction', lockedBy: lockedByOtherName });
                return {
                    success: false,'
                    reason: 'locked',
                    message: `系統正由 ${lockedByOtherName} 使用中，請稍後再試。` // Update message
                };
            }

     } catch (error) {
         // MODIFIED: console.error -> logger.error
         logger.error(`Error in requestScheduleLock for user ${uid}:`, error);'
          await logActivity(uid, 'requestScheduleLock', 'System', 'Error', { message: error.message, code: error.code });
         if (error instanceof HttpsError) { // Check imported HttpsError
             throw error; // 重拋 HttpsError
         } else {
             // Handle potential transaction errors more gracefully if needed'
             throw new HttpsError('internal', '請求鎖定排班系統時發生內部錯誤。'); // Use imported HttpsError
         }
     }
});

/**
 * Cloud Function: 釋放當前用戶持有的排班系統鎖定
 * ...
 */
// MODIFIED: Use v2 syntax'
exports.releaseScheduleLock = onCall({ region: 'asia-east1' }, async (request) => {
    if (!request.auth) { // Use request.auth'
        await logActivity('System', 'releaseScheduleLock', 'Unauthorized', 'Error', { message: 'User not authenticated.' });'
        throw new HttpsError('unauthenticated', '需要用戶認證才能釋放排班鎖定。'); // Use imported HttpsError
    }
    const uid = request.auth.uid; // Use request.auth.uid
    // ... rest of the logic remains largely the same, use request.auth.uid ...'
    const userRef = db.collection('users').doc(uid); // Assuming users collection holds employee data'
    const configRef = db.collection('system_config').doc('schedule_config'); // Update config doc

    try {
            const userSnap = await userRef.get();
            const employeeName = userSnap.exists ? (userSnap.data().name || uid) : uid;

            // 使用事務確保讀取和寫入的原子性
            let released = false;'
            let message = '';
            let currentHolder = null; // For logging if release failed due to wrong holder

            await db.runTransaction(async (transaction) => { // Use db.runTransaction
                const configSnap = await transaction.get(configRef); // Read config doc

                if (!configSnap.exists) {
                    // 狀態文件不存在，無需釋放，記錄警告
                    // MODIFIED: console.warn -> logger.warn'
                    logger.warn(`releaseScheduleLock called by ${uid}, but config document doesn't exist.`);'
                    message = '系統設定異常，無需釋放。';
                    released = false; // Consider this not a successful release in the normal sense
                    return; // Exit transaction
                }

                const currentConfigData = configSnap.data();
                currentHolder = currentConfigData.lockedBy?.name; // Store for potential logging

                if (!currentConfigData.isLocked) { // Check isLocked flag
                    // 系統不是 IN_USE 狀態，無需釋放'
                    message = '系統目前並非鎖定狀態。';
                    released = false;
                } else if (currentConfigData.lockedBy?.id !== uid) { // Check lockedBy.id
                    // 鎖不是由當前用戶持有'
                    message = '您並未持有排班系統鎖定，無法釋放。';
                    released = false;
                    // Log will happen outside transaction based on flag
                } else {
                    // 確認是當前用戶持有鎖 -> 釋放
                    const releasePayload = {
                        isLocked: false,
                        lockedBy: null,
                        lockAcquiredAt: null,
                        lockExpiresAt: null,
                        // Optionally keep lastStatusChangeReason or update it
                        // lastStatusChangeReason: `Released by user ${uid}`
                    };
                    transaction.update(configRef, releasePayload);
                    released = true;'
                    message = '排班鎖定已成功釋放。';
                }
            });

            // 記錄日誌 (事務成功後)
            if (released) {'
                await logActivity(employeeName, 'releaseScheduleLock', 'System', 'Success', { message });
            } else {
                 // Log failure if it was due to not holding the lock'
                 if (message === '您並未持有排班系統鎖定，無法釋放。') {'
                     await logActivity(employeeName, 'releaseScheduleLock', 'System', 'Failure', { reason: 'Not lock holder', currentHolder: currentHolder || 'Unknown' });
                 } else if(message) { // Log other info messages'
                     await logActivity(employeeName, 'releaseScheduleLock', 'System', 'Info', { message });
                 }
            }

            return { success: released, message: message };

    } catch (error) {
        // Get name using request.auth.token if available in v2
        const actorName = request.auth?.token?.name || uid; // Use request.auth.token.name
        // MODIFIED: console.error -> logger.error
        logger.error(`Error in releaseScheduleLock for user ${uid}:`, error);'
        await logActivity(actorName, 'releaseScheduleLock', 'System', 'Error', { message: error.message, code: error.code });
        if (error instanceof HttpsError) { // Check imported HttpsError
            throw error; // 重拋 HttpsError
        } else {'
            throw new HttpsError('internal', '釋放排班鎖定時發生內部錯誤。'); // Use imported HttpsError
        }
    }
});

// --- ADD isAdmin HELPER AND forceOpenScheduling FUNCTION --- 

// --- Helper: Check Admin Role (Example) ---
// MODIFIED: Adapt isAdmin to work with v2 request object
async function isAdmin(request) { 
    if (!request.auth) {
        // Log for debugging server-side check failure'
        logger.error('isAdmin check failed: Unauthenticated.');'
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.'); // Use imported HttpsError
    }
    const uid = request.auth.uid;
    try {'
        const userDoc = await db.collection('users').doc(uid).get(); // db is assumed to be initialized globally
        if (!userDoc.exists || (userDoc.data().level ?? 0) < 9) { // Assuming level 9+ is admin, handle missing level'
             logger.warn(`isAdmin check failed for user ${uid}: Level is ${userDoc.data()?.level ?? 'missing/undefined'} (Exists: ${userDoc.exists})`);'
            throw new HttpsError('permission-denied', 'User does not have admin privileges.'); // Use imported HttpsError
        }
        logger.info(`isAdmin check passed for user ${uid} (Level: ${userDoc.data().level})`);
        return true; // Return true if admin
    } catch (error) {
         logger.error(`Error during isAdmin check for user ${uid}:`, error);
         // Re-throw permission denied if it was that, otherwise throw internal error'
         if (error instanceof HttpsError && error.code === 'permission-denied') {
             throw error;
         }'
         throw new HttpsError('internal', 'Error checking admin privileges.', error.message); // Use imported HttpsError
    }
}


// --- NEW: Cloud Function to Force Open Scheduling (v2 syntax) ---
// MODIFIED: Use v2 syntax'
exports.forceOpenScheduling = onCall({ region: 'asia-east1' }, async (request) => {
    await isAdmin(request); // Ensure caller is admin using the adapted helper
'
    const configRef = db.collection('system_config').doc('schedule_config'); // Use system_config collection
    const now = admin.firestore.Timestamp.now();
    const thirtyMinutesInMillis = 30 * 60 * 1000;
    const forceOpenUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + thirtyMinutesInMillis);

    try {
        await configRef.update({'
            systemStatus: 'IDLE', // Force to IDLE
            forceOpenUntil: forceOpenUntil,
            lastForcedOpenBy: request.auth.uid, // Use request.auth.uid
            lastForcedOpenAt: now         // Optional: Log when it was forced
        });
        // MODIFIED: console.log -> logger.info
        logger.info(`Scheduling system forced open until ${forceOpenUntil.toDate().toISOString()} by ${request.auth.uid}`);
        // Log activity (optional)'
        await logActivity(request.auth.uid, 'forceOpenScheduling', 'Admin Action', 'Success', { until: forceOpenUntil.toDate().toISOString() });
        return { success: true };
    } catch (error) {
        // MODIFIED: console.error -> logger.error"
        logger.error("Error forcing schedule open:", error);
        // Log activity (optional)'
        await logActivity(request.auth.uid, 'forceOpenScheduling', 'Admin Action', 'Error', { message: error.message });'
        throw new HttpsError('internal', 'Failed to update schedule config.', error.message); // Use imported HttpsError
    }
});

/**
 * Cloud Function: Review Leave Request
 * Handles approval or rejection of leave requests by administrators
 * Requires level 9+ permission (admin)
 * 
 * @param {Object} request.data
 * @param {string} request.data.requestId - ID of the leave request document
 * @param {boolean} request.data.approved - Whether the request is approved or rejected
 * @param {string} [request.data.reason] - Optional reason for rejection
 */'
exports.reviewLeaveRequest = onCall({ region: 'asia-east1' }, async (request) => {
    // 1. Authentication check
    if (!request.auth) {"
        logger.error("reviewLeaveRequest: Unauthenticated call.");'
        throw new HttpsError('unauthenticated', '需要驗證身份');
    }

    // 2. Permission check - require level 9+ (admin)
    const requiredLevel = 9;
    let adminName = null;
    
    try {'
        const adminDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!adminDoc.exists) {
            logger.error(`reviewLeaveRequest: Admin user ${request.auth.uid} not found in database.`);'
            throw new HttpsError('permission-denied', '找不到管理員資料');
        }
        
        const adminData = adminDoc.data();
        const userLevel = adminData.level ?? 0;
        adminName = adminData.name || request.auth.uid;
        
        if (userLevel < requiredLevel) {
            logger.error(`reviewLeaveRequest: Permission denied for UID ${request.auth.uid}. Required: ${requiredLevel}, User has: ${userLevel}.`);'
            throw new HttpsError('permission-denied', `權限不足 (需要等級 ${requiredLevel})`);
        }
        
        logger.info(`reviewLeaveRequest: Called by admin ${adminName} (${request.auth.uid}). Data:`, request.data);
    } catch (error) {
        if (error instanceof HttpsError) {
            throw error; // Re-throw HTTP errors
        }"
        logger.error("reviewLeaveRequest: Error checking admin permissions:", error);'
        throw new HttpsError('internal', '驗證管理員權限時發生錯誤');
    }

    // 3. Request validation
    const { requestId, approved, reason } = request.data;
    
    if (!requestId) {"
        logger.error("reviewLeaveRequest: Missing requestId parameter", request.data);'
        throw new HttpsError('invalid-argument', '請假單ID為必填項');
    }
    '
    if (typeof approved !== 'boolean') {"'
        logger.error("reviewLeaveRequest: Invalid 'approved' parameter, must be boolean", request.data);'
        throw new HttpsError('invalid-argument', '請假單審核狀態必須為布林值');
    }

    // 4. Process the leave request
    try {'
        const leaveRequestRef = db.collection('leave_requests').doc(requestId);
        const leaveRequestDoc = await leaveRequestRef.get();
        
        if (!leaveRequestDoc.exists) {
            logger.error(`reviewLeaveRequest: Leave request ${requestId} not found`);'
            throw new HttpsError('not-found', '找不到指定的請假單');
        }
        
        const leaveData = leaveRequestDoc.data();
        
        // Check if request is already processed'
        if (leaveData.status === 'approved' || leaveData.status === 'rejected') {
            logger.warn(`reviewLeaveRequest: Leave request ${requestId} already processed (${leaveData.status})`);'
            throw new HttpsError('failed-precondition', `此請假單已被${leaveData.status === 'approved' ? '批准' : '拒絕'}`);
        }
        
        // Update the leave request status
        const updateData = {'
            status: approved ? 'approved' : 'rejected',
            reviewedBy: request.auth.uid,
            reviewedByName: adminName,
            reviewTimestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Add rejection reason if provided and request is rejected
        if (!approved && reason) {
            updateData.rejectionReason = reason;
        }
        
        await leaveRequestRef.update(updateData);
        logger.info(`reviewLeaveRequest: Successfully reviewed request ${requestId}. Approved: ${approved}`);
        
        // 5. Send notification to the employee
        try {
            const userId = leaveData.userId;
            if (!userId) {"
                throw new Error("Missing userId in leave request");
            }
            '
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                throw new Error(`User ${userId} not found`);
            }
            
            const userData = userDoc.data();
            
            const notificationData = {'
                title: approved ? '請假已批准' : '請假被拒絕','
                userName: userData.name || '員工','
                startDate: formatTimestamp(leaveData.startDate, 'YYYY-MM-DD'),'
                endDate: formatTimestamp(leaveData.endDate, 'YYYY-MM-DD'),'
                reason: approved ? '' : (reason || '未提供理由'),'
                message: `您的請假申請 (${formatTimestamp(leaveData.startDate, 'YYYY-MM-DD')} 至 ${formatTimestamp(leaveData.endDate, 'YYYY-MM-DD')}) ${approved ? '已被批准' : '已被拒絕'}`'
                + (approved ? '' : `\n拒絕原因: ${reason || '未提供'}`)
            };
            
            await sendNotification('
                approved ? 'leaveApproved' : 'leaveRejected',
                notificationData,
                { userId: userId }
            );
            
            logger.info(`reviewLeaveRequest: Notification sent to user ${userId} for request ${requestId}`);
        } catch (notifyError) {'
            // Non-critical error - log but don't fail the function
            logger.error(`reviewLeaveRequest: Error sending notification for request ${requestId}:`, notifyError);
        }
        
        // 6. Log the activity
        await logActivity({
            userId: request.auth.uid,
            userName: adminName,'
            feature: 'LeaveAdmin','
            action: approved ? 'ApproveLeave' : 'RejectLeave',
            details: {
                leaveRequestId: requestId,
                employeeId: leaveData.userId,'
                startDate: formatTimestamp(leaveData.startDate, 'YYYY-MM-DD'),'
                endDate: formatTimestamp(leaveData.endDate, 'YYYY-MM-DD'),'
                reason: approved ? '' : (reason || '未提供理由')
            },
            success: true
        });
        
        return { 
            success: true, '
            message: approved ? '請假申請已批准' : '請假申請已拒絕' 
        };
        
    } catch (error) {
        logger.error(`reviewLeaveRequest: Error processing request ${requestId}:`, error);
        
        // Log the failed activity
        try {
            await logActivity({
                userId: request.auth.uid,
                userName: adminName,'
                feature: 'LeaveAdmin','
                action: approved ? 'ApproveLeave' : 'RejectLeave',
                details: {
                    leaveRequestId: requestId,
                    error: error.message
                },
                success: false
            });
        } catch (logError) {"
            logger.error("Failed to log activity for failed leave review:", logError);
        }
        
        if (error instanceof HttpsError) {
            throw error;
        }'
        throw new HttpsError('internal', '處理請假單時發生錯誤', error.message);
    }
});

// Ensure helper functions getForbiddenDates and getHolidayDates are defined below
function getForbiddenDates(configData, userData) {
    // ... (implementation)
     let forbidden = configData.forbiddenDates || [];
    const storeForbidden = configData.storeForbiddenDates?.[userData.store] || [];
    return [...new Set([...forbidden, ...storeForbidden])]; 
}

function getHolidayDates(configData) {
    // ... (implementation)
     return configData.holidayDates || [];
}

//=======================================
//        獎金任務評估函數 (新增區塊)
//=======================================

/**
 * 排程函數：定期評估所有啟用的獎金任務。
 * 觸發方式：根據每個任務的 evaluationConfig.triggerType。
 *   - 目前只處理 MONTHLY，根據 evaluationConfig.evaluationFrequency (月初/月底)。
 * TODO: 需要設置 Pub/Sub 主題和 Cloud Scheduler 作業來實際觸發此函數。
 */

/**
 * 評估單個獎金任務對所有潛在符合資格的員工。
 * @param {object} task - The bonus task object (including id).
 */
async function evaluateSingleTaskForAllEmployees(task) {
    logger.info(`Evaluating task [${task.name}] (${task.id}) for all employees.`);
    try {
        const minLevel = task.minLevel || 0;'
        // MODIFIED: Query 'employees' collection instead of 'users''
        const usersSnapshot = await db.collection('employees') '
                                      .where('level', '>=', minLevel)
                                      // Add other potential filters like isBonusEligible later'
                                      // .where('isBonusEligible', '==', true) // Example
                                      .get();

        if (usersSnapshot.empty) {
            logger.info(`No employees found meeting minimum level ${minLevel} for task ${task.id}.`);
            return;
        }

        logger.info(`Found ${usersSnapshot.size} employees potentially eligible for task ${task.id}.`);

        const evaluationDate = FieldValue.serverTimestamp(); // Use server timestamp for consistency
        const evaluationMonth = getEvaluationMonthString(task.evaluationConfig);
        if (!evaluationMonth) {
            logger.warn(`Could not determine evaluation month for task ${task.id}, skipping.`);
            return;
        }

        const employeePromises = [];
        usersSnapshot.forEach(userDoc => {
            const employee = { id: userDoc.id, ...userDoc.data() };
            employeePromises.push(evaluateTaskForEmployee(task, employee, evaluationMonth, evaluationDate));
        });

        await Promise.all(employeePromises);
        logger.info(`Finished evaluating task [${task.name}] (${task.id}) for all employees.`);

    } catch (error) {
        logger.error(`Error evaluating task ${task.id} for all employees:`, error);
    }
}

/**
 * 評估特定獎金任務對單個員工的達成情況。
 * @param {object} task - The bonus task object.
 * @param {object} employee - The employee user object.'
 * @param {string} evaluationMonth - The target month string 'YYYY-MM'.
 * @param {Timestamp} evaluationDate - Timestamp of when the evaluation is run.
 */
async function evaluateTaskForEmployee(task, employee, evaluationMonth, evaluationDate) {'
    const progressDocRef = db.collection('employee_bonus_progress').doc(`${employee.id}_${evaluationMonth}`);
    logger.info(`Evaluating task [${task.name}] (${task.id}) for employee [${employee.displayName || employee.id}] (${employee.id}) for month ${evaluationMonth}.`);
"
    let status = "PENDING";
    let rewardEarned = null;
    const conditionsResult = [];
    let unlockConditionsMet = true; // Assume met initially

    try {
        // 1. 檢查開啟條件 (Unlock Conditions) - Currently only Tenure
        if (task.unlockConditions?.minTenureDays) {
            const tenureDays = calculateTenureDays(employee.hireDate);
            if (tenureDays === null || tenureDays < task.unlockConditions.minTenureDays) {
                unlockConditionsMet = false;"
                status = "INELIGIBLE";
                logger.info(`Employee ${employee.id} ineligible for task ${task.id} due to tenure (${tenureDays} days < ${task.unlockConditions.minTenureDays} required).`);
            }
        }
        // Add checks for other unlock conditions (e.g., store performance) here later

        // 2. 如果開啟條件滿足，評估核心條件 (Core Conditions)
        if (unlockConditionsMet && task.conditions && task.conditions.length > 0) {'
            let overallPassed = task.conditionsLogic === 'OR' ? false : true; // Initial state depends on logic
            // 使用正確參數調用 checkSingleCondition 函數
            const conditionPromises = task.conditions.map(condition => {
                // 使用新版函數的參數格式
                return checkSingleCondition(employee.id, condition, employee, evaluationDate instanceof Date ? 
                    evaluationDate : new Date());
            });

            const results = await Promise.all(conditionPromises);
            results.forEach(result => {
                conditionsResult.push(result); // Store individual results'
                if (task.conditionsLogic === 'AND') {
                    if (!result.passed) overallPassed = false;
                } else { // OR logic
                    if (result.passed) overallPassed = true;
                }
            });

            if (overallPassed) {"
                status = "PASSED";
                rewardEarned = task.rewardValue;
                logger.info(`Employee ${employee.id} PASSED task ${task.id}.`);
            } else {"
                status = "FAILED";
                logger.info(`Employee ${employee.id} FAILED task ${task.id}.`);
            }
        } else if (unlockConditionsMet && (!task.conditions || task.conditions.length === 0)) {
            // No core conditions defined, but unlock met - consider it PASSED"
            status = "PASSED";
            rewardEarned = task.rewardValue;
             logger.info(`Employee ${employee.id} PASSED task ${task.id} (no core conditions defined).`);
        } else if (!unlockConditionsMet) {
            // Already set to INELIGIBLE above
        }

        // 3. 記錄結果到 Firestore
        const taskResult = {
            taskId: task.id,
            taskName: task.name,
            status: status,
            rewardEarned: rewardEarned,
            evaluationDate: evaluationDate, // Record when this specific evaluation ran
            unlockConditionsMet: unlockConditionsMet,
            conditionsResult: conditionsResult // Store snapshot of condition checks
        };

        // Use set with merge:true to add/update the task result within the monthly document
        await progressDocRef.set({
            employeeId: employee.id,'
            employeeName: employee.displayName || employee.name || '未知姓名',
            month: evaluationMonth,
            tasks: FieldValue.arrayUnion(taskResult) // Add task result to array, avoids duplicates if run multiple times
        }, { merge: true });

        logger.info(`Saved evaluation result for task ${task.id}, employee ${employee.id}, month ${evaluationMonth}. Status: ${status}`);

    } catch (error) {
        logger.error(`Error evaluating task ${task.id} for employee ${employee.id}:`, error);
        // Optionally log failure to a separate collection or update status to ERROR
    }
}

/**
 * 檢查單個核心條件對指定員工是否達成。
 * @param {object} employee - The employee user object.
 * @param {object} condition - The condition object { type, metric, operator, value, params }.'
 * @param {string} evaluationMonth - The target month string 'YYYY-MM' (for time-based lookups).
 * @returns {Promise<object>} - Promise resolving to { condition, dataValue, passed: boolean }
 * @deprecated 使用新版 checkSingleCondition(userId, condition, employeeData, evaluationDate) 替代
 */
async function checkSingleCondition(employee, condition, evaluationMonth) {
    logger.warn(`使用已棄用的 checkSingleCondition 舊接口。請更新調用以使用新版函數。`);
    
    // 建立評估日期，使用 evaluationMonth 的月底
    let evaluationDate;
    try {'
        const [year, month] = evaluationMonth.split('-').map(Number);
        evaluationDate = new Date(year, month, 0); // 月底日期
    } catch (error) {
        logger.error(`無法從 ${evaluationMonth} 創建評估日期，使用當前日期替代`, error);
        evaluationDate = new Date();
    }
    
    // 從這個函數命名空間中獲取對全局新版函數的引用
    const globalCheckSingleCondition = global.checkSingleCondition || checkSingleCondition;
    // 避免遞歸調用，直接調用新接口
    return await globalCheckSingleCondition(employee.id, condition, employee, evaluationDate);
}

// --- Evaluation Helper Functions ---

/**
 * Calculates tenure in days based on hire date.
 * @param {Timestamp|Date|string} hireDateInput - Employee hire date.
 * @returns {number|null} - Tenure in days, or null if hire date is invalid.
 */
function calculateTenureDays(hireDateInput) {
    if (!hireDateInput) return null;
    try {
        let hireDate;
        if (hireDateInput.toDate) { // Firestore Timestamp
            hireDate = hireDateInput.toDate();
        } else if (hireDateInput instanceof Date) {
            hireDate = hireDateInput;
        } else { // Try parsing string (ISO format recommended)
            hireDate = new Date(hireDateInput);
        }

        if (isNaN(hireDate.getTime())) {"
            logger.warn("Invalid hire date for tenure calculation:", hireDateInput);
            return null;
        }

        const today = new Date();
        // Set time to 00:00:00 for both dates to compare whole days
        const hireDateStartOfDay = new Date(hireDate.getFullYear(), hireDate.getMonth(), hireDate.getDate());
        const todayStartOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const diffTime = Math.abs(todayStartOfDay - hireDateStartOfDay);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Add 1 to include the hire day
        return diffDays;
    } catch (error) {"
        logger.error("Error calculating tenure days:", error, { hireDateInput });
        return null;
    }
}

/**
 * Compares two values using a specified operator.
 * @param {*} actualValue - The actual data value from the employee/system.'
 * @param {string} operator - The comparison operator (e.g., '>=', '<=', '==').
 * @param {*} targetValue - The target value from the condition definition.
 * @returns {boolean} - True if the comparison holds, false otherwise.
 */
function compareValues(actualValue, operator, targetValue) {
    logger.debug(`Comparing values: ${actualValue} ${operator} ${targetValue}`);
    // Basic type coercion for comparison (may need refinement)
    const numActual = Number(actualValue);
    const numTarget = Number(targetValue);
    const useNumeric = !isNaN(numActual) && !isNaN(numTarget);

    try {
        switch (operator) {'
            case '>=':
                return useNumeric ? numActual >= numTarget : actualValue >= targetValue;'
            case '<=':
                return useNumeric ? numActual <= numTarget : actualValue <= targetValue;'
            case '==':'
                // Be careful with type coercion for '=='
                 return useNumeric ? numActual === numTarget : String(actualValue) === String(targetValue);'
            case '!=':
                return useNumeric ? numActual !== numTarget : String(actualValue) !== String(targetValue);'
            case '>':
                return useNumeric ? numActual > numTarget : actualValue > targetValue;'
            case '<':
                return useNumeric ? numActual < numTarget : actualValue < targetValue;
            default:
                logger.warn(`Unsupported operator: ${operator}`);
                return false;
        }
    } catch (error) {"
        logger.error("Error during value comparison:", error, { actualValue, operator, targetValue });
        return false;
    }
}

/**
 * Determines the evaluation month string (YYYY-MM) based on config.
 * @param {object} evaluationConfig - The evaluation config object.
 * @returns {string|null} - YYYY-MM string or null.
 */
function getEvaluationMonthString(evaluationConfig) {'
    if (!evaluationConfig || evaluationConfig.triggerType !== 'MONTHLY') {"
        logger.warn("Cannot get evaluation month: Invalid config or triggerType is not MONTHLY.", { evaluationConfig });
        return null;
    };
try {
        const currentDate = new Date();
        // If we have a specific month in the config, use it
        if (evaluationConfig.targetMonth) {
            return evaluationConfig.targetMonth;
        }
        
        // Otherwise calculate from the current date'
        const targetMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        logger.info(`Using current month for evaluation: ${targetMonth}`);
        return targetMonth;
    } catch (error) {"
        logger.error("Error determining evaluation month:", error);
        return null;
    }
}

// =======================================
// == 獎金任務評估函數 (Cloud Functions) ==
// =======================================

// --- 引入必要的 Firebase Admin SDK ---
// (假設 admin, db, logger, FieldValue 已經在檔案上方初始化)

/**
 * 已由上方定義的 compareValues 函數取代
 * @deprecated 請使用上方定義的 compareValues 函數
 */
function compareValues(actual, operator, target) {
    // 重定向到上方定義的函數，保持參數順序一致
    return compareValues(actual, operator, target);
}

/**
 * Calculates tenure in days between hire date and a given end date.'
 * @param {admin.firestore.Timestamp | Date | string | null} hireDateInput - The user's hire date.
 * @param {Date} evaluationDate - The date the evaluation is run (defaults to now if invalid).
 * @returns {number|null} Tenure in days, or null if hire date is invalid.
 */
function calculateTenureDays(hireDateInput, evaluationDate = new Date()) {
     // (此函數內容與之前提供的一樣)
     let hireDate;
     if (!hireDateInput) return null;

     try {
         if (hireDateInput instanceof Date) {
             hireDate = hireDateInput;
         } else if (hireDateInput.toDate) { // Firestore Timestamp
             hireDate = hireDateInput.toDate();'
         } else if (typeof hireDateInput === 'string') {
              hireDate = new Date(hireDateInput);
         } else {"
              logger.warn("Unsupported hireDate format:", hireDateInput);
              return null;
         }

         if (isNaN(hireDate.getTime())) {"
             logger.warn("Invalid hireDate after parsing:", hireDateInput);
             return null;
         }

         // Ensure evaluationDate is valid
         if (!evaluationDate || !(evaluationDate instanceof Date) || isNaN(evaluationDate.getTime())) {"
             logger.warn("Invalid evaluationDate provided for tenure calculation. Using current time.");
             evaluationDate = new Date();
         }

         // 計算日期差異 (忽略時間部分)
         const evalDateOnly = new Date(evaluationDate.getFullYear(), evaluationDate.getMonth(), evaluationDate.getDate());
         const hireDateOnly = new Date(hireDate.getFullYear(), hireDate.getMonth(), hireDate.getDate());

         const diffTime = evalDateOnly.getTime() - hireDateOnly.getTime();
         const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // 只取整數天
         return diffDays >= 0 ? diffDays : 0;
     } catch (error) {"
          logger.error("Error calculating tenure days:", error, { hireDateInput, evaluationDate });
          return null;
     }
}

/**
 * Checks an attendance-related condition.'
 * @param {string} userId The employee's ID.'
 * @param {string} metric The specific attendance metric (e.g., 'on_time_rate').
 * @param {string} operator The comparison operator.
 * @param {*} value The target value.'
 * @param {string} timePeriod String indicating the period (e.g., 'LAST_MONTH').
 * @param {Date} evaluationDate Date the evaluation is running.
 * @returns {Promise<{passed: boolean, dataValue: any}>}
 */
async function checkAttendanceCondition(userId, metric, operator, value, timePeriod, evaluationDate) {
    // --- 計算時間範圍 ---
    let startDate, endDate;
    const evalYear = evaluationDate.getFullYear();
    const evalMonth = evaluationDate.getMonth(); // 0-indexed

    // Add more timePeriod options if needed'
    if (timePeriod === 'LAST_MONTH') {
        startDate = new Date(evalYear, evalMonth - 1, 1, 0, 0, 0, 0); // First day of last month, start of day
        endDate = new Date(evalYear, evalMonth, 0, 23, 59, 59, 999); // Last day of last month, end of day'
    } else if (timePeriod === 'CURRENT_MONTH') {
         startDate = new Date(evalYear, evalMonth, 1, 0, 0, 0, 0);
         endDate = new Date(evalYear, evalMonth + 1, 0, 23, 59, 59, 999);
    } else {
        logger.warn(`Unsupported timePeriod for attendance: ${timePeriod}`);
        return { passed: false, dataValue: `不支持的時間區間: ${timePeriod}` };
    }

    logger.info(`Checking ATTENDANCE metric: ${metric} for user ${userId} between ${startDate.toISOString()} and ${endDate.toISOString()}`);

    // --- ASSUMPTIONS: Verify these constants match your Firestore structure! ---'
    const CLOCK_RECORDS_COLLECTION = 'clock_records';'
    const SCHEDULE_COLLECTION = 'schedules';'
    const USER_ID_FIELD = 'userId';'
    const TIMESTAMP_FIELD = 'timestamp';'
    const STATUS_FIELD = 'status';                  // Assumed field written by recordClockEvent'
    const ON_TIME_STATUS_VALUE = '準時';            // Assumed value written by recordClockEvent'
    const LATE_STATUS_VALUE = '遲到';              // Assumed value written by recordClockEvent'
    const SCHEDULE_DATE_FIELD = 'date';             // (YYYY-MM-DD string)'
    const SCHEDULE_SHIFT_FIELD = 'shift';'
    const SCHEDULE_DAY_OFF_VALUE = '休';

    try {
        let actualValue = null;
        let passed = false;

        // --- Query clock records and schedules --- 
        // 查詢打卡記錄
        const clockRecordsQuery = db.collection(CLOCK_RECORDS_COLLECTION)'
                                  .where(USER_ID_FIELD, '==', userId)'
                                  .where(TIMESTAMP_FIELD, '>=', startDate)'
                                  .where(TIMESTAMP_FIELD, '<=', endDate);
        const clockRecordsSnapshot = await clockRecordsQuery.get();
        const clockRecords = [];
        clockRecordsSnapshot.forEach(doc => clockRecords.push(doc.data()));
        logger.info(`Found ${clockRecords.length} clock records for user ${userId}`);

        // 查詢排班記錄
        const scheduleQuery = db.collection(SCHEDULE_COLLECTION)'
                             .where(USER_ID_FIELD, '==', userId)'
                             .where(SCHEDULE_DATE_FIELD, '>=', startDate.toISOString().split('T')[0])'
                             .where(SCHEDULE_DATE_FIELD, '<=', endDate.toISOString().split('T')[0]);
        const scheduleSnapshot = await scheduleQuery.get();
        const scheduleRecords = [];
        scheduleSnapshot.forEach(doc => scheduleRecords.push(doc.data()));
        logger.info(`Found ${scheduleRecords.length} schedule records for user ${userId}`);

        // --- Calculate metrics --- 
        switch (metric) {'
            case 'on_time_rate': {
                let onTimeCount = 0;
                let relevantClockIns = 0;
                const scheduledWorkDaysMap = new Map();
                
                // 建立排班工作日映射
                scheduleRecords.forEach(schedule => {
                    if (schedule[SCHEDULE_SHIFT_FIELD] !== SCHEDULE_DAY_OFF_VALUE) {
                        scheduledWorkDaysMap.set(schedule[SCHEDULE_DATE_FIELD], schedule[SCHEDULE_SHIFT_FIELD]);
                    }
                });

                clockRecords.forEach(record => {
                    try {
                         const recordTimestamp = record[TIMESTAMP_FIELD];
                         if(recordTimestamp && recordTimestamp.toDate) {'
                             const recordDateStr = recordTimestamp.toDate().toISOString().split('T')[0];
                             if (scheduledWorkDaysMap.has(recordDateStr)) {
                                 relevantClockIns++;
                                 // Use the status field recorded by recordClockEvent
                                 if (record[STATUS_FIELD] === ON_TIME_STATUS_VALUE) { 
                                     onTimeCount++;
                                 }
                             }
                         }"
                    } catch (e) { logger.warn("Error processing clock record for on_time_rate:", e, record); }
                });

                actualValue = (relevantClockIns > 0) ? (onTimeCount / relevantClockIns) : 1.0; 
                logger.info(`On-time calculation: ${onTimeCount} on-time / ${relevantClockIns} relevant clock-ins = ${actualValue}`);
                passed = compareValues(actualValue, operator, value);
                break;
            }'
            case 'absence_days': {
                const scheduledWorkDaysMap = new Map();
                const clockedDaysMap = new Map();
                
                // 建立排班工作日映射
                scheduleRecords.forEach(schedule => {
                    if (schedule[SCHEDULE_SHIFT_FIELD] !== SCHEDULE_DAY_OFF_VALUE) {
                        scheduledWorkDaysMap.set(schedule[SCHEDULE_DATE_FIELD], true);
                    }
                });
                
                // 建立已打卡日期映射
                clockRecords.forEach(record => {
                    try {
                        const recordTimestamp = record[TIMESTAMP_FIELD];
                        if(recordTimestamp && recordTimestamp.toDate) {'
                            const recordDateStr = recordTimestamp.toDate().toISOString().split('T')[0];
                            clockedDaysMap.set(recordDateStr, true);
                        }"
                    } catch (e) { logger.warn("Error processing clock record for absence_days:", e, record); }
                });
                
                // 計算缺勤天數（排班但未打卡的天數）
                let absenceDays = 0;
                scheduledWorkDaysMap.forEach((_, dateStr) => {
                    if (!clockedDaysMap.has(dateStr)) {
                        absenceDays++;
                    }
                });
                
                actualValue = absenceDays;
                logger.info(`Absence days calculation: ${actualValue} scheduled work days without clock records`);
                passed = compareValues(actualValue, operator, value);
                break;
            }'
            case 'late_count': {
                let lateCount = 0;
                const scheduledWorkDaysMap = new Map();
                
                // 建立排班工作日映射
                scheduleRecords.forEach(schedule => {
                    if (schedule[SCHEDULE_SHIFT_FIELD] !== SCHEDULE_DAY_OFF_VALUE) {
                        scheduledWorkDaysMap.set(schedule[SCHEDULE_DATE_FIELD], schedule[SCHEDULE_SHIFT_FIELD]);
                    }
                });

                clockRecords.forEach(record => {
                     try {
                         const recordTimestamp = record[TIMESTAMP_FIELD];
                         if(recordTimestamp && recordTimestamp.toDate) {'
                             const recordDateStr = recordTimestamp.toDate().toISOString().split('T')[0];
                             if (scheduledWorkDaysMap.has(recordDateStr)) {
                                 // Use the status field recorded by recordClockEvent
                                 if (record[STATUS_FIELD] === LATE_STATUS_VALUE) { 
                                     lateCount++;
                                 }
                             }
                         }"
                    } catch (e) { logger.warn("Error processing clock record for late_count:", e, record); }
                });
                actualValue = lateCount;
                logger.info(`Late count calculation: ${actualValue} late records found on scheduled work days`);
                passed = compareValues(actualValue, operator, value);
                break;
            }
            default:
                logger.warn(`Unsupported attendance metric: ${metric}`);
                return { passed: false, dataValue: `不支持的考勤指標: ${metric}` };
        }

        logger.info(`Attendance check result - Metric: ${metric}, Actual: ${actualValue}, Target: ${value}, Operator: ${operator}, Passed: ${passed}`);
        return { passed: passed, dataValue: actualValue };

    } catch (error) {
        logger.error(`Error checking attendance condition for user ${userId}, metric ${metric}:`, error);
        // Return a clear error value
        return { passed: false, dataValue: `檢查時發生錯誤: ${error.message}` };
    }
}


/**
 * Checks a sales-related condition.'
 * @param {string} userId The employee's ID.'
 * @param {string | null} storeId The employee's store ID (might be needed).
 * @param {string} metric The specific sales metric.
 * @param {string} operator The comparison operator.
 * @param {*} value The target value.
 * @param {string} timePeriod String indicating the period.
 * @param {Date} evaluationDate Date the evaluation is running.
 * @returns {Promise<{passed: boolean, dataValue: any}>}
 */
async function checkSalesCondition(userId, storeId, metric, operator, value, timePeriod, evaluationDate) {
     // --- 計算時間範圍 (YYYY-MM) ---
     let yearMonth;
     const evalYear = evaluationDate.getFullYear();
     const evalMonth = evaluationDate.getMonth(); // 0-indexed
'
     if (timePeriod === 'LAST_MONTH') {
         const lastMonthDate = new Date(evalYear, evalMonth - 1, 1);'
         yearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;'
     } else if (timePeriod === 'CURRENT_MONTH') {'
          yearMonth = `${evalYear}-${String(evalMonth + 1).padStart(2, '0')}`;
     } else {
         logger.warn(`Unsupported timePeriod for sales: ${timePeriod}`);
         return { passed: false, dataValue: null };
     }

    logger.info(`Checking SALES metric: ${metric} for user ${userId} (Store: ${storeId}) for period ${yearMonth}`);

    // --- ASSUMPTIONS: Collection and Field Names for Sales ---
    // PLEASE VERIFY these against your actual Firestore structure.'
    const SALES_REPORTS_COLLECTION = 'sales_reports'; // ASSUMPTION: Monthly store reports collection name.'
    const SALES_RECORDS_COLLECTION = 'sales_records'; // ASSUMPTION: Individual sales records collection name (if used).'
    const STORE_ID_FIELD = 'store';                 // ASSUMPTION: Field name for store ID in reports/records.'
    const USER_ID_FIELD_SALES = 'userId';         // ASSUMPTION: Field name for user ID in individual sales records.'
    const REPORT_MONTH_FIELD = 'month';             // ASSUMPTION: Field name for month (YYYY-MM) in reports.'
    const TARGET_SALES_FIELD = 'target';         // ASSUMPTION: Field name for target sales in reports.'
    const ACTUAL_SALES_FIELD = 'revenue';         // ASSUMPTION: Field name for actual sales in reports.'
    const TOTAL_SALES_FIELD = 'revenue';           // ASSUMPTION: Field name for total sales in reports (might be same as actual).'
    const SALE_AMOUNT_FIELD = 'amount';               // ASSUMPTION: Field name for amount in individual sales records.'
    const SALE_TIMESTAMP_FIELD = 'timestamp';          // ASSUMPTION: Field name for timestamp in individual sales records.


    try {
        let actualValue = null;
        let passed = false;

        // --- 計算邏輯 ---
        switch (metric) {'
            case 'store_target_rate': {
                 if (!storeId) {
                     logger.warn(`Cannot check store_target_rate for user ${userId}: Missing storeId.`);"
                     return { passed: false, dataValue: "缺少店鋪資訊" };
                 }
                 // ASSUMPTION: Query sales_reports collection for the store and month.
                 const reportQuery = db.collection(SALES_REPORTS_COLLECTION)'
                                      .where(STORE_ID_FIELD, '==', storeId)'
                                      .where(REPORT_MONTH_FIELD, '==', yearMonth)
                                      .limit(1);
                 const reportSnapshot = await reportQuery.get();

                 if (reportSnapshot.empty) {
                      logger.warn(`No sales report found for store ${storeId}, month ${yearMonth}. Assuming 0% target rate.`);
                      actualValue = 0;
                 } else {
                      const reportData = reportSnapshot.docs[0].data();
                      const target = reportData[TARGET_SALES_FIELD];
                      const actual = reportData[ACTUAL_SALES_FIELD];
                      // Ensure target is a positive number to avoid division by zero or meaningless rates.'
                      if (target && typeof target === 'number' && target > 0 && actual && typeof actual === 'number') {
                           actualValue = actual / target;
                      } else {
                           logger.warn(`Missing, invalid, or zero target/actual sales in report for ${storeId}, ${yearMonth}: Target=${target}, Actual=${actual}. Assuming 0% target rate.`);
                           actualValue = 0;
                      }
                 }
                 passed = compareValues(actualValue, operator, value); // Usually >=
                 break;
             }'
            case 'personal_sales_amount': {
                 // ASSUMPTION: Query individual sales_records collection.'
                 const [year, month] = yearMonth.split('-').map(Number);
                 const startDate = new Date(year, month - 1, 1);
                 const endDate = new Date(year, month, 0, 23, 59, 59, 999);

                 const salesQuery = db.collection(SALES_RECORDS_COLLECTION)'
                                      .where(USER_ID_FIELD_SALES, '==', userId)'
                                      .where(SALE_TIMESTAMP_FIELD, '>=', startDate)'
                                      .where(SALE_TIMESTAMP_FIELD, '<=', endDate);
                 const salesSnapshot = await salesQuery.get();
                 actualValue = 0;
                 salesSnapshot.forEach(doc => {
                      const saleData = doc.data();'
                      if (saleData[SALE_AMOUNT_FIELD] && typeof saleData[SALE_AMOUNT_FIELD] === 'number') {
                          actualValue += saleData[SALE_AMOUNT_FIELD];
                      }
                 });
                 passed = compareValues(actualValue, operator, value); // Usually >=
                 break;
            }'
             case 'store_total_sales': {
                 if (!storeId) {
                      logger.warn(`Cannot check store_total_sales for user ${userId}: Missing storeId.`);"
                     return { passed: false, dataValue: "缺少店鋪資訊" };
                 }
                 // ASSUMPTION: Query sales_reports collection.
                 const reportQuery = db.collection(SALES_REPORTS_COLLECTION)'
                                      .where(STORE_ID_FIELD, '==', storeId)'
                                      .where(REPORT_MONTH_FIELD, '==', yearMonth)
                                      .limit(1);
                 const reportSnapshot = await reportQuery.get();

                 if (reportSnapshot.empty) {
                      logger.warn(`No sales report found for store ${storeId}, month ${yearMonth}. Assuming 0 total sales.`);
                      actualValue = 0;
                 } else {
                      const reportData = reportSnapshot.docs[0].data();
                      // Use the assumed field name for total sales.
                      actualValue = reportData[TOTAL_SALES_FIELD] ?? 0;
                 }
                 passed = compareValues(actualValue, operator, value); // Usually >=
                 break;
             }'
            case 'average_sale_amount': {
                 // 計算用戶平均訂單金額'
                 const [year, month] = yearMonth.split('-').map(Number);
                 const startDate = new Date(year, month - 1, 1);
                 const endDate = new Date(year, month, 0, 23, 59, 59, 999);

                 const salesQuery = db.collection(SALES_RECORDS_COLLECTION)'
                                      .where(USER_ID_FIELD_SALES, '==', userId)'
                                      .where(SALE_TIMESTAMP_FIELD, '>=', startDate)'
                                      .where(SALE_TIMESTAMP_FIELD, '<=', endDate);
                 const salesSnapshot = await salesQuery.get();
                 
                 if (salesSnapshot.empty) {
                     logger.warn(`No sales records found for user ${userId}, period ${yearMonth}. Assuming 0 average sale amount.`);
                     actualValue = 0;
                 } else {
                     let totalAmount = 0;
                     let recordCount = 0;
                     
                     salesSnapshot.forEach(doc => {
                         const saleData = doc.data();'
                         if (saleData[SALE_AMOUNT_FIELD] && typeof saleData[SALE_AMOUNT_FIELD] === 'number') {
                             totalAmount += saleData[SALE_AMOUNT_FIELD];
                             recordCount++;
                         }
                     });
                     
                     actualValue = recordCount > 0 ? totalAmount / recordCount : 0;
                     logger.info(`Average sale calculation: ${totalAmount} total / ${recordCount} records = ${actualValue}`);
                 }
                 
                 passed = compareValues(actualValue, operator, value);
                 break;
            }'
            case 'sales_count': {
                 // 計算用戶完成的銷售數量'
                 const [year, month] = yearMonth.split('-').map(Number);
                 const startDate = new Date(year, month - 1, 1);
                 const endDate = new Date(year, month, 0, 23, 59, 59, 999);

                 const salesQuery = db.collection(SALES_RECORDS_COLLECTION)'
                                      .where(USER_ID_FIELD_SALES, '==', userId)'
                                      .where(SALE_TIMESTAMP_FIELD, '>=', startDate)'
                                      .where(SALE_TIMESTAMP_FIELD, '<=', endDate);
                 const salesSnapshot = await salesQuery.get();
                 
                 actualValue = salesSnapshot.size;
                 logger.info(`Sales count: ${actualValue} sales records found for user ${userId} in period ${yearMonth}`);
                 
                 passed = compareValues(actualValue, operator, value);
                 break;
            }
            default:
                logger.warn(`Unsupported sales metric: ${metric}`);
                return { passed: false, dataValue: `不支持的銷售指標: ${metric}` };
        }

        logger.info(`Sales check result - Metric: ${metric}, Actual: ${actualValue}, Target: ${value}, Operator: ${operator}, Passed: ${passed}`);
        return { passed: passed, dataValue: actualValue };

    } catch (error) {
        logger.error(`Error checking sales condition for user ${userId}, metric ${metric}:`, error);
        return { passed: false, dataValue: `檢查時發生錯誤: ${error.message}` };
    }
}


/**
 * Main function to check a single condition. Routes based on type.
 * Called by evaluateTaskForEmployee.
 *
 * Determines the evaluation month string (YYYY-MM) based on config.
 * @param {object} evaluationConfig - The evaluation config object from the bonus task.'
 * @returns {string|null} - YYYY-MM string or null if config is invalid or type isn't MONTHLY.
 */
function getEvaluationMonthString(evaluationConfig) {'
    if (!evaluationConfig || evaluationConfig.triggerType !== 'MONTHLY') {"
        logger.warn("Cannot get evaluation month: Invalid config or triggerType is not MONTHLY.", { evaluationConfig });
        return null;
    };
try {
        const currentDate = new Date();
        // If we have a specific month in the config, use it
        if (evaluationConfig.targetMonth) {
            return evaluationConfig.targetMonth;
        }
        
        // Otherwise calculate from the current date'
        const targetMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        logger.info(`Using current month for evaluation: ${targetMonth}`);
        return targetMonth;
    } catch (error) {"
        logger.error("Error determining evaluation month: ", error);
        return null;
    }
}

/**
 * Scheduled function to evaluate bonus tasks.
 * Triggered daily, checks internally if tasks are due based on their config.
 */
exports.evaluateBonusTasksScheduled = onSchedule({", schedule: "every day 03:00", // Runs daily at 3 AM Taipei time"
    timeZone: "Asia/Taipei",
    // secrets: [...] // Add secrets needed by condition checks if any (e.g., external API keys)
    timeoutSeconds: 540, // Max timeout for scheduled functions'
    memory: '1GiB' // Adjust memory if needed for processing many users/tasks
}, async (event) => {
    // (此函數內容與之前提供的一樣，調用 evaluateSingleTaskForAllEmployees)"
    logger.info("Starting scheduled bonus task evaluation run...");
    const startTime = Date.now();'
    const now = new Date(); // Use a consistent 'now' for checks within this run
    const todayDay = now.getDate(); // Day of the month (1-31)
    let tasksEvaluatedCount = 0;

    // Log start of the system task'
    await logActivity({ userId: 'system', feature: 'ScheduledTask', action: 'evaluateBonusTasksScheduledStart', details: `Run started at ${now.toISOString()}`, success: true });

    try {'
        // ASSUMPTION: Bonus tasks are stored in 'bonus_tasks' collection.'
        const tasksSnapshot = await db.collection('bonus_tasks')'
                                      .where('isActive', '==', true) // Only evaluate active tasks'
                                      .where('evaluationConfig.triggerType', '==', 'MONTHLY') // Currently only supports monthly triggers
                                      .get();

        if (tasksSnapshot.empty) {"
            logger.info("No active monthly bonus tasks found to evaluate today.");
            // Log completion even if no tasks found
            const duration = Date.now() - startTime;'
            await logActivity({ userId: 'system', feature: 'ScheduledTask', action: 'evaluateBonusTasksScheduledComplete', details: `Run finished in ${duration}ms. No active monthly tasks found.`, success: true });
            return; // Exit if no tasks
        }

        logger.info(`Found ${tasksSnapshot.size} active monthly bonus tasks.`);

        const evaluationPromises = [];

        tasksSnapshot.forEach(taskDoc => {
            const task = { id: taskDoc.id, ...taskDoc.data() };
            const evalConfig = task.evaluationConfig;

            // Basic validation of task data
            if (!evalConfig || !evalConfig.evaluationFrequency) {
                 logger.warn(`Task ${task.id} [${task.name}] is missing evaluationConfig or evaluationFrequency, skipping.`);
                 return; // Skip task if essential config is missing
            }

            // Determine if this task should be evaluated today based on its frequency setting
            let shouldEvaluateToday = false;'
            if (evalConfig.evaluationFrequency === 'START_OF_MONTH') {
                 // Evaluate if today is the 1st day of the month
                if (todayDay === 1) {
                    shouldEvaluateToday = true;
                }'
            } else if (evalConfig.evaluationFrequency === 'END_OF_MONTH') {
                // Evaluate if today is the *last* day of the current month
                const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                if (todayDay === lastDayOfMonth) {
                    shouldEvaluateToday = true;
                }
            } else {
                logger.warn(`Task ${task.id} [${task.name}] has unsupported evaluationFrequency: ${evalConfig.evaluationFrequency}, skipping.`);
                return; // Skip if frequency is unknown
            }

            // If today is the evaluation day for this task, add its evaluation to the promises
            if (shouldEvaluateToday) {
                logger.info(`Task [${task.name}] (${task.id}) is scheduled for evaluation today (Frequency: ${evalConfig.evaluationFrequency}). Queueing evaluation.`);
                // Queue the function that evaluates this task for all employees
                evaluationPromises.push(evaluateSingleTaskForAllEmployees(task));
                tasksEvaluatedCount++;
            } else {
                 logger.info(`Task [${task.name}] (${task.id}) is not scheduled for evaluation today (Frequency: ${evalConfig.evaluationFrequency}, Today: ${todayDay}).`);
            }
        });

        // Wait for all queued task evaluations to complete
        if (evaluationPromises.length > 0) {
             logger.info(`Waiting for ${evaluationPromises.length} task evaluations to complete...`);
            await Promise.all(evaluationPromises);
             logger.info(`All ${evaluationPromises.length} scheduled task evaluations completed.`);
        } else {"
             logger.info("No tasks were due for evaluation today.");
        }

        const duration = Date.now() - startTime;
        logger.info(`Scheduled bonus task evaluation run finished in ${duration}ms. Evaluated ${tasksEvaluatedCount} tasks.`);
        // Log successful completion'
        await logActivity({ userId: 'system', feature: 'ScheduledTask', action: 'evaluateBonusTasksScheduledComplete', details: `Run finished in ${duration}ms. Processed ${tasksEvaluatedCount} tasks scheduled for today.`, success: true });


    } catch (error) {
        const duration = Date.now() - startTime;"
        logger.error("Critical error during scheduled bonus task evaluation run:", error);
        // Log failure'
        await logActivity({ userId: 'system', feature: 'ScheduledTask', action: 'evaluateBonusTasksScheduledError', details: `Run failed after ${duration}ms: ${error.message}`, success: false });
        // Re-throwing the error might be appropriate depending on desired function behavior on failure
        // throw error;
    }
});

// --- Make sure to export the new scheduled function ---'
// (If you use a central module.exports = {}, add 'evaluateBonusTasksScheduled' there.
// Since you use exports.funcName = ..., the line above already does the export.)

// --- 打卡處理函數 (HTTPS Callable) ---
exports.recordClockEvent = onCall({
    secrets: [LINE_OA_TOKEN_PARAM, TELEGRAM_BOT_TOKEN_PARAM], // Add secrets if needed by notifications inside'
    region: 'asia-east2' // Specify your function region
}, async (request) => {"'
    logger.info("recordClockEvent received:", { data: request.data, auth: request.auth ? request.auth.uid : 'No auth' });

    // 1. 驗證用戶身份
    if (!request.auth) {"
        logger.warn("recordClockEvent: Authentication required.");'
        throw new HttpsError('unauthenticated', '需要驗證身份才能打卡。');
    }
    const userId = request.auth.uid;

    // --- 新增：獲取打卡設定和分店資料 ---
    let settingsData = {};
    let storeData = null;
    let parsedRadii = {};
    let parsedHours = {};
    const selectedStoreId = request.data?.storeId; // Get store ID from request
    const userLocation = request.data?.location; // Get location from request

    if (!selectedStoreId) {
        logger.warn(`recordClockEvent: Missing storeId in request data for user ${userId}.`);'
        throw new HttpsError('invalid-argument', '打卡請求中缺少分店資訊。');
    }
    // Location is optional for check if radius is unlimited, but needed otherwise
    if (!userLocation || userLocation.latitude == null || userLocation.longitude == null) {
         logger.warn(`recordClockEvent: Missing location data in request for user ${userId}. Radius check might fail if required.`);'
         // We'll check later if the radius requires location
    };
try {
        // CORRECTED: Read from store_config instead of clockinConfig'
        const settingsRef = db.collection('settings').doc('store_config');
        // REMOVED: No longer fetching storeRef separately'
        // const storeRef = db.collection('stores').doc(selectedStoreId); 

        const settingsSnap = await settingsRef.get();

        if (settingsSnap.exists) {
            settingsData = settingsSnap.data();
            // --- Store List Parsing (Server-side) ---
            if (settingsData.storeListString) {
                 const parsedStores = parseStoreListStringServer(settingsData.storeListString); 
                 // Find the data for the selected store
                 storeData = parsedStores.find(store => store.id === selectedStoreId); 
                 if (storeData) {
                      logger.info(`Found location data for selected store ${selectedStoreId} from storeListString.`);
                      // Check if lat/lon exist (should be handled by parser)
                      if (storeData.latitude == null || storeData.longitude == null) {
                           logger.error(`Parsed store data for ${selectedStoreId} is missing latitude/longitude.`);'
                           throw new HttpsError('internal', `解析後的分店資料 (${selectedStoreId}) 缺少位置資訊。`);
                      }
                 } else {
                      logger.error(`Selected storeId ${selectedStoreId} not found in parsed storeListString.`);'
                      throw new HttpsError('not-found', `在系統設定中找不到所選分店 (${selectedStoreId}) 的位置資料。`);
                 }
            } else {"'
                 logger.error("'storeListString' field missing in settings/store_config. Cannot verify location.");'
                 throw new HttpsError('failed-precondition', '系統缺少必要的分店列表設定，無法驗證位置。');
            }
            // --- End Store List Parsing ---

            parsedRadii = parseGeofenceRadiiServer(settingsData.storeGeofenceRadius);
            parsedHours = parseOperatingHoursServer(settingsData.storeOperatingHours);
            logger.info(`Fetched and parsed clockin settings for store ${selectedStoreId}.`);
        } else {
            // Changed warning message to reflect the new source"
            logger.warn("Main settings document (settings/store_config) not found. Assuming no restrictions.");
            // If settings doc is missing, we also lack storeListString, so throw error.'
            throw new HttpsError('failed-precondition', '找不到主要設定文件 (settings/store_config)，無法進行打卡驗證。');
        }

        // REMOVED: Logic that fetched storeSnap separately
        /*
        if (storeSnap.exists) {
            storeData = storeSnap.data();'
            // ASSUMPTION: Store document has 'latitude' and 'longitude' fields
            if (storeData.latitude == null || storeData.longitude == null) {
                 logger.error(`Store data for ${selectedStoreId} is missing latitude/longitude.`);'
                 throw new HttpsError('failed-precondition', `所選分店 (${selectedStoreId}) 缺少位置資訊，無法驗證距離。`);
            }
        } else {
            logger.error(`Store document not found for ID: ${selectedStoreId}`);'
            throw new HttpsError('not-found', `找不到所選分店 (${selectedStoreId}) 的資料。`);
        }
        */

    } catch (error) {
        logger.error(`Error fetching settings or store data for ${selectedStoreId}:`, error);
        if (error instanceof HttpsError) throw error;'
        throw new HttpsError('internal', '讀取打卡設定或分店資料時發生錯誤。');
    }
    // --- End 新增讀取 ---


    // --- 新增：伺服器端驗證 --- 
    // 1. 半徑驗證
    const radiusLimit = parsedRadii[selectedStoreId] ?? UNLIMITED_RADIUS_SERVER;
    if (radiusLimit !== UNLIMITED_RADIUS_SERVER) {
        if (!userLocation || userLocation.latitude == null || userLocation.longitude == null) {
             logger.warn(`recordClockEvent: Geofence check failed for ${userId} at ${selectedStoreId} - Location data missing from request.`);'
             throw new HttpsError('invalid-argument', '打卡範圍需要驗證，但請求中缺少您的位置資訊。');
        }
        const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            storeData.latitude,
            storeData.longitude
        );
        logger.info(`Geofence check for ${userId} at ${selectedStoreId}: Distance=${distance.toFixed(1)}m, Limit=${radiusLimit}m`);
        if (distance > radiusLimit) {
            logger.warn(`recordClockEvent: Geofence check failed for ${userId}. Distance ${distance.toFixed(1)}m > Limit ${radiusLimit}m.`);
            // Use storeData.name if available, otherwise storeId
            const storeDisplayName = storeData?.name || selectedStoreId;"'
            throw new HttpsError('failed-precondition', `您目前距離 "${storeDisplayName}" (${distance.toFixed(0)}米) 超出允許的打卡範圍 (${radiusLimit}米)。`);
        }
    } else {
         logger.info(`Geofence check skipped for ${userId} at ${selectedStoreId} (unlimited radius).`);
    }

    // 2. 營業時間驗證
    const storeOperatingHoursList = parsedHours[selectedStoreId]; // Get the list of ranges for this store
    if (storeOperatingHoursList && storeOperatingHoursList.length > 0) { // Only check if hours are defined
        if (!isWithinOperatingHoursServer(storeOperatingHoursList)) {
            logger.warn(`recordClockEvent: Operating hours check failed for ${userId} at ${selectedStoreId}.`);'
             const hoursString = storeOperatingHoursList.map(r => `${String(r.start.hours).padStart(2,'0')}:${String(r.start.minutes).padStart(2,'0')}-${String(r.end.hours).padStart(2,'0')}:${String(r.end.minutes).padStart(2,'0')}`).join(', ');
             const storeDisplayName = storeData?.name || selectedStoreId;"'
            throw new HttpsError('failed-precondition', `目前時間不在 "${storeDisplayName}" 的打卡時間內 (允許: ${hoursString})。`);
        }
        logger.info(`Operating hours check passed for ${userId} at ${selectedStoreId}.`);
    } else {
        logger.info(`Operating hours check skipped for ${userId} at ${selectedStoreId} (no hours defined).`);
    }
    // --- End 伺服器端驗證 ---

    // 2. 獲取用戶資料 (可選，用於記錄姓名等)'
    let userName = '未知用戶';
    try {
        const userRecord = await auth.getUser(userId);
        userName = userRecord.displayName || userRecord.email || userId; // Use display name, email, or UID'
        // 或者從 Firestore 的 'employees' 或 'users' 集合獲取更詳細資料'
        // const employeeDoc = await db.collection('employees').doc(userId).get();
        // if (employeeDoc.exists) {
        //     userName = employeeDoc.data().name || userName;
        // }
    } catch (error) {
        logger.error(`recordClockEvent: Error fetching user data for ${userId}:`, error);
        // Decide if this is critical. If not, continue with default userName.
    }

    // 3. 決定是上班還是下班'
    let determinedAction = 'clockIn'; // 默認為上班
    try {'
        const lastRecordSnapshot = await db.collection('clock_records')'
            .where('userId', '==', userId)'
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (!lastRecordSnapshot.empty) {
            const lastRecord = lastRecordSnapshot.docs[0].data();'
            if (lastRecord.action === 'clockIn') {'
                determinedAction = 'clockOut'; // 如果上一筆是上班，這次就是下班
            }
            // 如果上一筆是下班，這次仍然是上班 (determinedAction 初始值)
        }
        logger.info(`recordClockEvent: Determined action for ${userId}: ${determinedAction}`);
    } catch (error) {
        logger.error(`recordClockEvent: Error fetching last clock record for ${userId}:`, error);'
        throw new HttpsError('internal', '讀取上次打卡記錄時出錯，無法確定操作。');
    }

    // 4. 準備打卡記錄數據
    const serverTimestamp = FieldValue.serverTimestamp(); // Use server timestamp for the record
    const clockRecordData = {
        userId: userId,
        userName: userName, // Use fetched username'
        action: determinedAction, // 'clockIn' or 'clockOut'
        timestamp: serverTimestamp, // IMPORTANT: Use server time'
        source: 'web_app', // Mark the source
        storeId: selectedStoreId, // --- ADDED: Record the store ID --- 
        location: request.data.location || null, // Optional location data from client
        // validatedLocationId: request.data.validatedLocationId || null // This was likely meant for client-side info, server validation is done above'
        // status field will be added below if it's a clock-in
    };

    // 5. 如果是上班打卡，嘗試判斷並記錄狀態 (準時/遲到)'
    if (determinedAction === 'clockIn') {
        try {
            // We need the actual time the server timestamp will resolve to for comparison
            // This requires an extra step: write first, then get the timestamp, then update.
            // OR: Make an assumption about server time skew (less accurate) or use client time for status check only (less secure).'
            // Let's try a different approach: Use client time for status check only IF provided AND seems reasonable.'
            // Or even better: Let's just record the schedule startTime here, and let the check function compare later? No, let's try to determine status now.

            // Workaround: Create a JS Date object representing approx server time NOW for comparison.
            // Note: This is NOT the exact timestamp saved, but usually close enough for status check.
            const approxServerDate = new Date(); // JS Date object on the server'
            const clockInDateStr = approxServerDate.toLocaleDateString('sv-SE'); // Get YYYY-MM-DD format (Swedish locale is reliable)

            logger.info(`Attempting to check schedule for ${userId} on ${clockInDateStr}`);

            // --- ASSUMPTIONS FOR SCHEDULE CHECK ---'
            const SCHEDULE_COLLECTION = 'schedules';'
            const USER_ID_FIELD = 'userId';'
            const SCHEDULE_DATE_FIELD = 'date'; // Assumed field for YYYY-MM-DD string'
            const SCHEDULE_START_TIME_FIELD = 'startTime'; // Assumed field for HH:mm string
            // --- END ASSUMPTIONS ---

            const scheduleQuery = db.collection(SCHEDULE_COLLECTION)'
                                  .where(USER_ID_FIELD, '==', userId)'
                                  .where(SCHEDULE_DATE_FIELD, '==', clockInDateStr)
                                  .limit(1);
            const scheduleSnapshot = await scheduleQuery.get();

            if (!scheduleSnapshot.empty) {
                const scheduleData = scheduleSnapshot.docs[0].data();"
                const scheduledStartTimeStr = scheduleData[SCHEDULE_START_TIME_FIELD]; // e.g., "09:00"
'
                if (scheduledStartTimeStr && typeof scheduledStartTimeStr === 'string' && /^[0-2][0-9]:[0-5][0-9]$/.test(scheduledStartTimeStr)) {'
                    const [schedHours, schedMinutes] = scheduledStartTimeStr.split(':').map(Number);

                    // Get clock-in time (hours and minutes) from our approximate server time
                    const clockInHours = approxServerDate.getHours();
                    const clockInMinutes = approxServerDate.getMinutes();

                    logger.info(`Comparing ClockIn Time (${clockInHours}:${clockInMinutes}) with Scheduled Start (${schedHours}:${schedMinutes})`);
'
                    let determinedStatus = '準時'; // Default to on time
                    if (clockInHours > schedHours || (clockInHours === schedHours && clockInMinutes > schedMinutes)) {'
                        determinedStatus = '遲到'; // Strictly later than scheduled time
                    }

                    clockRecordData.status = determinedStatus; // Add status field
                    logger.info(`Determined clock-in status for ${userId} as: ${determinedStatus}`);
                } else {'
                    logger.warn(`Could not parse scheduled startTime '${scheduledStartTimeStr}' for user ${userId} on ${clockInDateStr}. Status not set.`);
                }
            } else {
                logger.warn(`No schedule found for user ${userId} on ${clockInDateStr}. Status not set.`);
            }
        } catch (error) {
            logger.error(`Error checking schedule during clock-in for user ${userId}:`, error);
            // Proceed without status if schedule check fails
        }
    }

    // 6. 寫入 Firestore (Now potentially includes status)
    try {
        // Write the clock record'
        const recordRef = await db.collection('clock_records').add(clockRecordData);'
        logger.info(`Successfully recorded ${determinedAction} for ${userId}. Record ID: ${recordRef.id}. Status: ${clockRecordData.status || 'N/A'}`);

        // Optionally update employee document with last clock action and timestamp'
        const employeeRef = db.collection('employees').doc(userId);
        const updateData = {
            lastClockAction: determinedAction,
            [`last${determinedAction.charAt(0).toUpperCase() + determinedAction.slice(1)}Timestamp`]: serverTimestamp // Use the actual server timestamp here
        };
        await employeeRef.set(updateData, { merge: true });
        logger.info(`Updated employee status for ${userId}.`);

        // 7. 返回成功響應給前端'
        return { status: 'success', action: determinedAction };

    } catch (error) {
        logger.error(`Error writing clock record or updating employee for ${userId}:`, error);'
        throw new HttpsError('internal', '寫入打卡記錄或更新員工狀態時出錯。');
    }
});

// --- 新增：輔助函數：計算距離 (Haversine) ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
        return Infinity; // Cannot calculate if coordinates are missing
    }
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

// --- 新增：解析半徑設定的輔助函數 (Server-side version) ---
function parseGeofenceRadiiServer(radiiString) {
    const radii = {};'
    if (!radiiString || typeof radiiString !== 'string') return radii;
'
    radiiString.split(';').forEach(part => {
        part = part.trim();
        if (!part) return;
        const match = part.match(/^([^0-9]+)(\d+)?$/);
        if (match) {
            const storeName = match[1].trim();
            const radiusValue = match[2] ? parseInt(match[2], 10) : UNLIMITED_RADIUS_SERVER;
            if (storeName) {
                 radii[storeName] = isNaN(radiusValue) ? UNLIMITED_RADIUS_SERVER : radiusValue;
            }
        } else if (/^[^0-9]+$/.test(part)) {
             const storeName = part.trim();
             if(storeName) radii[storeName] = UNLIMITED_RADIUS_SERVER;
        }
    });
    return radii;
}

// --- 新增：解析營業時間設定的輔助函數 (Server-side version) ---
function parseOperatingHoursServer(hoursString) {
    const hours = {};'
    if (!hoursString || typeof hoursString !== 'string') return hours;
'
    hoursString.split(';').forEach(part => {
        part = part.trim();
        if (!part) return;
        const firstDigitIndex = part.search(/\d/);'
        let storeName = '';'
        let timeRangesStr = '';
        if (firstDigitIndex > 0) {
             storeName = part.substring(0, firstDigitIndex).trim();
             timeRangesStr = part.substring(firstDigitIndex).trim();
        } else if (firstDigitIndex === -1 && /^[^,;-]+$/.test(part)){
             storeName = part.trim();'
             timeRangesStr = '';
        } else {
             return;
        }
        if (!storeName) return;
        const timeRanges = [];
        if (timeRangesStr) {'
            timeRangesStr.split(',').forEach(rangeStr => {
                rangeStr = rangeStr.trim();'
                const times = rangeStr.split('-');
                if (times.length === 2) {
                    const startStr = times[0].trim();
                    const endStr = times[1].trim();
                    if (/^\d{4}$/.test(startStr) && /^\d{4}$/.test(endStr)) {
                        try {
                             const startH = parseInt(startStr.substring(0, 2), 10);
                             const startM = parseInt(startStr.substring(2, 4), 10);
                             const endH = parseInt(endStr.substring(0, 2), 10);
                             const endM = parseInt(endStr.substring(2, 4), 10);
                             if (startH >= 0 && startH < 24 && startM >= 0 && startM < 60 &&
                                 endH >= 0 && endH < 24 && endM >= 0 && endM < 60) {
                                timeRanges.push({ start: { hours: startH, minutes: startM }, end: { hours: endH, minutes: endM } });"
                             } else { logger.warn(`Invalid time range values in "${rangeStr}" for store "${storeName}"`); }"
                        } catch (e) { logger.warn(`Error parsing time range "${rangeStr}" for store "${storeName}":`, e); }"
                    } else { logger.warn(`Invalid HHMM format in "${rangeStr}" for store "${storeName}"`); }"'
                } else { logger.warn(`Invalid time range format (no '-') in "${rangeStr}" for store "${storeName}"`); }
            });
        }
         hours[storeName] = timeRanges;
    });
    return hours;
}

// --- 新增：檢查是否在營業時間內的函數 (Server-side version, uses JS Date) ---
function isWithinOperatingHoursServer(storeHoursList) {
     if (!storeHoursList || storeHoursList.length === 0) {
         return true; // No hours defined = always allowed
     }
'
     const now = new Date(); // Server's current time
     const currentMinutes = now.getHours() * 60 + now.getMinutes();

     for (const range of storeHoursList) {
         const startMinutes = range.start.hours * 60 + range.start.minutes;
         let endMinutes = range.end.hours * 60 + range.end.minutes;
         if (endMinutes < startMinutes) { // Overnight range
             if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
                 return true;
             }
         } else { // Normal range
             if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                 return true;
             }
         }
     }
     return false; // Not within any range
}

// --- End of New Helpers ---

// --- ADDED: Server-side parser for storeListString --- 
function parseStoreListStringServer(storeString) {
     const locations = [];'
     if (!storeString || typeof storeString !== 'string') return locations;'
     storeString.split(';').forEach(part => {
          part = part.trim();
          if (!part) return;'
          const eqIndex = part.indexOf('=');
          if (eqIndex === -1) return;
          const namePart = part.substring(0, eqIndex).trim();
          const coordsPart = part.substring(eqIndex + 1).trim();
          const nameMatch = namePart.match(/^([^0-9]+)/);
          const storeName = nameMatch ? nameMatch[1].trim() : namePart;'
          const coords = coordsPart.split(',');
          if (coords.length === 2) {
               const lat = parseFloat(coords[0].trim());
               const lon = parseFloat(coords[1].trim());
               if (!isNaN(lat) && !isNaN(lon) && storeName) {
                    locations.push({ id: storeName, name: storeName, latitude: lat, longitude: lon });
               }
          }
     });
     return locations;
}
// --- End of Added Helper ---

/**
 * Main function to check a single condition. Routes based on type.
 * Called by evaluateTaskForEmployee.
 *
 * Determines the evaluation month string (YYYY-MM) based on config.
 * @param {object} evaluationConfig - The evaluation config object from the bonus task.'
 * @returns {string|null} - YYYY-MM string or null if config is invalid or type isn't MONTHLY.
 */
function getEvaluationMonthString(evaluationConfig) {'
    if (!evaluationConfig || evaluationConfig.triggerType !== 'MONTHLY') {"
        logger.warn("Cannot get evaluation month: Invalid config or triggerType is not MONTHLY.", { evaluationConfig });
        return null;
    };
try {
        const currentDate = new Date();
        // If we have a specific month in the config, use it
        if (evaluationConfig.targetMonth) {
            return evaluationConfig.targetMonth;
        }
        
        // Otherwise calculate from the current date'
        const targetMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        logger.info(`Using current month for evaluation: ${targetMonth}`);
        return targetMonth;
    } catch (error) {"
        logger.error("Error determining evaluation month:", error);
        return null;
    }
}

/**
 * Function to check a single condition. Routes based on type.
 * Called by evaluateTaskForEmployee.
 * @param {string} userId - The employee ID
 * @param {object} condition - The condition to check
 * @param {object} taskData - Additional task data
 * @returns {object} Result containing condition, passed flag, and dataValue
 */
function checkSingleCondition(userId, condition, taskData) {
    if (!condition || !condition.type) {
        logger.error(`Invalid condition for user ${userId}:`, condition);'
        return { condition, passed: false, dataValue: null, error: 'Invalid condition format' };
    }

    let result;
    try {
        switch (condition.type) {'
            case 'ATTENDANCE':
                result = checkAttendanceCondition(userId, condition, taskData);
                break;'
            case 'SALES':
                result = checkSalesCondition(userId, condition, taskData);
                break;
            default:"
                logger.warn(`Unsupported condition type "${condition.type}" for user ${userId}`);'
                result = { condition, passed: false, dataValue: null, error: 'Unsupported condition type' };
        }
    } catch (error) {
        logger.error(`Error checking condition for user ${userId}:`, error, { condition });
        result = { condition, passed: false, dataValue: null, error: error.message };
    }
    
    logger.info(`Condition check final result for user ${userId}:`, result);
    return result; // Return the object containing condition, passed, and dataValue
}

/**
 * Scheduled function to calculate monthly payrolls.
 * Triggered at the end of each month to process all active employees.
 */
exports.calculatePayrollScheduled = onSchedule({"
    schedule: "0 1 1 * *", // Runs at 1:00 AM on the 1st day of each month"
    timeZone: "Asia/Taipei",
    timeoutSeconds: 540, // Max timeout for scheduled functions'
    memory: '1GiB' // Adjust memory if needed
}, async (event) => {"
    logger.info("Starting scheduled payroll calculation run...");
    const startTime = Date.now();
    
    try {
        // 獲取上個月的 YYYY-MM 格式
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month'
        const targetMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
        
        logger.info(`Calculating payroll for month: ${targetMonth}`);
        await runPayrollCalculation(targetMonth);
        
        const duration = Date.now() - startTime;
        logger.info(`Payroll calculation completed in ${duration}ms for month ${targetMonth}`);
        await logActivity({ '
            userId: 'system', '
            feature: 'Payroll', '
            action: 'calculatePayrollScheduledComplete', 
            details: `Calculated payroll for month ${targetMonth} in ${duration}ms`, 
            success: true 
        });
    } catch (error) {
        const duration = Date.now() - startTime;"
        logger.error("Critical error during payroll calculation: ", error);
        await logActivity({ ', userId: 'system', '
            feature: 'Payroll', '
            action: 'calculatePayrollScheduledError', 
            details: `Failed after ${duration}ms: ${error.message}`, 
            success: false 
        });
    }
});

/**
 * Main function to calculate payroll for all employees for a specific month.'
 * @param {string} targetMonth - The target month in format 'YYYY-MM'.
 * @returns {Promise<void>}
 */
async function runPayrollCalculation(targetMonth) {
    // 解析目標月份'
    const [year, month] = targetMonth.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
        logger.error(`Invalid target month format: ${targetMonth}`);
        throw new Error(`Invalid target month format: ${targetMonth}`);
    }
    
    // 設定月份的開始和結束日期
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0); // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
    
    logger.info(`Calculating payroll for period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // 1. 獲取薪資配置
    const payrollConfig = await getPayrollConfig();
    if (!payrollConfig) {"
        throw new Error("Failed to retrieve payroll configuration");
    }
    
    // 2. 獲取所有活躍員工'
    const employeesSnapshot = await db.collection('employees')'
        .where('isActive', '==', true)
        .get();
    
    if (employeesSnapshot.empty) {"
        logger.info("No active employees found.");
        return;
    }
    
    logger.info(`Found ${employeesSnapshot.size} active employees for payroll calculation.`);
    
    // 3. 批次處理每個員工
    const batchSize = 10; // 同時處理的員工數量
    const employees = [];
    employeesSnapshot.forEach(doc => {
        employees.push({ id: doc.id, ...doc.data() });
    });
    
    for (let i = 0; i < employees.length; i += batchSize) {
        const batch = employees.slice(i, i + batchSize);
        await Promise.all(batch.map(employee => 
            calculateEmployeePayroll(employee, targetMonth, startDate, endDate, payrollConfig)
        ));
        logger.info(`Processed ${Math.min(i + batchSize, employees.length)} of ${employees.length} employees`);
    }
}

/**
 * Get payroll configuration from Firestore.
 * @returns {Promise<object|null>} - Payroll configuration or null if not found.
 */
async function getPayrollConfig() {
    try {'
        const configDoc = await db.collection('settings').doc('payroll_config').get();
        if (!configDoc.exists) {"
            logger.warn("Payroll configuration not found, using defaults");
            return {
                defaultHourlyRate: 200, // 預設時薪 (TWD)
                overtimeMultiplier: 1.33, // 加班費倍率
                laborInsuranceRate: 0.2, // 勞保費率 (20%)
                healthInsuranceRate: 0.0469 // 健保費率 (4.69%)
            };
        }
        return configDoc.data();
    } catch (error) {"
        logger.error("Error retrieving payroll configuration:", error);
        return null;
    }
}

/**
 * Calculate payroll for a single employee.
 * @param {object} employee - Employee data.'
 * @param {string} targetMonth - Target month in format 'YYYY-MM'.
 * @param {Date} startDate - Start date of the month.
 * @param {Date} endDate - End date of the month.
 * @param {object} payrollConfig - Payroll configuration.
 * @returns {Promise<void>}
 */
async function calculateEmployeePayroll(employee, targetMonth, startDate, endDate, payrollConfig) {
    const employeeId = employee.id;
    const employeeName = employee.displayName || employee.name || employeeId;
    logger.info(`Calculating payroll for employee: ${employeeName} (${employeeId}) for ${targetMonth}`);
    
    try {
        // 1. 獲取出勤數據
        const attendanceSummary = await calculateAttendanceSummary(employeeId, startDate, endDate);
        
        // 2. 獲取休假數據
        const leaveSummary = await calculateLeaveSummary(employeeId, startDate, endDate);
        
        // 3. 獲取獎金數據
        const bonusSummary = await calculateBonusSummary(employeeId, targetMonth);
        
        // 4. 計算薪資
        // 基本工資
        const baseHourlyRate = employee.hourlyRate || payrollConfig.defaultHourlyRate;
        const baseSalaryPay = attendanceSummary.regularHours * baseHourlyRate;
        
        // 加班費
        const overtimeRate = baseHourlyRate * payrollConfig.overtimeMultiplier;
        const overtimePay = attendanceSummary.overtimeHours * overtimeRate;
        
        // 總工資
        const totalSalary = baseSalaryPay + overtimePay + bonusSummary.totalBonus;
        
        // 扣除項目 (勞保、健保等)
        const laborInsurance = totalSalary * payrollConfig.laborInsuranceRate;
        const healthInsurance = totalSalary * payrollConfig.healthInsuranceRate;
        const totalDeductions = laborInsurance + healthInsurance;
        
        // 淨工資
        const netSalary = totalSalary - totalDeductions;
        
        // 5. 儲存計算結果
        await savePayrollRecord(employeeId, targetMonth, {
            employeeId,
            employeeName,
            targetMonth,
            calculatedAt: new Date(),
            attendance: attendanceSummary,
            leave: leaveSummary,
            bonus: bonusSummary,
            salary: {
                baseHourlyRate,
                baseSalaryPay,
                overtimePay,
                totalSalary,
                deductions: {
                    laborInsurance,
                    healthInsurance,
                    totalDeductions
                },
                netSalary
            }
        });
        
        logger.info(`Completed payroll calculation for ${employeeName} (${employeeId}): ${netSalary} TWD`);
    } catch (error) {
        logger.error(`Error calculating payroll for employee ${employeeId}:`, error);
        throw error;
    }
}

/**
 * Save payroll record to Firestore.
 * @param {string} employeeId - Employee ID.'
 * @param {string} targetMonth - Target month in format 'YYYY-MM'.
 * @param {object} payrollData - Calculated payroll data.
 * @returns {Promise<void>}
 */
async function savePayrollRecord(employeeId, targetMonth, payrollData) {
    try {'
        const payrollRef = db.collection('payrolls').doc(`${employeeId}_${targetMonth}`);
        await payrollRef.set(payrollData, { merge: true });
        logger.info(`Saved payroll record for employee ${employeeId} for month ${targetMonth}`);
    } catch (error) {
        logger.error(`Error saving payroll record for employee ${employeeId}:`, error);
        throw error;
    }
}

/**
 * Calculate attendance summary for an employee.
 * @param {string} employeeId - Employee ID.
 * @param {Date} startDate - Start date of the month.
 * @param {Date} endDate - End date of the month.
 * @returns {Promise<Object>} - Attendance summary.
 */
async function calculateAttendanceSummary(employeeId, startDate, endDate) {
    try {
        logger.info(`Calculating attendance summary for employee ${employeeId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
        
        // 查詢出勤記錄'
        const clockRecordsQuery = db.collection('clock_records')'
                                 .where('userId', '==', employeeId)'
                                 .where('timestamp', '>=', startDate)'
                                 .where('timestamp', '<=', endDate);
        const clockRecordsSnapshot = await clockRecordsQuery.get();
        const clockRecords = [];
        clockRecordsSnapshot.forEach(doc => clockRecords.push(doc.data()));
        
        // 查詢排班記錄'
        const scheduleQuery = db.collection('schedules')'
                           .where('userId', '==', employeeId)'
                           .where('date', '>=', startDate.toISOString().split('T')[0])'
                           .where('date', '<=', endDate.toISOString().split('T')[0]);
        const scheduleSnapshot = await scheduleQuery.get();
        const scheduleRecords = [];
        scheduleSnapshot.forEach(doc => scheduleRecords.push(doc.data()));
        
        // 計算指標
        let regularHours = 0;
        let overtimeHours = 0;
        let lateCount = 0;
        let absenceDays = 0;
        let onTimeCount = 0;
        let totalWorkDays = 0;
        
        // 建立排班工作日映射
        const scheduledWorkDaysMap = new Map();
        const clockedDaysMap = new Map();
        
        scheduleRecords.forEach(schedule => {'
            if (schedule.shift !== '休') {
                totalWorkDays++;
                scheduledWorkDaysMap.set(schedule.date, {
                    shift: schedule.shift,
                    store: schedule.store
                });
            }
        });
        
        // 處理打卡記錄
        clockRecords.forEach(record => {
            try {
                const recordTimestamp = record.timestamp;
                if (recordTimestamp && recordTimestamp.toDate) {
                    const recordDate = recordTimestamp.toDate();'
                    const recordDateStr = recordDate.toISOString().split('T')[0];
                    
                    if (!clockedDaysMap.has(recordDateStr)) {
                        clockedDaysMap.set(recordDateStr, []);
                    }
                    clockedDaysMap.get(recordDateStr).push(record);
                    
                    // 計算遲到和準時
                    if (scheduledWorkDaysMap.has(recordDateStr)) {
                        // 判斷遲到或準時'
                        if (record.status === '遲到') {
                            lateCount++;'
                        } else if (record.status === '準時') {
                            onTimeCount++;
                        }
                        
                        // 計算工時（假設每個班次8小時）
                        const shiftHours = 8; // 基本工時，可以根據班次不同調整
                        regularHours += shiftHours;
                        
                        // 計算加班時間（如果有）
                        if (record.overtimeHours) {
                            overtimeHours += parseFloat(record.overtimeHours);
                        }
                    }
                }
            } catch (e) {
                logger.warn(`Error processing clock record for attendance summary: ${e.message}`, e);
            }
        });
        
        // 計算缺勤天數
        scheduledWorkDaysMap.forEach((shiftInfo, dateStr) => {
            if (!clockedDaysMap.has(dateStr)) {
                absenceDays++;
            }
        });
        
        // 計算出勤率
        const onTimeRate = totalWorkDays > 0 ? onTimeCount / totalWorkDays : 0;
        
        // 構建並返回摘要
        const summary = {
            totalWorkDays,
            regularHours,
            overtimeHours,
            lateCount,
            absenceDays,
            onTimeCount,
            onTimeRate,
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            }
        };
        
        logger.info(`Completed attendance summary calculation for ${employeeId}: ${JSON.stringify(summary)}`);
        return summary;
    } catch (error) {
        logger.error(`Error calculating attendance summary for employee ${employeeId}:`, error);
        // 返回預設值以避免系統崩潰
        return {
            totalWorkDays: 0,
            regularHours: 0,
            overtimeHours: 0,
            lateCount: 0,
            absenceDays: 0,
            onTimeCount: 0,
            onTimeRate: 0,
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            },
            error: error.message
        };
    }
}

/**
 * Calculate leave summary for an employee.
 * @param {string} employeeId - Employee ID.
 * @param {Date} startDate - Start date of the month.
 * @param {Date} endDate - End date of the month.
 * @returns {Promise<Object>} - Leave summary.
 */
async function calculateLeaveSummary(employeeId, startDate, endDate) {
    try {
        logger.info(`Calculating leave summary for employee ${employeeId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
        '
        const startDateStr = startDate.toISOString().split('T')[0];'
        const endDateStr = endDate.toISOString().split('T')[0];'
        const monthStr = startDateStr.substring(0, 7); // 'YYYY-MM'
        
        // 查詢請假記錄'
        const leaveRequestsQuery = db.collection('leave_requests')'
                                .where('employeeId', '==', employeeId)'
                                .where('month', '==', monthStr);
        const leaveRequestsSnapshot = await leaveRequestsQuery.get();
        
        // 如果沒有請假記錄，返回預設值
        if (leaveRequestsSnapshot.empty) {
            return {
                totalLeaveDays: 0,
                leaveTypes: {},
                leaveDates: [],
                period: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }
            };
        }
        
        // 處理請假記錄
        let totalLeaveDays = 0;
        const leaveTypes = {};
        const leaveDates = [];
        
        leaveRequestsSnapshot.forEach(doc => {
            const leaveRequest = doc.data();
            const selectedDates = leaveRequest.selected_dates || [];
            
            // 只計算在目標月份內的請假日期
            const validDates = selectedDates.filter(dateStr => 
                dateStr >= startDateStr && dateStr <= endDateStr
            );
            
            totalLeaveDays += validDates.length;
            leaveDates.push(...validDates);
            
            // 統計請假類型'
            const leaveType = leaveRequest.leave_type || '一般假';
            leaveTypes[leaveType] = (leaveTypes[leaveType] || 0) + validDates.length;
        });
        
        // 構建並返回摘要
        const summary = {
            totalLeaveDays,
            leaveTypes,
            leaveDates,
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            }
        };
        
        logger.info(`Completed leave summary calculation for ${employeeId}: ${JSON.stringify(summary)}`);
        return summary;
    } catch (error) {
        logger.error(`Error calculating leave summary for employee ${employeeId}:`, error);
        // 返回預設值以避免系統崩潰
        return {
            totalLeaveDays: 0,
            leaveTypes: {},
            leaveDates: [],
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            },
            error: error.message
        };
    }
}

/**
 * Calculate bonus summary for an employee.
 * @param {string} employeeId - Employee ID.'
 * @param {string} targetMonth - Target month in format 'YYYY-MM'.
 * @returns {Promise<Object>} - Bonus summary.
 */
async function calculateBonusSummary(employeeId, targetMonth) {
    try {
        logger.info(`Calculating bonus summary for employee ${employeeId} for month ${targetMonth}`);
        
        // 查詢獎金記錄
        const progressDocId = `${employeeId}_${targetMonth}`;'
        const progressDoc = await db.collection('employee_bonus_progress').doc(progressDocId).get();
        
        // 如果沒有獎金記錄，返回預設值
        if (!progressDoc.exists) {
            return {
                totalBonus: 0,
                bonusItems: [],
                targetMonth
            };
        }
        
        // 處理獎金記錄
        const progressData = progressDoc.data();
        const tasks = progressData.tasks || [];
        let totalBonus = 0;
        const bonusItems = [];
        
        tasks.forEach(taskResult => {'
            if (taskResult.status === 'PASSED' && typeof taskResult.rewardEarned === 'number') {
                totalBonus += taskResult.rewardEarned;
                bonusItems.push({
                    taskId: taskResult.taskId,
                    taskName: taskResult.taskName,
                    reward: taskResult.rewardEarned,
                    evaluationDate: taskResult.evaluationDate
                });
            }
        });
        
        // 構建並返回摘要
        const summary = {
            totalBonus,
            bonusItems,
            targetMonth
        };
        
        logger.info(`Completed bonus summary calculation for ${employeeId}: ${JSON.stringify(summary)}`);
        return summary;
    } catch (error) {
        logger.error(`Error calculating bonus summary for employee ${employeeId}:`, error);
        // 返回預設值以避免系統崩潰
        return {
            totalBonus: 0,
            bonusItems: [],
            targetMonth,
            error: error.message
        };
    }"'
}