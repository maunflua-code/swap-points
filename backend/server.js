const express = require('express');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логування
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// Дані
let orders = [];
let users = [];
let transactions = [];

// КУРС ВАЛЮТ (USDT=46, TON=80)
let currentRate = { USDT: 46, TON: 80 };

// ============= API МАРШРУТИ =============

// Отримати курси
app.get('/api/rates', (req, res) => {
    console.log('📊 Відправляємо курс:', currentRate);
    res.json(currentRate);
});

// Змінити курс
app.post('/api/rates', (req, res) => {
    console.log('💰 Оновлення курсу:', req.body);
    const { USDT, TON } = req.body;
    if (USDT) currentRate.USDT = USDT;
    if (TON) currentRate.TON = TON;
    res.json({ success: true, rates: currentRate });
});

// Вхід/реєстрація
app.post('/api/login', (req, res) => {
    console.log('🔑 Вхід:', req.body);
    const { phone } = req.body;
    
    let user = users.find(u => u.phone === phone);
    
    if (!user) {
        user = {
            id: 'user_' + Date.now(),
            phone,
            balanceUSDT: 0,
            balanceUAH: 0,
            totalExchanges: 0,
            totalExchangedUAH: 0,
            createdAt: new Date()
        };
        users.push(user);
        console.log('✅ Нового користувача створено:', user.id);
    }
    
    res.json({
        id: user.id,
        phone: user.phone,
        balanceUSDT: user.balanceUSDT,
        balanceUAH: user.balanceUAH
    });
});

// Отримати дані користувача
app.get('/api/user/:userId', (req, res) => {
    const user = users.find(u => u.id === req.params.userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        balanceUSDT: user.balanceUSDT,
        balanceUAH: user.balanceUAH,
        totalExchanges: user.totalExchanges,
        totalExchangedUAH: user.totalExchangedUAH
    });
});

// Історія користувача
app.get('/api/user/:userId/history', (req, res) => {
    const userTransactions = transactions.filter(t => t.userId === req.params.userId);
    res.json(userTransactions);
});

// Запит на поповнення балансу
app.post('/api/deposit/request', (req, res) => {
    console.log('💰 Запит на поповнення:', req.body);
    
    const { userId, amount } = req.body;
    
    if (!userId || !amount) {
        return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }
    
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Створюємо транзакцію на поповнення
    const transaction = {
        id: 'dep_' + Date.now(),
        userId,
        amount,
        currency: 'USDT',
        status: 'pending',
        type: 'deposit',
        date: new Date(),
        txHash: null
    };
    
    transactions.push(transaction);
    console.log('✅ Транзакцію створено:', transaction.id);
    
    res.json({ 
        success: true, 
        message: 'Заявку створено',
        transaction 
    });
});

// Підтвердження поповнення (після перевірки)
app.post('/api/deposit/confirm', (req, res) => {
    console.log('✅ Підтвердження поповнення:', req.body);
    
    const { userId, amount, txHash } = req.body;
    
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.balanceUSDT += amount;
    
    // Знаходимо і оновлюємо транзакцію
    const transaction = transactions.find(t => t.userId === userId && t.amount === amount && t.status === 'pending');
    if (transaction) {
        transaction.status = 'confirmed';
        transaction.txHash = txHash;
    }
    
    res.json({ success: true, balance: user.balanceUSDT });
});

// Створити заявку на виведення
app.post('/api/withdraw', (req, res) => {
    console.log('💳 Запит на виведення:', req.body);
    
    const { userId, amount, card } = req.body;
    
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.balanceUSDT < amount) {
        return res.status(400).json({ error: 'Недостатньо коштів' });
    }
    
    user.balanceUSDT -= amount;
    const uahAmount = amount * currentRate.USDT;
    
    const transaction = {
        id: 'tx_' + Date.now(),
        userId,
        type: 'withdraw',
        amount,
        currency: 'USDT',
        uahAmount,
        card,
        status: 'pending',
        date: new Date()
    };
    
    transactions.push(transaction);
    
    console.log('✅ Заявку на виведення створено:', transaction.id);
    
    res.json({ success: true, transaction });
});

// Створити заявку на обмін
app.post('/api/create-order', (req, res) => {
    console.log('📝 Нова заявка на обмін:', req.body);
    
    const { direction, amount, cardNumber } = req.body;
    
    if (!direction || !amount || !cardNumber) {
        return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }
    
    const orderId = 'SWAP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    
    const paymentAddress = direction === 'USDT_TO_UAH' 
        ? 'UQCS3J9NntTQTrhpmYcCk45tO3iH2H-6vq5fqqrqKCGhT8bG' 
        : 'UQCS3J9NntTQTrhpmYcCk45tO3iH2H-6vq5fqqrqKCGhT8bG';
    
    const rate = direction === 'USDT_TO_UAH' ? currentRate.USDT : currentRate.TON;
    const amountUAH = amount * rate;
    
    const order = {
        orderId,
        direction,
        amount,
        amountUAH,
        rate,
        cardNumber,
        paymentAddress,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    };
    
    orders.push(order);
    
    console.log('✅ Заявку на обмін створено:', orderId);
    
    res.json({
        orderId,
        paymentAddress,
        amount,
        amountUAH
    });
});

// Отримати статус заявки
app.get('/api/order/:orderId', (req, res) => {
    const order = orders.find(o => o.orderId === req.params.orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.status === 'pending' && new Date() > order.expiresAt) {
        order.status = 'expired';
    }
    
    res.json({
        status: order.status,
        amount: order.amount,
        amountUAH: order.amountUAH
    });
});

// Адмін: отримати всі заявки
app.get('/api/admin/orders', (req, res) => {
    res.json(orders);
});

// Адмін: підтвердити заявку на обмін
app.post('/api/admin/order/:orderId/confirm', (req, res) => {
    const order = orders.find(o => o.orderId === req.params.orderId);
    
    if (order) {
        order.status = 'confirmed';
        console.log('✅ Заявку на обмін підтверджено:', req.params.orderId);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Order not found' });
    }
});

// Адмін: позначити як отримано
app.post('/api/admin/order/:orderId/received', (req, res) => {
    const order = orders.find(o => o.orderId === req.params.orderId);
    
    if (order) {
        order.status = 'received';
        console.log('🔵 Заявку на обмін отримано:', req.params.orderId);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Order not found' });
    }
});

// Адмін: отримати всі транзакції
app.get('/api/admin/transactions', (req, res) => {
    res.json(transactions);
});

// Адмін: підтвердити поповнення
app.post('/api/admin/deposit/:transactionId/confirm', (req, res) => {
    const transaction = transactions.find(t => t.id === req.params.transactionId);
    
    if (transaction && transaction.type === 'deposit') {
        transaction.status = 'confirmed';
        
        // Знаходимо користувача і нараховуємо баланс
        const user = users.find(u => u.id === transaction.userId);
        if (user) {
            user.balanceUSDT += transaction.amount;
        }
        
        console.log('✅ Поповнення підтверджено:', req.params.transactionId);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Transaction not found' });
    }
});

// ============= СТАТИЧНІ ФАЙЛИ =============
app.use(express.static(path.join(__dirname, '..')));

// ============= ГОЛОВНА =============
app.get('/', (req, res) => {
    res.send(`
        <h1>Swap Points Server</h1>
        <p>Сервер працює!</p>
        <ul>
            <li><a href="/frontend/index.html">Головна сторінка</a></li>
            <li><a href="/frontend/exchange.html">Обмінник</a></li>
            <li><a href="/frontend/profile.html">Кабінет</a></li>
            <li><a href="/admin/index.html">Адмінка</a></li>
        </ul>
        <p>Заявок на обмін: ${orders.length}</p>
        <p>Користувачів: ${users.length}</p>
        <p>Транзакцій: ${transactions.length}</p>
        <p>Поточний курс: USDT = ${currentRate.USDT} UAH, TON = ${currentRate.TON} UAH</p>
    `);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log('\n🚀 Сервер запущено!');
    console.log(`📁 Робоча папка: ${path.join(__dirname, '..')}`);
    console.log(`👉 Сайт: http://localhost:${PORT}/frontend/index.html`);
    console.log(`👉 Обмінник: http://localhost:${PORT}/frontend/exchange.html`);
    console.log(`👉 Кабінет: http://localhost:${PORT}/frontend/profile.html`);
    console.log(`👉 Адмінка: http://localhost:${PORT}/admin/index.html`);
    console.log(`💰 Курс: USDT = ${currentRate.USDT} UAH, TON = ${currentRate.TON} UAH\n`);
});