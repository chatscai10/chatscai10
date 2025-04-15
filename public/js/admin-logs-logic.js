document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin Logs Logic Initializing...');

    // Check if Firebase is initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error('Firebase is not initialized. Make sure firebase-config.js is loaded before this script.');
        alert('系統初始化失敗，請稍後再試或聯繫管理員。');
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // DOM Elements
    const featureFilter = document.getElementById('feature-filter');
    const employeeFilter = document.getElementById('employee-filter');
    const dateRangeFilterInput = document.getElementById('date-range-filter');
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const logsTableBody = document.getElementById('logs-table-body');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');

    // State variables
    let currentPage = 1;
    const logsPerPage = 20; // Adjust as needed
    let lastVisibleDoc = null;
    let firstVisibleDoc = null;
    let totalPages = 1;
    let currentFilters = {
        feature: '',
        employee: '',
        startDate: null,
        endDate: null
    };
    let dateRangePicker = null; // Flatpickr instance

    // --- Initialization --- 

    function initializePage() {
        console.log('Initializing page components...');
        if (!checkDOMElements()) {
            console.error('Required DOM elements are missing.');
            return;
        }
        setupEventListeners();
        initializeDateRangePicker();
        populateFilterOptions(); // Populate dropdowns
        fetchLogs(); // Initial fetch
        console.log('Page initialized.');
    }

    function checkDOMElements() {
        const elements = [
            featureFilter, employeeFilter, dateRangeFilterInput, applyFiltersBtn,
            resetFiltersBtn, logsTableBody, prevPageBtn, nextPageBtn, pageInfo
        ];
        if (elements.some(el => !el)) {
            console.error('One or more essential DOM elements are missing.');
            return false;
        }
        return true;
    }

    function initializeDateRangePicker() {
        if (typeof flatpickr === 'undefined') {
            console.error('Flatpickr library is not loaded.');
            return;
        }
        dateRangePicker = flatpickr(dateRangeFilterInput, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "zh_tw", // Use Traditional Chinese locale
            onChange: function(selectedDates) {
                if (selectedDates.length === 2) {
                    currentFilters.startDate = selectedDates[0];
                    // Set endDate to the end of the selected day
                    currentFilters.endDate = new Date(selectedDates[1].setHours(23, 59, 59, 999));
                 } else {
                    currentFilters.startDate = null;
                    currentFilters.endDate = null;
                }
            }
        });
        console.log('Date range picker initialized.');
    }

    // --- Filter Logic --- 

    async function populateFilterOptions() {
        console.log('Populating filter options...');
        try {
            // Populate Features (Example - Replace with actual features used in logging)
            const features = ['Login', 'ClockIn', 'Order', 'Scheduling', 'Sales', 'SalaryView', 'BonusProgress', 'AnnouncementView', 'AdminChange', 'SystemTask']; // Add more as needed
            features.sort().forEach(feature => {
                const option = document.createElement('option');
                option.value = feature;
                option.textContent = feature; // Consider mapping to user-friendly names
                featureFilter.appendChild(option);
            });

            // Populate Employees
            const employeesSnapshot = await db.collection('employees').orderBy('employeeId').get();
            employeesSnapshot.forEach(doc => {
                const employee = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; // Use Firestore document ID as value
                option.textContent = `${employee.name} (${employee.employeeId})`;
                employeeFilter.appendChild(option);
            });
            console.log('Filter options populated.');
        } catch (error) {
            console.error('Error populating filter options:', error);
            // Optionally show an error message to the user
        }
    }

    function applyFilters() {
        console.log('Applying filters...');
        currentFilters.feature = featureFilter.value;
        currentFilters.employee = employeeFilter.value;
        // Dates are already updated by flatpickr's onChange

        // Reset pagination and fetch logs with new filters
        currentPage = 1;
        lastVisibleDoc = null;
        firstVisibleDoc = null;
        fetchLogs();
    }

    function resetFilters() {
        console.log('Resetting filters...');
        featureFilter.value = '';
        employeeFilter.value = '';
        if (dateRangePicker) {
            dateRangePicker.clear();
        }
        currentFilters = {
            feature: '',
            employee: '',
            startDate: null,
            endDate: null
        };
        // Reset pagination and fetch logs without filters
        currentPage = 1;
        lastVisibleDoc = null;
        firstVisibleDoc = null;
        fetchLogs();
    }

    // --- Data Fetching --- 

    async function fetchLogs(direction = 'next') {
        console.log(`Fetching logs (Page: ${currentPage}, Direction: ${direction})...`);
        setLoadingState(true);
        try {
            let query = db.collection('activity_logs').orderBy('timestamp', 'desc');

            // Apply filters
            if (currentFilters.feature) {
                query = query.where('feature', '==', currentFilters.feature);
            }
            if (currentFilters.employee) {
                // Assuming employeeId is stored in the log document
                // Adjust 'employeeId' field name if it's different in your logs
                query = query.where('employeeId', '==', currentFilters.employee);
            }
            if (currentFilters.startDate) {
                query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(currentFilters.startDate));
            }
            if (currentFilters.endDate) {
                query = query.where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(currentFilters.endDate));
            }

            // Firestore does not support ordering by a field and filtering by range on another field
            // if filters other than timestamp range are applied.
            // We might need to adjust the query strategy or do client-side filtering/sorting
            // if complex filtering AND timestamp sorting is strictly required.
            // For now, we prioritize timestamp descending order.

            // Pagination
            if (direction === 'next' && lastVisibleDoc) {
                query = query.startAfter(lastVisibleDoc);
            } else if (direction === 'prev' && firstVisibleDoc) {
                // Firestore doesn't directly support previous page with startAfter/endBefore in descending order.
                // We need to reverse the query order, use endBefore, fetch, and then reverse results.
                console.warn('Fetching previous page with filters might be complex/slow in Firestore.');
                // Simplification: Just go back to the start for now if 'prev' is clicked.
                // A more robust solution involves managing document references across pages.
                if (currentPage > 1) {
                     console.log("Fetching previous page logic needs implementation based on firstVisibleDoc.");
                    // TODO: Implement previous page logic (reverse query, endBefore, reverse results)
                    // For now, just disable prev button if not on page 1
                    // Resetting to page 1 might be a temporary workaround:
                    // currentPage = 1;
                    // lastVisibleDoc = null;
                    // firstVisibleDoc = null;
                    // query = db.collection('activity_logs').orderBy('timestamp', 'desc'); // Rebuild query
                    // Apply filters again here...
                } else {
                     query = query.limit(logsPerPage);
                }

            } else {
                // First page load or reset
                 query = query.limit(logsPerPage);
            }


            const snapshot = await query.limit(logsPerPage).get();
            
            if (snapshot.empty) {
                console.log('No logs found for the current query.');
                 if (currentPage === 1) {
                    logsTableBody.innerHTML = '<tr><td colspan="6">找不到符合條件的紀錄。</td></tr>';
                 } else {
                    // If not on the first page and no more logs, likely reached the end
                    alert('已經是最後一頁了。');
                    currentPage--; // Stay on the previous page
                 }
                 updatePaginationControls(snapshot.docs.length, snapshot.size < logsPerPage); // Indicate end of data
                 setLoadingState(false);
                 return;
            }

            // Store document references for pagination
            firstVisibleDoc = snapshot.docs[0];
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

            // Render logs
            renderLogs(snapshot.docs);
            updatePaginationControls(snapshot.docs.length, snapshot.size < logsPerPage);

        } catch (error) {
            console.error('Error fetching logs:', error);
            logsTableBody.innerHTML = '<tr><td colspan="6">載入紀錄時發生錯誤，請稍後再試。</td></tr>';
             updatePaginationControls(0, true); // Disable pagination on error
        } finally {
            setLoadingState(false);
        }
    }

    // --- Rendering --- 

    function renderLogs(logDocs) {
        logsTableBody.innerHTML = ''; // Clear previous logs
        if (!logDocs || logDocs.length === 0) {
            logsTableBody.innerHTML = '<tr><td colspan="6">沒有找到符合條件的紀錄。</td></tr>';
            return;
        }

        logDocs.forEach(doc => {
            const logData = doc.data();
            const row = logsTableBody.insertRow();

            // Format timestamp
            const timestamp = logData.timestamp ? logData.timestamp.toDate() : new Date(); // Handle potential missing timestamp
            const formattedTimestamp = timestamp.toLocaleString('zh-TW', { hour12: false });

            // Sanitize and display data
            row.insertCell().textContent = formattedTimestamp;
            row.insertCell().textContent = escapeHTML(logData.feature || 'N/A');
            row.insertCell().textContent = escapeHTML(logData.employeeName || logData.employeeId || '系統'); // Show name if available, else ID, else '系統'
            row.insertCell().textContent = escapeHTML(logData.action || 'N/A');
            
            // Display details (potentially JSON)
            let detailsText = 'N/A';
            if (logData.details) {
                try {
                    if (typeof logData.details === 'object') {
                         detailsText = JSON.stringify(logData.details, null, 2); // Pretty print JSON
                    } else {
                        detailsText = escapeHTML(String(logData.details));
                    }
                } catch (e) {
                     detailsText = escapeHTML(String(logData.details)); // Fallback if stringify fails
                }
            }
             const detailsCell = row.insertCell();
             // Use <pre> for better formatting of JSON
             const pre = document.createElement('pre');
             pre.textContent = detailsText;
             detailsCell.appendChild(pre);


            row.insertCell().textContent = escapeHTML(logData.status || 'N/A');
        });
        console.log(`Rendered ${logDocs.length} log entries.`);
    }

    // --- Pagination --- 

    function updatePaginationControls(fetchedCount, isLastPageGuess) {
         // Basic pagination update - needs total count for accurate total pages
        pageInfo.textContent = `頁數 ${currentPage}`; // Simplification without total pages

        prevPageBtn.disabled = currentPage === 1;
        // Disable next button if fewer logs than requested were fetched OR if it's explicitly the last page (more robust check needed)
        nextPageBtn.disabled = isLastPageGuess || fetchedCount < logsPerPage;

        console.log(`Pagination updated: Current Page=${currentPage}, Prev Enabled=${!prevPageBtn.disabled}, Next Enabled=${!nextPageBtn.disabled}`);

        // TODO: Implement total page count for better UX
        // This typically requires a separate count query, which adds cost/complexity.
        // Or, estimate total pages based on fetched batches, which can be inaccurate.
    }

    function goToNextPage() {
        if (!nextPageBtn.disabled) {
            currentPage++;
            fetchLogs('next');
        }
    }

    function goToPrevPage() {
        if (!prevPageBtn.disabled && currentPage > 1) {
            currentPage--;
            // Fetching previous page in Firestore with descending order is tricky.
            // Need to implement the reverse query logic or use a different pagination strategy.
            console.warn('Previous page fetch logic needs proper implementation.');
            // For now, we might reset to the beginning of the *previous* page marker if available
            // Or simply fetch the *current* page again after decrementing (less ideal)
            // Simplest (but potentially incorrect) is just decrementing and fetching:
             fetchLogs('prev'); // This will likely require the complex reverse query logic
        }
    }

    // --- Utility Functions --- 

    function setLoadingState(isLoading) {
        // Example: Add a loading indicator
        const loadingIndicator = document.getElementById('loading-indicator'); // Assuming you add one to the HTML
        if (loadingIndicator) {
            loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }
        // Disable buttons during loading
        applyFiltersBtn.disabled = isLoading;
        resetFiltersBtn.disabled = isLoading;
        prevPageBtn.disabled = isLoading || currentPage === 1;
        nextPageBtn.disabled = isLoading; // Re-evaluate actual disabled state after fetch completes

        console.log(`Loading state set to: ${isLoading}`);
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --- Event Listeners --- 

    function setupEventListeners() {
        applyFiltersBtn.addEventListener('click', applyFilters);
        resetFiltersBtn.addEventListener('click', resetFilters);
        nextPageBtn.addEventListener('click', goToNextPage);
        prevPageBtn.addEventListener('click', goToPrevPage);
        console.log('Event listeners set up.');
    }

    // --- Authentication Check --- 
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in.
            // Check if the user is an admin (implement your admin check logic here)
            // For example, check a custom claim or Firestore role
             user.getIdTokenResult().then((idTokenResult) => {
                if (idTokenResult.claims.admin) {
                    console.log('Admin user authenticated.');
                    initializePage();
                } else {
                    console.warn('User is not an admin. Redirecting...');
                    alert('您沒有權限訪問此頁面。');
                    window.location.href = '/index.html'; // Or login page
                }
             }).catch(error => {
                 console.error('Error getting ID token result:', error);
                 alert('無法驗證您的身份，請重新登入。');
                 window.location.href = '/index.html'; // Or login page
             });
        } else {
            // User is signed out.
            console.log('User is not signed in. Redirecting to login page.');
            window.location.href = '/index.html'; // Or your login page
        }
    });
}); 