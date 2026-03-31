// --- State & Initial Data ---
let transactions = [];
let chartInstance = null;

// Categories
const CATEGORIES = {
    income: ['Salary', 'Investment', 'Gift', 'Other Income'],
    expense: ['Food', 'Travel', 'Bills', 'Entertainment', 'Shopping', 'Health', 'Other Expense']
};

const CATEGORY_ICONS = {
    'Salary': 'fa-money-bill-wave',
    'Investment': 'fa-chart-line',
    'Gift': 'fa-gift',
    'Other Income': 'fa-coins',
    'Food': 'fa-utensils',
    'Travel': 'fa-plane',
    'Bills': 'fa-file-invoice-dollar',
    'Entertainment': 'fa-film',
    'Shopping': 'fa-bag-shopping',
    'Health': 'fa-notes-medical',
    'Other Expense': 'fa-receipt'
};

// --- DOM Elements ---
const DOM = {
    balance: document.getElementById('total-balance'),
    income: document.getElementById('total-income'),
    expense: document.getElementById('total-expense'),
    list: document.getElementById('transaction-list'),
    form: document.getElementById('transaction-form'),
    typeToggle: document.querySelectorAll('input[name="type"]'),
    categorySelect: document.getElementById('category'),
    dateInput: document.getElementById('date'),
    descInput: document.getElementById('desc'),
    amountInput: document.getElementById('amount'),
    toast: document.getElementById('toast'),
    darkModeBtn: document.getElementById('dark-mode-toggle'),
    exportBtn: document.getElementById('export-csv-btn'),
    // Filters
    searchInput: document.getElementById('search-input'),
    filterCategory: document.getElementById('filter-category'),
    filterStart: document.getElementById('filter-date-start'),
    filterEnd: document.getElementById('filter-date-end'),
    clearFiltersBtn: document.getElementById('clear-filters'),
    insightsList: document.getElementById('summary-insights')
};

// --- IndexedDB Configuration & Wrapper ---
const DB_NAME = 'ExpenseX_DB';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';
let db;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => {
            console.error('Error opening IndexedDB', e);
            reject(e);
        };
    });
}

function getAllFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

function saveToDB(item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item); 

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
}

function deleteFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
}


// --- Initialization ---
async function init() {
    // Set default date to today
    DOM.dateInput.valueAsDate = new Date();
    
    // Load Dark Mode Preference
    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        DOM.darkModeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    // Populate Category Dropdown globally
    updateCategoryOptions();

    // Load Transactions from IndexedDB Database
    try {
        await openDB();
        transactions = await getAllFromDB();
        
        // Data migration logic: If old localStorage data exists, migrate it to IndexedDB
        const oldLocalData = localStorage.getItem('transactions');
        if (oldLocalData && transactions.length === 0) {
            const parsedOldData = JSON.parse(oldLocalData);
            for (let item of parsedOldData) {
                await saveToDB(item);
                transactions.push(item);
            }
            // Clear old localstorage space
            localStorage.removeItem('transactions');
            console.log('Migrated old localStorage data to IndexedDB');
        }
    } catch (e) {
        showToast('Error connecting to local Database', 'error');
    }
    
    // Add Event Listeners
    setupEventListeners();

    // Update UI
    updateUI();
}

function setupEventListeners() {
    DOM.form.addEventListener('submit', addTransaction);
    
    DOM.typeToggle.forEach(radio => {
        radio.addEventListener('change', updateCategoryOptions);
    });

    DOM.darkModeBtn.addEventListener('click', toggleDarkMode);
    DOM.exportBtn.addEventListener('click', exportCSV);

    // Filters
    DOM.searchInput.addEventListener('input', updateUI);
    DOM.filterCategory.addEventListener('change', updateUI);
    DOM.filterStart.addEventListener('change', updateUI);
    DOM.filterEnd.addEventListener('change', updateUI);
    DOM.clearFiltersBtn.addEventListener('click', clearFilters);
    
    // Floating Labels
    const inputs = document.querySelectorAll('.form-control');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            const label = input.nextElementSibling;
            if(label && label.tagName === 'LABEL') {
                if(input.value !== '') {
                    label.classList.add('active');
                } else {
                    label.classList.remove('active');
                }
            }
        });
    });
}

// --- Core Functions ---

function updateCategoryOptions() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const options = CATEGORIES[type];
    
    DOM.categorySelect.innerHTML = options.map(cat => 
        `<option value="${cat}">${cat}</option>`
    ).join('');
}

function generateID() {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

async function addTransaction(e) {
    e.preventDefault();

    const desc = DOM.descInput.value.trim();
    const amount = parseFloat(DOM.amountInput.value);
    const category = DOM.categorySelect.value;
    const date = DOM.dateInput.value;
    const type = document.querySelector('input[name="type"]:checked').value;

    if (!desc || isNaN(amount) || amount <= 0 || !date) {
        showToast('Please fill all fields correctly.', 'error');
        return;
    }

    const transaction = {
        id: generateID(),
        desc,
        amount: type === 'expense' ? -amount : amount,
        category,
        date,
        type
    };

    try {
        await saveToDB(transaction); // Save asynchronously to IndexedDB
        transactions.push(transaction); // Update local state cache
        updateUI();
        
        DOM.form.reset();
        DOM.dateInput.valueAsDate = new Date(); // Reset date
        updateCategoryOptions(); // Reset categories
        
        // Ensure active state
        document.querySelectorAll('.form-control').forEach(input => {
            const label = input.nextElementSibling;
            if(label && label.tagName === 'LABEL') {
                 if(input.required || input.value !== '') label.classList.add('active');
            }
        });
        
        showToast('Transaction saved to Database!', 'success');
    } catch (err) {
        showToast('Failed to save to database!', 'error');
        console.error(err);
    }
}

// Make delete available globally
window.deleteTransaction = async function(id) {
    if (confirm('Are you sure you want to delete this transaction from the database?')) {
        try {
            await deleteFromDB(id);
            transactions = transactions.filter(t => t.id !== id);
            updateUI();
            showToast('Deleted from database.', 'success');
        } catch (err) {
            showToast('Failed to delete transaction!', 'error');
            console.error(err);
        }
    }
};

// --- UI Updates ---

function getFilteredTransactions() {
    const searchTerm = DOM.searchInput.value.toLowerCase();
    const categoryFilter = DOM.filterCategory.value;
    const startDate = DOM.filterStart.value;
    const endDate = DOM.filterEnd.value;

    return transactions.filter(t => {
        const matchSearch = t.desc.toLowerCase().includes(searchTerm);
        const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;
        
        let matchDate = true;
        if (startDate) matchDate = matchDate && t.date >= startDate;
        if (endDate) matchDate = matchDate && t.date <= endDate;

        return matchSearch && matchCategory && matchDate;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by newest first
}

function updateUI() {
    const filtered = getFilteredTransactions();
    
    // Update List
    renderList(filtered);
    
    // Update Summaries
    updateSummaries(transactions);
    
    // Update Chart
    renderChart(filtered);
}

function renderList(items) {
    DOM.list.innerHTML = '';

    if (items.length === 0) {
        DOM.list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-ghost"></i>
                <p>No activity found in database.</p>
            </div>
        `;
        return;
    }

    items.forEach(t => {
        const isIncome = t.type === 'income';
        const sign = isIncome ? '+' : '-';
        const absAmount = Math.abs(t.amount).toFixed(2);
        const iconClass = CATEGORY_ICONS[t.category] || 'fa-tag';
        
        // Format date: DD MMM YYYY
        const dateObj = new Date(t.date);
        const formattedDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        const el = document.createElement('div');
        el.className = `transaction-item ${t.type}`;
        el.innerHTML = `
            <div class="left-t-content">
                <div class="t-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="t-details">
                    <div class="t-desc" title="${t.desc}">${t.desc}</div>
                    <div class="t-meta">
                        <span class="t-category">${t.category}</span>
                        <span class="t-date"><i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${formattedDate}</span>
                    </div>
                </div>
            </div>
            <div class="t-amount-action">
                <div class="t-amount">${sign}₹${absAmount}</div>
                <button type="button" class="btn-delete" onclick="deleteTransaction('${t.id}')" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        DOM.list.appendChild(el);
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

function updateSummaries(items) {
    const amounts = items.map(t => t.amount);
    
    const total = amounts.reduce((acc, item) => acc + item, 0);
    const income = amounts.filter(item => item > 0).reduce((acc, item) => acc + item, 0);
    const expense = amounts.filter(item => item < 0).reduce((acc, item) => acc + item, 0) * -1;

    DOM.balance.style.transform = 'scale(1.02)';
    setTimeout(() => DOM.balance.style.transform = 'scale(1)', 150);

    DOM.balance.innerText = formatCurrency(total);
    DOM.income.innerText = formatCurrency(income);
    DOM.expense.innerText = formatCurrency(expense);
    
    // Insights
    updateInsights(items, income, expense);
}

function updateInsights(items, totalIncome, totalExpense) {
    if (items.length === 0) {
        DOM.insightsList.innerHTML = '<p>Get started by adding your first transaction!</p>';
        return;
    }

    let highestExpenseCategory = 'N/A';
    let highestExpenseAmount = -1;
    
    const expensesByCategory = {};
    items.filter(t => t.type === 'expense').forEach(t => {
        const amt = Math.abs(t.amount);
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + amt;
        if (expensesByCategory[t.category] > highestExpenseAmount) {
            highestExpenseAmount = expensesByCategory[t.category];
            highestExpenseCategory = t.category;
        }
    });

    const savingsRate = totalIncome > 0 ? (((totalIncome - totalExpense) / totalIncome) * 100).toFixed(1) : 0;
    
    let insightsHTML = '';
    
    if (totalExpense > 0) {
        insightsHTML += `<p><i class="fa-solid fa-chart-pie" style="color:var(--primary-color)"></i> <strong>${highestExpenseCategory}</strong> is your top spend: ${formatCurrency(highestExpenseAmount)}</p>`;
    }
    
    if (totalIncome > 0 && totalExpense > 0) {
        let isWarning = totalExpense > totalIncome;
        let icon = isWarning ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-piggy-bank"></i>';
        insightsHTML += `<p style="color: ${isWarning ? 'var(--expense-color)' : 'inherit'}">${icon} Savings Rate: <strong>${Math.max(0, savingsRate)}%</strong> ${isWarning ? ' - Overspending!' : ''}</p>`;
    } else if (totalIncome === 0 && totalExpense > 0) {
        insightsHTML += `<p style="color: var(--expense-color)"><i class="fa-solid fa-triangle-exclamation"></i> You are spending without recorded income.</p>`;
    }

    DOM.insightsList.innerHTML = insightsHTML || '<p>Add more data to unlock insights.</p>';
}

// --- Chart Generation ---
function renderChart(items) {
    const ctx = document.getElementById('expense-chart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }

    const expenseItems = items.filter(t => t.type === 'expense');
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const emptyColor = isDark ? '#1e293b' : '#e2e8f0';
    
    if (items.length === 0 || expenseItems.length === 0) {
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['No Data'], datasets: [{ data: [1], backgroundColor: [emptyColor], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '70%' }
        });
        return;
    }

    const dataMap = {};
    expenseItems.forEach(t => {
        dataMap[t.category] = (dataMap[t.category] || 0) + Math.abs(t.amount);
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);
    
    const colors = ['#6366f1', '#ec4899', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6'];

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark ? '#0f172a' : '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'right', labels: { color: textColor, usePointStyle: true, boxWidth: 8, font: { family: "'Outfit', sans-serif", size: 12 } } },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: textColor, bodyColor: textColor,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1, padding: 12, cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed !== null) { label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed); }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function clearFilters() {
    DOM.searchInput.value = '';
    DOM.filterCategory.value = 'all';
    DOM.filterStart.value = '';
    DOM.filterEnd.value = '';
    updateUI();
}

function toggleDarkMode() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        DOM.darkModeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        DOM.darkModeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
    updateUI();
}

function exportCSV() {
    if (transactions.length === 0) {
        showToast('No activity to export.', 'error');
        return;
    }

    const headers = ['Date', 'Description', 'Category', 'Type', 'Amount'];
    const csvRows = [];
    csvRows.push(headers.join(','));

    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const row = [
            t.date,
            `"${t.desc.replace(/"/g, '""')}"`, 
            t.category,
            t.type,
            Math.abs(t.amount)
        ];
        csvRows.push(row.join(','));
    });

    const csvData = csvRows.join('\n');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `ExpenseX_DB_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast('Exported DB to CSV successfully!', 'success');
}

function showToast(message, type) {
    DOM.toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-circle-xmark'}" style="margin-right:8px"></i> ${message}`;
    DOM.toast.className = `toast show ${type}`;
    setTimeout(() => { DOM.toast.className = 'toast'; }, 3000);
}

// Start
init();