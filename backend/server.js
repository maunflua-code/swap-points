const express = require('express');
const path = require('path');
const { User, Order, Transaction, Rate } = require('./database');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логування всіх запитів
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    if (req.method === 'POST') {
        console.log('📦 Body:', req.body);
    }
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
        console.log('⚠️ Помилка отримання курсів, використовуємо пам\'ять');
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
        console.log('⚠️ Помилка оновлення курсів, оновлюємо в пам\'яті');
        if (USDT) currentRate.USDT = USDT;
        if (TON) currentRate.TON = TON;
        res.json({ success: true, rates: currentRate });
    }
});

// Вхід/реєстрація з паролем
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password, isRegister } = req.body;
        console.log('🔐 Спроба входу:', { phone, isRegister, password: password ? '***' : 'відсутній' });
        
        // Перевірка обов'язкових полів
        if (!phone) {
            console.log('❌ Телефон відсутній');
            return res.status(400).json({ error: 'Телефон обов\'язковий' });
        }
        
        if (!password) {
            console.log('❌ Пароль відсутній');
            return res.status(400).json({ error: 'Пароль обов\'язковий' });
        }
        
        if (password.length < 4) {
            console.log('❌ Пароль занадто короткий');
            return res.status(400).json({ error: 'Пароль має бути не менше 4 символів' });
        }
        
        try {
            // Шукаємо користувача в MongoDB
            let user = await User.findOne({ phone });
            console.log('🔍 Результат пошуку:', user ? 'знайдено' : 'не знайдено');
            
            if (isRegister) {
                // РЕЄСТРАЦІЯ
                if (user) {
                    console.log('❌ Користувач вже існує:', phone);
                    return res.status(400).json({ error: 'Користувач з таким номером вже існує' });
                }
                
                // Створюємо нового користувача з паролем
                user = new User({ 
                    phone, 
                    password,
                    balanceUSDT: 0,
                    balanceUAH: 0,
                    totalExchanges: 0,
                    totalExchangedUAH: 0
                });
                await user.save();
                console.log('✅ Нового користувача створено:', phone);
                
            } else {
                // ВХІД
                if (!user) {
                    console.log('❌ Користувача не знайдено:', phone);
                    return res.status(404).json({ error: 'Користувача не знайдено' });
                }
                
                // Перевіряємо пароль
                console.log('🔑 Перевірка пароля...');
                if (user.password !== password) {
                    console.log('❌ Невірний пароль для:', phone);
                    return res.status(401).json({ error: 'Невірний пароль' });
                }
                console.log('✅ Пароль правильний');
            }
            
            // Успішний вхід
            console.log('✅ Успішний вхід для:', phone);
            res.json({
                id: user._id.toString(),
                phone: user.phone,
                balanceUSDT: user.balanceUSDT,
                balanceUAH: user.balanceUAH
            });
            
        } catch (dbError) {
            console.log('🔥 Помилка бази даних:', dbError);
            
            // Якщо MongoDB не працює, використовуємо пам'ять
            console.log('⚠️ Використовуємо резервне зберігання в пам\'яті');
            
            let user = users.find(u => u.phone === phone);
            
            if (isRegister) {
                if (user) {
                    return res.status(400).json({ error: 'Користувач вже існує' });
                }
                
                user = {
                    id: 'user_' + Date.now(),
                    phone,
                    password,
                    balanceUSDT: 0,
                    balanceUAH: 0,
                    totalExchanges: 0,
                    totalExchangedUAH: 0,
                    createdAt: new Date()
                };
                users.push(user);
                console.log('✅ Нового користувача створено в пам\'яті:', phone);
                
            } else {
                if (!user) {
                    return res.status(404).json({ error: 'Користувача не знайдено' });
                }
                
                if (user.password !== password) {
                    return res.status(401).json({ error: 'Невірний пароль' });
                }
            }
            
            res.json({
                id: user.id,
                phone: user.phone,
                balanceUSDT: user.balanceUSDT,
                balanceUAH: user.balanceUAH
            });
        }
        
    } catch (error) {
        console.log('🔥 КРИТИЧНА ПОМИЛКА:', error);
        res.status(500).json({ error: 'Помилка сервера: ' + error.message });
    }
});

// Отримати дані користувача
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            // Шукаємо в пам'яті
            const memUser = users.find(u => u.id === req.params.userId);
            if (memUser) {
                return res.json({
                    balanceUSDT: memUser.balanceUSDT,
                    balanceUAH: memUser.balanceUAH,
                    totalExchanges: memUser.totalExchanges,
                    totalExchangedUAH: memUser.totalExchangedUAH
                });
            }
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            balanceUSDT: user.balanceUSDT,
            balanceUAH: user.balanceUAH,
            totalExchanges: user.totalExchanges,
            totalExchangedUAH: user.totalExchangedUAH
        });
    } catch (error) {
        console.log('Помилка отримання даних користувача:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Історія користувача
app.get('/api/user/:userId/history', async (req, res) => {
    try {
        const userTransactions = await Transaction.find({ userId: req.params.userId }).sort({ date: -1 });
        res.json(userTransactions);
    } catch (error) {
        const userTransactions = transactions.filter(t => t.userId === req.params.userId);
        res.json(userTransactions);
    }
});

// Запит на поповнення балансу
app.post('/api/deposit/request', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        let user;
        try {
            user = await User.findById(userId);
        } catch (e) {
            user = users.find(u => u.id === userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        try {
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
        } catch (e) {
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
        }
        
        res.json({ success: true, message: 'Заявку на поповнення створено' });
    } catch (error) {
        console.log('Помилка створення заявки на поповнення:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Підтвердження поповнення
app.post('/api/deposit/confirm', async (req, res) => {
    try {
        const { userId, amount, txHash } = req.body;
        
        let user;
        try {
            user = await User.findById(userId);
            if (user) {
                user.balanceUSDT += amount;
                await user.save();
            }
        } catch (e) {
            user = users.find(u => u.id === userId);
            if (user) {
                user.balanceUSDT += amount;
            }
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ success: true, balance: user.balanceUSDT });
    } catch (error) {
        console.log('Помилка підтвердження поповнення:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Створити заявку на виведення
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, card } = req.body;
        
        let user;
        try {
            user = await User.findById(userId);
        } catch (e) {
            user = users.find(u => u.id === userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.balanceUSDT < amount) {
            return res.status(400).json({ error: 'Недостатньо коштів' });
        }
        
        user.balanceUSDT -= amount;
        
        if (user.save) await user.save();
        
        const rate = await Rate.findOne() || { USDT: 46 };
        const uahAmount = amount * rate.USDT;
        
        try {
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
        } catch (e) {
            const transaction = {
                id: 'withdraw_' + Date.now(),
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
        }
        
        res.json({ success: true });
    } catch (error) {
        console.log('Помилка створення заявки на виведення:', error);
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
        
        try {
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
        } catch (e) {
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
        }
        
        res.json({ orderId, paymentAddress, amount, amountUAH });
    } catch (error) {
        console.log('Помилка створення заявки на обмін:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримати статус заявки
app.get('/api/order/:orderId', async (req, res) => {
    try {
        let order;
        try {
            order = await Order.findOne({ orderId: req.params.orderId });
        } catch (e) {
            order = orders.find(o => o.orderId === req.params.orderId);
        }
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status === 'pending' && new Date() > order.expiresAt) {
            order.status = 'expired';
            if (order.save) await order.save();
        }
        
        res.json({ status: order.status, amount: order.amount, amountUAH: order.amountUAH });
    } catch (error) {
        console.log('Помилка отримання статусу заявки:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ============= СТАТИСТИКА =============

// Отримати статистику для соціального доказу
app.get('/api/stats', async (req, res) => {
    try {
        let totalExchanges = 1243;
        let totalUsers = 528;
        
        try {
            totalExchanges = await Order.countDocuments({ status: 'confirmed' }) + 1243;
            totalUsers = await User.countDocuments();
        } catch (e) {
            totalExchanges = orders.filter(o => o.status === 'confirmed').length + 1243;
            totalUsers = users.length;
        }
        
        res.json({
            totalExchanges,
            totalUsers,
            online: Math.floor(Math.random() * 50) + 100,
            recentExchanges: [
                { amount: 150, currency: 'USDT', uah: 6900, time: new Date() },
                { amount: 45, currency: 'TON', uah: 3600, time: new Date() },
                { amount: 280, currency: 'USDT', uah: 12880, time: new Date() }
            ]
        });
    } catch (error) {
        console.log('Помилка статистики:', error);
        res.json({
            totalExchanges: 1243,
            totalUsers: 528,
            online: 128,
            recentExchanges: [
                { amount: 150, currency: 'USDT', uah: 6900, time: new Date() },
                { amount: 45, currency: 'TON', uah: 3600, time: new Date() },
                { amount: 280, currency: 'USDT', uah: 12880, time: new Date() }
            ]
        });
    }
});

// ============= АДМІН МАРШРУТИ =============

// Адмін: отримати всі заявки
app.get('/api/admin/orders', async (req, res) => {
    try {
        const dbOrders = await Order.find().sort({ createdAt: -1 });
        res.json(dbOrders);
    } catch (error) {
        res.json(orders);
    }
});

// Адмін: отримати всіх користувачів
app.get('/api/admin/users', async (req, res) => {
    try {
        const dbUsers = await User.find().sort({ createdAt: -1 });
        res.json(dbUsers);
    } catch (error) {
        res.json(users);
    }
});

// Адмін: отримати всі транзакції
app.get('/api/admin/transactions', async (req, res) => {
    try {
        const dbTransactions = await Transaction.find().sort({ date: -1 });
        res.json(dbTransactions);
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
            const memOrder = orders.find(o => o.orderId === req.params.orderId);
            if (memOrder) {
                memOrder.status = 'confirmed';
                return res.json({ success: true });
            }
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = 'confirmed';
        await order.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Адмін: позначити як отримано
app.post('/api/admin/order/:orderId/received', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        
        if (!order) {
            const memOrder = orders.find(o => o.orderId === req.params.orderId);
            if (memOrder) {
                memOrder.status = 'received';
                return res.json({ success: true });
            }
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = 'received';
        await order.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ============= СТАТИЧНІ ФАЙЛИ =============
app.use(express.static(path.join(__dirname, '..')));

// ============= ГОЛОВНА =============
app.get('/', async (req, res) => {
    try {
        let ordersCount = 0;
        let usersCount = 0;
        let transactionsCount = 0;
        let rate = null;
        
        try {
            ordersCount = await Order.countDocuments();
            usersCount = await User.countDocuments();
            transactionsCount = await Transaction.countDocuments();
            rate = await Rate.findOne();
        } catch (e) {
            ordersCount = orders.length;
            usersCount = users.length;
            transactionsCount = transactions.length;
        }
        
        res.send(`
            <h1>Swap Points Server</h1>
            <p>Сервер працює!</p>
            <ul>
                <li><a href="/frontend/index.html">Головна сторінка</a></li>
                <li><a href="/frontend/exchange.html">Обмінник</a></li>
                <li><a href="/frontend/profile.html">Кабінет</a></li>
                <li><a href="/admin/index.html">Адмінка</a></li>
            </ul>
            <p>Заявок на обмін: ${ordersCount}</p>
            <p>Користувачів: ${usersCount}</p>
            <p>Транзакцій: ${transactionsCount}</p>
            <p>Поточний курс: USDT = ${rate ? rate.USDT : currentRate.USDT} UAH, TON = ${rate ? rate.TON : currentRate.TON} UAH</p>
        `);
    } catch (error) {
        res.send(`
            <h1>Swap Points Server</h1>
            <p>Сервер працює!</p>
            <ul>
                <li><a href="/frontend/index.html">Головна сторінка</a></li>
                <li><a href="/frontend/exchange.html">Обмінник</a></li>
                <li><a href="/frontend/profile.html">Кабінет</a></li>
                <li><a href="/admin/index.html">Адмінка</a></li>
            </ul>
        `);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 Сервер запущено!');
    console.log(`📁 Робоча папка: ${path.join(__dirname, '..')}`);
    console.log(`🌐 Порт: ${PORT}`);
    console.log(`👉 Сайт: http://localhost:${PORT}/frontend/index.html`);
    console.log(`👉 Обмінник: http://localhost:${PORT}/frontend/exchange.html`);
    console.log(`👉 Кабінет: http://localhost:${PORT}/frontend/profile.html`);
    console.log(`👉 Адмінка: http://localhost:${PORT}/admin/index.html`);
    console.log(`💰 Курс: USDT = ${currentRate.USDT} UAH, TON = ${currentRate.TON} UAH\n`);
});