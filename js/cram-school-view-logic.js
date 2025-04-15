// js/cram-school-view-logic.js - Logic for employee-facing cram school view

'use strict';

// --- Module Variables ---
let viewCurrentUser = null;
let viewDb = null;
let viewAuth = null; // Store auth instance if needed for comments
let postsListContainer = null;
let messageArea = null;
let currentFilterCategory = null; // Track the currently selected category
let allPostsData = []; // Store all posts data for category extraction
let currentSearchTerm = ''; // Track current search term
let searchInput = null; // Reference to search input element
let readPostIds = new Set(); // Store IDs of posts read by the current user
let functions = null; // Firebase Functions instance

// Firebase references
let postsRef;
let currentUserData = {};
let cramSchoolFunctions = {};

// --- Initialization ---
function initCramSchoolViewPage(user, db) {
    viewCurrentUser = user;
    viewDb = db;
    // Get auth instance if needed (e.g., for adding comments)
    try {
        viewAuth = firebase.auth(); // Using compat library explicitly
    } catch (e) {
        console.error("Failed to get Firebase Auth instance:", e);
    }

    // Get Firebase Functions instance
    try {
        functions = firebase.functions(); // Using compat library explicitly
        // Optional: Set region if your functions are not in us-central1
        // functions.useEmulator("localhost", 5001); // Uncomment for local emulator testing
        console.log("Firebase Functions initialized for Cram School View.");
    } catch (e) {
        console.error("Failed to get Firebase Functions instance:", e);
        messageArea.textContent = '錯誤：無法連接到後端功能接口。';
        return; // Stop if functions cannot be initialized
    }

    console.log("Initializing Cram School View Page for:", viewCurrentUser?.displayName);

    postsListContainer = document.getElementById('cram-posts-list');
    messageArea = document.getElementById('message-area');
    searchInput = document.getElementById('cram-search-input'); // Get search input

    if (!postsListContainer || !messageArea) {
        console.error("Required elements not found for cram school view.");
        return;
    }
    if (!searchInput) {
        console.warn("Search input #cram-search-input not found in HTML.");
    } else {
        // Add event listener for search input
        searchInput.addEventListener('input', handleSearchInput);
        console.log("Search input event listener attached.");
    }

    if (!viewCurrentUser) { // Ensure user is available for fetching read statuses
        console.error("User object not available for initCramSchoolViewPage.");
        return;
    }
    
    // Fetch initial read statuses before loading posts
    // Note: This fetches ALL statuses for the user. Optimization might be needed for large numbers.
    fetchReadStatuses().then(() => {
        loadAndRenderPosts(); // Load posts after getting read statuses
    }).catch(error => {
        console.error("Failed to fetch initial read statuses:", error);
        // Load posts anyway, but read status might be wrong initially
        loadAndRenderPosts(); 
    });
}

// Debounce function to limit how often search filtering runs
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle search input event (debounced)
const handleSearchInput = debounce((event) => {
    currentSearchTerm = event.target.value.trim().toLowerCase();
    console.log(`Search term updated: ${currentSearchTerm}`);
    // Re-render posts based on the current data and the new search term
    // We don't need to reload from Firestore, just filter what we have
    renderFilteredPosts(); 
}, 300); // Debounce by 300ms

// New function to filter and render posts based on search term and category
function renderFilteredPosts() {
    if (!postsListContainer) return;
    postsListContainer.innerHTML = ''; // Clear current posts

    console.log(`Rendering filtered posts. Category: ${currentFilterCategory}, Search: ${currentSearchTerm}`);

    // Determine the base list of posts (all or filtered by category)
    let postsToRender = allPostsData; 
    if (currentFilterCategory) {
        postsToRender = allPostsData.filter(post => post.data.category === currentFilterCategory);
    }

    // Apply search filter if search term exists
    if (currentSearchTerm) {
        postsToRender = postsToRender.filter(post => {
            const content = post.data.content?.toLowerCase() || '';
            const category = post.data.category?.toLowerCase() || '';
            // Add title search later if title field exists: const title = post.data.title?.toLowerCase() || '';
            return content.includes(currentSearchTerm) || category.includes(currentSearchTerm);
        });
    }

    console.log(`Found ${postsToRender.length} posts after filtering.`);

    if (postsToRender.length === 0) {
        let message = '沒有找到符合條件的日誌。';
        if (currentFilterCategory && currentSearchTerm) {
            message = `在分類 "${currentFilterCategory}" 中找不到包含 "${currentSearchTerm}" 的日誌。`;
        } else if (currentFilterCategory) {
            message = `分類 "${currentFilterCategory}" 中沒有日誌。`;
        } else if (currentSearchTerm) {
            message = `找不到包含 "${currentSearchTerm}" 的日誌。`;
        }
        postsListContainer.innerHTML = `<p>${message}</p>`;
    } else {
        postsToRender.forEach(post => {
            renderPost(post.id, post.data);
        });
    }
    
    // Re-setup delegation as content changed
    setupPostListEventDelegation(postsListContainer); 
}

// --- Firestore Data Loading & Rendering ---

// Modified to accept category filter and store all posts
async function loadAndRenderPosts(selectedCategory = null) {
    currentFilterCategory = selectedCategory; // Update current filter state
    console.log(`Rendering posts. Category Filter: ${currentFilterCategory}, Search: ${currentSearchTerm}`);
    if (!viewDb) {
        postsListContainer.innerHTML = '<p class="text-danger">資料庫未初始化。</p>';
        return;
    }
    
    postsListContainer.innerHTML = '<p>正在載入文章列表...</p>';
    const filtersContainer = document.getElementById('cram-category-filters');

    // We always fetch from the Cloud Function now, which handles permissions.
    // The Cloud Function sorts by order and timestamp.
    // We store the result in allPostsData for client-side filtering (category/search).
    try {
        console.log("Fetching posts via Cloud Function...");
        const postsFromFunction = await callGetCramSchoolPosts(); 
        allPostsData = postsFromFunction; // Store the permission-filtered and sorted posts

        console.log(`Received ${allPostsData.length} permitted posts.`);
        
        if (filtersContainer) renderCategoryFilters(allPostsData); // Render category filters based on received posts
        renderFilteredPosts(); // Filter received posts by category/search and render

    } catch (error) {
        console.error("Failed to load posts from Cloud Function:", error);
        postsListContainer.innerHTML = `<p class="text-danger">讀取文章時發生錯誤: ${error.message}</p>`;
        // Clear filters if loading failed
        if (filtersContainer) filtersContainer.innerHTML = ''; 
        allPostsData = []; // Reset data cache
    }
}

// New function to render category filters
function renderCategoryFilters(posts) {
    const filtersContainer = document.getElementById('cram-category-filters');
    if (!filtersContainer) {
        console.warn("Category filter container #cram-category-filters not found in HTML.");
        return; 
    }
    if (!posts || posts.length === 0) {
        console.log("No posts data available to render categories.");
        filtersContainer.innerHTML = ''; // Clear if it had old filters
        return; 
    }

    // Extract unique categories, filter out null/empty strings, and sort
    const categories = [...new Set(posts.map(post => post.data.category))]
                        .filter(category => category && category.trim() !== '') // Ensure category exists and is not just whitespace
                        .sort((a, b) => a.localeCompare(b, 'zh-Hant')); // Sort using Chinese locale

    console.log("Rendering filters for categories:", categories);
    filtersContainer.innerHTML = ''; // Clear previous filters

    // Add 'All' filter button
    const allButton = document.createElement('button');
    allButton.className = currentFilterCategory === null ? 'btn btn-primary btn-sm me-2 mb-2' : 'btn btn-outline-primary btn-sm me-2 mb-2';
    allButton.textContent = '全部';
    allButton.addEventListener('click', () => {
        currentFilterCategory = null;
        loadAndRenderPosts(null); // Reset to all posts
    });
    filtersContainer.appendChild(allButton);

    // Add filter button for each category
    categories.forEach(category => {
        const button = document.createElement('button');
        button.className = currentFilterCategory === category ? 'btn btn-primary btn-sm me-2 mb-2' : 'btn btn-outline-primary btn-sm me-2 mb-2';
        button.textContent = category;
        button.addEventListener('click', () => {
            currentFilterCategory = category;
            renderFilteredPosts(); // Just re-filter the existing data
        });
        filtersContainer.appendChild(button);
    });
}

// Function to render a single post
function renderPost(postId, postData) {
    const postElement = document.createElement('div');
    postElement.className = 'cram-post';
    postElement.dataset.postId = postId;
    
    // Check if this post has been read
    const isRead = readPostIds.has(postId);
    
    // Create the post HTML with sanitized content
    const postHtml = `
        <div class="post-header">
            <h3 class="post-title">
                ${postData.category ? `<span class="badge bg-primary">${postData.category}</span> ` : ''}
                知識+內容
                ${isRead ? '<span class="badge bg-secondary ms-2">已讀</span>' : ''}
            </h3>
            <p class="post-meta">
                發佈時間: ${postData.timestamp ? new Date(postData.timestamp.toDate()).toLocaleString('zh-TW') : '未知時間'}
                ${!isRead ? `<button class="btn btn-outline-secondary btn-sm ms-2 mark-read-btn" data-post-id="${postId}">標記為已讀</button>` : ''}
            </p>
        </div>
        <div class="post-content"></div>
        ${postData.videoUrl ? embedVideoUrl(postData.videoUrl) : ''}
        ${postData.imageUrl ? `<div class="post-image"><img src="${postData.imageUrl}" alt="Post image" /></div>` : ''}
        <hr>
        <button class="btn btn-outline-primary btn-sm toggle-comments-btn" data-post-id="${postId}">顯示留言</button>
        <div class="comments-section" style="display: none;">
            <div class="comments-list" data-post-id="${postId}">載入留言中...</div>
            <div class="new-comment-form mt-3">
                <textarea class="form-control new-comment-content" rows="2" placeholder="新增留言..."></textarea>
                <div class="reply-indicator d-none" style="font-size: 0.8em; color: #6c757d; margin-bottom: 5px;"></div>
                <button class="btn btn-primary btn-sm submit-comment-btn" data-post-id="${postId}">送出</button>
                <button class="btn btn-outline-secondary btn-sm cancel-reply-btn d-none">取消回覆</button>
            </div>
        </div>
    `;
    
    postElement.innerHTML = postHtml;
    
    // Separately handle the content with DOMPurify to prevent XSS
    const contentDiv = postElement.querySelector('.post-content');
    if (contentDiv && postData.contentHtml) {
        // Use DOMPurify to sanitize HTML
        const sanitizedHtml = DOMPurify.sanitize(postData.contentHtml, {
            ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img'],
            ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'class', 'style'],
            ALLOW_DATA_ATTR: false
        });
        contentDiv.innerHTML = sanitizedHtml;
        
        // Add rel="noopener noreferrer" to all links
        contentDiv.querySelectorAll('a').forEach(link => {
            link.setAttribute('rel', 'noopener noreferrer');
            link.setAttribute('target', '_blank');
        });
    } else if (contentDiv) {
        contentDiv.textContent = postData.content || '(無內容)'; // Plain text fallback
    }
    
    postsListContainer.appendChild(postElement);
}

// Function to load and render comments for a post
async function loadAndRenderComments(postId, commentsListDiv) {
    if (!viewDb || !commentsListDiv) return;
    
    commentsListDiv.innerHTML = '<p>正在載入留言...</p>';
    try {
        const commentsQuery = viewDb.collection('cram_school_posts').doc(postId).collection('comments')
            .orderBy('timestamp', 'asc');
        const snapshot = await commentsQuery.get();
        
        if (snapshot.empty) {
            commentsListDiv.innerHTML = '<p>暫無留言</p>';
            return;
        }
        
        commentsListDiv.innerHTML = ''; // Clear for new comments
        snapshot.forEach(doc => {
            renderComment(commentsListDiv, doc.id, doc.data());
        });
    } catch (error) {
        console.error(`Error loading comments for post ${postId}:`, error);
        commentsListDiv.innerHTML = `<p class="text-danger">載入留言失敗: ${error.message}</p>`;
    }
}

// Function to render a single comment
function renderComment(container, commentId, commentData) {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment-item';
    commentElement.dataset.commentId = commentId;
    
    // Check if this is a reply and add appropriate styling
    if (commentData.parentId) {
        commentElement.style.marginLeft = '20px';
        commentElement.style.borderLeft = '2px solid #ddd';
        commentElement.style.paddingLeft = '10px';
    }
    
    // Format timestamp if available
    const timestamp = commentData.timestamp ? new Date(commentData.timestamp.toDate()).toLocaleString('zh-TW') : '未知時間';
    
    // Check if current user is the comment author
    const isOwnComment = viewCurrentUser && commentData.userId === viewCurrentUser.uid;
    
    // Sanitize comment content for safety
    const sanitizedContent = DOMPurify.sanitize(commentData.content);
    
    commentElement.innerHTML = `
        <div>
            <strong>${commentData.userName || '匿名使用者'}</strong>
            <small>${timestamp}</small>
            ${isOwnComment ? '<span class="badge bg-info ms-1">我的留言</span>' : ''}
        </div>
        <div class="comment-content">${sanitizedContent}</div>
        <div class="comment-actions mt-1">
            <button class="btn btn-sm btn-outline-secondary reply-comment-btn">回覆</button>
            ${isOwnComment ? '<button class="btn btn-sm btn-outline-danger ms-1 delete-comment-btn">刪除</button>' : ''}
        </div>
    `;
    
    container.appendChild(commentElement);
}

// Event delegation for post list
function setupPostListEventDelegation(container) {
    if (!container) return;
    
    // Remove any existing listener to prevent duplication
    const clonedContainer = container.cloneNode(true);
    container.parentNode.replaceChild(clonedContainer, container);
    
    // Set up the new listener
    clonedContainer.addEventListener('click', async (event) => {
        const target = event.target;
        
        // Handle "Mark as Read" button
        if (target.classList.contains('mark-read-btn')) {
            const postId = target.dataset.postId;
            if (postId) {
                try {
                    target.textContent = '處理中...';
                    target.disabled = true;
                    
                    await handleMarkAsRead(postId);
                    
                    // Update UI
                    const postDiv = target.closest('.cram-post');
                    const titleDiv = postDiv?.querySelector('.post-title');
                    if (titleDiv && !titleDiv.querySelector('.badge.bg-secondary')) {
                        titleDiv.appendChild(createReadBadge());
                    }
                    target.remove(); // Remove the button
                    
                    showMessage('已標記為已讀', 'success');
                } catch (error) {
                    console.error('Error marking post as read:', error);
                    target.textContent = '標記為已讀';
                    target.disabled = false;
                    showMessage(`標記失敗: ${error.message}`, 'error');
                }
            }
        }
        
        // Handle "Toggle Comments" button
        else if (target.classList.contains('toggle-comments-btn')) {
            const postId = target.dataset.postId;
            if (postId) {
                const postDiv = target.closest('.cram-post');
                const commentsSection = postDiv?.querySelector('.comments-section');
                const commentsListDiv = postDiv?.querySelector('.comments-list');
                
                if (commentsSection && commentsListDiv) {
                    if (commentsSection.style.display === 'none') {
                        commentsSection.style.display = 'block';
                        target.textContent = '隱藏留言';
                        
                        // Load comments if not already loaded
                        loadAndRenderComments(postId, commentsListDiv);
                    } else {
                        commentsSection.style.display = 'none';
                        target.textContent = '顯示留言';
                    }
                }
            }
        }
        
        // Handle "Submit Comment" button
        else if (target.classList.contains('submit-comment-btn')) {
            const postId = target.dataset.postId;
            if (postId) {
                const postDiv = target.closest('.cram-post');
                const textarea = postDiv?.querySelector('.new-comment-content');
                const content = textarea?.value.trim();
                
                if (content) {
                    try {
                        target.textContent = '送出中...';
                        target.disabled = true;
                        
                        // Get the parentId if replying to a comment
                        const replyIndicator = postDiv.querySelector('.reply-indicator');
                        let parentId = null;
                        if (!replyIndicator.classList.contains('d-none')) {
                            // Extract parentId from the currently active reply
                            const commentElement = postDiv.querySelector('.comment-item.replying');
                            if (commentElement) {
                                parentId = commentElement.dataset.commentId;
                            }
                        }
                        
                        // Call Cloud Function to submit comment
                        await handleAddComment(postId, content, parentId);
                        
                        // Reset the form
                        clearCommentForm(postDiv.querySelector('.new-comment-form'));
                        
                        // Reload comments to show the new one
                        const commentsListDiv = postDiv.querySelector('.comments-list');
                        if (commentsListDiv) {
                            loadAndRenderComments(postId, commentsListDiv);
                        }
                        
                        showMessage('留言已送出', 'success');
                    } catch (error) {
                        console.error('Error submitting comment:', error);
                        showMessage(`留言失敗: ${error.message}`, 'error');
                    } finally {
                        target.textContent = '送出';
                        target.disabled = false;
                    }
                } else {
                    showMessage('請輸入留言內容', 'warning');
                }
            }
        }
        
        // Handle "Reply Comment" button
        else if (target.classList.contains('reply-comment-btn')) {
            const commentItem = target.closest('.comment-item');
            const postDiv = target.closest('.cram-post');
            if (commentItem && postDiv) {
                const commentId = commentItem.dataset.commentId;
                
                // Clear any existing 'replying' class
                postDiv.querySelectorAll('.comment-item.replying').forEach(item => {
                    item.classList.remove('replying');
                });
                
                // Mark this comment as being replied to
                commentItem.classList.add('replying');
                
                setupReply(postDiv.querySelector('.new-comment-form'), commentId);
            }
        }
        
        // Handle "Cancel Reply" button
        else if (target.classList.contains('cancel-reply-btn')) {
            const postDiv = target.closest('.cram-post');
            if (postDiv) {
                // Remove 'replying' class from all comments
                postDiv.querySelectorAll('.comment-item.replying').forEach(item => {
                    item.classList.remove('replying');
                });
                
                clearCommentForm(postDiv.querySelector('.new-comment-form'));
            }
        }
        
        // Handle "Delete Comment" button
        else if (target.classList.contains('delete-comment-btn')) {
            const commentItem = target.closest('.comment-item');
            const postDiv = target.closest('.cram-post');
            if (commentItem && postDiv && viewCurrentUser) {
                const commentId = commentItem.dataset.commentId;
                const postId = postDiv.dataset.postId;
                
                if (confirm('確定要刪除此留言嗎？')) {
                    try {
                        target.textContent = '刪除中...';
                        target.disabled = true;
                        
                        // Call Cloud Function to delete comment (to be implemented)
                        // await deleteComment(postId, commentId);
                        
                        // For now, fallback to direct Firestore delete (will be replaced)
                        await viewDb.collection('cram_school_posts').doc(postId).collection('comments').doc(commentId).delete();
                        
                        // Remove the comment from UI
                        commentItem.remove();
                        
                        showMessage('留言已刪除', 'success');
                    } catch (error) {
                        console.error('Error deleting comment:', error);
                        showMessage(`刪除失敗: ${error.message}`, 'error');
                        target.textContent = '刪除';
                        target.disabled = false;
                    }
                }
            }
        }
    });
}

async function handleAddComment(postId, content, parentId = null) {
    if (!functions || !viewAuth || !viewCurrentUser) {
        throw new Error("無法留言：元件未初始化或未登入。");
    }
    
    console.log(`Adding comment to post ${postId}: "${content}"`, parentId ? `Reply to ${parentId}` : '');
    
    try {
        // 调用Cloud Function提交评论
        const addCommentFunction = functions.httpsCallable('addCramSchoolComment');
        const result = await addCommentFunction({
            postId: postId,
            commentText: content,
            parentId: parentId
        });
        
        if (result.data && result.data.success) {
            console.log('Comment added successfully via Cloud Function');
            return result.data;
        } else {
            throw new Error(result.data?.message || '留言提交失敗');
        }
    } catch (error) {
        console.error('Error adding comment via Cloud Function:', error);
        throw error;
    }
}

function setupReply(formDiv, commentIdToReply) {
     if (!formDiv) return null;
     const textarea = formDiv.querySelector('.new-comment-content');
     const replyIndicator = formDiv.querySelector('.reply-indicator');
     const cancelBtn = formDiv.querySelector('.cancel-reply-btn');
     const postDiv = formDiv.closest('.cram-post'); // Find the parent post

     // Find the comment text to show context
     const commentDiv = postDiv?.querySelector(`.comment-item[data-comment-id="${commentIdToReply}"]`);
     const originalCommenter = commentDiv?.querySelector('strong')?.textContent || '留言';

     textarea.placeholder = `回覆 ${originalCommenter}...`;
     textarea.focus();
     replyIndicator.textContent = `正在回覆 ${originalCommenter}`;
     replyIndicator.classList.remove('d-none');
     cancelBtn.classList.remove('d-none');

     console.log('Replying to comment:', commentIdToReply);
     return commentIdToReply; // Return the ID being replied to
}

function clearCommentForm(formDiv) {
    if (!formDiv) return;
    const textarea = formDiv.querySelector('.new-comment-content');
    const replyIndicator = formDiv.querySelector('.reply-indicator');
    const cancelBtn = formDiv.querySelector('.cancel-reply-btn');

    textarea.value = '';
    textarea.placeholder = '新增留言...';
    replyIndicator.classList.add('d-none');
    cancelBtn.classList.add('d-none');

    console.log('Comment form cleared.');
}

// --- Utility ---
function showMessage(msg, type = 'info') {
    if (!messageArea) return;
    messageArea.textContent = msg;
    messageArea.className = `message ${type}-message`; // Assumes CSS classes like info-message, error-message
    // Optional: Clear message after a delay
    setTimeout(() => { messageArea.textContent = ''; messageArea.className = 'message'; }, 5000);
}

// --- NEW: Video Embedding Helper (Copied from admin version for now) ---
function embedVideoUrl(url) {
    if (!url) return '';

    let embedHtml = '';
    try {
        const urlObj = new URL(url);
        const youtubeMatch = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
        const vimeoMatch = url.match(/vimeo.*\/(\d+)/);

        if (youtubeMatch && youtubeMatch[2].length === 11) {
            const videoId = youtubeMatch[2];
            embedHtml = `<div class="embed-responsive embed-responsive-16by9 mt-2"><iframe class="embed-responsive-item" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        } else if (vimeoMatch) {
            const videoId = vimeoMatch[1];
            embedHtml = `<div class="embed-responsive embed-responsive-16by9 mt-2"><iframe src="https://player.vimeo.com/video/${videoId}" title="Vimeo video player" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
        } else {
            // Basic link if it's not YouTube or Vimeo
            embedHtml = `<p class="mt-2">無法嵌入影片，連結: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
        }
    } catch (e) {
        console.warn("Could not parse video URL:", url, e);
        embedHtml = `<p class="mt-2 text-danger">影片連結格式錯誤或不受支援: ${url}</p>`;
    }
    return embedHtml;
}

// --- NEW Function to fetch read statuses for the current user ---
async function fetchReadStatuses() {
    if (!viewCurrentUser || !viewDb) return;
    console.log("Fetching read statuses for user:", viewCurrentUser.uid);
    readPostIds = new Set(); // Reset before fetching
    try {
        const statusCollection = viewDb.collection('cram_school_read_status');
        const q = statusCollection.where('userId', '==', viewCurrentUser.uid);
        const snapshot = await q.get();
        snapshot.forEach(doc => {
            readPostIds.add(doc.data().postId);
        });
        console.log(`Fetched ${readPostIds.size} read statuses.`);
    } catch (error) {
        console.error("Error fetching read statuses:", error);
        // Keep readPostIds empty, functionality will proceed without read status
        readPostIds = new Set(); 
        throw error; // Re-throw so the caller knows it failed
    }
}

// --- NEW: Helper to create the 'Read' badge ---
function createReadBadge() {
    const badge = document.createElement('span');
    badge.className = 'badge bg-secondary ms-2';
    badge.textContent = '已讀';
    return badge;
}

// --- NEW: Function to handle marking a post as read ---
async function handleMarkAsRead(postId) {
    if (!viewCurrentUser || !viewDb) {
        throw new Error("使用者未登入或資料庫未連接。");
    }
    const userId = viewCurrentUser.uid;
    const docId = `${userId}_${postId}`; // Composite document ID
    const statusRef = viewDb.collection('cram_school_read_status').doc(docId);
    
    console.log(`Setting read status for doc: ${docId}`);
    try {
        await statusRef.set({
            userId: userId,
            postId: postId,
            readAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Add to local set for immediate UI update
        readPostIds.add(postId);
        console.log(`Post ${postId} marked as read successfully.`);
    } catch (error) {
        console.error(`Error setting read status for post ${postId}:`, error);
        throw error; // Re-throw to be caught by the caller
    }
}

// --- NEW Function to call Cloud Function ---
async function callGetCramSchoolPosts() {
    try {
        // Try with Firebase Functions if available
        if (firebase.functions) {
            console.log("Calling getCramSchoolPosts Cloud Function...");
            const getPostsFunction = firebase.functions().httpsCallable('getCramSchoolPosts');
            
            try {
                const result = await getPostsFunction(); // No data needs to be passed for this function
                console.log("Received posts from Cloud Function:", result.data?.posts?.length || 0);
                
                // The Cloud Function should return data in the format { posts: [...] }
                if (result.data && Array.isArray(result.data.posts)) {
                    return result.data.posts; // Return the array of posts
                } else {
                    console.warn("Invalid data structure returned from getCramSchoolPosts, using direct query fallback");
                }
            } catch (error) {
                console.warn("Error calling getCramSchoolPosts function, falling back to direct query:", error);
            }
        } else {
            console.warn("Firebase Functions service not initialized, falling back to direct query");
        }
        
        // Fallback to direct Firestore query
        return await fallbackDirectFirestoreQuery();
    } catch (error) {
        console.error("All attempts to fetch cram school posts failed:", error);
        // Last resort - return empty array but don't throw
        return [];
    }
}

// Fallback direct Firestore query - this circumvents the Cloud Function when it fails
async function fallbackDirectFirestoreQuery() {
    console.log("Using fallback direct Firestore query for cram school posts");
    
    try {
        // Get database instance - use global, viewDb, or try to initialize
        const db = viewDb || window.db || firebase.firestore();
        
        if (!db) {
            console.error("Cannot get Firestore database instance for fallback query");
            return [];
        }
        
        // Create a query that mimics what the Cloud Function would do
        let query = db.collection('cram_school_posts');
        
        // If user data is available, filter by permissions
        if (currentUser && currentUser.store) {
            query = query.where('visibleTo', 'array-contains', currentUser.store);
        }
        
        // Get the posts
        const snapshot = await query
            .orderBy('publishedAt', 'desc')
            .limit(100) // Limit to reasonable amount
            .get();
        
        if (snapshot.empty) {
            console.log("No posts found in direct Firestore query");
            return [];
        }
        
        // Format the posts to match the expected structure from the Cloud Function
        const posts = [];
        snapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                data: doc.data()
            });
        });
        
        console.log(`Retrieved ${posts.length} posts via direct Firestore query`);
        return posts;
    } catch (error) {
        console.error("Error in fallback direct Firestore query:", error);
        // Return empty array as last resort instead of throwing
        return [];
    }
}

// 初始化并设置Firebase Functions引用
function initializeFirebaseFunctions() {
  if (!firebase.functions) {
    console.error('Firebase functions not available');
    return;
  }
  
  cramSchoolFunctions = {
    getCramSchoolPosts: firebase.functions().httpsCallable('getCramSchoolPosts'),
    addCramSchoolComment: firebase.functions().httpsCallable('addCramSchoolComment')
  };
}

// 知識+ 初始化函數
function initCramSchoolSection() {
  if (!firebase.auth().currentUser) {
    console.error('User not authenticated');
    document.getElementById('postsList').innerHTML = '<p class="text-center">請先登入以查看知識+內容</p>';
    return;
  }
  
  initializeFirebaseFunctions();
  
  // 初始化UI元素
  setupFilterButtons();
  
  // 加载帖子
  loadAndRenderPosts();
  
  // 添加评论表单监听器
  document.getElementById('commentForm')?.addEventListener('submit', handleAddComment);
}

// 設置分類過濾按鈕
function setupFilterButtons() {
  const filterContainer = document.getElementById('categoryFilters');
  
  if (!filterContainer) {
    console.error('Category filter container not found');
    return;
  }
  
  // 添加"全部"按鈕
  const allButton = document.createElement('button');
  allButton.textContent = '全部';
  allButton.className = 'btn btn-outline-primary active-filter mr-2 mb-2';
  allButton.dataset.category = 'all';
  filterContainer.appendChild(allButton);
  
  // 常用分類
  const categories = ['公告', '常見問題', '教學資源', '活動'];
  
  categories.forEach(category => {
    const button = document.createElement('button');
    button.textContent = category;
    button.className = 'btn btn-outline-primary mr-2 mb-2';
    button.dataset.category = category;
    filterContainer.appendChild(button);
  });
  
  // 添加點擊事件
  filterContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      // 移除所有按鈕的活動狀態
      document.querySelectorAll('#categoryFilters button').forEach(btn => {
        btn.classList.remove('active-filter');
      });
      
      // 添加活動狀態到被點擊的按鈕
      e.target.classList.add('active-filter');
      
      // 過濾貼文
      const category = e.target.dataset.category;
      filterPostsByCategory(category);
    }
  });
}

// 過濾貼文列表
function filterPostsByCategory(category) {
  const posts = document.querySelectorAll('.post-item');
  
  posts.forEach(post => {
    if (category === 'all' || post.dataset.category === category) {
      post.style.display = 'block';
    } else {
      post.style.display = 'none';
    }
  });
}

// 加载并渲染帖子列表
async function loadAndRenderPosts() {
  try {
    const postsList = document.getElementById('postsList');
    postsList.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="sr-only">Loading...</span></div></div>';
    
    // 使用Cloud Function获取帖子
    const result = await cramSchoolFunctions.getCramSchoolPosts();
    const posts = result.data.posts || [];
    
    if (posts.length === 0) {
      postsList.innerHTML = '<p class="text-center">目前沒有發布的知識+內容</p>';
      return;
    }
    
    // 清空加载指示器
    postsList.innerHTML = '';
    
    // 渲染每个帖子
    posts.forEach(post => {
      renderPost(post, postsList);
    });
    
    // 添加点击事件监听器以展开/折叠评论区
    document.querySelectorAll('.toggle-comments').forEach(button => {
      button.addEventListener('click', function() {
        const postId = this.dataset.postId;
        const commentsSection = document.getElementById(`comments-section-${postId}`);
        
        if (commentsSection.style.display === 'none' || !commentsSection.style.display) {
          commentsSection.style.display = 'block';
          this.textContent = '收起留言';
          loadAndRenderComments(postId);
        } else {
          commentsSection.style.display = 'none';
          this.textContent = '查看留言';
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading posts:', error);
    const postsList = document.getElementById('postsList');
    postsList.innerHTML = `<p class="text-center text-danger">載入知識+內容時發生錯誤: ${error.message}</p>`;
  }
}

// 渲染单个帖子
function renderPost(post, container) {
  // 使用DOMPurify净化HTML内容，防止XSS攻击
  const safeHTML = DOMPurify.sanitize(post.data.contentHtml || post.data.content);
  
  const postElement = document.createElement('div');
  postElement.className = 'post-item card mb-4';
  postElement.dataset.category = post.data.category || '未分類';
  postElement.dataset.postId = post.id;
  
  // 格式化时间戳
  const timestamp = post.data.timestamp ? new Date(post.data.timestamp.seconds * 1000) : new Date();
  const formattedDate = `${timestamp.getFullYear()}/${(timestamp.getMonth()+1).toString().padStart(2, '0')}/${timestamp.getDate().toString().padStart(2, '0')}`;
  
  // 构建帖子HTML
  postElement.innerHTML = `
    <div class="card-header d-flex justify-content-between align-items-center">
      <span class="badge badge-info">${post.data.category || '未分類'}</span>
      <small class="text-muted">${formattedDate}</small>
    </div>
    <div class="card-body">
      <div class="post-content">${safeHTML}</div>
      
      ${post.data.imageUrl ? `
        <div class="post-image mt-3">
          <img src="${DOMPurify.sanitize(post.data.imageUrl)}" class="img-fluid rounded" alt="Post image">
        </div>
      ` : ''}
      
      ${post.data.videoUrl ? `
        <div class="post-video mt-3">
          <div class="embed-responsive embed-responsive-16by9">
            <iframe class="embed-responsive-item" src="${DOMPurify.sanitize(post.data.videoUrl)}" allowfullscreen></iframe>
          </div>
        </div>
      ` : ''}
    </div>
    <div class="card-footer">
      <button class="btn btn-sm btn-outline-secondary toggle-comments" data-post-id="${post.id}">
        查看留言
      </button>
      
      <div id="comments-section-${post.id}" style="display: none;" class="mt-3">
        <div id="comments-list-${post.id}" class="comments-list">
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-secondary" role="status">
              <span class="sr-only">Loading comments...</span>
            </div>
          </div>
        </div>
        
        <form id="comment-form-${post.id}" class="comment-form mt-3">
          <div class="form-group">
            <textarea class="form-control" placeholder="寫下您的留言..." required></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">發表留言</button>
        </form>
      </div>
    </div>
  `;
  
  // 为评论表单添加提交事件监听器
  const commentForm = postElement.querySelector(`#comment-form-${post.id}`);
  commentForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const commentText = this.querySelector('textarea').value;
    handleAddComment(post.id, commentText);
    this.querySelector('textarea').value = ''; // 清空输入框
  });
  
  container.appendChild(postElement);
}

// 加载并渲染评论
async function loadAndRenderComments(postId) {
  const commentsContainer = document.getElementById(`comments-list-${postId}`);
  
  if (!commentsContainer) {
    console.error(`Comments container for post ${postId} not found`);
    return;
  }
  
  try {
    // 显示加载中
    commentsContainer.innerHTML = `
      <div class="text-center">
        <div class="spinner-border spinner-border-sm text-secondary" role="status">
          <span class="sr-only">Loading comments...</span>
        </div>
      </div>
    `;
    
    // 从Firestore直接获取评论（稍后可迁移到Cloud Function）
    const commentsSnapshot = await firebase.firestore()
      .collection('cram_school_posts')
      .doc(postId)
      .collection('comments')
      .orderBy('timestamp', 'desc')
      .get();
    
    if (commentsSnapshot.empty) {
      commentsContainer.innerHTML = '<p class="text-center text-muted">暫無留言</p>';
      return;
    }
    
    // 渲染评论
    commentsContainer.innerHTML = '';
    
    commentsSnapshot.forEach(doc => {
      const comment = doc.data();
      const commentElement = document.createElement('div');
      commentElement.className = 'comment-item mb-2 p-2 border-bottom';
      
      const commentDate = comment.timestamp 
        ? new Date(comment.timestamp.seconds * 1000).toLocaleDateString('zh-TW') 
        : '剛剛';
      
      const safeContent = DOMPurify.sanitize(comment.content);
      
      commentElement.innerHTML = `
        <div class="d-flex justify-content-between">
          <strong>${comment.userName || '匿名用戶'}</strong>
          <small class="text-muted">${commentDate}</small>
        </div>
        <div class="comment-content mt-1">${safeContent}</div>
      `;
      
      commentsContainer.appendChild(commentElement);
    });
    
  } catch (error) {
    console.error(`Error loading comments for post ${postId}:`, error);
    commentsContainer.innerHTML = '<p class="text-center text-danger">載入留言時發生錯誤</p>';
  }
}

// 处理添加评论
async function handleAddComment(postId, commentText) {
  if (!firebase.auth().currentUser) {
    showToast('請先登入以發表留言', 'warning');
    return;
  }
  
  if (!commentText || typeof commentText !== 'string' || commentText.trim().length === 0) {
    showToast('留言內容不能為空', 'warning');
    return;
  }
  
  try {
    // 显示加载指示器
    const submitButton = document.querySelector(`#comment-form-${postId} button[type="submit"]`);
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 提交中...';
    
    // 使用Cloud Function添加评论
    await cramSchoolFunctions.addCramSchoolComment({
      postId: postId,
      commentText: commentText
    });
    
    // 重新加载评论列表以显示新添加的评论
    await loadAndRenderComments(postId);
    
    // 恢复按钮状态
    submitButton.disabled = false;
    submitButton.textContent = originalText;
    
    showToast('留言已發布', 'success');
    
  } catch (error) {
    console.error('Error adding comment:', error);
    showToast(`發布留言時發生錯誤: ${error.message}`, 'danger');
    
    // 恢复按钮状态
    const submitButton = document.querySelector(`#comment-form-${postId} button[type="submit"]`);
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = '發表留言';
    }
  }
}

// 显示提示消息
function showToast(message, type = 'info') {
  // 检查是否已存在toast容器，如果不存在则创建
  let toastContainer = document.getElementById('toast-container');
  
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'position-fixed bottom-0 right-0 p-3';
    toastContainer.style.zIndex = '5';
    toastContainer.style.right = '0';
    toastContainer.style.bottom = '0';
    document.body.appendChild(toastContainer);
  }
  
  // 创建toast元素
  const toastId = `toast-${Date.now()}`;
  const toast = document.createElement('div');
  toast.className = `toast bg-${type}`;
  toast.role = 'alert';
  toast.ariaLive = 'assertive';
  toast.ariaAtomic = 'true';
  toast.id = toastId;
  toast.innerHTML = `
    <div class="toast-header">
      <strong class="mr-auto">通知</strong>
      <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div class="toast-body text-white">
      ${message}
    </div>
  `;
  
  toastContainer.appendChild(toast);
  
  // 显示toast，并在3秒后自动关闭
  $(toast).toast({ delay: 3000 });
  $(toast).toast('show');
  
  // 添加关闭事件监听器
  toast.querySelector('.close').addEventListener('click', function() {
    $(toast).toast('hide');
  });
  
  // 回头从DOM中移除
  $(toast).on('hidden.bs.toast', function() {
    toast.remove();
  });
}
