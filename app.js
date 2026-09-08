const firebaseConfig = {
    apiKey: "AIzaSyAEtG331Ugw0M5cUiV-84x1iQLbyBgGMh4",
    authDomain: "flux-chat-b9ccf.firebaseapp.com",
    databaseURL: "https://flux-chat-b9ccf-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "flux-chat-b9ccf",
    storageBucket: "flux-chat-b9ccf.firebasestorage.app",
    messagingSenderId: "1042933524010",
    appId: "1:1042933524010:web:5e6545c4cae71bd30c4553",
    measurementId: "G-HPY5FQH4HP"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentUser = null;
let currentChatId = 'general';
let currentListeners = [];

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('authError');
    
    errorEl.textContent = '';
    
    if (!username || !password) {
        errorEl.textContent = 'Заполните все поля';
        return;
    }
    
    try {
        const snap = await database.ref(`users/${username}`).get();
        
        if (!snap.exists()) {
            errorEl.textContent = 'Пользователь не найден';
            return;
        }
        
        const userData = snap.val();
        
        if (userData.password !== password) {
            errorEl.textContent = 'Неверный пароль';
            return;
        }

        if (userData.banned) {
            errorEl.textContent = '❌ Вы заблокированы: ' + (userData.banReason || 'Нарушение правил');
            return;
        }

        currentUser = { username, ...userData };

        localStorage.setItem('currentUser', username);

        await loadMainScreen();
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        errorEl.textContent = 'Ошибка подключения к серверу';
    }
}

async function register() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('authError');
    
    errorEl.textContent = '';
    
    if (!username || !password) {
        errorEl.textContent = 'Заполните все поля';
        return;
    }
    
    if (username.length < 3) {
        errorEl.textContent = 'Имя минимум 3 символа';
        return;
    }
    
    if (password.length < 6) {
        errorEl.textContent = 'Пароль минимум 6 символов';
        return;
    }
    
    try {

        const snap = await database.ref(`users/${username}`).get();
        
        if (snap.exists()) {
            errorEl.textContent = 'Имя уже занято';
            return;
        }

        const userData = {
            username: username,
            password: password,
            name: username,
            avatar: '',
            roles: [],
            stars: 0,
            online: true,
            banned: false,
            createdAt: Date.now()
        };
        
        await database.ref(`users/${username}`).set(userData);

        await database.ref(`chats/general/members/${username}`).set(true);

        await database.ref(`users/${username}/stars`).set(100);

        currentUser = userData;
        localStorage.setItem('currentUser', username);
        
        alert('✅ Регистрация успешна! Вы получили 100 ⭐ бонусом!');

        await loadMainScreen();
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        errorEl.textContent = 'Ошибка: ' + error.message;
    }
}


async function loadMainScreen() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'flex';

    document.getElementById('userName').textContent = currentUser.username;

    if (currentUser.avatar) {
        document.getElementById('userAvatar').src = currentUser.avatar;
    }

    setupRealtimeListeners(currentUser.username);

    loadChats();

    openChat('general', 'Общий чат');

    checkRoles(currentUser.roles || []);
}

function setupRealtimeListeners(username) {
    currentListeners.forEach(ref => ref.off());
    currentListeners = [];

    const userRef = database.ref(`users/${username}`);
    userRef.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;
        
        currentUser = { ...currentUser, ...data };
        if (data.banned) {
            showBanScreen(data.banReason);
            return;
        }

        if (data.avatar) {
            document.getElementById('userAvatar').src = data.avatar;
        }

        checkRoles(data.roles || []);

        updateBalance(data.stars || 0);
    });
    currentListeners.push(userRef);

    const rolesRef = database.ref(`users/${username}/roles`);
    rolesRef.on('value', (snap) => {
        const roles = snap.val() || [];
        currentUser.roles = roles;
        
        if (roles.includes('admin') || roles.includes('moderator')) {
            document.getElementById('adminBtn').style.display = 'block';
        } else {
            document.getElementById('adminBtn').style.display = 'none';
        }
    });
    currentListeners.push(rolesRef);

    const starsRef = database.ref(`users/${username}/stars`);
    starsRef.on('value', (snap) => {
        const stars = snap.val() || 0;
        updateBalance(stars);
    });
    currentListeners.push(starsRef);

    const premiumRef = database.ref(`premium/${username}`);
    premiumRef.on('value', (snap) => {
        const premiumData = snap.val();
        const isPremium = premiumData && new Date(premiumData.expireDate) > new Date();
        
        if (isPremium) {
            document.getElementById('premiumBtn').style.display = 'block';
        } else {
            document.getElementById('premiumBtn').style.display = 'none';
        }
    });
    currentListeners.push(premiumRef);

    const notifRef = database.ref(`notifications/${username}`);
    notifRef.on('child_added', (snap) => {
        const notification = snap.val();
        showNotification(notification);
    });
    currentListeners.push(notifRef);
}

function loadChats() {
    const chatsRef = database.ref(`chats`);
    
    chatsRef.on('value', (snap) => {
        const chats = snap.val() || {};
        const chatsList = document.getElementById('chatsList');
        chatsList.innerHTML = '';

        if (chats.general) {
            const chatItem = createChatItem('general', 'Общий чат', '🌐');
            chatsList.appendChild(chatItem);
        }

        Object.entries(chats).forEach(([chatId, chat]) => {
            if (chatId === 'general') return;

            if (chat.members && chat.members[currentUser.username]) {
                const chatItem = createChatItem(chatId, chat.name || chatId, chat.type === 'private' ? '👤' : '👥');
                chatsList.appendChild(chatItem);
            }
        });
    });
}

function createChatItem(chatId, name, icon) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.dataset.chatId = chatId;
    div.innerHTML = `
        <span class="chat-icon">${icon}</span>
        <span class="chat-name">${name}</span>
    `;
    
    div.onclick = () => openChat(chatId, name);
    
    return div;
}

function openChat(chatId, chatName) {
    currentChatId = chatId;

    document.getElementById('currentChatName').textContent = chatName;

    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    const oldChatRef = database.ref(`messages/${currentChatId}`);
    oldChatRef.off();

    const messagesRef = database.ref(`messages/${chatId}`);

    messagesRef.once('value', (snap) => {
        const messages = snap.val() || {};
        Object.entries(messages).forEach(([msgId, message]) => {
            addMessageToUI(message, msgId);
        });
        scrollToBottom();
    });

    messagesRef.on('child_added', (snap) => {
        const message = snap.val();
        // Проверяем, не добавлено ли уже
        if (!document.querySelector(`[data-msg-id="${snap.key}"]`)) {
            addMessageToUI(message, snap.key);
            scrollToBottom();
        }
    });

    messagesRef.on('child_changed', (snap) => {
        const message = snap.val();
        updateMessageUI(message, snap.key);
    });

    messagesRef.on('child_removed', (snap) => {
        const el = document.querySelector(`[data-msg-id="${snap.key}"]`);
        if (el) el.remove();
    });
}

function addMessageToUI(message, msgId) {
    const container = document.getElementById('messagesContainer');
    
    const isOwn = message.sender === currentUser.username;
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.dataset.msgId = msgId;
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    div.innerHTML = `
        <div class="message-info">
            <span class="sender-name">${isOwn ? 'Вы' : message.sender}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(message.text || '')}</div>
    `;
    
    container.appendChild(div);
}

function updateMessageUI(message, msgId) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
        const textEl = el.querySelector('.message-text');
        if (textEl) {
            textEl.textContent = message.text || '';
        }
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !currentChatId) return;

    const messageRef = database.ref(`messages/${currentChatId}`).push();
    
    messageRef.set({
        text: text,
        sender: currentUser.username,
        senderAvatar: currentUser.avatar || '',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        edited: false
    });

    input.value = '';
}

function showAdminPanel() {
    document.getElementById('adminPanel').style.display = 'flex';
    showAdminUsers();
}

function closeAdminPanel() {
    document.getElementById('adminPanel').style.display = 'none';
}

async function showAdminUsers() {
    const content = document.getElementById('adminContent');

    const snap = await database.ref('users').get();
    const users = snap.val() || {};
    
    let html = '<div class="users-list">';
    
    Object.entries(users).forEach(([username, userData]) => {
        const isAdmin = (userData.roles || []).includes('admin');
        const isModerator = (userData.roles || []).includes('moderator');
        const isBanned = userData.banned;
        
        html += `
            <div class="user-item">
                <div class="user-info">
                    <strong>${username}</strong>
                    <span class="stars">⭐ ${userData.stars || 0}</span>
                    ${isAdmin ? '<span class="badge admin">ADMIN</span>' : ''}
                    ${isModerator ? '<span class="badge mod">MOD</span>' : ''}
                    ${isBanned ? '<span class="badge banned">BANNED</span>' : ''}
                </div>
                <div class="user-actions">
                    ${!isAdmin ? `<button onclick="giveRole('${username}', 'admin')">👑 Дать админа</button>` : `<button onclick="removeRole('${username}', 'admin')">❌ Убрать админа</button>`}
                    ${!isModerator ? `<button onclick="giveRole('${username}', 'moderator')">⭐ Дать модера</button>` : `<button onclick="removeRole('${username}', 'moderator')">❌ Убрать модера</button>`}
                    ${!isBanned ? `<button onclick="banUser('${username}', 'Нарушение')">🚫 Бан</button>` : `<button onclick="unbanUser('${username}')">✅ Разбан</button>`}
                    <button onclick="giveStars('${username}', 100)">+100 ⭐</button>
                    <button onclick="removeStars('${username}', 100)">-100 ⭐</button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    content.innerHTML = html;
}

async function giveRole(username, role) {
    const userRef = database.ref(`users/${username}/roles`);
    const snap = await userRef.get();
    const roles = snap.val() || [];
    
    if (!roles.includes(role)) {
        roles.push(role);
        await userRef.set(roles);

        await database.ref(`notifications/${username}`).push({
            title: 'Новая роль!',
            message: `Вам выдана роль: ${role}`,
            read: false,
            timestamp: Date.now()
        });
    }
    
    showAdminUsers();
}

async function removeRole(username, role) {
    const userRef = database.ref(`users/${username}/roles`);
    const snap = await userRef.get();
    const roles = snap.val() || [];
    
    const filtered = roles.filter(r => r !== role);
    await userRef.set(filtered);
    
    showAdminUsers();
}

async function banUser(username, reason) {
    await database.ref(`users/${username}`).update({
        banned: true,
        banReason: reason,
        bannedAt: Date.now()
    });

    await database.ref(`notifications/${username}`).push({
        title: '❌ Бан',
        message: `Вы заблокированы: ${reason}`,
        read: false,
        timestamp: Date.now()
    });
    
    showAdminUsers();
}

async function unbanUser(username) {
    await database.ref(`users/${username}`).update({
        banned: false,
        banReason: null,
        bannedAt: null
    });
    
    showAdminUsers();
}

async function giveStars(username, amount) {
    const userRef = database.ref(`users/${username}/stars`);
    const snap = await userRef.get();
    const stars = snap.val() || 0;
    
    await userRef.set(stars + amount);
    
    showAdminUsers();
}

async function removeStars(username, amount) {
    const userRef = database.ref(`users/${username}/stars`);
    const snap = await userRef.get();
    const stars = snap.val() || 0;
    
    if (stars >= amount) {
        await userRef.set(stars - amount);
    }
    
    showAdminUsers();
}

function updateBalance(stars) {
    const balanceEl = document.getElementById('starsBalance');
    if (balanceEl) {
        balanceEl.textContent = `⭐ ${stars}`;
    }
}

function checkRoles(roles) {
    if (roles.includes('admin') || roles.includes('moderator')) {
        document.getElementById('adminBtn').style.display = 'block';
    } else {
        document.getElementById('adminBtn').style.display = 'none';
    }
}

function showBanScreen(reason) {
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('authError').textContent = `❌ Вы заблокированы: ${reason}`;
    
    localStorage.removeItem('currentUser');
}

function showNotification(notification) {
    if (Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.message
        });
    }

    if (notification.title === '🚫 Бан') {
        showBanScreen(notification.message);
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function logout() {

    currentListeners.forEach(ref => ref.off());
    currentListeners = [];

    await database.ref(`users/${currentUser.username}/online`).set(false);

    localStorage.removeItem('currentUser');
 
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';

    currentUser = null;
    currentChatId = null;
}

async function autoLogin() {
    const savedUser = localStorage.getItem('currentUser');
    
    if (!savedUser) return;
    
    try {
        const snap = await database.ref(`users/${savedUser}`).get();
        
        if (snap.exists()) {
            const userData = snap.val();
            
            if (userData.banned) {
                showBanScreen(userData.banReason);
                return;
            }
            
            currentUser = { username: savedUser, ...userData };

            await database.ref(`users/${savedUser}/online`).set(true);

            await loadMainScreen();
        }
    } catch (error) {
        console.error('Ошибка автовхода:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window) {
        Notification.requestPermission();
    }

    autoLogin();
});
