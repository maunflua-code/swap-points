const mongoose = require('mongoose');

// Підключення до MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/swap-points';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB підключено!'))
    .catch(err => console.error('❌ Помилка MongoDB:', err));

// Схема користувача
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    balanceUSDT: { type: Number, default: 0 },
    balanceUAH: { type: Number, default: 0 },
    totalExchanges: { type: Number, default: 0 },
    totalExchangedUAH: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Схема заявки на обмін
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    userId: String,
    direction: String,
    amount: Number,
    amountUAH: Number,
    rate: Number,
    cardNumber: String,
    paymentAddress: String,
    status: { type: String, default: 'pending' },
    txHash: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
});

// Схема транзакції
const transactionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: String,
    type: String, // 'deposit', 'withdraw', 'exchange'
    amount: Number,
    currency: String,
    uahAmount: Number,
    card: String,
    txHash: String,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});

// Схема курсів
const rateSchema = new mongoose.Schema({
    USDT: { type: Number, default: 46 },
    TON: { type: Number, default: 80 },
    updatedAt: { type: Date, default: Date.now }
});

// Створюємо моделі
const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Rate = mongoose.model('Rate', rateSchema);

module.exports = { User, Order, Transaction, Rate };