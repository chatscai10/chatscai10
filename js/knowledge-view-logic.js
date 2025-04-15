/**
 * Knowledge View Logic
 * Handles loading and displaying knowledge content for users
 */

(function() {
'use strict';

// Module variables
let db;
let currentUser;
let knowledgeItems = [];
let currentCategoryFilter = 'all';
let isLoading = false;

// DOM Elements
let $knowledgeContainer;
let $categoriesFilter;
let $loadingIndicator;
let $noContentMessage;
let $searchInput;

/**
 * Initialize the knowledge view module
 */
function initKnowledgeView() {
    console.log("Initializing knowledge view module...");
    
    try {
        // Initialize Firebase if not already done
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            if (!db) {
                db = firebase.firestore();
                console.log("Firestore initialized in knowledge view module");
            } else {
                console.log("Using existing Firestore instance");
            }
        } else {
            console.error("Firestore not initialized");
            showErrorMessage("無法連接資料庫，請刷新頁面重試");
            return;
        }
        
        // Bind DOM elements
        if (!bindDOMElements()) {
            console.error("Failed to bind DOM elements");
            showErrorMessage("頁面元素初始化失敗，請刷新頁面重試");
            return;
        }
        
        // Check authentication
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user;
                console.log("User authenticated, loading knowledge content...");
                loadKnowledgeContent();
            } else {
                console.log("User not authenticated, redirecting to login...");
                window.location.href = "index.html";
            }
        });
        
        // Set up event listeners
        setupEventListeners();
    } catch (error) {
        console.error("Error in initKnowledgeView:", error);
        showErrorMessage("知識庫初始化失敗: " + error.message);
    }
}

/**
 * Bind DOM elements
 */
function bindDOMElements() {
    try {
        // Log the start of binding for debugging
        console.log("Binding DOM elements for knowledge view...");
        
        // First, check for the exact ID in the HTML
        $knowledgeContainer = document.getElementById('knowledgeContainer');
        
        if ($knowledgeContainer) {
            console.log("Found knowledge container with ID: knowledgeContainer");
        } else {
            console.warn("knowledgeContainer not found by ID, trying alternative selectors");
            
            // Try different possible IDs and selectors
            const possibleContainerIds = ['knowledgeContent', 'knowledge-content'];
            const possibleSelectors = [
                '.knowledge-container > div:last-child',
                '.knowledge-content',
                '.container > .knowledge-container > div:last-child'
            ];
            
            // Try by ID first
            for (const id of possibleContainerIds) {
                $knowledgeContainer = document.getElementById(id);
                if ($knowledgeContainer) {
                    console.log(`Found knowledge container with ID: ${id}`);
                    break;
                }
            }
            
            // If not found by ID, try by class selector
            if (!$knowledgeContainer) {
                for (const selector of possibleSelectors) {
                    $knowledgeContainer = document.querySelector(selector);
                    if ($knowledgeContainer) {
                        console.log(`Found knowledge container with selector: ${selector}`);
                        break;
                    }
                }
            }
            
            // Last resort - create the container if parent exists
            if (!$knowledgeContainer) {
                console.warn("Knowledge container not found, attempting to create one...");
                const parentContainer = document.querySelector('.knowledge-container');
                if (parentContainer) {
                    console.log("Creating missing knowledge container element");
                    $knowledgeContainer = document.createElement('div');
                    $knowledgeContainer.id = 'knowledgeContainer';
                    parentContainer.appendChild($knowledgeContainer);
                    console.log("Created new knowledge container with ID: knowledgeContainer");
                } else {
                    console.error("Parent container '.knowledge-container' not found, cannot create knowledge container");
                    return false;
                }
            }
        }
        
        // Get other required elements
        $categoriesFilter = document.getElementById('categoriesFilter');
        $loadingIndicator = document.getElementById('loadingIndicator');
        $noContentMessage = document.getElementById('noContentMessage');
        $searchInput = document.getElementById('knowledgeSearch');
        
        // Log which elements were bound for debugging
        console.log("DOM elements bound:", {
            knowledgeContainer: $knowledgeContainer ? ($knowledgeContainer.id || 'no-id') : 'not-found',
            categoriesFilter: $categoriesFilter ? 'found' : 'not-found',
            loadingIndicator: $loadingIndicator ? 'found' : 'not-found',
            noContentMessage: $noContentMessage ? 'found' : 'not-found',
            searchInput: $searchInput ? 'found' : 'not-found'
        });
        
        // Create missing critical elements if needed
        if (!$loadingIndicator) {
            console.warn("Creating missing loading indicator");
            $loadingIndicator = document.createElement('div');
            $loadingIndicator.id = 'loadingIndicator';
            $loadingIndicator.className = 'loading-indicator';
            $loadingIndicator.innerHTML = '<div class="spinner"></div><p>載入中...</p>';
            const parent = $knowledgeContainer.parentNode;
            if (parent) {
                parent.insertBefore($loadingIndicator, $knowledgeContainer);
            }
        }
        
        if (!$noContentMessage) {
            console.warn("Creating missing no content message");
            $noContentMessage = document.createElement('div');
            $noContentMessage.id = 'noContentMessage';
            $noContentMessage.className = 'no-content-message';
            $noContentMessage.style.display = 'none';
            $noContentMessage.textContent = '目前沒有知識庫內容';
            const parent = $knowledgeContainer.parentNode;
            if (parent) {
                parent.insertBefore($noContentMessage, $knowledgeContainer);
            }
        }
        
        return true;
    } catch (error) {
        console.error("Error binding DOM elements:", error);
        return false;
    }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    console.log("Setting up event listeners...");
    
    // Category filter change
    if ($categoriesFilter) {
        $categoriesFilter.addEventListener('change', function(e) {
            currentCategoryFilter = e.target.value;
            console.log(`Category filter changed to: ${currentCategoryFilter}`);
            renderKnowledgeItems();
        });
    }
    
    // Search input
    if ($searchInput) {
        $searchInput.addEventListener('input', function() {
            console.log(`Search term changed to: ${this.value}`);
            renderKnowledgeItems();
        });
    }
}

/**
 * Load knowledge content from Firestore
 */
function loadKnowledgeContent() {
    // Prevent multiple simultaneous loading requests
    if (isLoading) {
        console.log("Knowledge content already loading, request ignored");
        return;
    }
    
    console.log("Loading knowledge content...");
    isLoading = true;
    
    try {
        // Show loading indicator and hide no content message
        if ($loadingIndicator) {
            $loadingIndicator.style.display = 'flex';
        } else {
            console.warn("Loading indicator not found, creating one");
            // Try to create a loading indicator if missing
            $loadingIndicator = document.createElement('div');
            $loadingIndicator.id = 'loadingIndicator';
            $loadingIndicator.className = 'loading-indicator';
            $loadingIndicator.innerHTML = '<div class="spinner"></div><p>載入中...</p>';
            const parent = $knowledgeContainer?.parentNode || document.querySelector('.knowledge-container') || document.body;
            parent.insertBefore($loadingIndicator, parent.firstChild);
            $loadingIndicator.style.display = 'flex';
        }
        
        if ($noContentMessage) {
            $noContentMessage.style.display = 'none';
        }
        
        // Verify $knowledgeContainer exists, try to get it if not
        if (!$knowledgeContainer) {
            console.warn("Knowledge container not found during loading, attempting to rebind");
            if (!bindDOMElements()) {
                console.error("Failed to rebind DOM elements, cannot load content");
                showErrorMessage("無法載入知識庫內容，頁面結構有誤");
                isLoading = false;
                return;
            }
        }
        
        // Clear container initially
        if ($knowledgeContainer) {
            $knowledgeContainer.innerHTML = '';
        } else {
            console.error("Knowledge container still not available after rebinding");
            showErrorMessage("無法載入知識庫內容，無法找到顯示容器");
            isLoading = false;
            return;
        }
        
        // Set a timeout to detect long-running requests
        const loadingTimeout = setTimeout(() => {
            console.warn("Knowledge content loading is taking longer than expected");
            if ($loadingIndicator) {
                const loadingMessage = $loadingIndicator.querySelector('p');
                if (loadingMessage) {
                    loadingMessage.textContent = '資料載入時間較長，請稍候...';
                }
            }
        }, 5000);
        
        // Verify db is available
        if (!db) {
            console.error("Firestore instance not available");
            clearTimeout(loadingTimeout);
            
            // Try to reinitialize Firestore
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                console.log("Attempting to reinitialize Firestore");
                db = firebase.firestore();
                if (!db) {
                    showErrorMessage("資料庫初始化失敗，請刷新頁面重試");
                    isLoading = false;
                    return;
                }
            } else {
                showErrorMessage("資料庫連接失敗，請刷新頁面重試");
                isLoading = false;
                return;
            }
        }
        
        // Fetch knowledge items from Firestore
        db.collection('knowledge')
            .orderBy('createdAt', 'desc')
            .get()
            .then(querySnapshot => {
                clearTimeout(loadingTimeout);
                console.log(`Retrieved ${querySnapshot.size} knowledge items`);
                knowledgeItems = [];
                
                if (querySnapshot.empty) {
                    console.log("No knowledge items found in database");
                    if ($noContentMessage) {
                        $noContentMessage.style.display = 'block';
                        $noContentMessage.textContent = '目前沒有知識庫內容';
                    }
                } else {
                    querySnapshot.forEach(doc => {
                        try {
                            const data = doc.data();
                            knowledgeItems.push({
                                id: doc.id,
                                title: data.title || 'No Title',
                                content: data.content || 'No Content',
                                category: data.category || 'Uncategorized',
                                createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                                createdBy: data.createdBy || 'Unknown'
                            });
                        } catch (docError) {
                            console.error(`Error processing document ${doc.id}:`, docError);
                            // Continue with other documents
                        }
                    });
                }
                
                // Populate categories filter
                populateCategoriesFilter();
                
                // Hide loading indicator
                if ($loadingIndicator) {
                    $loadingIndicator.style.display = 'none';
                }
                
                // Show no content message if no items
                if (knowledgeItems.length === 0) {
                    if ($noContentMessage) {
                        $noContentMessage.style.display = 'block';
                    }
                }
                
                // Render items
                renderKnowledgeItems();
            })
            .catch(error => {
                clearTimeout(loadingTimeout);
                console.error("Error loading knowledge content:", error);
                
                // Hide loading indicator
                if ($loadingIndicator) {
                    $loadingIndicator.style.display = 'none';
                }
                
                // Show error message
                showErrorMessage("載入知識庫內容時發生錯誤: " + error.message);
                
                // If network error, show more helpful message
                if (error.code === 'unavailable' || error.code === 'network-request-failed') {
                    showErrorMessage("網絡連接問題，請檢查您的網絡連接並重試");
                }
            })
            .finally(() => {
                // Reset loading state
                isLoading = false;
            });
    } catch (error) {
        console.error("Unexpected error in loadKnowledgeContent:", error);
        showErrorMessage("載入知識庫內容時發生未預期錯誤: " + error.message);
        isLoading = false;
        
        // Hide loading indicator
        if ($loadingIndicator) {
            $loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * Render knowledge items based on current filters
 */
function renderKnowledgeItems() {
    try {
        if (!$knowledgeContainer) {
            console.error("Knowledge container element not found during rendering");
            // Try to rebind the element with multiple fallback options
            $knowledgeContainer = document.getElementById('knowledgeContainer') || 
                                document.getElementById('knowledgeContent') || 
                                document.querySelector('.knowledge-container > div:last-child');
            
            if (!$knowledgeContainer) {
                console.error("Knowledge container still not found after multiple fallback attempts");
                const parentContainer = document.querySelector('.knowledge-container');
                if (parentContainer) {
                    console.log("Creating missing knowledge container as last resort");
                    $knowledgeContainer = document.createElement('div');
                    $knowledgeContainer.id = 'knowledgeContainer';
                    parentContainer.appendChild($knowledgeContainer);
                } else {
                    showErrorMessage("無法顯示知識庫內容，請刷新頁面重試");
                    return;
                }
            }
        }
        
        console.log("Rendering knowledge items to container:", $knowledgeContainer);
        
        // Clear container
        $knowledgeContainer.innerHTML = '';
        
        // Filter items based on current category and search term
        const filteredItems = filterKnowledgeItems();
        console.log(`Filtered to ${filteredItems.length} items`);
        
        if (filteredItems.length === 0) {
            // Show no content message
            if ($noContentMessage) {
                $noContentMessage.style.display = 'block';
                
                // If we have a filter or search term, show appropriate message
                const searchTerm = $searchInput ? $searchInput.value.trim() : '';
                if (searchTerm || (currentCategoryFilter && currentCategoryFilter !== 'all')) {
                    $noContentMessage.textContent = '沒有符合搜尋條件的知識庫內容';
                } else {
                    $noContentMessage.textContent = '目前沒有知識庫內容';
                }
            }
            return;
        }
        
        // Hide no content message
        if ($noContentMessage) {
            $noContentMessage.style.display = 'none';
        }
        
        // Render each item
        let renderCount = 0;
        for (const item of filteredItems) {
            try {
                const itemElement = createKnowledgeItemElement(item);
                if (itemElement) {
                    $knowledgeContainer.appendChild(itemElement);
                    renderCount++;
                }
            } catch (itemError) {
                console.error(`Error rendering knowledge item ${item.id}:`, itemError);
                // Continue with other items
            }
        }
        
        console.log(`Successfully rendered ${renderCount} of ${filteredItems.length} knowledge items`);
        
        // If no items were successfully rendered but we had items to render
        if (renderCount === 0 && filteredItems.length > 0) {
            showErrorMessage("顯示知識庫內容時發生錯誤，請刷新頁面重試");
        }
    } catch (error) {
        console.error("Error in renderKnowledgeItems:", error);
        showErrorMessage("顯示知識庫內容時發生錯誤: " + error.message);
    }
}

/**
 * Filter knowledge items based on current filters
 */
function filterKnowledgeItems() {
    try {
        const searchTerm = $searchInput ? $searchInput.value.toLowerCase().trim() : '';
        
        if (!knowledgeItems || !Array.isArray(knowledgeItems)) {
            console.error("Knowledge items is not an array:", knowledgeItems);
            return [];
        }
        
        return knowledgeItems.filter(item => {
            // Validate item has required properties
            if (!item || typeof item !== 'object') return false;
            
            // Filter by category
            if (currentCategoryFilter !== 'all' && item.category !== currentCategoryFilter) {
                return false;
            }
            
            // Filter by search term
            if (searchTerm && !(
                (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                (item.content && item.content.toLowerCase().includes(searchTerm))
            )) {
                return false;
            }
            
            return true;
        });
    } catch (error) {
        console.error("Error in filterKnowledgeItems:", error);
        return [];
    }
}

/**
 * Create a knowledge item element
 */
function createKnowledgeItemElement(item) {
    try {
        if (!item || !item.id) {
            console.error("Invalid knowledge item:", item);
            return null;
        }
        
        const element = document.createElement('div');
        element.className = 'knowledge-item';
        element.setAttribute('data-id', item.id);
        
        // Format date - with fallback for invalid dates
        let formattedDate = '未知日期';
        try {
            formattedDate = formatDate(item.createdAt);
        } catch (dateError) {
            console.warn(`Error formatting date for item ${item.id}:`, dateError);
        }
        
        // Create summary content (first 200 characters)
        const content = item.content || '';
        const summaryContent = content.length > 200 
            ? content.substring(0, 200) + '...' 
            : content;
        
        element.innerHTML = `
            <div class="knowledge-header">
                <h3 class="knowledge-title">${escapeHtml(item.title || '無標題')}</h3>
                <div class="knowledge-meta">
                    <span class="knowledge-category">${escapeHtml(item.category || '未分類')}</span>
                    <span class="knowledge-date">${formattedDate}</span>
                </div>
            </div>
            <div class="knowledge-summary">${escapeHtml(summaryContent)}</div>
            <button class="knowledge-view-btn">查看內容</button>
        `;
        
        // Add event listener to view button
        const viewButton = element.querySelector('.knowledge-view-btn');
        if (viewButton) {
            viewButton.addEventListener('click', () => {
                showItem(item);
            });
        }
        
        return element;
    } catch (error) {
        console.error(`Error creating element for item ${item?.id || 'unknown'}:`, error);
        return null;
    }
}

/**
 * Show a knowledge item in a modal
 */
function showItem(item) {
    console.log(`Showing knowledge item: ${item.id} - ${item.title}`);
    
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'knowledge-modal';
    
    // Format date
    const formattedDate = formatDate(item.createdAt);
    
    // Set modal content
    modal.innerHTML = `
        <div class="knowledge-modal-content">
            <span class="knowledge-modal-close">&times;</span>
            <h2>${escapeHtml(item.title)}</h2>
            <div class="knowledge-meta">
                <span class="knowledge-category">${escapeHtml(item.category)}</span>
                <span class="knowledge-date">${formattedDate}</span>
                <span class="knowledge-author">${escapeHtml(item.createdBy)}</span>
            </div>
            <div class="knowledge-content-full">${formatContent(item.content)}</div>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(modal);
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    
    // Show modal with animation
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
    
    // Add close button event listener
    const closeButton = modal.querySelector('.knowledge-modal-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            closeModal(modal);
        });
    }
    
    // Close when clicking outside content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    });
    
    // Close on escape key
    document.addEventListener('keydown', function escListener(e) {
        if (e.key === 'Escape') {
            closeModal(modal);
            document.removeEventListener('keydown', escListener);
        }
    });
}

/**
 * Close a modal
 */
function closeModal(modal) {
    modal.style.opacity = '0';
    setTimeout(() => {
        document.body.removeChild(modal);
        document.body.style.overflow = '';
    }, 300);
}

/**
 * Format content with basic markdown-like features
 */
function formatContent(content) {
    if (!content) return '';
    
    let formatted = escapeHtml(content);
    
    // Replace newlines with <br> tags
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Replace *bold* with <strong>bold</strong>
    formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    
    // Replace _italic_ with <em>italic</em>
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    
    return formatted;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format date to a readable string
 */
function formatDate(date) {
    if (!date) return 'Unknown date';
    
    try {
        // Convert to Date object if it's not already
        const dateObj = date instanceof Date ? date : new Date(date);
        
        // Check if valid date
        if (isNaN(dateObj.getTime())) {
            return 'Invalid date';
        }
        
        return dateObj.toLocaleDateString('zh-TW', {
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error("Error formatting date:", error);
        return 'Date error';
    }
}

/**
 * Update categories filter based on available categories
 */
function updateCategoriesFilter() {
    if (!$categoriesFilter) return;
    
    console.log("Updating categories filter...");
    
    // Get unique categories
    const categories = [...new Set(knowledgeItems.map(item => item.category || '未分類'))];
    
    // Save current selection
    const currentSelection = $categoriesFilter.value;
    
    // Clear options except "all"
    $categoriesFilter.innerHTML = '<option value="all">所有分類</option>';
    
    // Add category options
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        $categoriesFilter.appendChild(option);
    });
    
    // Restore selection if possible
    if (categories.includes(currentSelection)) {
        $categoriesFilter.value = currentSelection;
    }
}

/**
 * Show loading indicator
 */
function showLoading() {
    if ($loadingIndicator) {
        $loadingIndicator.style.display = 'block';
    }
    hideNoContentMessage();
}

/**
 * Hide loading indicator
 */
function hideLoading() {
    if ($loadingIndicator) {
        $loadingIndicator.style.display = 'none';
    }
}

/**
 * Show no content message
 */
function showNoContentMessage() {
    if ($noContentMessage) {
        $noContentMessage.style.display = 'block';
    }
}

/**
 * Hide no content message
 */
function hideNoContentMessage() {
    if ($noContentMessage) {
        $noContentMessage.style.display = 'none';
    }
}

/**
 * Show an error message to the user
 */
function showErrorMessage(message) {
    console.error("Error:", message);
    
    // Check if an error message div already exists
    let errorDiv = document.querySelector('.error-message');
    
    if (!errorDiv) {
        // Create a new error message div
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        
        // Determine where to insert it
        if ($knowledgeContainer && $knowledgeContainer.parentNode) {
            $knowledgeContainer.parentNode.insertBefore(errorDiv, $knowledgeContainer);
        } else if ($loadingIndicator && $loadingIndicator.parentNode) {
            $loadingIndicator.parentNode.insertBefore(errorDiv, $loadingIndicator.nextSibling);
        } else {
            // Last resort - add to the container or body
            const container = document.querySelector('.container') || document.body;
            if (container) {
                const firstChild = container.firstChild;
                if (firstChild) {
                    container.insertBefore(errorDiv, firstChild);
                } else {
                    container.appendChild(errorDiv);
                }
            } else {
                document.body.innerHTML = `<div class="error-message">${message}</div>`;
                return;
            }
        }
    }
    
    // Update error message and ensure it's visible
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Hide loading indicator if present
    if ($loadingIndicator) {
        $loadingIndicator.style.display = 'none';
    }
    
    // Add a retry button
    const retryButton = document.createElement('button');
    retryButton.textContent = '重試';
    retryButton.className = 'error-retry-btn';
    retryButton.onclick = function() {
        errorDiv.style.display = 'none';
        // If we have Firestore, retry loading content
        if (db) {
            loadKnowledgeContent();
        } else {
            // Otherwise reload the page
            window.location.reload();
        }
    };
    
    // Clear existing buttons and add the new one
    const existingButtons = errorDiv.querySelectorAll('button');
    existingButtons.forEach(btn => btn.remove());
    errorDiv.appendChild(retryButton);
    
    // Scroll to the error message
    try {
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
        // Fallback for older browsers
        window.scrollTo(0, errorDiv.offsetTop - 100);
    }
}

/**
 * Populate categories filter based on available knowledge items
 */
function populateCategoriesFilter() {
    if (!$categoriesFilter) {
        console.warn("Categories filter element not found");
        return;
    }
    
    try {
        // Store current value
        const currentValue = $categoriesFilter.value;
        
        // Clear all options except first one (All categories)
        while ($categoriesFilter.options.length > 1) {
            $categoriesFilter.remove(1);
        }
        
        // Extract unique categories
        const categories = [...new Set(knowledgeItems.map(item => item.category))];
        console.log("Found categories:", categories);
        
        // Add category options
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            $categoriesFilter.appendChild(option);
        });
        
        // Restore previous selection if it still exists
        if (currentValue && categories.includes(currentValue)) {
            $categoriesFilter.value = currentValue;
        } else {
            $categoriesFilter.value = 'all';
        }
    } catch (error) {
        console.error("Error populating categories filter:", error);
    }
}

// Export module functions
window.initKnowledgeView = initKnowledgeView;
window.loadKnowledgeContent = loadKnowledgeContent;

console.log("Knowledge view logic loaded successfully");
})(); 