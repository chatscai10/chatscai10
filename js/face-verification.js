/**
 * 炸雞店管理系統 - 人臉驗證模塊
 * v1.0.0 - 2025/04/16
 * 
 * 此模塊提供人臉驗證功能，用於增強打卡系統的安全性。
 */

class FaceVerification {
    constructor(options = {}) {
        this.options = {
            cameraSelector: '#camera-feed',
            captureButtonSelector: '#capture-button',
            verifyButtonSelector: '#verify-button',
            resetButtonSelector: '#reset-button',
            statusSelector: '#verification-status',
            confidenceThreshold: 0.85,
            maxRetries: 3,
            ...options
        };
        
        this.cameraStream = null;
        this.capturedImage = null;
        this.referenceImage = null;
        this.currentRetry = 0;
        this.isVerifying = false;
        this.isInitialized = false;
        this.verificationResult = null;
        
        // 指向相關DOM元素
        this.cameraElement = document.querySelector(this.options.cameraSelector);
        this.captureButton = document.querySelector(this.options.captureButtonSelector);
        this.verifyButton = document.querySelector(this.options.verifyButtonSelector);
        this.resetButton = document.querySelector(this.options.resetButtonSelector);
        this.statusElement = document.querySelector(this.options.statusSelector);
    }
    
    /**
     * 初始化人臉驗證模塊
     */
    async init() {
        if (this.isInitialized) return;
        
        try {
            // 檢查是否支援人臉識別API
            if (!window.faceapi && !this.options.mockAPI) {
                throw new Error('人臉識別API未載入，請確保已引入face-api.js庫');
            }
            
            // 載入必要的模型
            if (!this.options.mockAPI) {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models')
                ]);
            }
            
            // 設置事件監聽器
            this.setupEventListeners();
            
            this.isInitialized = true;
            this.updateStatus('初始化完成，請點擊"開始攝像頭"按鈕');
            
            // 如果有設定自動啟動，則啟動攝像頭
            if (this.options.autoStart) {
                this.startCamera();
            }
            
            return true;
        } catch (error) {
            console.error('初始化人臉驗證模塊失敗:', error);
            this.updateStatus(`初始化失敗: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * 設置事件監聽器
     */
    setupEventListeners() {
        // 啟動攝像頭按鈕
        if (this.captureButton) {
            this.captureButton.addEventListener('click', () => {
                if (!this.cameraStream) {
                    this.startCamera();
                } else {
                    this.captureFace();
                }
            });
        }
        
        // 驗證按鈕
        if (this.verifyButton) {
            this.verifyButton.addEventListener('click', () => {
                this.verifyFace();
            });
        }
        
        // 重置按鈕
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                this.reset();
            });
        }
    }
    
    /**
     * 啟動攝像頭
     */
    async startCamera() {
        try {
            // 請求攝像頭權限
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            
            // 顯示攝像頭畫面
            if (this.cameraElement) {
                this.cameraElement.srcObject = this.cameraStream;
                this.cameraElement.play();
            }
            
            // 更新UI
            if (this.captureButton) {
                this.captureButton.textContent = '拍攝人臉';
            }
            
            this.updateStatus('攝像頭已啟動，請將臉部對準中心並點擊"拍攝人臉"按鈕');
            
            return true;
        } catch (error) {
            console.error('啟動攝像頭失敗:', error);
            this.updateStatus(`啟動攝像頭失敗: ${error.message}`, 'error');
            
            // 如果是權限錯誤，提供更具體的指導
            if (error.name === 'NotAllowedError') {
                this.updateStatus('請允許網站使用攝像頭權限以進行人臉驗證', 'warning');
            }
            
            return false;
        }
    }
    
    /**
     * 捕獲人臉圖像
     */
    async captureFace() {
        if (!this.cameraStream || !this.cameraElement) {
            this.updateStatus('攝像頭未啟動', 'error');
            return null;
        }
        
        try {
            // 創建一個Canvas元素
            const canvas = document.createElement('canvas');
            canvas.width = this.cameraElement.videoWidth;
            canvas.height = this.cameraElement.videoHeight;
            
            // 繪製當前視訊幀
            const context = canvas.getContext('2d');
            context.drawImage(this.cameraElement, 0, 0, canvas.width, canvas.height);
            
            // 獲取圖像數據
            this.capturedImage = canvas.toDataURL('image/png');
            
            // 檢測人臉
            const faceDetected = await this.detectFace(this.capturedImage);
            
            if (faceDetected) {
                this.updateStatus('已捕獲人臉圖像，請點擊"驗證"按鈕', 'success');
                
                // 顯示捕獲的圖像（可選）
                if (this.options.capturedImageSelector) {
                    const capturedImageElement = document.querySelector(this.options.capturedImageSelector);
                    if (capturedImageElement) {
                        capturedImageElement.src = this.capturedImage;
                        capturedImageElement.style.display = 'block';
                    }
                }
                
                // 更新按鈕狀態
                if (this.verifyButton) {
                    this.verifyButton.disabled = false;
                }
                
                return this.capturedImage;
            } else {
                this.updateStatus('未檢測到人臉，請調整位置後重試', 'warning');
                return null;
            }
        } catch (error) {
            console.error('捕獲人臉圖像失敗:', error);
            this.updateStatus(`捕獲人臉失敗: ${error.message}`, 'error');
            return null;
        }
    }
    
    /**
     * 檢測圖像中的人臉
     * @param {string} imageData - 圖像的DataURL
     * @returns {boolean} 是否檢測到人臉
     */
    async detectFace(imageData) {
        if (this.options.mockAPI) {
            // 模擬模式，用於測試
            return true;
        }
        
        try {
            // 創建圖像元素
            const img = new Image();
            img.src = imageData;
            
            // 等待圖像載入
            await new Promise(resolve => {
                img.onload = resolve;
            });
            
            // 檢測人臉
            const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptors();
            
            return detections.length > 0;
        } catch (error) {
            console.error('檢測人臉失敗:', error);
            return false;
        }
    }
    
    /**
     * 載入參考人臉
     * @param {string} userId - 用戶ID
     */
    async loadReferenceImage(userId) {
        try {
            // 從服務器或本地存儲載入用戶的參考人臉圖像
            const userDoc = await firebase.firestore().collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                throw new Error('找不到用戶資料');
            }
            
            const userData = userDoc.data();
            
            if (!userData.faceImageUrl) {
                // 用戶尚未設置參考人臉
                this.updateStatus('尚未設置參考人臉，請先在個人設置中設置', 'warning');
                return false;
            }
            
            // 載入參考圖像
            this.referenceImage = userData.faceImageUrl;
            
            // 如果要顯示參考圖像（僅用於測試）
            if (this.options.referenceImageSelector && this.options.showReference) {
                const referenceImageElement = document.querySelector(this.options.referenceImageSelector);
                if (referenceImageElement) {
                    referenceImageElement.src = this.referenceImage;
                    referenceImageElement.style.display = 'block';
                }
            }
            
            return true;
        } catch (error) {
            console.error('載入參考人臉失敗:', error);
            this.updateStatus(`載入參考人臉失敗: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * 驗證人臉
     */
    async verifyFace() {
        if (!this.capturedImage) {
            this.updateStatus('請先捕獲人臉圖像', 'warning');
            return false;
        }
        
        if (!this.referenceImage && !this.options.mockAPI) {
            this.updateStatus('未載入參考人臉，無法進行驗證', 'warning');
            return false;
        }
        
        if (this.isVerifying) {
            this.updateStatus('正在驗證中，請稍候...', 'info');
            return false;
        }
        
        this.isVerifying = true;
        this.updateStatus('正在驗證人臉，請稍候...', 'info');
        
        try {
            let verificationResult;
            
            if (this.options.mockAPI) {
                // 模擬模式，隨機生成驗證結果（僅用於測試）
                await new Promise(resolve => setTimeout(resolve, 1500)); // 模擬網路延遲
                const randomValue = Math.random();
                verificationResult = {
                    isVerified: randomValue > 0.3, // 70%機率通過
                    confidence: 0.7 + randomValue * 0.3,
                    timestamp: new Date().toISOString()
                };
            } else {
                // 實際驗證邏輯，使用face-api.js
                verificationResult = await this.compareFaces(this.capturedImage, this.referenceImage);
            }
            
            this.verificationResult = verificationResult;
            
            // 更新狀態
            if (verificationResult.isVerified) {
                this.updateStatus(`人臉驗證成功，信心指數: ${(verificationResult.confidence * 100).toFixed(2)}%`, 'success');
                
                // 觸發成功事件
                this.triggerEvent('verificationSuccess', verificationResult);
                
                return true;
            } else {
                this.currentRetry++;
                const remainingRetries = this.options.maxRetries - this.currentRetry;
                
                if (remainingRetries > 0) {
                    this.updateStatus(`人臉驗證失敗，信心指數過低: ${(verificationResult.confidence * 100).toFixed(2)}%，剩餘 ${remainingRetries} 次嘗試機會`, 'warning');
                } else {
                    this.updateStatus(`人臉驗證失敗，系統將回退到備用驗證方法`, 'error');
                    
                    // 觸發失敗事件
                    this.triggerEvent('verificationFailure', verificationResult);
                }
                
                return false;
            }
        } catch (error) {
            console.error('人臉驗證失敗:', error);
            this.updateStatus(`人臉驗證過程中發生錯誤: ${error.message}`, 'error');
            return false;
        } finally {
            this.isVerifying = false;
        }
    }
    
    /**
     * 比較兩個人臉圖像
     * @param {string} capturedImage - 捕獲的人臉圖像
     * @param {string} referenceImage - 參考人臉圖像
     * @returns {Object} 驗證結果
     */
    async compareFaces(capturedImage, referenceImage) {
        try {
            // 載入兩個圖像
            const [img1, img2] = await Promise.all([
                this.loadImage(capturedImage),
                this.loadImage(referenceImage)
            ]);
            
            // 獲取人臉特徵描述符
            const [desc1, desc2] = await Promise.all([
                this.getFaceDescriptor(img1),
                this.getFaceDescriptor(img2)
            ]);
            
            if (!desc1 || !desc2) {
                return {
                    isVerified: false,
                    confidence: 0,
                    error: '無法提取人臉特徵',
                    timestamp: new Date().toISOString()
                };
            }
            
            // 計算相似度（歐氏距離）
            const distance = faceapi.euclideanDistance(desc1, desc2);
            
            // 轉換為相似度得分（0-1），距離越小，相似度越高
            const similarity = 1 - Math.min(1, distance);
            
            // 檢查是否超過閾值
            const isVerified = similarity >= this.options.confidenceThreshold;
            
            return {
                isVerified,
                confidence: similarity,
                distance,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('比較人臉失敗:', error);
            return {
                isVerified: false,
                confidence: 0,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * 載入圖像
     * @param {string} imageData - 圖像的DataURL或URL
     * @returns {HTMLImageElement} 載入的圖像元素
     */
    async loadImage(imageData) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error('載入圖像失敗'));
            img.src = imageData;
        });
    }
    
    /**
     * 獲取人臉特徵描述符
     * @param {HTMLImageElement} img - 圖像元素
     * @returns {Float32Array} 人臉特徵描述符
     */
    async getFaceDescriptor(img) {
        try {
            const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
                
            if (!detection) {
                console.warn('未檢測到人臉');
                return null;
            }
            
            return detection.descriptor;
        } catch (error) {
            console.error('獲取人臉特徵失敗:', error);
            return null;
        }
    }
    
    /**
     * 重置驗證狀態
     */
    reset() {
        // 停止攝像頭
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        // 清除圖像
        this.capturedImage = null;
        
        // 重置UI
        if (this.cameraElement) {
            this.cameraElement.srcObject = null;
        }
        
        if (this.captureButton) {
            this.captureButton.textContent = '開始攝像頭';
        }
        
        if (this.verifyButton) {
            this.verifyButton.disabled = true;
        }
        
        // 清除顯示的圖像
        if (this.options.capturedImageSelector) {
            const capturedImageElement = document.querySelector(this.options.capturedImageSelector);
            if (capturedImageElement) {
                capturedImageElement.style.display = 'none';
            }
        }
        
        // 重置嘗試次數
        this.currentRetry = 0;
        this.verificationResult = null;
        
        this.updateStatus('已重置人臉驗證，請點擊"開始攝像頭"按鈕重新開始');
    }
    
    /**
     * 更新狀態顯示
     * @param {string} message - 狀態訊息
     * @param {string} type - 訊息類型 (info, success, warning, error)
     */
    updateStatus(message, type = 'info') {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            
            // 清除所有類型
            this.statusElement.classList.remove('text-info', 'text-success', 'text-warning', 'text-danger');
            
            // 添加對應類型
            switch (type) {
                case 'success':
                    this.statusElement.classList.add('text-success');
                    break;
                case 'warning':
                    this.statusElement.classList.add('text-warning');
                    break;
                case 'error':
                    this.statusElement.classList.add('text-danger');
                    break;
                default:
                    this.statusElement.classList.add('text-info');
            }
        }
        
        console.log(`[人臉驗證] ${message}`);
    }
    
    /**
     * 觸發自定義事件
     * @param {string} eventName - 事件名稱
     * @param {object} data - 事件數據
     */
    triggerEvent(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
        
        // 如果有回調函數，則調用
        if (this.options[eventName] && typeof this.options[eventName] === 'function') {
            this.options[eventName](data);
        }
    }
    
    /**
     * 清理資源
     */
    destroy() {
        // 停止攝像頭
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        // 移除事件監聽器
        if (this.captureButton) {
            this.captureButton.removeEventListener('click', this.startCamera);
        }
        
        if (this.verifyButton) {
            this.verifyButton.removeEventListener('click', this.verifyFace);
        }
        
        if (this.resetButton) {
            this.resetButton.removeEventListener('click', this.reset);
        }
        
        this.isInitialized = false;
    }
    
    /**
     * 獲取驗證結果
     * @returns {Object|null} 驗證結果
     */
    getVerificationResult() {
        return this.verificationResult;
    }
}

// 如果在瀏覽器環境，添加到全局對象
if (typeof window !== 'undefined') {
    window.FaceVerification = FaceVerification;
} 