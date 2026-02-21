let currentRate = {
    USDT: 39.5,
    TON: 790
};

// Завантажуємо курс з сервера
async function loadRates() {
    try {
        const response = await fetch('/api/rates');
        const data = await response.json();
        currentRate = data;
        document.getElementById('usdtRate').textContent = data.USDT.toFixed(2);
        document.getElementById('tonRate').textContent = data.TON.toFixed(2);
    } catch (error) {
        console.log('Використовується стандартний курс');
    }
}

loadRates();

// Оновлення валюти при зміні напрямку
document.getElementById('direction').addEventListener('change', function(e) {
    const sendCurrency = document.getElementById('sendCurrency');
    if (e.target.value === 'USDT_TO_UAH') {
        sendCurrency.textContent = 'USDT';
    } else {
        sendCurrency.textContent = 'TON';
    }
    calculateReceive();
});

// Розрахунок суми отримання
document.getElementById('sendAmount').addEventListener('input', calculateReceive);

function calculateReceive() {
    const direction = document.getElementById('direction').value;
    const sendAmount = parseFloat(document.getElementById('sendAmount').value) || 0;
    let receiveAmount = 0;
    
    if (direction === 'USDT_TO_UAH') {
        receiveAmount = sendAmount * currentRate.USDT;
    } else {
        receiveAmount = sendAmount * currentRate.TON;
    }
    
    document.getElementById('receiveAmount').value = receiveAmount.toFixed(2);
}

// Створення заявки
document.getElementById('createOrderBtn').addEventListener('click', async function() {
    const direction = document.getElementById('direction').value;
    const sendAmount = parseFloat(document.getElementById('sendAmount').value);
    const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
    
    if (!cardNumber || cardNumber.length < 16) {
        alert('Введіть коректний номер картки');
        return;
    }
    
    try {
        const response = await fetch('/api/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                direction,
                amount: sendAmount,
                cardNumber
            })
        });
        
        const data = await response.json();
        
        // Показуємо статус
        document.getElementById('orderStatus').classList.remove('hidden');
        document.getElementById('orderIdText').innerHTML = `<strong>Номер заявки:</strong> ${data.orderId}`;
        document.getElementById('paymentAddress').innerHTML = `<strong>Адреса для оплати:</strong> ${data.paymentAddress}`;
        
        // Починаємо перевіряти статус
        checkOrderStatus(data.orderId);
        
    } catch (error) {
        alert('Помилка створення заявки');
    }
});

// Перевірка статусу заявки
async function checkOrderStatus(orderId) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`/api/order/${orderId}`);
            const data = await response.json();
            
            const statusText = document.getElementById('statusText');
            
            if (data.status === 'received') {
                statusText.innerHTML = '🔵 Переказ отримано, очікуйте підтвердження';
            } else if (data.status === 'confirmed') {
                statusText.innerHTML = '✅ Підтверджено! Гроші відправлено на картку';
                clearInterval(interval);
            } else if (data.status === 'cancelled') {
                statusText.innerHTML = '❌ Заявку скасовано';
                clearInterval(interval);
            }
        } catch (error) {
            console.log('Помилка перевірки статусу');
        }
    }, 5000); // Перевіряємо кожні 5 секунд
}