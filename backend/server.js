const express = require('express');
const path = require('path');
const { User, Order, Transaction, Rate } = require('./database');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логування
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// Дані в пам'яті
let orders = [];
let users = [];
let transactions = [];
let currentRate = { USDT: 46, TON: 80 };

// ============= ПІНГ MONGODB =============
setInterval(async () => {
    try {
        await User.countDocuments();
        console.log('📊 Пінг MongoDB');
    } catch (error) {
        console.log('❌ Помилка пінгу MongoDB');
    }
}, 30000);

// ============= API МАРШРУТИ =============

// Отримати курси
app.get('/api/rates', async (req, res) => {
    try {
        let rate = await Rate.findOne();
        if (!rate) {
            rate = new Rate({ USDT: 46, TON: 80 });
            await rate.save();
        }
        res.json({ USDT: rate.USDT, TON: rate.TON });
    } catch (error) {
        res.json(currentRate);
    }
});

// Змінити курс
app.post('/api/rates', async (req, res) => {
    try {
        const { USDT, TON } = req.body;
        let rate = await Rate.findOne();
        if (!rate) {
            rate = new Rate();
        }
        if (USDT) rate.USDT = USDT;
        if (TON) rate.TON = TON;
        rate.updatedAt = new Date();
        await rate.save();
        currentRate = { USDT: rate.USDT, TON: rate.TON };
        res.json({ success: true, rates: { USDT: rate.USDT, TON: rate.TON } });
    } catch (error) {
        if (USDT) currentRate.USDT = USDT;
        if (TON) currentRate.TON = TON;
        res.json({ success: true, rates: currentRate });
    }
});

// Вхід/реєстрація
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password, isRegister } = req.body;
        console.log('🔐 Спроба входу:', { phone, isRegister });
        
        if (!phone || !password) {
            return res.status(400).json({ error: 'Телефон і пароль обов\'язкові' });
        }
        
        let user = await User.findOne({ phone });
        
        if (isRegister) {
            if (user) {
                return res.status(400).json({ error: 'Користувач з таким номером вже існує' });
            }
            
            user = new User({ 
                phone, 
                password,
                balanceUSDT: 0,
                balanceUAH: 0
            });
            await user.save();
            console.log('✅ Нового користувача створено:', phone);
            
        } else {
            if (!user) {
                return res.status(404).json({ error: 'Користувача не знайдено' });
            }
            
            if (user.password !== password) {
                return res.status(401).json({ error: 'Невірний пароль' });
            }
        }
        
        res.json({
            id: user._id,
            phone: user.phone,
            balanceUSDT: user.balanceUSDT,
            balanceUAH: user.balanceUAH
        });
        
    } catch (error) {
        console.log('🔥 ПОМИЛКА:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримати дані користувача
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            balanceUSDT: user.balanceUSDT,
            balanceUAH: user.balanceUAH,
            totalExchanges: user.totalExchanges,
            totalExchangedUAH: user.totalExchangedUAH
        });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Історія користувача
app.get('/api/user/:userId/history', async (req, res) => {
    try {
        const userTransactions = await Transaction.find({ userId: req.params.userId }).sort({ date: -1 });
        res.json(userTransactions);
    } catch (error) {
        res.json([]);
    }
});

// Запит на поповнення
app.post('/api/deposit/request', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        const transaction = new Transaction({
            id: 'dep_' + Date.now(),
            userId,
            amount,
            currency: 'USDT',
            type: 'deposit',
            status: 'pending',
            date: new Date()
        });
        
        await transaction.save();
        res.json({ success: true, message: 'Заявку створено' });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Створити заявку на виведення
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, card } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.balanceUSDT < amount) {
            return res.status(400).json({ error: 'Недостатньо коштів' });
        }
        
        user.balanceUSDT -= amount;
        await user.save();
        
        const rate = await Rate.findOne();
        const uahAmount = amount * (rate ? rate.USDT : 46);
        
        const transaction = new Transaction({
            id: 'withdraw_' + Date.now(),
            userId,
            type: 'withdraw',
            amount,
            currency: 'USDT',
            uahAmount,
            card,
            status: 'pending',
            date: new Date()
        });
        
        await transaction.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Створити заявку на обмін
app.post('/api/create-order', async (req, res) => {
    try {
        const { direction, amount, cardNumber } = req.body;
        
        const rate = await Rate.findOne();
        const currentRate = rate || { USDT: 46, TON: 80 };
        
        const orderId = 'SWAP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        const paymentAddress = 'UQCS3J9NntTQTrhpmYcCk45tO3iH2H-6vq5fqqrqKCGhT8bG';
        const rateValue = direction === 'USDT_TO_UAH' ? currentRate.USDT : currentRate.TON;
        const amountUAH = amount * rateValue;
        
        const order = new Order({
            orderId,
            direction,
            amount,
            amountUAH,
            rate: rateValue,
            cardNumber,
            paymentAddress,
            status: 'pending',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        });
        
        await order.save();
        res.json({ orderId, paymentAddress, amount, amountUAH });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримати статус заявки
app.get('/api/order/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ status: order.status, amount: order.amount, amountUAH: order.amountUAH });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ============= СТАТИСТИКА =============
app.get('/api/stats', async (req, res) => {
    try {
        const totalExchanges = await Order.countDocuments({ status: 'confirmed' });
        const totalUsers = await User.countDocuments();
        
        const recentTransactions = await Order.find({ status: 'confirmed' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('amount amountUAH direction createdAt');
        
        const baseOnline = Math.floor(totalUsers * 0.15);
        const onlineNow = baseOnline + Math.floor(Math.random() * 20);
        const trend = Math.random() > 0.5 ? '▲' : '▼';
        
        const names = ['Олександр', 'Марія', 'Андрій', 'Катерина', 'Дмитро', 'Тарас', 'Юлія'];
        
        res.json({
            totalExchanges: totalExchanges + 1243,
            totalUsers,
            online: onlineNow,
            onlineTrend: trend,
            recentTransactions: recentTransactions.length > 0 
                ? recentTransactions.map(tx => ({
                    amount: tx.amount,
                    currency: tx.direction.split('_')[0],
                    uah: tx.amountUAH,
                    time: tx.createdAt,
                    user: names[Math.floor(Math.random() * names.length)]
                }))
                : Array(5).fill(0).map(() => ({
                    amount: Math.floor(Math.random() * 200) + 50,
                    currency: Math.random() > 0.5 ? 'USDT' : 'TON',
                    uah: Math.floor(Math.random() * 10000) + 2000,
                    time: new Date(Date.now() - Math.random() * 3600000),
                    user: names[Math.floor(Math.random() * names.length)]
                }))
        });
        
    } catch (error) {
        console.log('Помилка статистики:', error);
        const names = ['Олександр', 'Марія', 'Андрій', 'Катерина', 'Дмитро'];
        const randomTransactions = [];
        for (let i = 0; i < 5; i++) {
            randomTransactions.push({
                amount: Math.floor(Math.random() * 200) + 50,
                currency: Math.random() > 0.5 ? 'USDT' : 'TON',
                uah: Math.floor(Math.random() * 10000) + 2000,
                time: new Date(Date.now() - Math.random() * 3600000),
                user: names[Math.floor(Math.random() * names.length)]
            });
        }
        
        res.json({
            totalExchanges: 1243,
            totalUsers: 528,
            online: Math.floor(Math.random() * 50) + 100,
            onlineTrend: Math.random() > 0.5 ? '▲' : '▼',
            recentTransactions: randomTransactions
        });
    }
});

// ============= АДМІН МАРШРУТИ =============
app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/admin/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 });
        res.json(transactions);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/admin/order/:orderId/confirm', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (order) {
            order.status = 'confirmed';
            await order.save();
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

app.post('/api/admin/order/:orderId/received', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (order) {
            order.status = 'received';
            await order.save();
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
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
            <li><a href="/frontend/index.html">Головна</a></li>
            <li><a href="/frontend/exchange.html">Обмінник</a></li>
            <li><a href="/frontend/profile.html">Кабінет</a></li>
            <li><a href="/admin/index.html">Адмінка</a></li>
        </ul>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Сервер запущено на порту ${PORT}`);
    console.log(`👉 http://localhost:${PORT}/frontend/index.html\n`);
});