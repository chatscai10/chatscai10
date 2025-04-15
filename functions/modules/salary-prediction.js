/**
 * salary-prediction.js - 薪資預測功能模組
 * 
 * 此模組包含薪資預測相關功能，包括測試數據生成和清除功能
 * 模組化設計，便於維護和拓展
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { FieldValue } = require("firebase-admin/firestore");

// 確保Firebase Admin已初始化
let db;
try {
    db = admin.firestore();
} catch (e) {
    // 模組被引入時可能已經初始化，不需要處理
}

/**
 * 記錄活動日誌的輔助函數
 * @param {Object} logData - 日誌數據
 */
async function logActivity(logData) {
    try {
        if (!logData.userId || !logData.feature || !logData.action) {
            logger.warn('logActivity called with missing required fields', {
                providedFields: Object.keys(logData)
            });
        }

        const logEntry = {
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userId: logData.userId || 'system',
            userName: logData.userName || null,
            feature: logData.feature || 'SalaryPrediction',
            action: logData.action || 'Unknown',
            details: logData.details || null,
            success: logData.success === undefined ? null : Boolean(logData.success)
        };

        await admin.firestore().collection('activity_logs').add(logEntry);
    } catch (error) {
        logger.error("Failed to write activity log:", { error: error.message, logData });
    }
}

/**
 * Generate test data for salary prediction
 * Only available to administrators
 */
exports.generateSalaryPredictionTestData = async (request) => {
  try {
    // Validate user permissions - admin only
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Check if user is admin
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    // Get request data
    const {
      employeeId,
      storeId,
      startYear,
      startMonth,
      recordCount,
      baseSalary,
      employeeLevel,
      variationFactor
    } = request.data;

    // Validate parameters
    if (!employeeId || !storeId || !startYear || !startMonth || !recordCount) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    // Verify employee and store exist
    const employeeDoc = await db.collection('employees').doc(employeeId).get();
    const storeDoc = await db.collection('stores').doc(storeId).get();

    if (!employeeDoc.exists) {
      throw new HttpsError('not-found', 'Employee not found');
    }
    if (!storeDoc.exists) {
      throw new HttpsError('not-found', 'Store not found');
    }

    // Set default values
    const defaultBaseSalary = baseSalary || 30000;
    const defaultVariationFactor = variationFactor || 0.15;
    const defaultEmployeeLevel = employeeLevel || 1;

    // Prepare batch write
    const batch = db.batch();
    const salaryRecords = [];

    // Adjust base salary by employee level
    let actualBaseSalary = defaultBaseSalary;
    if (defaultEmployeeLevel === 2) {
      actualBaseSalary = defaultBaseSalary * 1.2;
    } else if (defaultEmployeeLevel === 3) {
      actualBaseSalary = defaultBaseSalary * 1.5;
    }

    // Generate test data
    for (let i = 0; i < recordCount; i++) {
      // Calculate year and month
      let year = parseInt(startYear);
      let month = parseInt(startMonth) + i;
      
      // Adjust month overflow
      while (month > 12) {
        month -= 12;
        year += 1;
      }

      // Generate random factors
      const attendanceRate = 0.85 + Math.random() * 0.15; // 85% - 100%
      const performanceScore = 3 + Math.random() * 2; // 3.0 - 5.0
      const salesAchievement = 0.8 + Math.random() * 0.4; // 80% - 120%
      
      // Calculate base variation
      const randomVariation = 1 + (Math.random() * 2 - 1) * defaultVariationFactor;
      
      // Calculate performance bonuses
      const performanceBonus = Math.floor(actualBaseSalary * 0.1 * (performanceScore / 5) * randomVariation);
      const salesBonus = Math.floor(actualBaseSalary * 0.15 * salesAchievement * randomVariation);
      
      // Calculate attendance bonus
      const attendanceBonus = Math.floor(actualBaseSalary * 0.05 * attendanceRate);
      
      // Calculate overtime pay
      const overtimeHours = Math.floor(Math.random() * 20); // 0-20 hours
      const overtimePay = Math.floor((actualBaseSalary / 160) * 1.5 * overtimeHours);
      
      // Calculate total salary
      const totalSalary = Math.floor(actualBaseSalary + performanceBonus + salesBonus + attendanceBonus + overtimePay);
      
      // Create salary record
      const recordId = `${employeeId}_${storeId}_${year}_${month}`;
      const salaryRecord = {
        employeeId,
        storeId,
        year,
        month,
        baseSalary: actualBaseSalary,
        attendanceRate,
        performanceScore,
        salesAchievement,
        performanceBonus,
        salesBonus,
        attendanceBonus,
        overtimeHours,
        overtimePay,
        totalSalary,
        isTestData: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid
      };
      
      // Add to batch write
      const docRef = db.collection('salary_records').doc(recordId);
      batch.set(docRef, salaryRecord);
      salaryRecords.push(salaryRecord);
    }
    
    // Execute batch write
    await batch.commit();
    
    logger.info(`Admin ${uid} generated ${recordCount} salary test records for employee: ${employeeId}, store: ${storeId}`);
    
    return {
      success: true,
      count: recordCount,
      message: `Successfully generated ${recordCount} salary test records`,
      records: salaryRecords
    };
  } catch (error) {
    logger.error('Failed to generate salary test data:', error);
    throw new HttpsError('internal', `Test data generation failed: ${error.message}`);
  }
};

/**
 * Clear salary prediction test data
 * Only available to administrators
 */
exports.clearSalaryPredictionTestData = async (request) => {
  try {
    // Validate user permissions - admin only
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Check if user is admin
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    // Get optional filter conditions from request
    const { employeeId, storeId, year, month } = request.data || {};

    // Build query
    let query = db.collection('salary_records').where('isTestData', '==', true);
    
    // Apply optional filters
    if (employeeId) {
      query = query.where('employeeId', '==', employeeId);
    }
    if (storeId) {
      query = query.where('storeId', '==', storeId);
    }
    if (year) {
      query = query.where('year', '==', parseInt(year));
    }
    if (month) {
      query = query.where('month', '==', parseInt(month));
    }
    
    // Get matching documents
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return {
        success: true,
        count: 0,
        message: 'No matching test data records found'
      };
    }
    
    // Prepare batch delete
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Execute batch delete
    await batch.commit();
    
    const count = snapshot.size;
    logger.info(`Admin ${uid} deleted ${count} salary test records`);
    
    return {
      success: true,
      count,
      message: `Successfully deleted ${count} salary test records`
    };
  } catch (error) {
    logger.error('Failed to clear salary test data:', error);
    throw new HttpsError('internal', `Test data clearing failed: ${error.message}`);
  }
};

// 匯出所有函數的單一物件
module.exports = {
    generateSalaryPredictionTestData: exports.generateSalaryPredictionTestData,
    clearSalaryPredictionTestData: exports.clearSalaryPredictionTestData
}; 