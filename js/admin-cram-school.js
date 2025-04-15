// js/admin-cram-school.js - 補習班日誌 (Firestore backed)

'use strict';

// REMOVED: Global Firebase service variables, will use passed instances directly
/*
let db = null;
let storage = null;
let auth = null;
*/

// --- 模組內變數 ---
// let cramSchoolDb = []; // REMOVED: Replaced by Firestore
let cramSchoolContainer = null; // 日誌內容的容器
// let nextPostId = 1; // REMOVED: Firestore handles IDs
// let nextCommentId = 1; // REMOVED: Firestore handles IDs
let editingPostId = null; // Track which post is being edited
let editingCommentId = null; // Track which comment is being edited (Future use)
let replyingToCommentId = null; // Track which comment is being replied to (Future use)
let currentImageFile = null; // Track the selected image file
let existingImageUrl = null; // Track the image URL when editing
let existingVideoUrl = null; // Track the video URL when editing
let existingCategory = null; // Track the category when editing
let existingOrder = null; // Track the order when editing
let quillEditor = null; // Variable for Quill instance
let existingTargetLevel = null;
let existingTargetStore = null;

// --- 主要載入函數 (接收容器和 Firebase 實例) ---
function loadCramSchoolSection(container, dbInstance, userInstance) {
    // Store the provided container
    cramSchoolContainer = container;
    if (!cramSchoolContainer) {
        console.error('Cram School container not provided to loadCramSchoolSection.');
        return;
    }

    // Use the provided Firebase instances directly
    if (!dbInstance || !userInstance) { 
        console.error("Firebase db or user instance not provided to loadCramSchoolSection.");
        cramSchoolContainer.innerHTML = `<p class="text-danger">無法載入知識+：缺少資料庫或使用者資訊。</p>`;
        return;
    }
    // REMOVED: db = dbInstance;
    // REMOVED: auth = firebase.auth(); 
    // REMOVED: storage = firebase.storage();
    const currentDb = dbInstance; // Use local const for clarity within this scope
    const currentAuth = firebase.auth(); // Or pass authInstance if available
    const currentStorage = firebase.storage(); // Or pass storageInstance if available

    console.log("loadCramSchoolSection called, using provided db and user:", userInstance.uid);

    // Initial render of the UI structure
    renderInitialUI(currentDb); // Pass db instance if needed by UI setup?

    // Load and listen for real-time updates on posts
    loadAndRenderPosts(currentDb); // Pass db instance
}

// --- UI Rendering ---
function renderInitialUI(db) { // Accept db if needed by event handlers
    // Check if UI is already initialized to prevent duplication
    if (cramSchoolContainer.dataset.initialized) return;

    cramSchoolContainer.innerHTML = `
        <div id="cram-school-new-post">
            <h4>新增/編輯日誌</h4>
            <!-- Quill Editor Container -->
            <div id="cram-school-editor-container" style="min-height: 150px; border: 1px solid #ced4da; border-radius: .25rem;"></div>
            <!-- Category Input -->
            <div class="form-group" style="margin-top: 10px;">
                <label for="cram-school-new-post-category">分類 (選填):</label>
                <input type="text" id="cram-school-new-post-category" class="form-control" placeholder="例如：SOP, 公告, 產品知識">
            </div>
            <!-- Order Input -->
            <div class="form-group" style="margin-top: 10px;">
                <label for="cram-school-new-post-order">排序 (選填, 數字越小越靠前):</label>
                <input type="number" id="cram-school-new-post-order" class="form-control" placeholder="預設 999">
            </div>
            <!-- Target Level Input -->
            <div class="form-group" style="margin-top: 10px;">
                <label for="cram-school-new-post-level">目標等級 (選填, 數字):</label>
                <input type="number" id="cram-school-new-post-level" class="form-control" placeholder="留空則所有人可見">
            </div>
            <!-- Target Store Input -->
            <div class="form-group" style="margin-top: 10px;">
                <label for="cram-school-new-post-store">目標分店 (選填, 店代號):</label>
                <input type="text" id="cram-school-new-post-store" class="form-control" placeholder="留空則所有分店可見 (多個用逗號分隔)">
            </div>
            <!-- Video URL Input -->
            <div class="form-group" style="margin-top: 10px;">
                <label for="cram-school-new-post-video">影片網址 (選填, YouTube/Vimeo):</label>
                <input type="url" id="cram-school-new-post-video" class="form-control" placeholder="貼上 YouTube 或 Vimeo 影片連結">
            </div>
            <div class="form-group" style="margin-top: 10px;">
                <label for="cram-school-new-post-image">附加圖片 (選填):</label>
                <input type="file" id="cram-school-new-post-image" class="form-control-file" accept="image/*">
                <img id="cram-school-image-preview" src="#" alt="Image Preview" style="max-width: 200px; max-height: 150px; margin-top: 10px; display: none;"/>
                <button id="cram-school-remove-image-btn" class="btn btn-warning btn-sm" style="margin-top: 5px; display: none;">移除圖片</button>
            </div>
            <button id="cram-school-save-post-btn" class="btn btn-primary btn-sm" style="margin-top: 10px;">儲存日誌</button>
            <button id="cram-school-cancel-edit-post-btn" class="btn btn-secondary btn-sm" style="margin-top: 10px; display: none;">取消編輯</button>
        </div>
        <hr>
        <h4>日誌列表</h4>
        <div id="cram-school-posts-list">
            <p>讀取中...</p>
        </div>
    `;
    cramSchoolContainer.dataset.initialized = 'true';

    // Bind top-level button events (Pass db/storage/auth if needed)
    bindFormEvents(db, currentStorage, currentAuth); // Pass instances
    initializeQuillEditor(); // Initialize Quill editor
}

// Modify function signature to accept instances
function bindFormEvents(db, storage, auth) { 
    const savePostBtn = cramSchoolContainer.querySelector('#cram-school-save-post-btn');
    const cancelEditBtn = cramSchoolContainer.querySelector('#cram-school-cancel-edit-post-btn');
    const imageInput = cramSchoolContainer.querySelector('#cram-school-new-post-image');
    const imagePreview = cramSchoolContainer.querySelector('#cram-school-image-preview');
    const removeImageBtn = cramSchoolContainer.querySelector('#cram-school-remove-image-btn');

    if (savePostBtn) savePostBtn.onclick = () => handleSavePost(db, storage, auth); // Pass instances
    if (cancelEditBtn) cancelEditBtn.onclick = cancelEditPost;
    if (removeImageBtn) removeImageBtn.onclick = handleRemoveImage;

    if (imageInput && imagePreview) {
        imageInput.onchange = (event) => {
            currentImageFile = event.target.files[0];
            if (currentImageFile && currentImageFile.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result; // Show preview from local file
                    imagePreview.style.display = 'block';
                    removeImageBtn.style.display = 'inline-block'; // Show remove button
                    existingImageUrl = null; // Clear existing URL if a new file is chosen
                }
                reader.readAsDataURL(currentImageFile);
            } else {
                // If no file selected or invalid file, clear preview and stored file
                currentImageFile = null;
                // If editing and had an existing image, keep showing it until 'Remove' is clicked
                if (!editingPostId || !existingImageUrl) {
                     resetImagePreview();
                }
            }
        };
    }
}

function resetImagePreview() {
    const imagePreview = cramSchoolContainer.querySelector('#cram-school-image-preview');
    const imageInput = cramSchoolContainer.querySelector('#cram-school-new-post-image');
    const removeImageBtn = cramSchoolContainer.querySelector('#cram-school-remove-image-btn');

    imagePreview.src = '#';
    imagePreview.style.display = 'none';
    removeImageBtn.style.display = 'none';
    if (imageInput) imageInput.value = ''; // Clear the file input
    currentImageFile = null;
    existingImageUrl = null;
    // Also reset category and video field are handled in resetEditForm
    cramSchoolContainer.querySelector('#cram-school-new-post-category').value = ''; // Clear category input
    cramSchoolContainer.querySelector('#cram-school-new-post-order').value = ''; // Clear order input
    cramSchoolContainer.querySelector('#cram-school-new-post-level').value = ''; // Clear level
    cramSchoolContainer.querySelector('#cram-school-new-post-store').value = ''; // Clear store
    cramSchoolContainer.querySelector('#cram-school-new-post-video').value = ''; // Clear video input
    existingVideoUrl = null;
    // Resetting order is handled in resetEditForm
}

function handleRemoveImage() {
    // When editing, this marks the existing image for removal on save
    existingImageUrl = null; // Indicate removal
    resetImagePreview();
    // We don't delete from storage immediately, only upon saving the post.
}


// --- Firestore Data Loading & Rendering ---

// Modify signature to accept db instance
function loadAndRenderPosts(db) { 
    const postsListDiv = document.querySelector('#cram-school-posts-list');
    if (!db) {
        postsListDiv.innerHTML = '<p class="text-danger">Firestore 未初始化。</p>';
        return;
    }
    const postsCollection = db.collection('cram_school_posts');
    const q = postsCollection.orderBy('order', 'asc').orderBy('timestamp', 'desc');

    // Use onSnapshot for real-time updates
    q.onSnapshot((querySnapshot) => {
        postsListDiv.innerHTML = ''; // Clear previous list
        if (querySnapshot.empty) {
            postsListDiv.innerHTML = '<p>目前沒有任何日誌。</p>';
            return;
        }
        querySnapshot.forEach((doc) => {
            renderPost(doc.id, doc.data(), db); // Pass db instance
        });
        // Set up event delegation after posts are rendered
        setupPostListEventDelegation(postsListDiv, db, storage, auth); // Pass instances

    }, (error) => {
        console.error("Error fetching posts: ", error);
        postsListDiv.innerHTML = '<p class="text-danger">讀取日誌時發生錯誤。</p>';
    });
}

// Modify signature to accept db instance
function renderPost(postId, postData, db) { 
    const postsListDiv = document.querySelector('#cram-school-posts-list');
    const postElement = document.createElement('div');
    postElement.classList.add('cram-school-post', 'card', 'mb-3'); // Use Bootstrap card style
    postElement.dataset.postId = postId;
    // postElement.style.border = '1px solid #eee'; // Replaced by card
    // postElement.style.marginBottom = '15px'; // Replaced by mb-3
    // postElement.style.padding = '10px'; // Replaced by card body

    // Format timestamp
    const timestamp = postData.timestamp?.toDate ? postData.timestamp.toDate().toLocaleString() : 'No date';
    const orderText = postData.order !== undefined && postData.order !== null ? `(排序: ${postData.order})` : ''; // Display order if set

    // Use content directly as it's now HTML from Quill
    const postContentHtml = postData.content || ''; // Use content directly
    // Prepare image HTML if exists
    const imageHtml = postData.imageUrl ? `<img src="${postData.imageUrl}" alt="Post Image" class="img-fluid mt-2" style="max-height: 300px;">` : ''; // Use img-fluid
    // --- NEW: Prepare video HTML if exists ---
    const videoHtml = postData.videoUrl ? embedVideoUrl(postData.videoUrl) : '';

    postElement.innerHTML = `
        <div class="card-body">
             <div class="post-actions float-end">
                <button class="btn btn-sm btn-outline-primary edit-post-btn">編輯</button>
                <button class="btn btn-sm btn-outline-danger delete-post-btn ms-1">刪除</button>
            </div>
            <div class="post-meta text-muted mb-1">
                 <small>發布於 ${timestamp} ${orderText}</small>
            </div>
            <!-- Add ql-editor class for potential Quill styling consistency -->
            <div class="post-content ql-editor mb-2"> 
                ${postContentHtml} 
            </div>
             ${imageHtml ? `<div class="mt-2">${imageHtml}</div>` : ''}
             ${videoHtml ? `<div class="mt-2">${videoHtml}</div>` : ''}
            <hr class="my-2">
            <div class="post-comments">
                <h6>留言</h6>
                <div class="comments-list mb-2">
                    <!-- Comments will be loaded here -->
                    <small>讀取留言中...</small>
                </div>
                <div class="new-comment-form mt-2">
                    <textarea class="form-control new-comment-content" rows="2" placeholder="新增留言..."></textarea>
                    <button class="btn btn-secondary btn-sm mt-1 add-comment-btn">送出</button>
                </div>
            </div>
        </div>
    `;
    postsListDiv.appendChild(postElement);

    // Load comments for this post (Pass db instance)
    loadAndRenderComments(postId, postElement.querySelector('.comments-list'), db);
}

// Modify signature to accept db instance
function loadAndRenderComments(postId, commentsListDiv, db) { 
    const commentsCollection = db.collection('cram_school_posts').doc(postId).collection('comments');
    const q = commentsCollection.orderBy('timestamp', 'asc'); // Order comments chronologically

    q.onSnapshot((querySnapshot) => {
        commentsListDiv.innerHTML = ''; // Clear previous comments
        if (querySnapshot.empty) {
            commentsListDiv.innerHTML = '<small>尚無留言。</small>';
            return;
        }
        querySnapshot.forEach((doc) => {
            renderComment(commentsListDiv, doc.id, doc.data());
        });
    }, (error) => {
        console.error(`Error fetching comments for post ${postId}: `, error);
        commentsListDiv.innerHTML = '<small class="text-danger">讀取留言失敗。</small>';
    });
}

function renderComment(container, commentId, commentData) {
    const commentElement = document.createElement('div');
    commentElement.classList.add('comment-item', 'mb-2');
    commentElement.dataset.commentId = commentId;
    // Add indentation for replies based on parentId if implementing nesting later
    // commentElement.style.marginLeft = commentData.parentId ? '20px' : '0';

    const timestamp = commentData.timestamp?.toDate ? commentData.timestamp.toDate().toLocaleTimeString() : '';
    const userName = commentData.userName || '匿名'; // Get username
    // Use content directly as HTML
    const contentHtml = commentData.content || ''; // Use content directly

    // Basic comment structure - Add Edit/Delete later
    commentElement.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div>
                <strong>${userName}:</strong> <span class="comment-content-display">${contentHtml}</span>
            </div>
            <div class="comment-actions ms-2 flex-shrink-0">
                 <button class="btn btn-sm btn-outline-secondary reply-comment-btn" data-comment-id="${commentId}">回覆</button>
                 <button class="btn btn-sm btn-outline-info edit-comment-btn ms-1">編輯</button>
                 <button class="btn btn-sm btn-outline-danger delete-comment-btn ms-1">刪除</button>
            </div>
        </div>
        <small class="text-muted">${timestamp}</small>
    `;
    container.appendChild(commentElement);
}


// --- Event Delegation Setup ---
function setupPostListEventDelegation(postsListDiv, db, storage, auth) {
    postsListDiv.addEventListener('click', async (event) => {
        const target = event.target;
        const postElement = target.closest('.cram-school-post');
        if (!postElement) return;
        const postId = postElement.dataset.postId;

        if (target.classList.contains('edit-post-btn')) {
            // Fetch full post data for editing
            try {
                const docRef = db.collection('cram_school_posts').doc(postId);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    handleEditPost(postId, docSnap.data());
                } else {
                    console.error("Post not found for editing:", postId);
                    alert("找不到要編輯的日誌。");
                }
            } catch (error) {
                console.error("Error fetching post for edit:", error);
                alert("讀取日誌資料時發生錯誤。");
            }
        } else if (target.classList.contains('delete-post-btn')) {
            handleDeletePost(postId, db, storage); // Pass instances
        } else if (target.classList.contains('add-comment-btn')) {
            const commentTextarea = postElement.querySelector('.new-comment-content');
            const content = commentTextarea.value.trim();
            if (content) {
                handleAddComment(postId, content, null, db, auth); // Pass instances (null for parentId initially)
            }
        }
        // Add handlers for reply/edit/delete comment buttons if needed here
        // Example:
        // else if (target.classList.contains('delete-comment-btn')) {
        //     const commentId = target.closest('[data-comment-id]')?.dataset.commentId;
        //     if (commentId) handleDeleteComment(postId, commentId, db);
        // }
    });
}

// --- Post Actions (Updated for Firebase Compat SDK) ---

// Modify signature to accept instances
async function handleSavePost(db, storage, auth) {
    const content = quillEditor.root.innerHTML; // Get HTML content from Quill
    const category = cramSchoolContainer.querySelector('#cram-school-new-post-category').value.trim();
    const orderInput = cramSchoolContainer.querySelector('#cram-school-new-post-order').value.trim();
    const order = orderInput === '' ? 999 : parseInt(orderInput, 10);
    const targetLevelInput = cramSchoolContainer.querySelector('#cram-school-new-post-level').value.trim();
    const targetLevel = targetLevelInput === '' ? null : parseInt(targetLevelInput, 10);
    const targetStoreInput = cramSchoolContainer.querySelector('#cram-school-new-post-store').value.trim();
    const targetStore = targetStoreInput === '' ? null : targetStoreInput.split(',').map(s => s.trim()).filter(s => s);
    const videoUrl = cramSchoolContainer.querySelector('#cram-school-new-post-video').value.trim();

    if (!quillEditor.getText().trim()) { // Use Quill's method to check if content is effectively empty
        alert('日誌內容不能為空。');
        return;
    }

    const saveButton = cramSchoolContainer.querySelector('#cram-school-save-post-btn');
    saveButton.disabled = true;
    saveButton.textContent = '儲存中...';

    try {
        let imageUrl = existingImageUrl; // Start with existing URL if editing

        // Handle image upload/removal
        if (currentImageFile) {
            // Upload new image
            const imageRef = storage.ref(`cram_school_images/${Date.now()}_${currentImageFile.name}`);
            const uploadTask = await imageRef.put(currentImageFile);
            imageUrl = await uploadTask.ref.getDownloadURL();
            console.log('New image uploaded:', imageUrl);
            // If editing and had an old image, delete it (optional, consider keeping history?)
            // if (editingPostId && existingImageUrl) { ... delete old image logic ... }
        } else if (editingPostId && existingImageUrl === null) {
            // Image was marked for removal during edit (existingImageUrl set to null)
            imageUrl = null;
            // TODO: Delete the actual image from storage here if needed
            // This requires storing the storage path, not just the URL
            // Example: const oldImageRef = storage.refFromURL(originalImageUrlBeforeEdit);
            // await oldImageRef.delete();
        }

        const postData = {
            content: content,
            timestamp: editingPostId ? postData.timestamp : firebase.firestore.FieldValue.serverTimestamp(), // Keep original timestamp when editing?
            // Or update timestamp on every edit:
            // timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            imageUrl: imageUrl, // May be null
            videoUrl: videoUrl || null,
            category: category || null,
            order: isNaN(order) ? 999 : order,
            targetLevel: (targetLevel !== null && !isNaN(targetLevel)) ? targetLevel : null,
            targetStore: (targetStore && targetStore.length > 0) ? targetStore : null,
            // Add author info if needed (optional)
            // authorId: auth.currentUser.uid,
            // authorName: auth.currentUser.displayName
        };

        if (editingPostId) {
            // Update existing post
            await db.collection('cram_school_posts').doc(editingPostId).update(postData);
            console.log('Post updated:', editingPostId);
            alert('日誌已更新！');
        } else {
            // Add new post
            const docRef = await db.collection('cram_school_posts').add(postData);
            console.log('Post added with ID:', docRef.id);
            alert('日誌已新增！');
        }

        resetEditForm();

    } catch (error) {
        console.error('Error saving post:', error);
        alert(`儲存日誌失敗: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存日誌';
    }
}

function resetEditForm() {
    // Clear Quill editor
    if (quillEditor) {
        quillEditor.setText(''); 
    }
    
    // Clear other inputs
    cramSchoolContainer.querySelector('#cram-school-new-post-category').value = '';
    cramSchoolContainer.querySelector('#cram-school-new-post-order').value = ''; 
    cramSchoolContainer.querySelector('#cram-school-new-post-level').value = '';
    cramSchoolContainer.querySelector('#cram-school-new-post-store').value = '';
    cramSchoolContainer.querySelector('#cram-school-new-post-video').value = ''; 
    resetImagePreview(); 
    
    // Reset state variables
    editingPostId = null;
    existingImageUrl = null; 
    existingCategory = null; 
    existingOrder = null; 
    existingTargetLevel = null;
    existingTargetStore = null;
    existingVideoUrl = null;
    
    // Reset buttons
    cramSchoolContainer.querySelector('#cram-school-cancel-edit-post-btn').style.display = 'none';
    cramSchoolContainer.querySelector('#cram-school-save-post-btn').textContent = '儲存日誌';
}

function handleEditPost(postId, postData) {
    editingPostId = postId;
    
    // Load content into Quill editor
    if (quillEditor) {
        quillEditor.root.innerHTML = postData.content || ''; 
    } else {
        console.error("Quill editor not ready for loading content.");
        // Optionally show a message or load into a hidden textarea as fallback
    }
    
    // Populate other fields
    cramSchoolContainer.querySelector('#cram-school-new-post-category').value = postData.category || ''; 
    cramSchoolContainer.querySelector('#cram-school-new-post-order').value = postData.order !== undefined && postData.order !== null ? postData.order : '';
    cramSchoolContainer.querySelector('#cram-school-new-post-level').value = postData.targetLevel !== undefined && postData.targetLevel !== null ? postData.targetLevel : '';
    let storeValue = '';
    if (postData.targetStore) {
        storeValue = Array.isArray(postData.targetStore) ? postData.targetStore.join(', ') : postData.targetStore;
    }
    cramSchoolContainer.querySelector('#cram-school-new-post-store').value = storeValue;
    cramSchoolContainer.querySelector('#cram-school-new-post-video').value = postData.videoUrl || ''; 

    // Handle existing image display
    resetImagePreview(); 
    if (postData.imageUrl) {
        existingImageUrl = postData.imageUrl;
        const preview = cramSchoolContainer.querySelector('#cram-school-image-preview');
        const removeBtn = cramSchoolContainer.querySelector('#cram-school-remove-image-btn');
        preview.src = existingImageUrl;
        preview.style.display = 'block';
        removeBtn.style.display = 'inline-block';
    }
    
    // Store existing state
    existingCategory = postData.category || null;
    existingOrder = postData.order !== undefined && postData.order !== null ? postData.order : null; 
    existingTargetLevel = postData.targetLevel !== undefined && postData.targetLevel !== null ? postData.targetLevel : null;
    existingTargetStore = postData.targetStore || null;
    existingVideoUrl = postData.videoUrl || null;

    // Update UI
    cramSchoolContainer.querySelector('#cram-school-save-post-btn').textContent = '更新日誌';
    cramSchoolContainer.querySelector('#cram-school-cancel-edit-post-btn').style.display = 'inline-block';
    cramSchoolContainer.querySelector('#cram-school-new-post').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditPost() {
    // Reset all form fields including Quill
    resetEditForm(); 
}

// Modify signature to accept instances
async function handleDeletePost(postId, db, storage) { 
    if (!confirm('確定要刪除這篇日誌及其所有留言嗎？')) return;

    try {
        const postRef = db.collection('cram_school_posts').doc(postId);
        const postSnap = await postRef.get();

        // Delete image from storage if it exists
        if (postSnap.exists && postSnap.data().imageUrl) {
            try {
                const imageRef = storage.refFromURL(postSnap.data().imageUrl);
                await imageRef.delete();
                console.log('Associated image deleted from storage.');
            } catch (storageError) {
                // Log error but continue deleting the post document
                console.error('Error deleting image from storage (post will still be deleted):', storageError);
            }
        }

        // TODO: Delete comments subcollection (Requires recursive delete or a Cloud Function)
        // Firestore client-side SDK cannot delete subcollections directly in one go.
        // Option 1: Iterate and delete comments client-side (slow, potentially incomplete on error)
        // Option 2: Use a Cloud Function triggered on post delete.
        console.warn(`Deletion of comments subcollection for post ${postId} is not implemented client-side.`);

        // Delete the post document
        await postRef.delete();
        console.log('Post deleted:', postId);
        alert('日誌已刪除。'); // (Note: Comments might still exist if not handled by CF)

    } catch (error) {
        console.error('Error deleting post:', error);
        alert(`刪除日誌失敗: ${error.message}`);
    }
}

// Modify signature to accept instances
async function handleAddComment(postId, content, parentId = null, db, auth) { 
    const user = auth.currentUser;
    if (!user) {
        alert("請先登入才能留言。");
        return;
    }

    const commentData = {
        userId: user.uid,
        userName: user.displayName || '匿名用戶',
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        parentId: parentId // For nested comments (Future use)
    };

    try {
        const commentsCollection = db.collection('cram_school_posts').doc(postId).collection('comments');
        await commentsCollection.add(commentData);
        console.log(`Comment added to post ${postId}`);
        // Optionally clear the form for the specific post
        const postElement = document.querySelector(`.cram-school-post[data-post-id="${postId}"]`);
        if (postElement) {
            clearCommentForm(postElement.querySelector('.new-comment-form'));
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        alert(`新增留言失敗: ${error.message}`);
    }
}

function setupReply(postDiv, commentIdToReply) {
    if (!postDiv) return null;
    
    const formDiv = postDiv.querySelector('.new-comment-form');
    if (!formDiv) return null;
    
    const textarea = formDiv.querySelector('.new-comment-content');
    const replyIndicator = formDiv.querySelector('.reply-indicator');
    const cancelBtn = formDiv.querySelector('.cancel-reply-btn');
    
    // Find the comment text to show context
    const commentDiv = postDiv.querySelector(`.comment-item[data-comment-id="${commentIdToReply}"]`);
    const originalCommenter = commentDiv?.querySelector('strong')?.textContent || '留言';
    
    textarea.placeholder = `回覆 ${originalCommenter}...`;
    textarea.focus();
    replyIndicator.textContent = `正在回覆 ${originalCommenter}`;
    replyIndicator.classList.remove('d-none');
    cancelBtn.classList.remove('d-none');
    
    console.log('Replying to comment:', commentIdToReply);
    replyingToCommentId = commentIdToReply; // Store the ID globally
    return commentIdToReply;
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

// Modify signature to accept instances (Example - if implemented)
async function handleDeleteComment(postId, commentId, db) { 
    if (!confirm('確定要刪除這則留言嗎？')) return;
    try {
        await db.collection('cram_school_posts').doc(postId).collection('comments').doc(commentId).delete();
        console.log(`Comment ${commentId} deleted from post ${postId}`);
    } catch (error) {
        console.error('Error deleting comment:', error);
        alert(`刪除留言失敗: ${error.message}`);
    }
}

function handleEditComment(postId, commentId) {
    // This could be implemented later if needed
    console.log('Edit comment not implemented yet. PostId:', postId, 'CommentId:', commentId);
    alert('編輯留言功能尚未實作。');
}

// --- NEW: Video Embedding Helper ---
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

// New function to initialize Quill
function initializeQuillEditor() {
    const editorContainer = cramSchoolContainer.querySelector('#cram-school-editor-container');
    if (editorContainer) {
        if (typeof Quill !== 'undefined') {
            console.log("Initializing Quill editor...");
            quillEditor = new Quill(editorContainer, {
                theme: 'snow', // Use the Snow theme
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['link', 'image', 'video'], // Allow inserting images/videos if needed, requires server handling or base64
                        ['clean'] // Remove formatting button
                    ]
                },
                placeholder: '輸入日誌內容...' 
            });
            console.log("Quill editor initialized.");
        } else {
            console.error("Quill library not found. Please ensure Quill JS and CSS are included in admin.html.");
            editorContainer.innerHTML = '<p class="text-danger">錯誤：無法載入編輯器元件。請確認 Quill.js 已載入。</p>';
        }
    } else {
         console.error("Quill editor container #cram-school-editor-container not found.");
    }
}

// Make the loadCramSchoolSection function accessible globally
window.loadCramSchoolSection = loadCramSchoolSection; 
window.loadCramSchoolSection = loadCramSchoolSection; 