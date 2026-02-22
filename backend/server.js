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

// Дані в пам'яті (якщо MongoDB не підключена)
let orders = [];
let users = [];
let transactions = [];

// КУРС ВАЛЮТ
let currentRate = { USDT: 46, TON: 80 };

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
        // Якщо MongoDB не працює, використовуємо дані в пам'яті
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
        
        // Оновлюємо також в пам'яті
        currentRate = { USDT: rate.USDT, TON: rate.TON };
        
        res.json({ success: true, rates: { USDT: rate.USDT, TON: rate.TON } });
    } catch (error) {
        // Якщо MongoDB не працює, оновлюємо в пам'яті
        if (USDT) currentRate.USDT = USDT;
        if (TON) currentRate.TON = TON;
        res.json({ success: true, rates: currentRate });
    }
});

// Вхід/реєстрація
app.post('/api/login', async (req, res) => {
    try {
        const { phone } = req.body;
        
        let user = await User.findOne({ phone });
        
        if (!user) {
            user = new User({ phone });
            await user.save();
            console.log('✅ Нового користувача створено:', user.id);
        }
        
        res.json({
            id: user._id,
            phone: user.phone,
            balanceUSDT: user.balanceUSDT,
            balanceUAH: user.balanceUAH
        });
    } catch (error) {
        console.log('Помилка MongoDB, використовуємо пам\'ять');
        
        // Fallback на пам'ять
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
        }
        
        res.json({
            id: user.id,
            phone: user.phone,
            balanceUSDT: user.balanceUSDT,
            balanceUAH: user.balanceUAH
        });
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
        console.log('Помилка MongoDB, використовуємо пам\'ять');
        
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
    }
});

// Історія користувача
app.get('/api/user/:userId/history', async (req, res) => {
    try {
        const userTransactions = await Transaction.find({ userId: req.params.userId }).sort({ date: -1 });
        res.json(userTransactions);
    } catch (error) {
        console.log('Помилка MongoDB, використовуємо пам\'ять');
        
        const userTransactions = transactions.filter(t => t.userId === req.params.userId);
        res.json(userTransactions);
    }
});

// Запит на поповнення балансу
app.post('/api/deposit/request', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
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
        console.log('Помилка MongoDB, використовуємо пам\'ять');
        
        const transaction = {
            id: 'dep_' + Date.now(),
            userId,
            amount,
            currency: 'USDT',
            type: 'deposit',
            status: 'pending',
            date: new Date()
        };
        
        transactions.push(transaction);
        
        res.json({ success: true, message: 'Заявку створено' });
    }
});

// Підтвердження поповнення
app.post('/api/deposit/confirm', async (req, res) => {
    try {
        const { userId, amount, txHash } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.balanceUSDT += amount;
        await user.save();
        
        const transaction = await Transaction.findOne({ 
            userId, 
            amount, 
            type: 'deposit',
            status: 'pending' 
        });
        
        if (transaction) {
            transaction.status = 'confirmed';
            transaction.txHash = txHash;
            await transaction.save();
        }
        
        res.json({ success: true, balance: user.balanceUSDT });
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
        console.log('Помилка MongoDB, використовуємо пам\'ять');
        
        const user = users.find(u => u.id === userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.balanceUSDT < amount) {
            return res.status(400).json({ error: 'Недостатньо коштів' });
        }
        
        user.balanceUSDT -= amount;
        
        const transaction = {
            id: 'withdraw_' + Date.now(),
            userId,
            type: 'withdraw',
            amount,
            currency: 'USDT',
            uahAmount: amount * 46,
            card,
            status: 'pending',
            date: new Date()
        };
        
        transactions.push(transaction);
        
        res.json({ success: true });
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
        console.log('Помилка MongoDB, використовуємо пам\'ять');
        
        const orderId = 'SWAP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        const paymentAddress = 'UQCS3J9NntTQTrhpmYcCk45tO3iH2H-6vq5fqqrqKCGhT8bG';
        const rateValue = direction === 'USDT_TO_UAH' ? 46 : 80;
        const amountUAH = amount * rateValue;
        
        const order = {
            orderId,
            direction,
            amount,
            amountUAH,
            rate: rateValue,
            cardNumber,
            paymentAddress,
            status: 'pending',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        };
        
        orders.push(order);
        
        res.json({ orderId, paymentAddress, amount, amountUAH });
    }
});

// Отримати статус заявки
app.get('/api/order/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status === 'pending' && new Date() > order.expiresAt) {
            order.status = 'expired';
            await order.save();
        }
        
        res.json({ status: order.status, amount: order.amount, amountUAH: order.amountUAH });
    } catch (error) {
        const order = orders.find(o => o.orderId === req.params.orderId);
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status === 'pending' && new Date() > order.expiresAt) {
            order.status = 'expired';
        }
        
        res.json({ status: order.status, amount: order.amount, amountUAH: order.amountUAH });
    }
});

// ============= СТАТИСТИКА =============

// Отримати статистику для соціального доказу
app.get('/api/stats', async (req, res) => {
    try {
        // Реальні дані з бази
        const totalExchanges = await Order.countDocuments({ status: 'confirmed' });
        const totalUsers = await User.countDocuments();
        
        // Останні 5 обмінів
        const recentExchanges = await Order.find({ status: 'confirmed' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('amount amountUAH direction createdAt');
        
        res.json({
            totalExchanges: totalExchanges + 1243, // + початкові дані
            totalUsers,
            online: Math.floor(Math.random() * 50) + 100,
            recentExchanges: recentExchanges.map(ex => ({
                amount: ex.amount,
                currency: ex.direction.split('_')[0],
                uah: ex.amountUAH,
                time: ex.createdAt
            }))
        });
    } catch (error) {
        console.log('Помилка статистики, використовуємо тестові дані');
        
        // Тестові дані якщо база порожня
        res.json({
            totalExchanges: 1243,
            totalUsers: 528,
            online: 128,
            recentExchanges: [
                { amount: 150, currency: 'USDT', uah: 6900, time: new Date() },
                { amount: 45, currency: 'TON', uah: 3600, time: new Date() },
                { amount: 280, currency: 'USDT', uah: 12880, time: new Date() },
                { amount: 100, currency: 'USDT', uah: 4600, time: new Date() },
                { amount: 30, currency: 'TON', uah: 2400, time: new Date() }
            ]
        });
    }
});

// ============= АДМІН МАРШРУТИ =============

// Адмін: отримати всі заявки
app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.json(orders);
    }
});

// Адмін: отримати всіх користувачів
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.json(users);
    }
});

// Адмін: отримати всі транзакції
app.get('/api/admin/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 });
        res.json(transactions);
    } catch (error) {
        res.json(transactions);
    }
});

// Адмін: підтвердити поповнення
app.post('/api/admin/deposit/:transactionId/confirm', async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.transactionId);
        
        if (!transaction || transaction.type !== 'deposit') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        transaction.status = 'confirmed';
        await transaction.save();
        
        const user = await User.findById(transaction.userId);
        if (user) {
            user.balanceUSDT += transaction.amount;
            await user.save();
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Адмін: підтвердити заявку на обмін
app.post('/api/admin/order/:orderId/confirm', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = 'confirmed';
        await order.save();
        
        res.json({ success: true });
    } catch (error) {
        const order = orders.find(o => o.orderId === req.params.orderId);
        if (order) {
            order.status = 'confirmed';
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    }
});

// Адмін: позначити як отримано
app.post('/api/admin/order/:orderId/received', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = 'received';
        await order.save();
        
        res.json({ success: true });
    } catch (error) {
        const order = orders.find(o => o.orderId === req.params.orderId);
        if (order) {
            order.status = 'received';
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    }
});

// ============= СТАТИЧНІ ФАЙЛИ =============
app.use(express.static(path.join(__dirname, '..')));

// ============= ГОЛОВНА =============
app.get('/', async (req, res) => {
    try {
        const ordersCount = await Order.countDocuments();
        const usersCount = await User.countDocuments();
        const transactionsCount = await Transaction.countDocuments();
        const rate = await Rate.findOne();
        
        res.send(`
            <h1>Swap Points Server</h1>
            <p>Сервер працює з MongoDB!</p>
            <ul>
                <li><a href="/frontend/index.html">Головна сторінка</a></li>
                <li><a href="/frontend/exchange.html">Обмінник</a></li>
                <li><a href="/frontend/profile.html">Кабінет</a></li>
                <li><a href="/admin/index.html">Адмінка</a></li>
            </ul>
            <p>Заявок на обмін: ${ordersCount}</p>
            <p>Користувачів: ${usersCount}</p>
            <p>Транзакцій: ${transactionsCount}</p>
            <p>Поточний курс: USDT = ${rate ? rate.USDT : 46} UAH, TON = ${rate ? rate.TON : 80} UAH</p>
        `);
    } catch (error) {
        res.send(`
            <h1>Swap Points Server</h1>
            <p>Сервер працює в режимі пам'яті (без MongoDB)</p>
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
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 Сервер запущено!');
    console.log(`📁 Робоча папка: ${path.join(__dirname, '..')}`);
    console.log(`👉 Сайт: http://localhost:${PORT}/frontend/index.html`);
    console.log(`👉 Обмінник: http://localhost:${PORT}/frontend/exchange.html`);
    console.log(`👉 Кабінет: http://localhost:${PORT}/frontend/profile.html`);
    console.log(`👉 Адмінка: http://localhost:${PORT}/admin/index.html`);
    console.log(`💰 Курс: USDT = ${currentRate.USDT} UAH, TON = ${currentRate.TON} UAH\n`);
});