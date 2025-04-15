// 知識+ 页面的JavaScript功能

// 全局变量
let db;
let auth;
let storage;
let currentUser = null;
let unsubscribe = null;
let posts = [];
let categories = [];
let activeFilters = [];

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setupAuthListeners();
    setupEventListeners();
});

// 初始化Firebase服务
function initFirebase() {
    firebase.initializeApp({
        apiKey: "AIzaSyDxCLJkEfGrDxup6-ROtrYbC_m7ocgqllE",
        authDomain: "chicken-cram.firebaseapp.com",
        projectId: "chicken-cram",
        storageBucket: "chicken-cram.appspot.com",
        messagingSenderId: "580346447075",
        appId: "1:580346447075:web:750e12345678901234abcd"
    });
    
    db = firebase.firestore();
    auth = firebase.auth();
    storage = firebase.storage();
}

// 设置身份验证监听器
function setupAuthListeners() {
    auth.onAuthStateChanged(user => {
        const loginSection = document.getElementById('login-section');
        const contentSection = document.getElementById('content-section');
        const userDisplayName = document.getElementById('user-display-name');
        const userAvatar = document.getElementById('user-avatar');
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const newPostBtn = document.getElementById('new-post-btn');

        if (user) {
            // 用户已登录
            currentUser = user;
            console.log('User logged in:', user.displayName);
            
            // 更新UI顯示
            if (loginSection && contentSection) {
                loginSection.classList.add('d-none');
                contentSection.classList.remove('d-none');
            }
            
            if (userDisplayName) {
                userDisplayName.textContent = user.displayName || '用戶';
            }
            
            if (userAvatar && user.photoURL) {
                userAvatar.src = user.photoURL;
                userAvatar.classList.remove('d-none');
            }
            
            if (loginBtn && logoutBtn) {
                loginBtn.classList.add('d-none');
                logoutBtn.classList.remove('d-none');
            }
            
            if (newPostBtn) {
                newPostBtn.classList.remove('d-none');
            }
            
            // 載入知識+貼文
            loadPosts();
            
        } else {
            // 用戶未登入
            currentUser = null;
            console.log('User logged out');
            
            // 更新UI顯示
            if (loginSection && contentSection) {
                loginSection.classList.remove('d-none');
                contentSection.classList.add('d-none');
            }
            
            if (userDisplayName) {
                userDisplayName.textContent = '';
            }
            
            if (userAvatar) {
                userAvatar.classList.add('d-none');
            }
            
            if (loginBtn && logoutBtn) {
                loginBtn.classList.remove('d-none');
                logoutBtn.classList.add('d-none');
            }
            
            if (newPostBtn) {
                newPostBtn.classList.add('d-none');
            }
            
            // 取消資料庫監聽
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
        }
    });
}

// 設置事件監聽器
function setupEventListeners() {
    // 登入按鈕
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => {
                console.error('Login failed:', error);
                showToast('登入失敗，請稍後重試', 'error');
            });
        });
    }
    
    // 登出按鈕
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().catch(error => {
                console.error('Logout failed:', error);
                showToast('登出失敗，請稍後重試', 'error');
            });
        });
    }
    
    // 新貼文按鈕
    const newPostBtn = document.getElementById('new-post-btn');
    if (newPostBtn) {
        newPostBtn.addEventListener('click', () => {
            $('#newPostModal').modal('show');
        });
    }
    
    // 發布貼文表單提交
    const postForm = document.getElementById('new-post-form');
    if (postForm) {
        postForm.addEventListener('submit', handleNewPost);
    }
    
    // 分類過濾器點擊
    const categoryFilters = document.querySelectorAll('.category-filter');
    categoryFilters.forEach(filter => {
        filter.addEventListener('click', event => {
            const category = event.target.dataset.category;
            
            // 移除所有分類的active類
            categoryFilters.forEach(f => f.classList.remove('active'));
            
            // 為當前點擊的分類添加active類
            event.target.classList.add('active');
            
            // 根據分類載入貼文
            loadPosts(category);
        });
    });
}

// 載入貼文
function loadPosts(category = 'all') {
    const postsContainer = document.getElementById('posts-list');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    if (!postsContainer || !loadingSpinner) return;
    
    // 顯示載入動畫
    loadingSpinner.classList.remove('d-none');
    postsContainer.innerHTML = '';
    
    // 構建查詢
    let query = db.collection('posts').orderBy('createdAt', 'desc');
    
    if (category !== 'all') {
        query = query.where('category', '==', category);
    }
    
    // 限制查詢數量
    query = query.limit(20);
    
    // 取消之前的監聽器
    if (unsubscribe) {
        unsubscribe();
    }
    
    // 設置新的監聽器
    unsubscribe = query.onSnapshot(snapshot => {
        // 隱藏載入動畫
        loadingSpinner.classList.add('d-none');
        
        if (snapshot.empty) {
            postsContainer.innerHTML = '<div class="alert alert-info">目前還沒有貼文，成為第一個發文的人吧！</div>';
            return;
        }
        
        // 渲染貼文
        snapshot.forEach(doc => {
            const post = doc.data();
            post.id = doc.id;
            
            const postElement = createPostElement(post);
            postsContainer.appendChild(postElement);
        });
    }, error => {
        console.error('Error loading posts:', error);
        loadingSpinner.classList.add('d-none');
        postsContainer.innerHTML = '<div class="alert alert-danger">載入貼文時出錯，請稍後重試</div>';
    });
}

// 創建貼文元素
function createPostElement(post) {
    const postCard = document.createElement('div');
    postCard.className = 'card post-card';
    postCard.dataset.postId = post.id;
    
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // 貼文頭部
    const postHeader = document.createElement('div');
    postHeader.className = 'post-header';
    
    const postAvatar = document.createElement('div');
    postAvatar.className = 'post-avatar';
    
    if (post.authorPhotoURL) {
        const avatar = document.createElement('img');
        avatar.src = post.authorPhotoURL;
        avatar.className = 'img-fluid';
        avatar.alt = post.authorName || '用戶';
        postAvatar.appendChild(avatar);
    }
    
    const postInfo = document.createElement('div');
    
    const postAuthor = document.createElement('p');
    postAuthor.className = 'post-author';
    postAuthor.textContent = post.authorName || '匿名用戶';
    
    const postDate = document.createElement('small');
    postDate.className = 'post-date';
    postDate.textContent = formatDate(post.createdAt?.toDate());
    
    postInfo.appendChild(postAuthor);
    postInfo.appendChild(postDate);
    
    postHeader.appendChild(postAvatar);
    postHeader.appendChild(postInfo);
    
    // 貼文標題
    const postTitle = document.createElement('h5');
    postTitle.className = 'card-title mt-3';
    postTitle.textContent = post.title;
    
    // 貼文分類
    const postCategory = document.createElement('span');
    postCategory.className = 'post-category';
    postCategory.textContent = getCategoryLabel(post.category);
    
    // 貼文內容
    const postContent = document.createElement('div');
    postContent.className = 'post-content mt-3';
    postContent.innerHTML = DOMPurify.sanitize(post.content.replace(/\n/g, '<br>'));
    
    // 貼文圖片
    if (post.imageURL) {
        const postImage = document.createElement('img');
        postImage.src = post.imageURL;
        postImage.className = 'img-fluid';
        postImage.alt = post.title;
        postContent.appendChild(postImage);
    }
    
    // 貼文動作
    const postActions = document.createElement('div');
    postActions.className = 'post-actions';
    
    // 點讚按鈕
    const likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn';
    
    // 檢查當前用戶是否已點讚
    if (post.likes && post.likes.includes(currentUser?.uid)) {
        likeBtn.classList.add('liked');
    }
    
    const likeIcon = document.createElement('i');
    likeIcon.className = 'far fa-thumbs-up';
    
    const likeText = document.createTextNode(` 讚 (${post.likes?.length || 0})`);
    
    likeBtn.appendChild(likeIcon);
    likeBtn.appendChild(likeText);
    
    likeBtn.addEventListener('click', () => toggleLike(post.id));
    
    // 評論按鈕
    const commentBtn = document.createElement('button');
    commentBtn.className = 'action-btn';
    
    const commentIcon = document.createElement('i');
    commentIcon.className = 'far fa-comment';
    
    const commentText = document.createTextNode(` 評論 (${post.commentCount || 0})`);
    
    commentBtn.appendChild(commentIcon);
    commentBtn.appendChild(commentText);
    
    commentBtn.addEventListener('click', () => toggleComments(post.id));
    
    postActions.appendChild(likeBtn);
    postActions.appendChild(commentBtn);
    
    // 添加到卡片
    cardBody.appendChild(postHeader);
    cardBody.appendChild(postCategory);
    cardBody.appendChild(postTitle);
    cardBody.appendChild(postContent);
    cardBody.appendChild(postActions);
    
    postCard.appendChild(cardBody);
    
    // 評論區域
    const commentsSection = document.createElement('div');
    commentsSection.className = 'comments-section d-none';
    commentsSection.id = `comments-${post.id}`;
    
    postCard.appendChild(commentsSection);
    
    return postCard;
}

// 處理新貼文提交
function handleNewPost(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showToast('請先登入', 'warning');
        return;
    }
    
    const title = document.getElementById('post-title').value.trim();
    const category = document.getElementById('post-category').value;
    const content = document.getElementById('post-content').value.trim();
    const imageFile = document.getElementById('post-image').files[0];
    
    if (!title || !content) {
        showToast('標題和內容不能為空', 'warning');
        return;
    }
    
    // 顯示載入提示
    showToast('正在發布...', 'info');
    
    // 創建貼文對象
    const post = {
        title,
        content,
        category,
        authorId: currentUser.uid,
        authorName: currentUser.displayName || '匿名用戶',
        authorPhotoURL: currentUser.photoURL,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        likes: [],
        commentCount: 0
    };
    
    // 如果有圖片，先上傳圖片
    if (imageFile) {
        const storageRef = storage.ref(`posts/${Date.now()}_${imageFile.name}`);
        
        storageRef.put(imageFile).then(snapshot => {
            return snapshot.ref.getDownloadURL();
        }).then(imageURL => {
            post.imageURL = imageURL;
            return savePost(post);
        }).catch(error => {
            console.error('Error uploading image:', error);
            showToast('圖片上傳失敗，請稍後重試', 'error');
        });
    } else {
        savePost(post);
    }
    
    // 保存貼文到Firestore
    function savePost(post) {
        return db.collection('posts').add(post).then(() => {
            // 重置表單
            document.getElementById('new-post-form').reset();
            
            // 關閉模態框
            $('#newPostModal').modal('hide');
            
            showToast('貼文發布成功！', 'success');
        }).catch(error => {
            console.error('Error adding post:', error);
            showToast('發布失敗，請稍後重試', 'error');
        });
    }
}

// 切換點讚狀態
function toggleLike(postId) {
    if (!currentUser) {
        showToast('請先登入', 'warning');
        return;
    }
    
    const postRef = db.collection('posts').doc(postId);
    
    db.runTransaction(transaction => {
        return transaction.get(postRef).then(doc => {
            if (!doc.exists) return;
            
            const post = doc.data();
            const likes = post.likes || [];
            const userId = currentUser.uid;
            
            if (likes.includes(userId)) {
                // 取消點讚
                transaction.update(postRef, {
                    likes: likes.filter(id => id !== userId)
                });
            } else {
                // 添加點讚
                transaction.update(postRef, {
                    likes: [...likes, userId]
                });
            }
        });
    }).catch(error => {
        console.error('Error toggling like:', error);
        showToast('操作失敗，請稍後重試', 'error');
    });
}

// 切換評論區顯示
function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    
    if (commentsSection.classList.contains('d-none')) {
        commentsSection.classList.remove('d-none');
        loadComments(postId);
    } else {
        commentsSection.classList.add('d-none');
    }
}

// 載入評論
function loadComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    
    commentsSection.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary" role="status"><span class="sr-only">載入中...</span></div></div>';
    
    db.collection('posts').doc(postId).collection('comments')
        .orderBy('createdAt', 'desc')
        .get()
        .then(snapshot => {
            let commentsHTML = '';
            
            if (snapshot.empty) {
                commentsHTML = '<p class="text-muted text-center">還沒有評論，成為第一個留言的人吧！</p>';
            } else {
                commentsHTML = '<div class="comments-list">';
                
                snapshot.forEach(doc => {
                    const comment = doc.data();
                    commentsHTML += createCommentElement(comment);
                });
                
                commentsHTML += '</div>';
            }
            
            // 添加評論表單
            commentsHTML += `
                <form class="comment-form mt-3">
                    <div class="form-group">
                        <textarea class="form-control form-control-sm" id="comment-input-${postId}" rows="2" placeholder="發表您的評論..."></textarea>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" onclick="addComment('${postId}', document.getElementById('comment-input-${postId}').value)">評論</button>
                </form>
            `;
            
            commentsSection.innerHTML = commentsHTML;
        })
        .catch(error => {
            console.error('Error loading comments:', error);
            commentsSection.innerHTML = '<div class="alert alert-danger">載入評論失敗，請稍後重試</div>';
        });
}

// 創建評論元素HTML
function createCommentElement(comment) {
    return `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-author">${comment.authorName || '匿名用戶'}</span>
                <small class="comment-date">${formatDate(comment.createdAt?.toDate())}</small>
            </div>
            <p class="comment-text">${DOMPurify.sanitize(comment.content)}</p>
        </div>
    `;
}

// 添加評論
function addComment(postId, content) {
    content = content.trim();
    
    if (!currentUser) {
        showToast('請先登入', 'warning');
        return;
    }
    
    if (!content) {
        showToast('評論內容不能為空', 'warning');
        return;
    }
    
    const comment = {
        content,
        authorId: currentUser.uid,
        authorName: currentUser.displayName || '匿名用戶',
        authorPhotoURL: currentUser.photoURL,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const batch = db.batch();
    
    // 添加評論
    const commentRef = db.collection('posts').doc(postId).collection('comments').doc();
    batch.set(commentRef, comment);
    
    // 更新貼文評論計數
    const postRef = db.collection('posts').doc(postId);
    batch.update(postRef, {
        commentCount: firebase.firestore.FieldValue.increment(1)
    });
    
    batch.commit().then(() => {
        // 重新載入評論
        loadComments(postId);
    }).catch(error => {
        console.error('Error adding comment:', error);
        showToast('評論發布失敗，請稍後重試', 'error');
    });
}

// 顯示提示框
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast show toast-${type}`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="toast-header">
            <strong class="mr-auto">${type === 'error' ? '錯誤' : type === 'success' ? '成功' : type === 'warning' ? '警告' : '資訊'}</strong>
            <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    
    // 添加關閉按鈕事件
    const closeBtn = toast.querySelector('.close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });
    
    toastContainer.appendChild(toast);
    
    // 5秒後自動關閉
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// 格式化日期
function formatDate(date) {
    if (!date) return '未知時間';
    
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // 差秒數
    
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)}分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小時前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
    
    // 格式化為年月日
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
}

// 獲取分類標籤文字
function getCategoryLabel(category) {
    switch (category) {
        case 'general':
            return '一般討論';
        case 'question':
            return '問題求助';
        case 'resource':
            return '資源分享';
        case 'announcement':
            return '官方公告';
        case 'experience':
            return '學習經驗';
        default:
            return '其他';
    }
} 