/**
 * prediction-models.js
 * 薪資預測算法模組 - 提供多種預測模型和參數調整功能
 */

/**
 * 預測模型類 - 基礎類別
 * 所有具體算法都繼承自此類
 */
class PredictionModel {
    constructor(config = {}) {
        this.modelName = "基礎模型";
        this.description = "預測模型基礎類別";
        this.config = {
            confidenceLevel: 0.85,
            ...(config || {})
        };
    }

    /**
     * 生成預測結果
     * @param {Array} historicalData - 歷史數據
     * @param {Object} factorData - 影響因子數據
     * @param {Number} predictionMonths - 預測月數
     * @returns {Object} - 預測結果
     */
    predict(historicalData, factorData, predictionMonths) {
        throw new Error("預測方法必須由子類實現");
    }

    /**
     * 獲取模型配置選項
     * @returns {Array} - 配置選項
     */
    getConfigOptions() {
        return [
            {
                id: "confidenceLevel",
                label: "信心水準",
                type: "range",
                min: 0.5,
                max: 0.99,
                step: 0.01,
                defaultValue: this.config.confidenceLevel,
                description: "預測結果的信心水準"
            }
        ];
    }

    /**
     * 計算數據波動性（標準差/平均值）
     * @param {Array} data - 數據數組
     * @returns {number} - 波動性係數
     */
    calculateVolatility(data) {
        if (data.length < 2) return 0.05; // 默認波動性
        
        const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        if (mean === 0) return 0.05;
        
        const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / data.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev / mean;
    }

    /**
     * 分析數據趨勢（線性回歸）
     * @param {Array} data - 數據數組
     * @returns {Object} - 趨勢分析結果
     */
    analyzeTrend(data) {
        if (data.length < 2) return { slope: 0, intercept: 0, r2: 0 };
        
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumX2 += i * i;
            sumY2 += data[i] * data[i];
        }
        
        // 計算斜率和截距
        const denominator = n * sumX2 - sumX * sumX;
        if (denominator === 0) return { slope: 0, intercept: 0, r2: 0 };
        
        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        
        // 計算R方值 (決定係數)
        const predictedValues = Array(n).fill().map((_, i) => intercept + slope * i);
        const meanY = sumY / n;
        const ssTotal = data.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
        const ssResidual = data.reduce((sum, y, i) => sum + Math.pow(y - predictedValues[i], 2), 0);
        
        const r2 = Math.max(0, 1 - (ssResidual / ssTotal));
        
        return { 
            slope,
            intercept,
            r2,
            // 將斜率轉換為相對變化率
            relativeSlope: data[data.length-1] !== 0 ? slope / data[data.length-1] : 0
        };
    }

    /**
     * 季節性分析 - 檢測數據中的季節性模式
     * @param {Array} data - 時間序列數據
     * @param {Number} period - 週期長度，如月度數據的季節性可能是12
     * @returns {Object} - 季節性指數
     */
    analyzeSeasonality(data, period = 12) {
        if (data.length < period * 2) {
            // 數據不足以進行季節性分析
            return { hasSeasonality: false, indices: Array(period).fill(1) };
        }

        // 計算每個週期位置的平均值
        const seasonalIndices = Array(period).fill(0);
        const seasonalCounts = Array(period).fill(0);
        
        data.forEach((value, index) => {
            const position = index % period;
            seasonalIndices[position] += value;
            seasonalCounts[position]++;
        });
        
        // 計算季節性指數
        const indices = seasonalIndices.map((sum, i) => 
            seasonalCounts[i] > 0 ? sum / seasonalCounts[i] : 1
        );
        
        // 正規化指數使其平均為1
        const indicesSum = indices.reduce((sum, val) => sum + val, 0);
        const normalizedIndices = indices.map(val => 
            indicesSum > 0 ? val * period / indicesSum : 1
        );
        
        // 檢測是否有明顯的季節性
        const seasonalVariance = normalizedIndices.reduce(
            (sum, val) => sum + Math.pow(val - 1, 2), 0
        ) / period;
        
        const hasSeasonality = seasonalVariance > 0.02; // 閾值可調整
        
        return {
            hasSeasonality,
            indices: normalizedIndices,
            variance: seasonalVariance
        };
    }

    /**
     * 移動平均計算
     * @param {Array} data - 數據數組
     * @param {Number} window - 窗口大小
     * @returns {Array} - 移動平均結果
     */
    calculateMovingAverage(data, window = 3) {
        if (data.length < window) return [...data];
        
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < window - 1) {
                // 初始填充
                result.push(data[i]);
            } else {
                // 計算移動平均
                let sum = 0;
                for (let j = 0; j < window; j++) {
                    sum += data[i - j];
                }
                result.push(sum / window);
            }
        }
        return result;
    }
}

/**
 * 線性回歸預測模型
 * 使用簡單線性回歸進行預測
 */
class LinearRegressionModel extends PredictionModel {
    constructor(config = {}) {
        super({
            weightFactors: {
                balanced: { attendance: 0.25, performance: 0.3, seasonal: 0.15, tenure: 0.3 },
                attendance: { attendance: 0.6, performance: 0.2, seasonal: 0.1, tenure: 0.1 },
                performance: { attendance: 0.2, performance: 0.6, seasonal: 0.1, tenure: 0.1 },
                tenure: { attendance: 0.1, performance: 0.2, seasonal: 0.1, tenure: 0.6 }
            },
            confidenceLevel: 0.85,
            useWeightedFactors: true,
            ...config
        });
        
        this.modelName = "線性回歸模型";
        this.description = "使用線性回歸算法預測未來薪資趨勢，考慮多種影響因素";
    }

    /**
     * 獲取模型配置選項
     */
    getConfigOptions() {
        return [
            ...super.getConfigOptions(),
            {
                id: "useWeightedFactors",
                label: "使用加權因子",
                type: "checkbox",
                defaultValue: this.config.useWeightedFactors,
                description: "啟用多因素加權影響"
            }
        ];
    }

    /**
     * 生成預測結果
     */
    predict(historicalData, factorData, predictionMonths, factorWeight = 'balanced') {
        // 使用選擇的權重類型
        const weights = this.config.weightFactors[factorWeight] || this.config.weightFactors.balanced;
        const performanceData = factorData.performance || [];
        const attendanceData = factorData.attendance || [];
        
        // 分析歷史薪資趨勢
        const baseSalaryTrend = this.analyzeTrend(historicalData.map(item => item.baseSalary));
        const overtimeTrend = this.analyzeTrend(historicalData.map(item => item.overtimePay || 0));
        const bonusTrend = this.analyzeTrend(historicalData.map(item => item.bonusAmount || 0));
        
        // 獲取最近的薪資記錄作為基準
        const latestSalary = historicalData[historicalData.length - 1];
        
        // 計算員工年資因素
        let tenureBonus = factorData.tenureBonus || 0;
        
        // 計算績效趨勢
        let performanceFactor = 0;
        if (performanceData.length > 0) {
            const recentPerformance = performanceData.slice(-3); // 最近3次績效
            const avgScore = recentPerformance.reduce((sum, item) => sum + item.overallScore, 0) / recentPerformance.length;
            performanceFactor = (avgScore - 3) / 5; // 假設評分範圍是1-5，3分是標準
        }
        
        // 計算出勤趨勢
        let attendanceFactor = 0;
        if (attendanceData.length > 0) {
            const recentAttendance = attendanceData.slice(-3); // 最近3個月
            const avgOnTimeRate = recentAttendance.reduce((sum, item) => sum + item.onTimeRate, 0) / recentAttendance.length;
            attendanceFactor = (avgOnTimeRate - 0.9) * 0.5; // 假設準時率90%是標準
        }
        
        // 計算季節性因素
        const currentMonth = new Date().getMonth();
        const seasonalFactors = [0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.15]; // 假設1月和12月有額外的季節因素
        const seasonalFactor = seasonalFactors[currentMonth];
        
        // 綜合各因素，計算整體增長預期
        let expectedGrowthRate = baseSalaryTrend.relativeSlope * 0.5; // 基本薪資趨勢
        
        // 如果使用加權因子，添加其他影響因素
        if (this.config.useWeightedFactors) {
            expectedGrowthRate += performanceFactor * weights.performance + // 績效因素
                               attendanceFactor * weights.attendance + // 出勤因素
                               tenureBonus * weights.tenure + // 年資因素
                               seasonalFactor * weights.seasonal; // 季節因素
        }
        
        // 計算預測月份
        const lastDate = new Date(latestSalary.year, latestSalary.month - 1);
        
        // 生成月份標籤和預測值
        const monthLabels = [];
        const predictedSalaries = [];
        const confidenceUpper = [];
        const confidenceLower = [];
        const baseSalaries = [];
        const overtimePays = [];
        const bonusAmounts = [];
        
        // 月度波動性（用於計算信心區間）
        const volatility = this.calculateVolatility(historicalData.map(item => item.totalSalary));
        
        // 最近的基本薪資、加班和獎金
        let lastBaseSalary = latestSalary.baseSalary;
        let lastOvertime = latestSalary.overtimePay || 0;
        let lastBonus = latestSalary.bonusAmount || 0;
        
        // 預測每月薪資
        const monthlySalaries = [];
        
        for (let i = 0; i < predictionMonths; i++) {
            const predictionDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i + 1);
            const monthLabel = `${predictionDate.getFullYear()}-${(predictionDate.getMonth() + 1).toString().padStart(2, '0')}`;
            monthLabels.push(monthLabel);
            
            // 計算預測月的各組成部分
            const monthInYear = predictionDate.getMonth();
            const isEndOfYear = (monthInYear === 11 || monthInYear === 0); // 12月或1月
            
            // 基本薪資小幅增長
            const baseSalary = lastBaseSalary * (1 + baseSalaryTrend.relativeSlope * (i + 1) / 24); // 每年增長率的一部分
            baseSalaries.push(baseSalary);
            
            // 加班費波動
            const overtimeMultiplier = 1 + (Math.sin(i / 2) * 0.1) + (Math.random() * 0.05);
            const overtime = lastOvertime * overtimeMultiplier;
            overtimePays.push(overtime);
            
            // 獎金（年終或績效導向）
            let bonus = lastBonus;
            if (isEndOfYear) {
                bonus *= 1.5; // 年終時增加
            }
            
            // 績效和出勤影響獎金
            if (this.config.useWeightedFactors) {
                bonus *= (1 + performanceFactor * 0.2 + attendanceFactor * 0.1);
            }
            bonusAmounts.push(bonus);
            
            // 總薪資
            const totalSalary = baseSalary + overtime + bonus;
            predictedSalaries.push(totalSalary);
            
            // 計算信心區間
            const confidenceMargin = totalSalary * volatility * (i + 1) / predictionMonths * (1 - this.config.confidenceLevel);
            confidenceUpper.push(totalSalary + confidenceMargin);
            confidenceLower.push(totalSalary - confidenceMargin);
            
            // 添加到月薪數組
            monthlySalaries.push({
                month: monthLabel,
                baseSalary: baseSalary,
                overtimePay: overtime,
                bonusAmount: bonus,
                totalSalary: totalSalary,
                change: i === 0 ? 0 : (totalSalary / predictedSalaries[i-1] - 1)
            });
            
            // 更新最近薪資，用於下一次迭代
            lastBaseSalary = baseSalary;
            lastOvertime = overtime;
            lastBonus = bonus;
        }
        
        // 計算關鍵指標
        const averageSalary = predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths;
        const totalIncrease = (predictedSalaries[predictionMonths - 1] / predictedSalaries[0]) - 1;
        
        // 確定關鍵影響因素
        const keyFactors = [];
        
        if (this.config.useWeightedFactors) {
            // 依照權重排序因素
            const factorsWithWeight = [
                { name: 'attendance', label: '出勤表現', value: attendanceFactor, weight: weights.attendance },
                { name: 'performance', label: '工作績效', value: performanceFactor, weight: weights.performance },
                { name: 'tenure', label: '年資累積', value: tenureBonus, weight: weights.tenure },
                { name: 'seasonal', label: '季節性因素', value: seasonalFactor, weight: weights.seasonal }
            ];
            
            // 計算加權值，用於排序
            factorsWithWeight.forEach(f => f.weightedValue = f.value * f.weight);
            
            // 排序並取前三名
            factorsWithWeight.sort((a, b) => b.weightedValue - a.weightedValue);
            
            // 添加到關鍵因素，只包含影響較大的因素
            factorsWithWeight.forEach(f => {
                if (f.weightedValue > 0.01) {
                    keyFactors.push({
                        name: f.name,
                        label: f.label,
                        impact: f.weightedValue > 0.05 ? 'high' : (f.weightedValue > 0.02 ? 'medium' : 'low')
                    });
                }
            });
        }
        
        // 如果沒有找到關鍵因素，添加一個基本趨勢因素
        if (keyFactors.length === 0) {
            keyFactors.push({
                name: 'trend',
                label: '基本薪資趨勢',
                impact: Math.abs(baseSalaryTrend.relativeSlope) > 0.01 ? 'medium' : 'low'
            });
        }
        
        return {
            modelName: this.modelName,
            monthLabels,
            historicalLabels: historicalData.map(item => `${item.year}-${item.month.toString().padStart(2, '0')}`),
            historicalValues: historicalData.map(item => item.totalSalary),
            predictedSalaries,
            confidenceUpper,
            confidenceLower,
            baseSalaries,
            overtimePays,
            bonusAmounts,
            monthlySalaries,
            averageSalary,
            totalIncrease,
            keyFactors,
            accuracy: this.config.confidenceLevel,
            factorWeight,
            volatility
        };
    }
}

/**
 * 季節性調整模型
 * 結合線性趨勢和季節性模式進行預測
 */
class SeasonalAdjustedModel extends PredictionModel {
    constructor(config = {}) {
        super({
            confidenceLevel: 0.85,
            seasonalPeriod: 12, // 年度週期
            seasonalStrength: 1.0, // 季節性強度
            ...config
        });
        
        this.modelName = "季節性調整模型";
        this.description = "結合線性趨勢和季節性模式進行預測，更適合具有明顯季節性變化的薪資";
    }

    /**
     * 獲取模型配置選項
     */
    getConfigOptions() {
        return [
            ...super.getConfigOptions(),
            {
                id: "seasonalPeriod",
                label: "季節性週期",
                type: "select",
                options: [
                    { value: 3, label: "季度(3個月)" },
                    { value: 4, label: "季(4個月)" },
                    { value: 6, label: "半年(6個月)" },
                    { value: 12, label: "年度(12個月)" }
                ],
                defaultValue: this.config.seasonalPeriod,
                description: "數據中的季節性週期長度"
            },
            {
                id: "seasonalStrength",
                label: "季節性強度",
                type: "range",
                min: 0,
                max: 2,
                step: 0.1,
                defaultValue: this.config.seasonalStrength,
                description: "季節性因素的影響強度"
            }
        ];
    }

    /**
     * 生成預測結果
     */
    predict(historicalData, factorData, predictionMonths) {
        if (historicalData.length < 6) {
            // 如果歷史數據過少，則使用線性模型
            const linearModel = new LinearRegressionModel(this.config);
            return linearModel.predict(historicalData, factorData, predictionMonths);
        }
        
        // 分析歷史數據趨勢
        const totalSalaryData = historicalData.map(item => item.totalSalary);
        const trendResult = this.analyzeTrend(totalSalaryData);
        
        // 分析季節性
        const seasonalResult = this.analyzeSeasonality(totalSalaryData, this.config.seasonalPeriod);
        
        // 獲取最近的薪資記錄作為基準
        const latestSalary = historicalData[historicalData.length - 1];
        
        // 計算預測月份
        const lastDate = new Date(latestSalary.year, latestSalary.month - 1);
        
        // 生成月份標籤和預測值
        const monthLabels = [];
        const predictedSalaries = [];
        const confidenceUpper = [];
        const confidenceLower = [];
        const baseSalaries = [];
        const overtimePays = [];
        const bonusAmounts = [];
        
        // 月度波動性（用於計算信心區間）
        const volatility = this.calculateVolatility(totalSalaryData);
        
        // 預測每月薪資
        const monthlySalaries = [];
        const baseValue = totalSalaryData[totalSalaryData.length - 1];
        
        for (let i = 0; i < predictionMonths; i++) {
            const predictionDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i + 1);
            const monthLabel = `${predictionDate.getFullYear()}-${(predictionDate.getMonth() + 1).toString().padStart(2, '0')}`;
            monthLabels.push(monthLabel);
            
            // 計算季節性因子
            const seasonalIndex = (lastDate.getMonth() + i + 1) % this.config.seasonalPeriod;
            const seasonalFactor = seasonalResult.hasSeasonality 
                ? 1 + (seasonalResult.indices[seasonalIndex] - 1) * this.config.seasonalStrength
                : 1;
            
            // 計算趨勢值
            const trendValue = baseValue * (1 + trendResult.relativeSlope * (i + 1));
            
            // 應用季節性調整
            const totalSalary = trendValue * seasonalFactor;
            
            // 分解總薪資
            const baseSalary = latestSalary.baseSalary * (trendValue / baseValue);
            const overtime = latestSalary.overtimePay * (trendValue / baseValue) * (seasonalFactor);
            const bonus = totalSalary - baseSalary - overtime;
            
            // 保存預測值
            predictedSalaries.push(totalSalary);
            baseSalaries.push(baseSalary);
            overtimePays.push(overtime);
            bonusAmounts.push(bonus);
            
            // 計算信心區間
            const confidenceMargin = totalSalary * volatility * (i + 1) / predictionMonths * (1 - this.config.confidenceLevel);
            confidenceUpper.push(totalSalary + confidenceMargin);
            confidenceLower.push(totalSalary - confidenceMargin);
            
            // 添加到月薪數組
            monthlySalaries.push({
                month: monthLabel,
                baseSalary: baseSalary,
                overtimePay: overtime,
                bonusAmount: bonus,
                totalSalary: totalSalary,
                change: i === 0 ? 0 : (totalSalary / predictedSalaries[i-1] - 1),
                seasonalFactor
            });
        }
        
        // 計算關鍵指標
        const averageSalary = predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths;
        const totalIncrease = (predictedSalaries[predictionMonths - 1] / predictedSalaries[0]) - 1;
        
        // 確定關鍵影響因素
        const keyFactors = [];
        
        // 添加季節性因素
        if (seasonalResult.hasSeasonality) {
            keyFactors.push({
                name: 'seasonality',
                label: '季節性模式',
                impact: seasonalResult.variance > 0.05 ? 'high' : 'medium'
            });
        }
        
        // 添加趨勢因素
        keyFactors.push({
            name: 'trend',
            label: '長期薪資趨勢',
            impact: Math.abs(trendResult.relativeSlope) > 0.01 ? 'high' : 'medium'
        });
        
        return {
            modelName: this.modelName,
            monthLabels,
            historicalLabels: historicalData.map(item => `${item.year}-${item.month.toString().padStart(2, '0')}`),
            historicalValues: historicalData.map(item => item.totalSalary),
            predictedSalaries,
            confidenceUpper,
            confidenceLower,
            baseSalaries,
            overtimePays,
            bonusAmounts,
            monthlySalaries,
            averageSalary,
            totalIncrease,
            keyFactors,
            accuracy: this.config.confidenceLevel,
            trendStrength: trendResult.r2,
            seasonalStrength: seasonalResult.hasSeasonality ? seasonalResult.variance : 0,
            volatility
        };
    }
}

/**
 * 移動平均預測模型
 * 使用加權移動平均方法進行預測
 */
class MovingAverageModel extends PredictionModel {
    constructor(config = {}) {
        super({
            confidenceLevel: 0.85,
            windowSize: 3,
            weights: [0.5, 0.3, 0.2], // 權重依次是最近月份、次近、更早
            ...config
        });
        
        this.modelName = "移動平均模型";
        this.description = "使用加權移動平均方法進行預測，適合短期穩定預測";
    }

    /**
     * 獲取模型配置選項
     */
    getConfigOptions() {
        return [
            ...super.getConfigOptions(),
            {
                id: "windowSize",
                label: "窗口大小",
                type: "select",
                options: [
                    { value: 2, label: "2個月" },
                    { value: 3, label: "3個月" },
                    { value: 4, label: "4個月" },
                    { value: 6, label: "6個月" }
                ],
                defaultValue: this.config.windowSize,
                description: "計算移動平均的月份數量"
            }
        ];
    }

    /**
     * 生成預測結果
     */
    predict(historicalData, factorData, predictionMonths) {
        if (historicalData.length < this.config.windowSize) {
            // 如果歷史數據不足，則使用線性模型
            const linearModel = new LinearRegressionModel(this.config);
            return linearModel.predict(historicalData, factorData, predictionMonths);
        }
        
        // 計算加權移動平均的權重
        const weights = this.config.weights.slice(0, this.config.windowSize);
        
        // 如果權重數量不匹配窗口大小，則生成默認權重
        if (weights.length !== this.config.windowSize) {
            const sum = (this.config.windowSize * (this.config.windowSize + 1)) / 2;
            for (let i = 0; i < this.config.windowSize; i++) {
                weights[i] = (this.config.windowSize - i) / sum;
            }
        }
        
        // 歸一化權重
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        const normalizedWeights = weights.map(w => w / totalWeight);
        
        // 獲取最近的薪資記錄
        const recentData = historicalData.slice(-this.config.windowSize);
        
        // 計算預測月份
        const lastDate = new Date(historicalData[historicalData.length - 1].year, 
                                  historicalData[historicalData.length - 1].month - 1);
        
        // 生成月份標籤和預測值
        const monthLabels = [];
        const predictedSalaries = [];
        const confidenceUpper = [];
        const confidenceLower = [];
        const baseSalaries = [];
        const overtimePays = [];
        const bonusAmounts = [];
        
        // 月度波動性（用於計算信心區間）
        const volatility = this.calculateVolatility(historicalData.map(item => item.totalSalary));
        
        // 先計算加權平均值作為基準
        let avgBaseSalary = 0;
        let avgOvertimePay = 0;
        let avgBonusAmount = 0;
        
        for (let i = 0; i < this.config.windowSize; i++) {
            avgBaseSalary += recentData[i].baseSalary * normalizedWeights[i];
            avgOvertimePay += (recentData[i].overtimePay || 0) * normalizedWeights[i];
            avgBonusAmount += (recentData[i].bonusAmount || 0) * normalizedWeights[i];
        }
        
        // 分析趨勢
        const totalSalaryData = historicalData.map(item => item.totalSalary);
        const trendResult = this.analyzeTrend(totalSalaryData);
        const growthRate = trendResult.relativeSlope;
        
        // 預測每月薪資
        const monthlySalaries = [];
        const currentRecentData = [...recentData];
        
        for (let i = 0; i < predictionMonths; i++) {
            const predictionDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i + 1);
            const monthLabel = `${predictionDate.getFullYear()}-${(predictionDate.getMonth() + 1).toString().padStart(2, '0')}`;
            monthLabels.push(monthLabel);
            
            // 計算加權平均值
            let baseSalary = 0;
            let overtimePay = 0;
            let bonusAmount = 0;
            
            for (let j = 0; j < this.config.windowSize; j++) {
                baseSalary += currentRecentData[j].baseSalary * normalizedWeights[j];
                overtimePay += (currentRecentData[j].overtimePay || 0) * normalizedWeights[j];
                bonusAmount += (currentRecentData[j].bonusAmount || 0) * normalizedWeights[j];
            }
            
            // 應用小幅趨勢增長
            baseSalary *= (1 + growthRate * 0.5); // 應用一半的趨勢影響
            overtimePay *= (1 + growthRate * 0.3);
            bonusAmount *= (1 + growthRate * 0.2);
            
            const totalSalary = baseSalary + overtimePay + bonusAmount;
            
            // 保存預測值
            baseSalaries.push(baseSalary);
            overtimePays.push(overtimePay);
            bonusAmounts.push(bonusAmount);
            predictedSalaries.push(totalSalary);
            
            // 計算信心區間
            const confidenceMargin = totalSalary * volatility * (i + 1) / predictionMonths * (1 - this.config.confidenceLevel);
            confidenceUpper.push(totalSalary + confidenceMargin);
            confidenceLower.push(totalSalary - confidenceMargin);
            
            // 添加到月薪數組
            monthlySalaries.push({
                month: monthLabel,
                baseSalary,
                overtimePay,
                bonusAmount,
                totalSalary,
                change: i === 0 ? 0 : (totalSalary / predictedSalaries[i-1] - 1)
            });
            
            // 更新最近數據窗口，移除最舊的，添加新預測的
            currentRecentData.shift();
            currentRecentData.push({
                baseSalary,
                overtimePay,
                bonusAmount,
                totalSalary
            });
        }
        
        // 計算關鍵指標
        const averageSalary = predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths;
        const totalIncrease = (predictedSalaries[predictionMonths - 1] / predictedSalaries[0]) - 1;
        
        // 確定關鍵影響因素
        const keyFactors = [
            {
                name: 'recent_pattern',
                label: '近期薪資模式',
                impact: 'high'
            },
            {
                name: 'trend',
                label: '薪資趨勢',
                impact: Math.abs(growthRate) > 0.01 ? 'medium' : 'low'
            }
        ];
        
        return {
            modelName: this.modelName,
            monthLabels,
            historicalLabels: historicalData.map(item => `${item.year}-${item.month.toString().padStart(2, '0')}`),
            historicalValues: historicalData.map(item => item.totalSalary),
            predictedSalaries,
            confidenceUpper,
            confidenceLower,
            baseSalaries,
            overtimePays,
            bonusAmounts,
            monthlySalaries,
            averageSalary,
            totalIncrease,
            keyFactors,
            accuracy: this.config.confidenceLevel,
            volatility,
            windowSize: this.config.windowSize
        };
    }
}

/**
 * 提供所有可用的預測模型
 */
const PredictionModels = {
    linear: LinearRegressionModel,
    seasonal: SeasonalAdjustedModel,
    movingAverage: MovingAverageModel
};

/**
 * 可用於前端的模型選擇選項
 */
const ModelOptions = [
    { value: 'linear', label: '線性回歸模型', description: '基於歷史趨勢和多種因素的線性預測' },
    { value: 'seasonal', label: '季節性調整模型', description: '結合趨勢和季節性波動的預測，適合有明顯季節性變化的薪資' },
    { value: 'movingAverage', label: '移動平均模型', description: '基於近期薪資的加權移動平均，適合短期穩定預測' }
];

// 匯出所有類和常量
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PredictionModel,
        LinearRegressionModel,
        SeasonalAdjustedModel,
        MovingAverageModel,
        PredictionModels,
        ModelOptions
    };
} else {
    // 瀏覽器環境中，掛載到全局對象
    window.PredictionModels = PredictionModels;
    window.ModelOptions = ModelOptions;
} 