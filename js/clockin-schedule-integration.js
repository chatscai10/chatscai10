// js/clockin-schedule-integration.js - 打卡與排班系統整合邏輯

'use strict';

/**
 * ClockIn-Schedule Integration Module
 * 
 * 此模組負責打卡系統與排班系統之間的數據整合，確保兩個系統間數據流暢、一致。
 * 主要功能包括：
 * 1. 在打卡時檢查排班資料
 * 2. 計算出勤統計數據（準時率、缺勤次數等）
 * 3. 自動標記遲到、早退狀態
 * 4. 為管理報表提供整合數據
 */

// --- 全域常數 ---
const STATUS_ON_TIME = 'on_time';       // 準時
const STATUS_LATE = 'late';             // 遲到
const STATUS_EARLY_LEAVE = 'early_leave'; // 早退
const STATUS_ABSENT = 'absent';         // 缺勤
const STATUS_UNSCHEDULED = 'unscheduled'; // 未排班打卡
const STATUS_NO_CLOCK_OUT = 'no_clock_out'; // 未打下班卡

// 寬限時間（分鐘）- 超出此時間才標記為遲到/早退
const DEFAULT_GRACE_PERIOD_MINUTES = 5;

// --- 排班檢查功能 ---

/**
 * 檢查員工在指定日期的排班狀態
 * @param {Object} db - Firestore 實例
 * @param {string} userId - 員工ID
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @param {string} storeId - 分店ID
 * @returns {Promise<Object|null>} 排班信息或 null（若無排班）
 */
async function checkEmployeeSchedule(db, userId, dateStr, storeId) {
    if (!db || !userId || !dateStr) {
        console.error('checkEmployeeSchedule: Missing required parameters');
        return null;
    }

    try {
        // 1. 先檢查精確的員工排班記錄
        const scheduleRef = db.collection('schedules')
            .where('date', '==', dateStr)
            .where('userId', '==', userId)
            .limit(1);
        
        let scheduleSnapshot = await scheduleRef.get();
        
        // 2. 如果沒找到精確記錄，查看日期的整體排班表
        if (scheduleSnapshot.empty) {
            const dateScheduleRef = db.collection('schedules').doc(dateStr);
            const dateScheduleSnap = await dateScheduleRef.get();
            
            if (dateScheduleSnap.exists) {
                const scheduleData = dateScheduleSnap.data();
                // 檢查此員工是否在排班中 (確認數據結構)
                if (scheduleData.shifts && scheduleData.shifts[userId]) {
                    return {
                        userId: userId,
                        date: dateStr,
                        storeId: scheduleData.shifts[userId].storeId || storeId,
                        shiftType: scheduleData.shifts[userId].shiftType || 'regular',
                        startTime: scheduleData.shifts[userId].startTime,
                        endTime: scheduleData.shifts[userId].endTime,
                        source: 'date_schedule'
                    };
                }
                
                // 如果有分店特定排班，也檢查
                if (scheduleData.storeShifts && 
                    scheduleData.storeShifts[storeId] && 
                    scheduleData.storeShifts[storeId].employees && 
                    scheduleData.storeShifts[storeId].employees.includes(userId)) {
                    
                    return {
                        userId: userId,
                        date: dateStr,
                        storeId: storeId,
                        shiftType: scheduleData.storeShifts[storeId].shiftType || 'regular',
                        startTime: scheduleData.storeShifts[storeId].startTime,
                        endTime: scheduleData.storeShifts[storeId].endTime,
                        source: 'store_schedule'
                    };
                }
            }
            
            return null; // 無排班記錄
        }
        
        // 找到了精確的排班記錄
        const scheduleData = scheduleSnapshot.docs[0].data();
        return {
            userId: userId,
            date: dateStr,
            storeId: scheduleData.storeId || storeId,
            shiftType: scheduleData.shiftType || 'regular',
            startTime: scheduleData.startTime,
            endTime: scheduleData.endTime,
            source: 'employee_schedule'
        };
        
    } catch (error) {
        console.error('Error checking employee schedule:', error);
        return null;
    }
}

/**
 * 計算打卡狀態（準時/遲到/早退）
 * @param {Object} clockInTime - 上班打卡時間
 * @param {Object} clockOutTime - 下班打卡時間 (可選)
 * @param {Object} schedule - 排班信息
 * @param {number} gracePeriodMinutes - 寬限時間(分鐘)
 * @returns {Object} 包含狀態和詳細信息的對象
 */
function calculateClockStatus(clockInTime, clockOutTime, schedule, gracePeriodMinutes = DEFAULT_GRACE_PERIOD_MINUTES) {
    if (!clockInTime || !schedule || !schedule.startTime) {
        return { status: STATUS_UNSCHEDULED, details: '無法計算狀態：缺少必要數據' };
    }
    
    // 解析排班開始時間和結束時間
    const scheduledStartParts = schedule.startTime.split(':');
    const scheduledStartHour = parseInt(scheduledStartParts[0], 10);
    const scheduledStartMinute = parseInt(scheduledStartParts[1], 10);
    
    // 計算排班開始時間的 Date 對象（使用打卡日期）
    const clockInDate = clockInTime.toDate();
    const scheduledStartTime = new Date(
        clockInDate.getFullYear(),
        clockInDate.getMonth(),
        clockInDate.getDate(),
        scheduledStartHour,
        scheduledStartMinute
    );
    
    // 計算寬限時間後的遲到臨界點
    const lateThreshold = new Date(scheduledStartTime.getTime() + gracePeriodMinutes * 60000);
    
    // 檢查是否遲到
    const isLate = clockInTime.toDate() > lateThreshold;
    
    // 如果有下班打卡，檢查是否早退
    let isEarlyLeave = false;
    if (clockOutTime && schedule.endTime) {
        const scheduledEndParts = schedule.endTime.split(':');
        const scheduledEndHour = parseInt(scheduledEndParts[0], 10);
        const scheduledEndMinute = parseInt(scheduledEndParts[1], 10);
        
        // 計算排班結束時間
        const clockOutDate = clockOutTime.toDate();
        const scheduledEndTime = new Date(
            clockOutDate.getFullYear(),
            clockOutDate.getMonth(),
            clockOutDate.getDate(),
            scheduledEndHour,
            scheduledEndMinute
        );
        
        // 計算早退臨界點
        const earlyLeaveThreshold = new Date(scheduledEndTime.getTime() - gracePeriodMinutes * 60000);
        
        // 檢查是否早退
        isEarlyLeave = clockOutTime.toDate() < earlyLeaveThreshold;
    }
    
    // 根據遲到/早退狀態返回結果
    if (isLate && isEarlyLeave) {
        return { 
            status: STATUS_LATE, // 優先標記為遲到
            details: '遲到且早退', 
            lateMinutes: Math.floor((clockInTime.toDate() - scheduledStartTime) / 60000),
            earlyLeaveMinutes: clockOutTime ? Math.floor((scheduledEndTime - clockOutTime.toDate()) / 60000) : 0
        };
    } else if (isLate) {
        return { 
            status: STATUS_LATE, 
            details: '遲到', 
            lateMinutes: Math.floor((clockInTime.toDate() - scheduledStartTime) / 60000)
        };
    } else if (isEarlyLeave) {
        return { 
            status: STATUS_EARLY_LEAVE, 
            details: '早退',
            earlyLeaveMinutes: Math.floor((scheduledEndTime - clockOutTime.toDate()) / 60000)
        };
    } else {
        return { 
            status: STATUS_ON_TIME, 
            details: '準時'
        };
    }
}

/**
 * 找出未打卡的員工
 * @param {Object} db - Firestore 實例
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @param {string} storeId - 分店ID (可選，如不提供則檢查所有分店)
 * @returns {Promise<Array>} 未打卡員工的ID與詳細信息
 */
async function findMissedClockIns(db, dateStr, storeId = null) {
    if (!db || !dateStr) {
        console.error('findMissedClockIns: Missing required parameters');
        return [];
    }
    
    try {
        // 1. 獲取當天排班員工
        let scheduledEmployees = [];
        let query = db.collection('schedules').where('date', '==', dateStr);
        
        if (storeId) {
            query = query.where('storeId', '==', storeId);
        }
        
        const scheduleSnapshot = await query.get();
        
        if (!scheduleSnapshot.empty) {
            scheduleSnapshot.forEach(doc => {
                const data = doc.data();
                scheduledEmployees.push({
                    userId: data.userId,
                    storeId: data.storeId,
                    shiftType: data.shiftType || 'regular',
                    startTime: data.startTime,
                    endTime: data.endTime
                });
            });
        }
        
        // 檢查日期文檔中的班表
        const dateScheduleRef = db.collection('schedules').doc(dateStr);
        const dateScheduleSnap = await dateScheduleRef.get();
        
        if (dateScheduleSnap.exists) {
            const scheduleData = dateScheduleSnap.data();
            
            // 處理按用戶ID的排班
            if (scheduleData.shifts) {
                Object.keys(scheduleData.shifts).forEach(userId => {
                    const shiftInfo = scheduleData.shifts[userId];
                    // 如果指定了分店ID，則只考慮該分店的排班
                    if (!storeId || shiftInfo.storeId === storeId) {
                        scheduledEmployees.push({
                            userId: userId,
                            storeId: shiftInfo.storeId,
                            shiftType: shiftInfo.shiftType || 'regular',
                            startTime: shiftInfo.startTime,
                            endTime: shiftInfo.endTime,
                            source: 'date_shifts'
                        });
                    }
                });
            }
            
            // 處理按分店的排班
            if (scheduleData.storeShifts && (!storeId || scheduleData.storeShifts[storeId])) {
                const stores = storeId ? [storeId] : Object.keys(scheduleData.storeShifts);
                
                stores.forEach(currentStoreId => {
                    const storeShift = scheduleData.storeShifts[currentStoreId];
                    if (storeShift.employees && Array.isArray(storeShift.employees)) {
                        storeShift.employees.forEach(userId => {
                            scheduledEmployees.push({
                                userId: userId,
                                storeId: currentStoreId,
                                shiftType: storeShift.shiftType || 'regular',
                                startTime: storeShift.startTime,
                                endTime: storeShift.endTime,
                                source: 'store_shifts'
                            });
                        });
                    }
                });
            }
        }
        
        // 移除重複的排班記錄
        scheduledEmployees = scheduledEmployees.filter((employee, index, self) => 
            index === self.findIndex(e => e.userId === employee.userId)
        );
        
        if (scheduledEmployees.length === 0) {
            return []; // 當天無排班
        }
        
        // 2. 獲取當天已打卡的員工
        const clockInQuery = db.collection('clock_records')
            .where('date', '==', dateStr)
            .where('action', '==', 'clockIn');
            
        if (storeId) {
            clockInQuery.where('storeId', '==', storeId);
        }
        
        const clockInSnapshot = await clockInQuery.get();
        const clockedInUserIds = new Set();
        
        if (!clockInSnapshot.empty) {
            clockInSnapshot.forEach(doc => {
                const data = doc.data();
                clockedInUserIds.add(data.userId);
            });
        }
        
        // 3. 找出未打卡的員工
        const missedClockIns = scheduledEmployees.filter(employee => !clockedInUserIds.has(employee.userId));
        
        // 4. 獲取員工姓名等詳細資料
        const enrichedMissedClockIns = await Promise.all(missedClockIns.map(async (employee) => {
            try {
                const employeeDoc = await db.collection('employees').doc(employee.userId).get();
                
                if (employeeDoc.exists) {
                    const employeeData = employeeDoc.data();
                    return {
                        ...employee,
                        name: employeeData.name || '未知姓名',
                        position: employeeData.position || '未知職位',
                        status: STATUS_ABSENT
                    };
                }
                
                return { ...employee, name: '未知姓名', status: STATUS_ABSENT };
            } catch (error) {
                console.error(`Error fetching details for employee ${employee.userId}:`, error);
                return { ...employee, name: '未知姓名', status: STATUS_ABSENT };
            }
        }));
        
        return enrichedMissedClockIns;
        
    } catch (error) {
        console.error('Error finding missed clock-ins:', error);
        return [];
    }
}

/**
 * 計算員工指定時間範圍內的出勤統計
 * @param {Object} db - Firestore 實例
 * @param {string} userId - 員工ID
 * @param {string} startDateStr - 開始日期 (YYYY-MM-DD)
 * @param {string} endDateStr - 結束日期 (YYYY-MM-DD)
 * @returns {Promise<Object>} 出勤統計信息
 */
async function calculateAttendanceStats(db, userId, startDateStr, endDateStr) {
    if (!db || !userId || !startDateStr || !endDateStr) {
        console.error('calculateAttendanceStats: Missing required parameters');
        return null;
    }
    
    try {
        // 1. 獲取排班記錄
        const scheduledDays = new Set();
        const scheduledDates = {};
        
        // 查詢員工特定排班
        const scheduleQuery = db.collection('schedules')
            .where('userId', '==', userId)
            .where('date', '>=', startDateStr)
            .where('date', '<=', endDateStr);
            
        const scheduleSnapshot = await scheduleQuery.get();
        
        if (!scheduleSnapshot.empty) {
            scheduleSnapshot.forEach(doc => {
                const data = doc.data();
                scheduledDays.add(data.date);
                scheduledDates[data.date] = {
                    storeId: data.storeId,
                    startTime: data.startTime,
                    endTime: data.endTime
                };
            });
        }
        
        // 檢查日期文檔中的班表
        // 計算日期範圍內的所有日期
        const dates = [];
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
            dates.push(dateStr);
        }
        
        // 檢查每個日期的排班文檔
        await Promise.all(dates.map(async (dateStr) => {
            const dateScheduleRef = db.collection('schedules').doc(dateStr);
            const dateScheduleSnap = await dateScheduleRef.get();
            
            if (dateScheduleSnap.exists) {
                const scheduleData = dateScheduleSnap.data();
                
                // 檢查用戶ID的排班
                if (scheduleData.shifts && scheduleData.shifts[userId]) {
                    scheduledDays.add(dateStr);
                    scheduledDates[dateStr] = {
                        storeId: scheduleData.shifts[userId].storeId,
                        startTime: scheduleData.shifts[userId].startTime,
                        endTime: scheduleData.shifts[userId].endTime,
                        source: 'date_shifts'
                    };
                }
                
                // 檢查分店的排班
                if (scheduleData.storeShifts) {
                    Object.keys(scheduleData.storeShifts).forEach(storeId => {
                        const storeShift = scheduleData.storeShifts[storeId];
                        if (storeShift.employees && storeShift.employees.includes(userId)) {
                            scheduledDays.add(dateStr);
                            scheduledDates[dateStr] = {
                                storeId: storeId,
                                startTime: storeShift.startTime,
                                endTime: storeShift.endTime,
                                source: 'store_shifts'
                            };
                        }
                    });
                }
            }
        }));
        
        // 2. 獲取打卡記錄
        const clockInQuery = db.collection('clock_records')
            .where('userId', '==', userId)
            .where('date', '>=', startDateStr)
            .where('date', '<=', endDateStr)
            .orderBy('date')
            .orderBy('timestamp');
            
        const clockInSnapshot = await clockInQuery.get();
        
        const clockRecords = {};
        if (!clockInSnapshot.empty) {
            clockInSnapshot.forEach(doc => {
                const data = doc.data();
                // 根據日期組織打卡記錄
                if (!clockRecords[data.date]) {
                    clockRecords[data.date] = [];
                }
                clockRecords[data.date].push(data);
            });
        }
        
        // 3. 計算統計數據
        let totalScheduledDays = scheduledDays.size;
        let onTimeDays = 0;
        let lateDays = 0;
        let earlyLeaveDays = 0;
        let absentDays = 0;
        let noClockOutDays = 0;
        let unscheduledClockIns = 0;
        
        // 計算每個排班日的打卡狀態
        for (const dateStr of scheduledDays) {
            const schedule = scheduledDates[dateStr];
            const dayClockRecords = clockRecords[dateStr] || [];
            
            // 找出上班和下班打卡記錄
            const clockIn = dayClockRecords.find(r => r.action === 'clockIn');
            const clockOut = dayClockRecords.find(r => r.action === 'clockOut');
            
            if (!clockIn) {
                // 未打上班卡
                absentDays++;
            } else if (!clockOut) {
                // 打了上班卡但沒有下班卡
                noClockOutDays++;
                
                // 檢查上班卡是否準時
                const status = calculateClockStatus(clockIn.timestamp, null, schedule);
                if (status.status === STATUS_ON_TIME) {
                    onTimeDays++;
                } else if (status.status === STATUS_LATE) {
                    lateDays++;
                }
            } else {
                // 有上班卡和下班卡
                const status = calculateClockStatus(clockIn.timestamp, clockOut.timestamp, schedule);
                
                if (status.status === STATUS_ON_TIME) {
                    onTimeDays++;
                } else if (status.status === STATUS_LATE) {
                    lateDays++;
                } else if (status.status === STATUS_EARLY_LEAVE) {
                    earlyLeaveDays++;
                }
            }
        }
        
        // 檢查非排班日的打卡記錄
        for (const dateStr in clockRecords) {
            if (!scheduledDays.has(dateStr)) {
                const dayClockRecords = clockRecords[dateStr];
                const clockIn = dayClockRecords.find(r => r.action === 'clockIn');
                
                if (clockIn) {
                    unscheduledClockIns++;
                }
            }
        }
        
        // 計算出勤率、準時率等指標
        const attendanceRate = totalScheduledDays > 0 ? (totalScheduledDays - absentDays) / totalScheduledDays : 0;
        const onTimeRate = (totalScheduledDays - absentDays) > 0 ? onTimeDays / (totalScheduledDays - absentDays) : 0;
        
        return {
            userId,
            period: {
                start: startDateStr,
                end: endDateStr
            },
            stats: {
                totalScheduledDays,
                actualAttendanceDays: totalScheduledDays - absentDays,
                onTimeDays,
                lateDays,
                earlyLeaveDays,
                absentDays,
                noClockOutDays,
                unscheduledClockIns,
                attendanceRate,
                onTimeRate
            },
            scheduledDates,
            clockRecords
        };
        
    } catch (error) {
        console.error('Error calculating attendance stats:', error);
        return null;
    }
}

// --- 公開 API ---
export {
    checkEmployeeSchedule,
    calculateClockStatus,
    findMissedClockIns,
    calculateAttendanceStats,
    // 常數
    STATUS_ON_TIME,
    STATUS_LATE,
    STATUS_EARLY_LEAVE,
    STATUS_ABSENT,
    STATUS_UNSCHEDULED,
    STATUS_NO_CLOCK_OUT
}; 