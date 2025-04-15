'use strict';

let settingsDb = null;
let settingsContainer = null;
let settingsMessageElement = null;
const CONFIG_DOC_PATH = 'system_config/referendum_config';

async function loadReferendumSettings(container, db, user, messageEl) {
    settingsDb = db;
    settingsContainer = container;
    settingsMessageElement = messageEl;

    if (!settingsDb) {
        settingsContainer.innerHTML = '<p class="text-danger">資料庫未初始化。</p>';
        return;
    }

    settingsContainer.innerHTML = '<p>讀取公投系統設定中...</p>';
    showMessage(''); // Clear previous messages

    try {
        const configRef = settingsDb.collection('system_config').doc('referendum_config');
        const docSnap = await configRef.get();

        let currentSettings = {};
        if (docSnap.exists) {
            currentSettings = docSnap.data();
        } else {
            console.log("Referendum config document doesn't exist, will use defaults.");
            // Optionally create it with defaults here if needed immediately
        }

        renderSettingsForm(currentSettings);

    } catch (error) {
        console.error("Error loading referendum settings:", error);
        settingsContainer.innerHTML = '<p class="text-danger">讀取設定時發生錯誤。</p>';
        showMessage(`讀取錯誤: ${error.message}`, 'error');
    }
}

function renderSettingsForm(settings) {
    // Default values for rendering the form
    const systemEnabled = settings.systemEnabled ?? true;
    const defaultPollDurationDays = settings.defaultPollDurationDays ?? 7;
    const completedPollHideDays = settings.completedPollHideDays ?? 3;
    // Challenge settings (add defaults)
    const challengeFailureThreshold = settings.challengeFailureThreshold ?? 5; // Example: 5 "Disagree" votes to fail
    const challengeCooldownDays = settings.challengeCooldownDays ?? 30;
    const challengePollDurationDays = settings.challengePollDurationDays ?? 7;

    settingsContainer.innerHTML = `
        <form id="referendum-settings-form">
            <h4>基本設定</h4>
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="ref-systemEnabled" ${systemEnabled ? 'checked' : ''}>
                <label class="form-check-label" for="ref-systemEnabled">
                    啟用公投系統
                </label>
            </div>

            <div class="form-group mb-3">
                <label for="ref-defaultPollDurationDays">預設投票天數:</label>
                <input type="number" id="ref-defaultPollDurationDays" class="form-control" value="${defaultPollDurationDays}" min="1" style="width: 100px; display: inline-block; margin-left: 10px;"> 天
            </div>

            <div class="form-group mb-3">
                <label for="ref-completedPollHideDays">已完成投票隱藏天數:</label>
                <input type="number" id="ref-completedPollHideDays" class="form-control" value="${completedPollHideDays}" min="1" style="width: 100px; display: inline-block; margin-left: 10px;"> 天後自動隱藏
            </div>

            <hr>

            <h4>勇士挑戰設定</h4>
             <div class="form-group mb-3">
                <label for="ref-challengePollDurationDays">挑戰投票持續天數:</label>
                <input type="number" id="ref-challengePollDurationDays" class="form-control" value="${challengePollDurationDays}" min="1" style="width: 100px; display: inline-block; margin-left: 10px;"> 天
            </div>
             <div class="form-group mb-3">
                <label for="ref-challengeFailureThreshold">挑戰失敗門檻 (反對票數):</label>
                <input type="number" id="ref-challengeFailureThreshold" class="form-control" value="${challengeFailureThreshold}" min="1" style="width: 100px; display: inline-block; margin-left: 10px;"> 票
                 <small class="form-text text-muted d-block">收到這麼多「不認同」票數即表示挑戰失敗。</small>
            </div>
             <div class="form-group mb-3">
                <label for="ref-challengeCooldownDays">挑戰失敗後冷卻天數:</label>
                <input type="number" id="ref-challengeCooldownDays" class="form-control" value="${challengeCooldownDays}" min="1" style="width: 100px; display: inline-block; margin-left: 10px;"> 天
                 <small class="form-text text-muted d-block">挑戰失敗後，需等待這麼多天才能再次發起挑戰。</small>
            </div>
            <!-- Fields like lastChallengeEndTime and lastChallengeFailed are managed by the backend function -->


            <button type="submit" class="btn btn-primary mt-3">儲存設定</button>
        </form>
    `;

    // Add event listener to the form
    const form = document.getElementById('referendum-settings-form');
    if (form) {
        form.addEventListener('submit', handleSaveSettings);
    }
}

async function handleSaveSettings(event) {
    event.preventDefault();
    showMessage('儲存中...', 'info');
    const saveBtn = event.target.querySelector('button[type="submit"]');
    saveBtn.disabled = true;

    const settingsToSave = {
        systemEnabled: document.getElementById('ref-systemEnabled').checked,
        defaultPollDurationDays: parseInt(document.getElementById('ref-defaultPollDurationDays').value, 10) || 7,
        completedPollHideDays: parseInt(document.getElementById('ref-completedPollHideDays').value, 10) || 3,
        challengePollDurationDays: parseInt(document.getElementById('ref-challengePollDurationDays').value, 10) || 7,
        challengeFailureThreshold: parseInt(document.getElementById('ref-challengeFailureThreshold').value, 10) || 5,
        challengeCooldownDays: parseInt(document.getElementById('ref-challengeCooldownDays').value, 10) || 30,
        // We don't save lastChallengeEndTime/Failed from here
    };

    // Basic validation
    if (settingsToSave.defaultPollDurationDays < 1 || settingsToSave.completedPollHideDays < 1 ||
        settingsToSave.challengePollDurationDays < 1 || settingsToSave.challengeFailureThreshold < 1 ||
        settingsToSave.challengeCooldownDays < 1) {
        showMessage('所有天數和票數必須至少為 1。', 'error');
        saveBtn.disabled = false;
        return;
    }


    try {
        const configRef = settingsDb.collection('system_config').doc('referendum_config');
        // Use set with merge: true to create or update the document
        await configRef.set(settingsToSave, { merge: true });
        showMessage('設定已成功儲存！', 'success');
        console.log("Referendum settings saved:", settingsToSave);
    } catch (error) {
        console.error("Error saving referendum settings:", error);
        showMessage(`儲存失敗: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function showMessage(msg, type = 'info') {
    if (!settingsMessageElement) {
        // Fallback if the main admin message element wasn't passed or found
        const formMsg = document.getElementById('referendum-settings-form-message'); // Add this ID to your form if needed
        if (formMsg) {
             formMsg.textContent = msg;
             formMsg.className = `message ${type}-message`;
        } else {
            console.log(`Referendum Settings Message (${type}): ${msg}`); // Log if no element
        }
        return;
    }
    settingsMessageElement.textContent = msg;
    settingsMessageElement.className = `message ${type}-message`;
}
