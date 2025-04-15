/**
 * 渲染銷售表單頂部的欄位
 */
function renderSalesFormHeader() {
    const headerContainer = document.querySelector('.form-header') || document.createElement('div');
    headerContainer.className = 'form-header';
    headerContainer.innerHTML = '';
    
    // 登錄人員欄位 - 移到登記日期上方
    const staffDiv = document.createElement('div');
    staffDiv.className = 'form-group';
    staffDiv.innerHTML = `
        <label for="staffName">登錄人員:</label>
        <input type="text" id="staffName" class="form-control" value="${currentUser?.name || ''}" readonly>
    `;
    headerContainer.appendChild(staffDiv);
    
    // 登記日期欄位 - 移除備註
    const dateDiv = document.createElement('div');
    dateDiv.className = 'form-group';
    dateDiv.innerHTML = `
        <label for="reportDate">登記日期: *</label>
        <input type="date" id="reportDate" class="form-control" required>
    `;
    headerContainer.appendChild(dateDiv);
    
    // 商店欄位
    const storeDiv = document.createElement('div');
    storeDiv.className = 'form-group';
    storeDiv.innerHTML = `
        <label for="storeSelect">分店:</label>
        <select id="storeSelect" class="form-control">
            ${createStoreOptions()}
        </select>
    `;
    headerContainer.appendChild(storeDiv);
    
    // 加到表單中
    const form = document.getElementById('sales-form');
    if (form && !form.querySelector('.form-header')) {
        form.insertBefore(headerContainer, form.firstChild);
    }
    
    // 設置預設日期為昨天（不顯示備註，僅設置預設值）
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById('reportDate').valueAsDate = yesterday;
} 