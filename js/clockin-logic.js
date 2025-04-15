// js/clockin-logic.js - 打卡頁面邏輯 (使用 Cloud Function)

'use strict';

// Moved UNLIMITED_RADIUS declaration to the top
const UNLIMITED_RADIUS = Infinity; // Or null, depending on how you want to check

// Global variables for Firebase services and user data
let pageCurrentUser = null;
let pageDb = null;
let pageFuncs = null; // Firebase Functions instance
let currentPosition = null; // 儲存獲取到的地理位置
let storeLocations = [];    // 儲存分店資料 { id, name, latitude, longitude }
let validationResult = { inRange: false, distance: Infinity, requiredRadius: UNLIMITED_RADIUS, storeId: null };
let isClocking = false;   // Renamed from isClockingIn for clarity
let lastClockRecord = null; // 最近一次打卡記錄
// --- (頂部模組變數) ---
let mapInstance = null; // <-- 新增：地圖實例
let userMarker = null;   // <-- 新增：用戶位置標記
let locationCircles = []; // <-- 新增：打卡範圍圓圈

// --- (DOM 元素引用) ---
let mapContainer; // <-- 新增
let storeSelectElement;
let availableStores = [];   // 儲存下拉選單的分店名稱列表

// DOM 元素引用 (Declare variables first)
let employeeNameSpan, currentTimeSpan, locationStatusSpan, longitudeSpan, latitudeSpan,
    accuracySpan, validationSpan, clockInBtn, clockOutBtn, messageElement, lastRecordSpan;

// --- 新增：打卡設定變數 ---
let clockinSettings = {
    storeGeofenceRadii: {}, // Parsed: { storeId: radius }
    storeOperatingHours: {}, // Parsed: { storeId: [{start: {h,m}, end: {h,m}}] }
    loaded: false,
    error: null
};
// --- End 新增 ---

// --- 新增人臉驗證整合 ---
let faceVerificationEnabled = false; // 默認關閉，可通過設置開啟
let faceVerification = null;
let faceVerificationResult = null;

/**
 * 初始化打卡頁面 (MODIFIED: Initialize Functions)
 * @param {object} user
 * @param {firebase.firestore.Firestore} db
 * @param {firebase.functions.Functions} funcs // ADDED: Pass functions instance
 */
async function initClockinPage(user, db, funcs) { // ADDED funcs parameter
    console.log("Initializing Clock-in Page...");
    pageCurrentUser = user; // Store user globally
    pageDb = db;           // Store db globally
    pageFuncs = funcs;       // Store functions globally

    // MODIFIED: Prioritize firebase.auth().currentUser and validate UID before proceeding
    const authUser = firebase.auth().currentUser; // Get the most current auth state
    if (authUser && authUser.uid) {
        pageCurrentUser = {
             // Merge data: prioritize authUser, fallback to passed user, then defaults
             uid: authUser.uid,
             name: authUser.displayName || user?.name || '未知用戶',
             email: authUser.email || user?.email,
             store: user?.store // Assuming store info comes from the initially passed user object
             // Add other relevant fields from 'user' if needed
        };
         console.log("Using validated currentUser from auth state:", pageCurrentUser);
    } else if (user && user.uid) {
         // Fallback to using the passed user object if it seems valid
         pageCurrentUser = user;
         console.warn("Using potentially stale user object passed to initClockinPage:", pageCurrentUser);
    } else {
         console.error("initClockinPage: Cannot proceed without a valid user UID.");
         if (messageElement) messageElement.textContent = "錯誤：無法獲取有效的用戶身份。";
         disableClockButtons('用戶身份無效');
         return; // Stop initialization
    }

    console.log("Initializing Clockin Page for:", pageCurrentUser?.name, `(UID: ${pageCurrentUser?.uid})`); // Log UID

    // Check if functions instance is provided
    if (!pageFuncs) {
        console.error("Firebase Functions instance not provided to initClockinPage.");
        if (messageElement) messageElement.textContent = "錯誤：後端接口未初始化。";
        disableClockButtons('後端接口錯誤');
        return;
    }

    // Get DOM elements
    employeeNameSpan = document.getElementById('clockin-employee-name');
    messageElement = document.getElementById('clockin-message');
    longitudeSpan = document.getElementById('longitude');
    latitudeSpan = document.getElementById('latitude');
    accuracySpan = document.getElementById('accuracy');
    validationSpan = document.getElementById('location-validation');
    currentTimeSpan = document.getElementById('current-time');
    storeSelectElement = document.getElementById('clockin-store-select'); // <-- 新增
    locationStatusSpan = document.getElementById('location-status');
    lastRecordSpan = document.getElementById('last-record-text');
    mapContainer = document.getElementById('map-container');
    // ADDED: Get button elements
    clockInBtn = document.getElementById('clock-in-btn');
    clockOutBtn = document.getElementById('clock-out-btn');

    // MODIFIED: Include button checks
    if (!employeeNameSpan || !currentTimeSpan || !storeSelectElement || !locationStatusSpan || !clockInBtn || !clockOutBtn /* ...other checks... */) {
        console.error("Required clockin page elements not found.");
        if (messageElement) messageElement.textContent = "頁面元件載入錯誤。";
        return;
    }

    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    initMap();

    // Moved assignment here, after employeeNameSpan is guaranteed to be assigned (or null if not found)
    if (employeeNameSpan) {
        employeeNameSpan.textContent = pageCurrentUser.name || 'N/A';
    }

    // 綁定打卡按鈕 (Now buttons should exist)
    clockInBtn.onclick = () => handleClockAction(); // No type needed, function determines action
    clockOutBtn.onclick = () => handleClockAction();

    messageElement.textContent = '';

    // --- Fetch settings, stores, and location in parallel --- 
    try {
         messageElement.textContent = '正在讀取設定與分店列表...';
         // Fetch settings and store list concurrently
         await Promise.all([
              (async () => { // Fetch Settings (including store list string)
                   try {
                        // CORRECTED: Read from store_config instead of clockinConfig
                        const settingsRef = pageDb.collection('settings').doc('store_config');
                        const settingsSnap = await settingsRef.get();
                        if (settingsSnap.exists) {
                            const settingsData = settingsSnap.data();
                            // Use the same field names: storeGeofenceRadius, storeOperatingHours
                            console.log("Fetched main settings (store_config) for clock-in:", settingsData);

                            // --- Store List Parsing --- 
                            if (settingsData.storeListString) {
                                 const parsedStores = parseStoreListString(settingsData.storeListString);
                                 storeLocations = parsedStores.locations; // [{id, name, lat, lon}]
                                 availableStores = parsedStores.names; // [name1, name2]
                                 if (storeLocations.length > 0) {
                                     console.log("Parsed stores from storeListString:", storeLocations);
                                     populateStoreDropdown(); // Populate dropdown AFTER stores are parsed
                                 } else {
                                      console.warn("No valid stores could be parsed from storeListString.");
                                      if (storeSelectElement) storeSelectElement.disabled = true;
                                      showMessage("無法解析分店列表。", "error");
                                      // Maybe throw error here if store list is mandatory?
                                      // throw new Error("無法解析分店列表。"); 
                                 }
                            } else {
                                console.warn("'storeListString' not found in settings/store_config.");
                                if (storeSelectElement) storeSelectElement.disabled = true;
                                showMessage("缺少分店列表設定。", "error");
                                // Maybe throw error here?
                                // throw new Error("缺少分店列表設定。"); 
                            }
                            // --- End Store List Parsing ---

                            if (settingsData.storeGeofenceRadius) {
                                clockinSettings.storeGeofenceRadii = parseGeofenceRadii(settingsData.storeGeofenceRadius);
                            }
                            if (settingsData.storeOperatingHours) {
                                clockinSettings.storeOperatingHours = parseOperatingHours(settingsData.storeOperatingHours);
                            }
                             console.log("Parsed clockin settings from store_config:", clockinSettings);
                        } else {
                            // Changed warning message to reflect the new source
                            console.warn("Main settings document (settings/store_config) not found. Using defaults (no restrictions).");
                            clockinSettings.error = "Store config document not found";
                             // Critical error if settings doc is missing?
                             if (storeSelectElement) storeSelectElement.disabled = true;
                             showMessage("找不到主要設定文件。", "error");
                             throw new Error("找不到主要設定文件(settings/store_config)。");
                        }
                         clockinSettings.loaded = true;
                   } catch (error) {
                        console.error("Error fetching clock-in settings:", error);
                        clockinSettings.error = error.message;
                        clockinSettings.loaded = true; // Mark loaded anyway to not block
                        showMessage("讀取打卡設定失敗，將使用預設值。", "warning");
                   }
              })(),
         ]);

         // After settings and stores are loaded (or attempted)
         messageElement.textContent = '正在獲取您的位置與上次打卡記錄...';
         requestLocation(); // Request location (validates and enables buttons)
         await fetchLastRecord(); // Fetches last record to determine initial button state

    } catch (error) {
         // Catch errors from fetching stores or other async operations
         console.error("Error during initialization:", error);
         locationStatusSpan.textContent = '錯誤';
         messageElement.textContent = `初始化失敗: ${error.message}`;
         disableClockButtons('初始化失敗');
         if (storeSelectElement) storeSelectElement.disabled = true;
    }
}

/**
 * 加載先決條件 (允許打卡地點) 並獲取當前位置
 */
async function loadPrerequisitesAndLocation() {
    try {
        messageElement.textContent = '正在讀取打卡地點設定...';
        await fetchStoreLocations(); // 從 Firestore 加載地點

        messageElement.textContent = '正在獲取您的位置...';
        requestLocation(); // 請求地理位置

    } catch (error) {
        console.error("Error loading prerequisites:", error);
        locationStatusSpan.textContent = '錯誤';
        messageElement.textContent = `載入失敗: ${error.message}`;
        disableClockButtons('載入設定失敗');
    }
}

/**
 * 更新顯示的目前時間
 */
function updateCurrentTime() {
    if (!currentTimeSpan) return;
    const now = new Date();
    currentTimeSpan.textContent = now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
}

/**
 * 從 Firestore 的參數設定中獲取並解析分店地點、半徑和營業時間。
 * MODIFIED: Reads settings from a single config document and parses strings.
 */
async function fetchStoreLocations() {
    if (!pageDb) throw new Error("Firestore (pageDb) is not available.");
    console.log("Fetching store location parameters...");
    storeLocations = []; // Reset the global array

    try {
        // --- TODO: Replace these placeholders with actual Firestore read logic --- 
        // 1. Define the path to your config document
        const CONFIG_COLLECTION = 'settings'; // ??? PLEASE VERIFY ???
        const CONFIG_DOCUMENT_ID = 'main_config'; // ??? PLEASE VERIFY ???
        const COORDINATE_FIELD_NAME = 'storeCoordinates'; // ??? PLEASE VERIFY ???
        const RADIUS_FIELD_NAME = 'storeRadii'; // ??? PLEASE VERIFY ???
        const OPENING_HOURS_FIELD_NAME = 'storeOpeningHours'; // ??? PLEASE VERIFY ???

        // 2. Fetch the config document
        // const configDocRef = pageDb.collection(CONFIG_COLLECTION).doc(CONFIG_DOCUMENT_ID);
        // const configDocSnap = await configDocRef.get();

        // 3. Check if the document exists and get the field values
        // if (!configDocSnap.exists()) {
        //     throw new Error(`Config document not found at ${CONFIG_COLLECTION}/${CONFIG_DOCUMENT_ID}`);
        // }
        // const configData = configDocSnap.data();

        // --- Placeholder Data (Replace with actual data from configData) ---
        // const coordinateString = configData[COORDINATE_FIELD_NAME] || '';
        // const radiusString = configData[RADIUS_FIELD_NAME] || '';
        // const openingHoursString = configData[OPENING_HOURS_FIELD_NAME] || '';
        // Example Placeholder Data:
        const coordinateString = "忠孝2=24.9748412,121.2556713;龍安2=24.9880023,121.2812737;龍崗2=24.9298505,121.2529472"; // Example
        const radiusString = "忠孝100;龍安50;龍崗"; // Example
        const openingHoursString = "忠孝1500-0000,0000-0100;龍安1500-0000,0000-0100;龍崗1500-0000,0000-0100"; // Example
        // --- End of Placeholder Data ---
        // --- End of TODO section for Firestore read ---

        // --- Parse the strings --- 
        const parsedCoordinates = {};
        coordinateString.split(';').forEach(part => {
            const [namePart, coords] = part.split('=');
            if (namePart && coords) {
                const nameMatch = namePart.match(/^([^\d]+)(\d*)$/); // Separate name and trailing digits
                if (nameMatch) {
                    const pureName = nameMatch[1]; // e.g., "忠孝"
                    const [lat, lon] = coords.split(',').map(Number);
                    if (pureName && !isNaN(lat) && !isNaN(lon)) {
                        parsedCoordinates[pureName] = { latitude: lat, longitude: lon };
                    } else {
                        logger.warn(`Invalid coordinate format part: ${part}`);
                    }
                } else {
                     logger.warn(`Could not parse store name from: ${namePart}`);
                }
            }
        });

        const parsedRadii = {};
        radiusString.split(';').forEach(part => {
            if (part.trim()) {
                const match = part.match(/^([^\d]+)(\d*)$/);
                if (match) {
                    const pureName = match[1];
                    const radiusValue = match[2];
                    if (pureName) {
                         // If radiusValue is empty or not a valid number, use unlimited
                        const radius = (radiusValue && !isNaN(parseInt(radiusValue))) ? parseInt(radiusValue) : UNLIMITED_RADIUS;
                        parsedRadii[pureName] = radius;
                    } else {
                         logger.warn(`Could not parse store name from radius part: ${part}`);
                    }
                }
             } else {
                 logger.warn(`Invalid radius format part: ${part}`);
             }
        });

        const parsedOpeningHours = {};
        openingHoursString.split(';').forEach(part => {
            if (part.trim()) {
                const firstDigitIndex = part.search(/\d/);
                if (firstDigitIndex > 0) {
                    const pureName = part.substring(0, firstDigitIndex).trim();
                    const hoursStr = part.substring(firstDigitIndex).trim();
                    if (pureName && hoursStr) {
                        // --- MODIFIED: Parse the hours string into usable objects ---
                        const timeRanges = [];
                        hoursStr.split(',').forEach(rangeStr => {
                            const [startStr, endStr] = rangeStr.split('-');
                            if (startStr && endStr && startStr.length === 4 && endStr.length === 4) {
                                try {
                                    const startHours = parseInt(startStr.substring(0, 2));
                                    const startMinutes = parseInt(startStr.substring(2, 4));
                                    const endHours = parseInt(endStr.substring(0, 2));
                                    const endMinutes = parseInt(endStr.substring(2, 4));

                                    if (!isNaN(startHours) && !isNaN(startMinutes) && !isNaN(endHours) && !isNaN(endMinutes)) {
                                        timeRanges.push({
                                            start: { hours: startHours, minutes: startMinutes },
                                            end: { hours: endHours, minutes: endMinutes }
                                        });
                                    } else {
                                         logger.warn(`Invalid time format in range: ${rangeStr} for ${pureName}`);
                                    }
                                } catch (e) {
                                     logger.warn(`Error parsing time range ${rangeStr} for ${pureName}:`, e);
                                }
                            } else {
                                 logger.warn(`Invalid time range format: ${rangeStr} for ${pureName}`);
                            }
                        });
                        parsedOpeningHours[pureName] = timeRanges; // Store the array of parsed ranges
                        // --- End of MODIFICATION ---
                    } else {
                          logger.warn(`Could not parse opening hours part: ${part}`);
                    }
                 } else if (/^[^\d]+$/.test(part.trim())) {
                     const pureName = part.trim();
                     parsedOpeningHours[pureName] = []; // Store empty array for no hours defined
                 } else {
                     logger.warn(`Invalid opening hours format part: ${part}`);
                 }
            }
        });

        // --- Combine parsed data --- 
        storeLocations = Object.keys(parsedCoordinates).map(pureName => {
            const coords = parsedCoordinates[pureName];
            const radius = parsedRadii[pureName] ?? UNLIMITED_RADIUS;
            const hoursData = parsedOpeningHours[pureName] ?? []; // Default to empty array
            
            return {
                id: pureName, 
                name: pureName,
                latitude: coords.latitude,
                longitude: coords.longitude,
                radius: radius,
                // openingHoursString: hours, // Old way: storing raw string
                openingHours: hoursData // New way: storing parsed array of ranges
            };
        });

        if (storeLocations.length === 0) {
             console.warn("No valid store locations could be parsed from the parameter strings.");
             // Consider default or error handling
        }
        console.log("Store locations processed:", storeLocations);

    } catch (error) {
        console.error("Error processing store location parameters:", error);
        // Keep storeLocations empty or handle error appropriately
        throw new Error(`讀取或解析地點參數時發生錯誤: ${error.message}`);
    }
}

/**
 * 請求用戶地理位置
 */
function requestLocation() {
    locationStatusSpan.textContent = "請求授權中...";
    if (!navigator.geolocation) {
        locationStatusSpan.textContent = "瀏覽器不支援定位";
        disableClockButtons('瀏覽器不支援');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        handleLocationSuccess,
        handleLocationError,
        {
            enableHighAccuracy: true, // 嘗試更高精度
            timeout: 15000,          // 15秒超時
            maximumAge: 0           // 不使用快取
        }
    );
}

// --- 新增：初始化地圖函數 ---
function initMap() {
    if (!mapContainer) return;
    if (mapInstance) return; // 防止重複初始化

    mapContainer.textContent = ''; // 清空 "(地圖載入區域 - 可選)"

    try {
        // 預設視圖中心點 (例如台北車站) 和縮放級別
        mapInstance = L.map(mapContainer).setView([25.0479, 121.5171], 15);

        // 添加圖層 (使用 OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mapInstance);

        console.log("Leaflet map initialized.");

    } catch (error) {
        console.error("Error initializing Leaflet map:", error);
        mapContainer.innerHTML = '<p style="color:red">地圖載入失敗</p>';
        mapInstance = null;
    }
}

// --- 修改 handleLocationSuccess ---
function handleLocationSuccess(position) {
    currentPosition = position.coords;
    console.log("Location acquired:", currentPosition);

    // Update DOM elements
    locationStatusSpan.textContent = "定位成功";
    longitudeSpan.textContent = currentPosition.longitude.toFixed(6);
    latitudeSpan.textContent = currentPosition.latitude.toFixed(6);
    accuracySpan.textContent = currentPosition.accuracy.toFixed(1);

    // --- Accuracy Check ---
    const ACCURACY_THRESHOLD = 100; // 準確度閾值 (米)，可調整
    if (currentPosition.accuracy > ACCURACY_THRESHOLD) {
        locationStatusSpan.textContent = `定位成功 (但誤差較大: ${currentPosition.accuracy.toFixed(0)}米)`;
        validationSpan.textContent = "請移至訊號較佳處";
        validationSpan.className = 'warning-message'; // Or a specific class
        disableClockButtons(`誤差範圍過大 (>${ACCURACY_THRESHOLD}米)`);
        updateMap(); // Still update map to show current inaccurate location
        console.warn(`Accuracy (${currentPosition.accuracy}m) exceeds threshold (${ACCURACY_THRESHOLD}m).`);
        // Optionally add a retry button here
        return; // Stop further processing like validation if accuracy is poor
    }
    // --- End Accuracy Check ---

    updateMap(); // Update map display
    validateLocation(); // Proceed with location validation
}

/**
 * 獲取位置失敗的回調
 * @param {GeolocationPositionError} error
 */
function handleLocationError(error) {
    console.error("Geolocation error:", error);
    currentPosition = null;
    let message = "定位失敗";
    let suggestion = "請檢查裝置定位設定或稍後再試。"; // Default suggestion

    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = "您拒絕了定位請求";
            suggestion = "請允許瀏覽器/APP存取您的位置才能打卡。";
            break;
        case error.POSITION_UNAVAILABLE:
            message = "無法獲取目前位置";
            suggestion = "請確認您的裝置定位功能已開啟，並處於訊號良好的地方。";
            break;
        case error.TIMEOUT:
            message = "定位請求超時";
            suggestion = "請嘗試移動到網路或GPS訊號較佳的位置再試一次。";
            break;
        default:
            message = "發生未知定位錯誤";
            suggestion = `錯誤碼: ${error.code}, 訊息: ${error.message}`; // Include details if unknown
    }
    locationStatusSpan.textContent = `${message} - ${suggestion}`;
    longitudeSpan.textContent = "---";
    latitudeSpan.textContent = "---";
    accuracySpan.textContent = "---";
    validationSpan.textContent = "無法驗證";
    validationSpan.className = '';
    disableClockButtons('定位失敗');
    // Maybe clear the map or show a default state
    if (mapInstance && userMarker) {
        mapInstance.removeLayer(userMarker);
        userMarker = null;
    }
}

// --- 新增：更新地圖顯示函數 ---
function updateMap() {
    if (!mapInstance || !currentPosition) return;

    const lat = currentPosition.latitude;
    const lng = currentPosition.longitude;
    const accuracy = currentPosition.accuracy;

    // 移動地圖視圖到用戶位置
    mapInstance.setView([lat, lng], 16); // 可以根據精確度調整縮放

    // 更新或創建用戶位置標記
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        userMarker = L.marker([lat, lng]).addTo(mapInstance);
    }
    userMarker.bindPopup(`你的位置<br>精確度: ${accuracy.toFixed(1)} 米`).openPopup();

    // 清除舊的範圍圓圈
    locationCircles.forEach(circle => mapInstance.removeLayer(circle));
    locationCircles = [];

    // 繪製允許的打卡範圍圈
    storeLocations.forEach(loc => {
        if (loc.latitude && loc.longitude && loc.radius) {
            const circle = L.circle([loc.latitude, loc.longitude], {
                color: 'blue',
                fillColor: '#30f',
                fillOpacity: 0.2,
                radius: loc.radius // 半徑單位是米
            }).addTo(mapInstance);
            circle.bindPopup(`${loc.name || loc.id}<br>允許半徑: ${loc.radius} 米`);
            locationCircles.push(circle);
        }
    });

     // (可選) 繪製定位精確度範圍圈
     const accuracyCircle = L.circle([lat, lng], {
          radius: accuracy,
          color: 'gray',
          fillColor: '#ccc',
          fillOpacity: 0.1,
          weight: 1,
          dashArray: '5, 5'
     }).addTo(mapInstance);
     locationCircles.push(accuracyCircle); // 也加入陣列以便清除
}

/**
 * 驗證地理位置 (MODIFIED: Enable buttons on success)
 */
function validateLocation() {
    if (!currentPosition || !storeSelectElement) { // Check storeSelectElement too
        validationSpan.textContent = "無法驗證 (缺位置或未選分店)";
        disableClockButtons('無法驗證地點');
        return;
    }

    const selectedStoreId = storeSelectElement.value;
    if (!selectedStoreId) {
        validationSpan.textContent = "請先選擇分店";
        validationSpan.className = 'warning-message';
        disableClockButtons('請選擇分店');
        return;
    }

     // Find the location data for the selected store
     // We need to re-fetch or ensure storeLocations is populated correctly
     // Assuming storeLocations is populated correctly during init/fetchStoreLocations
     const selectedStoreData = storeLocations.find(loc => loc.id === selectedStoreId);

     if (!selectedStoreData || !selectedStoreData.latitude || !selectedStoreData.longitude) {
          validationSpan.textContent = `找不到 "${selectedStoreId}" 的位置資訊`;
          validationSpan.className = 'error-message';
          disableClockButtons('分店位置未知');
          return;
     }

    // --- MODIFIED: Check distance against selected store and its specific radius ---
    validationResult = { inRange: false, distance: Infinity, requiredRadius: UNLIMITED_RADIUS, storeId: selectedStoreId };

    const distance = calculateDistance(
        currentPosition.latitude, currentPosition.longitude,
        selectedStoreData.latitude, selectedStoreData.longitude
    );
    validationResult.distance = distance;

    // Get radius limit for the selected store from settings
     let radiusLimit = UNLIMITED_RADIUS; // Default to unlimited
     if (clockinSettings.loaded && !clockinSettings.error && clockinSettings.storeGeofenceRadii[selectedStoreId] !== undefined) {
         radiusLimit = clockinSettings.storeGeofenceRadii[selectedStoreId];
     } else if (!clockinSettings.loaded) {
          console.warn("Radius check skipped: Settings not loaded yet.");
     } else if (clockinSettings.error) {
          console.warn(`Radius check skipped for ${selectedStoreId} due to settings load error: ${clockinSettings.error}`);
     } else {
          console.log(`No specific radius found for store "${selectedStoreId}" in settings. Assuming unlimited.`);
     }

     validationResult.requiredRadius = radiusLimit; // Store the limit used

    // Perform the check
    if (distance <= radiusLimit) {
        validationResult.inRange = true;
        const radiusText = radiusLimit === UNLIMITED_RADIUS ? '無限制' : `${radiusLimit.toFixed(0)} 米`;
        validationSpan.textContent = `驗證成功 (距離: ${distance.toFixed(0)} 米 / 範圍: ${radiusText})`;
        validationSpan.className = 'success-message';
        // Fetch last record again to ensure button state is correct AFTER validation
        fetchLastRecord().then(() => {
            // enableClockButtonsBasedOnLastRecord(); // Called by fetchLastRecord
        });
    } else {
        validationResult.inRange = false;
        const radiusText = radiusLimit === UNLIMITED_RADIUS ? '未知限制' : `${radiusLimit.toFixed(0)} 米`; // Show limit even if failed
        validationSpan.textContent = `驗證失敗 (距離: ${distance.toFixed(0)} 米 / 需要 <= ${radiusText})`;
        validationSpan.className = 'error-message';
        disableClockButtons('超出打卡範圍');
    }
    console.log("Location validation result:", validationResult);
    // --- End MODIFICATION ---
}
    

/**
 * 計算兩點之間的距離 (Haversine 公式)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} 距離 (米)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 地球半徑 (米)
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// --- 新增：解析半徑設定的輔助函數 ---
function parseGeofenceRadii(radiiString) {
    const radii = {};
    if (!radiiString || typeof radiiString !== 'string') return radii;

    radiiString.split(';').forEach(part => {
        part = part.trim();
        if (!part) return;

        // Match store name (non-digit start) and optional radius (digits)
        const match = part.match(/^([^0-9]+)(\d+)?$/);
        if (match) {
            const storeName = match[1].trim();
            const radiusValue = match[2] ? parseInt(match[2], 10) : UNLIMITED_RADIUS; // No number means unlimited
            if (storeName) {
                 radii[storeName] = isNaN(radiusValue) ? UNLIMITED_RADIUS : radiusValue;
            } else {
                 console.warn(`Could not parse store name from geofence part: "${part}"`);
            }
        } else if (/^[^0-9]+$/.test(part)) {
             // Handle cases like "StoreC" with no radius specified -> unlimited
             const storeName = part.trim();
             if(storeName) radii[storeName] = UNLIMITED_RADIUS;
        }
        else {
            console.warn(`Invalid geofence format part: "${part}"`);
        }
    });
    return radii;
}

// --- 新增：解析營業時間設定的輔助函數 ---
function parseOperatingHours(hoursString) {
    const hours = {};
    if (!hoursString || typeof hoursString !== 'string') return hours;

    hoursString.split(';').forEach(part => {
        part = part.trim();
        if (!part) return;

        // Separate store name from time ranges
        const firstHyphenIndex = part.indexOf('-'); // Should be within time like HHMM-HHMM
        const firstCommaIndex = part.indexOf(','); // Separates time ranges
        const firstDigitIndex = part.search(/\d/); // Find first digit

        let storeName = '';
        let timeRangesStr = '';

        if (firstDigitIndex > 0) {
             storeName = part.substring(0, firstDigitIndex).trim();
             timeRangesStr = part.substring(firstDigitIndex).trim();
        } else if (firstDigitIndex === -1 && /^[^,;-]+$/.test(part)){
             // Handle case like "StoreC" with no hours specified
             storeName = part.trim();
             timeRangesStr = ''; // No hours defined
        } else {
             console.warn(`Could not determine store name in operating hours part: "${part}"`);
             return; // Skip this part
        }


        if (!storeName) {
             console.warn(`Could not parse store name from operating hours part: "${part}"`);
             return; // Skip if store name is missing
        }

        const timeRanges = [];
        if (timeRangesStr) {
            timeRangesStr.split(',').forEach(rangeStr => {
                rangeStr = rangeStr.trim();
                const times = rangeStr.split('-');
                if (times.length === 2) {
                    const startStr = times[0].trim();
                    const endStr = times[1].trim();
                    // Basic validation for HHMM format
                    if (/^\d{4}$/.test(startStr) && /^\d{4}$/.test(endStr)) {
                        try {
                             const startH = parseInt(startStr.substring(0, 2), 10);
                             const startM = parseInt(startStr.substring(2, 4), 10);
                             const endH = parseInt(endStr.substring(0, 2), 10);
                             const endM = parseInt(endStr.substring(2, 4), 10);

                             // Basic sanity check for hours/minutes
                             if (startH >= 0 && startH < 24 && startM >= 0 && startM < 60 &&
                                 endH >= 0 && endH < 24 && endM >= 0 && endM < 60) {
                                timeRanges.push({
                                    start: { hours: startH, minutes: startM },
                                    end: { hours: endH, minutes: endM }
                                });
                             } else {
                                 console.warn(`Invalid hour/minute value in time range "${rangeStr}" for store "${storeName}"`);
                             }
                        } catch (e) {
                            console.warn(`Error parsing time range "${rangeStr}" for store "${storeName}":`, e);
                        }
                    } else {
                         console.warn(`Invalid time format (HHMM-HHMM) in range "${rangeStr}" for store "${storeName}"`);
                    }
                } else {
                    console.warn(`Invalid time range format (missing '-') in "${rangeStr}" for store "${storeName}"`);
                }
            });
        }
         hours[storeName] = timeRanges; // Store parsed ranges (or empty array if none)
    });
    return hours;
}

// --- 新增：檢查是否在營業時間內的函數 ---
function isWithinOperatingHours(storeId) {
     if (!clockinSettings.loaded || clockinSettings.error || !storeId) {
         console.warn("Skipping operating hours check: Settings not loaded, errored, or storeId missing.");
         return true; // Default to true if settings are unavailable or no store selected
     }

     const storeHours = clockinSettings.storeOperatingHours[storeId];
     if (!storeHours) {
          console.log(`No specific operating hours defined for store "${storeId}". Allowing clock-in.`);
          return true; // No hours defined for this store = always allowed
     }
     if (storeHours.length === 0) {
         console.log(`Operating hours list is empty for store "${storeId}". Allowing clock-in.`);
         return true; // Empty list means allowed (or could be interpreted as never allowed, adjust if needed)
     }


     const now = new Date();
     const currentMinutes = now.getHours() * 60 + now.getMinutes(); // Current time in minutes since midnight

     for (const range of storeHours) {
         const startMinutes = range.start.hours * 60 + range.start.minutes;
         let endMinutes = range.end.hours * 60 + range.end.minutes;

         // Handle overnight ranges (e.g., 22:00 - 02:00)
         if (endMinutes < startMinutes) {
             // Case 1: Current time is after start (e.g., 23:00 in 22:00-02:00)
             if (currentMinutes >= startMinutes) {
                 return true;
             }
             // Case 2: Current time is before end (e.g., 01:00 in 22:00-02:00)
              // Need to check against end time + 24 hours (in minutes) implicitly
             if (currentMinutes < endMinutes) { // This comparison works because endMinutes is small
                 return true;
             }
         } else {
             // Normal range (e.g., 09:00 - 17:00)
             if (currentMinutes >= startMinutes && currentMinutes < endMinutes) { // Usually end time is exclusive
                 return true;
             }
         }
     }

     console.log(`Current time (${now.getHours()}:${now.getMinutes()}) is outside operating hours for store "${storeId}".`);
     return false; // Not within any defined range
}

// --- 新增：填充分店下拉選單的函數 ---
function populateStoreDropdown() {
    if (!storeSelectElement) return;
    storeSelectElement.innerHTML = '<option value="">-- 請選擇分店 --</option>'; // 清空舊選項並加回預設

    availableStores.forEach(storeName => {
        const option = document.createElement('option');
        option.value = storeName;
        option.textContent = storeName;
        // 檢查是否為用戶的預設分店
        if (pageCurrentUser?.store === storeName) {
            option.selected = true;
        }
        storeSelectElement.appendChild(option);
    });

    // 如果用戶有預設分店但該分店不在列表，仍加入並選中 (可選)
     if (pageCurrentUser?.store && !availableStores.includes(pageCurrentUser.store)) {
          const defaultOption = document.createElement('option');
          defaultOption.value = pageCurrentUser.store;
          defaultOption.textContent = `${pageCurrentUser.store} (預設)`;
          defaultOption.selected = true;
          storeSelectElement.appendChild(defaultOption);
     }

    storeSelectElement.disabled = false; // 啟用下拉選單
}

/**
 * 初始化人臉驗證功能
 */
async function initFaceVerification() {
    // 檢查是否啟用人臉驗證
    try {
        const settingsDoc = await pageDb.collection('settings').doc('security').get();
        if (settingsDoc.exists) {
            const securitySettings = settingsDoc.data();
            faceVerificationEnabled = securitySettings.enableFaceVerification || false;
            
            console.log(`人臉驗證功能${faceVerificationEnabled ? '已啟用' : '未啟用'}`);
            
            if (faceVerificationEnabled) {
                // 檢查是否已引入face-verification.js
                if (typeof FaceVerification === 'undefined') {
                    console.warn('人臉驗證功能已啟用，但未找到FaceVerification類。請確保已引入face-verification.js');
                    showMessage('無法初始化人臉驗證功能，請聯絡系統管理員', 'warning');
                    return false;
                }
                
                // 檢查用戶是否已設置參考人臉
                const userDoc = await pageDb.collection('users').doc(pageCurrentUser.uid).get();
                if (!userDoc.exists || !userDoc.data().faceImageUrl) {
                    console.warn('用戶尚未設置參考人臉');
                    showMessage('請先在個人設置中設置您的參考人臉', 'warning');
                    return false;
                }
                
                return true;
            }
        }
    } catch (error) {
        console.error('初始化人臉驗證時發生錯誤:', error);
    }
    
    return false;
}

/**
 * 顯示人臉驗證對話框
 * @returns {Promise<boolean>} 驗證結果
 */
function showFaceVerificationDialog() {
    return new Promise((resolve, reject) => {
        // 創建驗證對話框
        const modalBackground = document.createElement('div');
        modalBackground.className = 'face-verification-modal';
        modalBackground.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.className = 'face-verification-content';
        modalContent.style.cssText = `
            background-color: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 90%;
            width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        `;
        
        modalContent.innerHTML = `
            <div class="face-verification-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h5 style="margin: 0; font-size: 1.25rem;">人臉身份驗證</h5>
                <button class="close-button" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            <div class="camera-container" style="position: relative; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <video id="face-camera-feed" autoplay playsinline style="width: 100%; display: block;"></video>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                            width: 220px; height: 300px; border: 2px dashed rgba(255, 255, 255, 0.7); 
                            border-radius: 50% 50% 45% 45%; pointer-events: none;"></div>
                <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
                            background-color: rgba(0, 0, 0, 0.5); color: white; padding: 5px 10px;
                            border-radius: 15px; font-size: 14px;">請將臉部對準框內</div>
            </div>
            <div class="controls" style="margin-top: 15px; display: flex; gap: 10px; justify-content: center;">
                <button id="face-capture-button" class="btn btn-primary" style="padding: 6px 12px; border-radius: 4px;">
                    開始攝像頭
                </button>
                <button id="face-verify-button" class="btn btn-success" style="padding: 6px 12px; border-radius: 4px;" disabled>
                    驗證
                </button>
                <button id="face-reset-button" class="btn btn-secondary" style="padding: 6px 12px; border-radius: 4px;">
                    重置
                </button>
            </div>
            <div style="display: flex; justify-content: center; margin-top: 10px;">
                <img id="face-captured-image" src="" alt="Captured face" style="max-width: 150px; max-height: 150px; display: none; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div id="face-verification-status" style="margin-top: 15px; text-align: center; font-weight: bold; color: #0d6efd;">
                請點擊"開始攝像頭"按鈕開始驗證
            </div>
            <div style="margin-top: 15px; display: flex; justify-content: space-between;">
                <button id="face-skip-button" class="btn btn-outline-warning" style="padding: 6px 12px; border-radius: 4px;">
                    跳過驗證
                </button>
                <button id="face-continue-button" class="btn btn-success" style="padding: 6px 12px; border-radius: 4px;" disabled>
                    確認並繼續
                </button>
            </div>
        `;
        
        modalBackground.appendChild(modalContent);
        document.body.appendChild(modalBackground);
        
        // 初始化人臉驗證
        faceVerification = new FaceVerification({
            cameraSelector: '#face-camera-feed',
            captureButtonSelector: '#face-capture-button',
            verifyButtonSelector: '#face-verify-button',
            resetButtonSelector: '#face-reset-button',
            statusSelector: '#face-verification-status',
            capturedImageSelector: '#face-captured-image',
            confidenceThreshold: 0.8,
            maxRetries: 3,
            mockAPI: false, // 實際環境中應該設為false
            verificationSuccess: function(data) {
                faceVerificationResult = data;
                document.getElementById('face-continue-button').disabled = false;
                
                // 添加驗證成功的視覺反饋
                const statusElement = document.getElementById('face-verification-status');
                statusElement.textContent = `驗證成功，信心指數: ${(data.confidence * 100).toFixed(2)}%`;
                statusElement.style.color = '#198754'; // Bootstrap 5 success color
            },
            verificationFailure: function(data) {
                faceVerificationResult = data;
                // 驗證失敗時的反饋
                const statusElement = document.getElementById('face-verification-status');
                statusElement.textContent = `驗證失敗，信心指數過低: ${(data.confidence * 100).toFixed(2)}%`;
                statusElement.style.color = '#dc3545'; // Bootstrap 5 danger color
            }
        });
        
        // 初始化模塊
        faceVerification.init().then(async success => {
            if (!success) {
                console.warn('初始化人臉驗證模塊失敗');
                
                // 如果初始化失敗，顯示警告但允許繼續
                const statusElement = document.getElementById('face-verification-status');
                statusElement.textContent = '初始化人臉驗證失敗，請重試或選擇跳過';
                statusElement.style.color = '#dc3545';
            } else {
                // 加載用戶參考人臉
                if (pageCurrentUser && pageCurrentUser.uid) {
                    await faceVerification.loadReferenceImage(pageCurrentUser.uid);
                }
            }
        });
        
        // 按鈕事件
        document.querySelector('.close-button').addEventListener('click', () => {
            closeModal(false);
        });
        
        document.getElementById('face-skip-button').addEventListener('click', () => {
            if (confirm('確定要跳過人臉驗證嗎？這將降低打卡的安全性。')) {
                console.log('用戶選擇跳過人臉驗證');
                closeModal(false);
            }
        });
        
        document.getElementById('face-continue-button').addEventListener('click', () => {
            closeModal(true);
        });
        
        // 關閉模態對話框
        function closeModal(verified) {
            if (faceVerification) {
                faceVerification.destroy();
                faceVerification = null;
            }
            
            document.body.removeChild(modalBackground);
            resolve(verified);
        }
    });
}

/**
 * 處理打卡動作時加入人臉驗證檢查
 */
async function handleClockAction() {
    // 1. Pre-checks
    if (isClocking) {
        showMessage('正在處理中，請稍候...', 'warning');
        return;
    }
    
    // --- ADDED: Store Selection Check ---
    const selectedStoreId = storeSelectElement?.value;
    if (!selectedStoreId) {
        showMessage('請先選擇您要打卡的分店。', 'error');
        return;
    }
    // --- End ADDED ---

    // Check geofence validation result again
    if (!validationResult.inRange || validationResult.storeId !== selectedStoreId) {
        // Re-validate if store changed or last validation failed
        showMessage('位置驗證未通過或已變更，請重新定位或確認分店。', 'warning');
        requestLocation(); // Trigger re-validation for the current selection
        return;
    }

    // --- ADDED: Operating Hours Check ---
    if (!isWithinOperatingHours(selectedStoreId)) {
        showMessage(`打卡失敗：目前時間不在 "${selectedStoreId}" 的營業時間內。`, 'error');
        return;
    }
    // --- End ADDED ---

    // --- 新增：人臉驗證流程 ---
    if (faceVerificationEnabled) {
        // 初始化人臉驗證
        const canVerify = await initFaceVerification();
        
        if (canVerify) {
            showMessage('正在進行人臉驗證...', 'info');
            
            try {
                // 顯示人臉驗證對話框
                const verificationPassed = await showFaceVerificationDialog();
                
                if (!verificationPassed) {
                    console.log('人臉驗證未通過或已取消');
                    
                    // 檢查是否已設置備用驗證方法
                    const userDoc = await pageDb.collection('users').doc(pageCurrentUser.uid).get();
                    if (userDoc.exists && userDoc.data().requireFaceVerification === true) {
                        showMessage('人臉驗證未通過，無法進行打卡', 'error');
                        return;
                    } else {
                        // 允許繼續，但會記錄跳過驗證的情況
                        showMessage('已跳過人臉驗證，繼續打卡流程', 'warning');
                    }
                } else {
                    showMessage('人臉驗證已通過，繼續打卡流程', 'success');
                }
            } catch (error) {
                console.error('人臉驗證過程中發生錯誤:', error);
                showMessage('人臉驗證過程中發生錯誤: ' + error.message, 'error');
                return;
            }
        } else {
            // 驗證無法進行，但仍允許打卡
            console.log('無法進行人臉驗證，繼續打卡流程');
        }
    }
    // --- 人臉驗證流程結束 ---

    if (!pageFuncs) {
        showMessage('錯誤：無法連接後端服務，請稍後再試。', 'error');
        return;
    }

    isClocking = true;
    disableClockButtons('處理中...'); // Disable both buttons
    showMessage('正在打卡...', 'info');

    // 2. Call Cloud Function
    const recordClockEventFunction = pageFuncs.httpsCallable('recordClockEvent');
    try {
        // Prepare data to send
        const dataToSend = {
            storeId: selectedStoreId
        };
        
        if (currentPosition) {
            dataToSend.location = {
                latitude: currentPosition.latitude,
                longitude: currentPosition.longitude,
                accuracy: currentPosition.accuracy
            };
        }
        
        // 添加人臉驗證結果（如果有）
        if (faceVerificationResult) {
            dataToSend.faceVerification = {
                verified: faceVerificationResult.isVerified,
                confidence: faceVerificationResult.confidence,
                timestamp: faceVerificationResult.timestamp
            };
        }

        console.log("Calling recordClockEvent with data:", dataToSend);
        const result = await recordClockEventFunction(dataToSend);
        console.log("Cloud Function response:", result.data);

        if (result.data && result.data.status === 'success') {
            const actionDone = result.data.action === 'clockIn' ? '上班' : '下班';
            showMessage(`打卡成功 (${actionDone})`, 'success');
            
            // 3. Update UI based on success
            // Fetch the latest record to get server time and update display
            await fetchLastRecord(); 
            // enableClockButtonsBasedOnLastRecord() will be called by fetchLastRecord
        } else {
            // Handle specific errors returned by the function if any
            throw new Error(result.data.message || '後端處理打卡時發生未知錯誤。');
        }

    } catch (error) {
        console.error("Error calling recordClockEvent function:", error);
        // Try to parse HttpsError details
        let displayError = error.message;
        if (error.code === 'functions/internal' && error.details) {
            displayError = `後端錯誤: ${error.details}`; // Show details if available
        } else if (error.code === 'functions/failed-precondition') {
            displayError = `打卡條件不符: ${error.message}`; // More specific feedback
        }
        showMessage(`打卡失敗: ${displayError}`, 'error');
        // Re-enable buttons based on the *last known* successful state after a delay
        setTimeout(() => {
            enableClockButtonsBasedOnLastRecord(); 
        }, 1500); 
    } finally {
        isClocking = false;
        // 清除人臉驗證結果
        faceVerificationResult = null;
        // Buttons are re-enabled by enableClockButtonsBasedOnLastRecord
    }
}

/**
 * 獲取最後一次打卡記錄 (MODIFIED: Calls enableClockButtonsBasedOnLastRecord)
 */
async function fetchLastRecord() {
    // ADDED: Guard clause to ensure currentUser and uid are available
    if (!pageCurrentUser || !pageCurrentUser.uid || !pageDb) {
        console.warn("fetchLastRecord: Skipping fetch because currentUser, uid or db is not available.");
        // Optionally disable buttons or show a message if this happens unexpectedly
         disableClockButtons('無法讀取用戶資訊');
         lastClockRecord = null; // Ensure state is cleared
         updateLastRecordDisplay(); // Update UI
         enableClockButtonsBasedOnLastRecord(); // Try to update button state based on cleared record
        return; // Stop execution here
    }
    console.log("Fetching last clock record for user:", pageCurrentUser.uid);
    try {
        // Option 1: Query clock_records collection
        const recordsRef = pageDb.collection('clock_records')
                            .where('userId', '==', pageCurrentUser.uid) // Now uid should be valid
                            .orderBy('timestamp', 'desc')
                            .limit(1);
        const snapshot = await recordsRef.get();

        if (!snapshot.empty) {
            lastClockRecord = snapshot.docs[0].data();
            console.log("Last record found:", lastClockRecord);
        } else {
            lastClockRecord = null; // No previous records
            console.log("No previous clock records found.");
        }
        
        // Option 2: Read directly from employee document (if storing last status there)
        /*
        const employeeRef = pageDb.collection('employees').doc(pageCurrentUser.uid);
        const docSnap = await employeeRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            lastClockRecord = {
                action: data.clockStatus === 'in' ? 'clockIn' : 'clockOut',
                timestamp: data.clockStatus === 'in' ? data.lastClockIn : data.lastClockOut
                // Add other fields if needed
            }
        } else {
            lastClockRecord = null;
        }
        */
        
        updateLastRecordDisplay(); // Update UI text
        enableClockButtonsBasedOnLastRecord(); // Enable/disable buttons based on state

    } catch (error) {
        console.error("Error fetching last record:", error);
        lastRecordSpan.textContent = "讀取上次記錄失敗";
        disableClockButtons('讀取記錄失敗');
        lastClockRecord = null;
    }
}

/**
 * 更新上次打卡記錄的顯示文字 (MODIFIED: Handle server timestamps)
 */
function updateLastRecordDisplay() {
    if (!lastRecordSpan) return;
    if (lastClockRecord && lastClockRecord.timestamp) {
        let timeStr = '未知時間';
        // Check if timestamp is a Firestore Timestamp object
        if (lastClockRecord.timestamp.toDate) { 
            try {
                 timeStr = lastClockRecord.timestamp.toDate().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
            } catch(e) { console.error("Error formatting timestamp:", e); }
        } else {
             console.warn("Last record timestamp is not a Firestore Timestamp object:", lastClockRecord.timestamp);
             // Attempt to display if it's already a string/number?
             timeStr = new Date(lastClockRecord.timestamp).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }); // Fallback attempt
        }
        
        const actionText = lastClockRecord.action === 'clockIn' ? '上班打卡' : '下班打卡';
        lastRecordSpan.textContent = `上次記錄: ${actionText} (${timeStr})`;
    } else {
        lastRecordSpan.textContent = "無上次打卡記錄";
    }
}

/**
 * 根據最後打卡記錄啟用/禁用按鈕
 */
function enableClockButtonsBasedOnLastRecord() {
    if (!clockInBtn || !clockOutBtn) return;

     // --- MODIFIED: Also check store selection ---
     const selectedStoreId = storeSelectElement?.value;
     if (!selectedStoreId) {
          console.log("Buttons remain disabled: No store selected.");
          disableClockButtons('請選擇分店');
          return;
     }
    // --- End MODIFICATION ---

    // Only enable buttons if location validation passed for the *currently selected* store
    if (!validationResult.inRange || validationResult.storeId !== selectedStoreId) {
        console.log("Buttons remain disabled: location not validated for the selected store.");
        // Keep the '不在打卡範圍內' or '請選擇分店' message from disableClockButtons
        // If validation hasn't run yet, disable with a generic message?
        if (validationSpan.textContent.includes('驗證')) { // Check if validation ran
             disableClockButtons('超出打卡範圍');
        } else {
             disableClockButtons('需先定位');
        }
        return;
    }

    // --- ADDED: Operating Hours Check (redundant check for robustness) ---
     if (!isWithinOperatingHours(selectedStoreId)) {
          console.log("Buttons remain disabled: Outside operating hours.");
          disableClockButtons('非營業時間');
          return;
     }
    // --- End ADDED ---


    if (!lastClockRecord || lastClockRecord.action === 'clockOut') {
        // If no record or last action was clock out, enable Clock In
        enableClockButtons('in');
        console.log("Enabled Clock In button.");
    } else { // Enable both (should not happen in normal flow but safe)
         clockInBtn.disabled = false; clockInBtn.textContent = '打卡上班';
         clockOutBtn.disabled = false; clockOutBtn.textContent = '打卡下班';
         // Check if lastClockRecord exists and log its state if unexpected enable happened
         console.warn("Enabled both clock buttons - unexpected state. Last record:", lastClockRecord);
    }
}

/**
 * 啟用指定的打卡按鈕 (in 或 out)
 */
function enableClockButtons(type) {
    if (!clockInBtn || !clockOutBtn) return;
    if (type === 'in') {
        clockInBtn.disabled = false;
        clockInBtn.textContent = '打卡上班';
        clockOutBtn.disabled = true;
        clockOutBtn.textContent = '請先上班打卡';
        console.log("Enabled Clock In button.");
    } else if (type === 'out') {
        clockInBtn.disabled = true;
        clockInBtn.textContent = '已上班打卡';
        clockOutBtn.disabled = false;
        clockOutBtn.textContent = '打卡下班';
        console.log("Enabled Clock Out button.");
    } else { // Enable both (should not happen in normal flow but safe) 
         clockInBtn.disabled = false; clockInBtn.textContent = '打卡上班';
         clockOutBtn.disabled = false; clockOutBtn.textContent = '打卡下班';
         console.warn("Enabled both clock buttons - unexpected state.");
    }
}

/**
 * 禁用所有打卡按鈕
 */
function disableClockButtons(reason = '') {
    if (!clockInBtn || !clockOutBtn) return;
    clockInBtn.disabled = true;
    clockOutBtn.disabled = true;
    if (reason) {
        // Optionally update button text or a shared message area
         // Avoid overly long messages in buttons
         let btnText = reason;
         if (reason.length > 10) { // Simple length check
             // Try to provide context in messageElement instead
             showMessage(`打卡按鈕已禁用: ${reason}`, 'warning');
             // Use a shorter text for buttons
             if (reason.includes('範圍')) btnText = '超出範圍';
             else if (reason.includes('時間')) btnText = '非營業時間';
             else if (reason.includes('讀取')) btnText = '讀取錯誤';
             else if (reason.includes('分店')) btnText = '選分店';
              else if (reason.includes('定位')) btnText = '需定位';
             else btnText = '無法打卡';
         }
         clockInBtn.textContent = btnText;
         clockOutBtn.textContent = btnText;
        console.log(`Clock buttons disabled: ${reason}`);
    } else {
         // Default disabled text?
         clockInBtn.textContent = '處理中...';
         clockOutBtn.textContent = '處理中...';
    }
}

/**
 * 顯示訊息
 * @param {string} msg
 * @param {'info' | 'success' | 'error'} type
 */
function showMessage(msg, type = 'info') {
    if (messageElement) {
        messageElement.textContent = msg;
        messageElement.className = `message ${type}-message`;
    }
}

// --- ADDED: Helper function to parse storeListString --- 
function parseStoreListString(storeString) {
     const locations = [];
     const names = [];
     if (!storeString || typeof storeString !== 'string') {
          return { locations, names };
     }

     // Format: StoreName<Demand>=Lat,Lon;...
     storeString.split(';').forEach(part => {
          part = part.trim();
          if (!part) return;

          const eqIndex = part.indexOf('=');
          if (eqIndex === -1) {
               console.warn(`Invalid store format (missing '='): "${part}"`);
               return;
          }

          const namePart = part.substring(0, eqIndex).trim();
          const coordsPart = part.substring(eqIndex + 1).trim();

          // Extract name (ignore demand number for clock-in)
          // Match non-digits at the start for the name
          const nameMatch = namePart.match(/^([^0-9]+)/);
          const storeName = nameMatch ? nameMatch[1].trim() : namePart; // Fallback to full part if no number found

          // Extract coordinates
          const coords = coordsPart.split(',');
          if (coords.length === 2) {
               const lat = parseFloat(coords[0].trim());
               const lon = parseFloat(coords[1].trim());

               if (!isNaN(lat) && !isNaN(lon) && storeName) {
                    locations.push({
                         id: storeName, // Use name as ID for now
                         name: storeName,
                         latitude: lat,
                         longitude: lon
                    });
                    names.push(storeName);
               } else {
                    console.warn(`Invalid coordinates or name in store part: "${part}" (Parsed Name: ${storeName}, Lat: ${lat}, Lon: ${lon})`);
               }
          } else {
               console.warn(`Invalid coordinate format (missing ',' or too many parts): "${coordsPart}" in store part "${part}"`);
          }
     });

     return { locations, names };
}

console.log("clockin-logic.js loaded");