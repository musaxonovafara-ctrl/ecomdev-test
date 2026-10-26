import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API ---

app.post('/api/students', async (req: Request, res: Response) => {
  try {
    const { name, phone, group, monthlyFee } = req.body;
    if (!name || !phone || !group || monthlyFee === undefined) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    const student = await prisma.student.create({
      data: { name, phone, group, monthlyFee: Number(monthlyFee) }
    });
    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при создании ученика' });
  }
});

app.get('/api/students', async (req: Request, res: Response) => {
  try {
    const students = await prisma.student.findMany({
      include: { payments: true },
      orderBy: { id: 'desc' }
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении списка учеников' });
  }
});

app.put('/api/students/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, group, monthlyFee } = req.body;
    const student = await prisma.student.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(group && { group }),
        ...(monthlyFee !== undefined && { monthlyFee: Number(monthlyFee) })
      }
    });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Ученик не найден или ошибка обновления' });
  }
});

app.delete('/api/students/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.student.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при удалении ученика' });
  }
});

app.post('/api/payments', async (req: Request, res: Response) => {
  try {
    const { studentId, amount, date } = req.body;
    if (!studentId || amount === undefined || !date) {
      return res.status(400).json({ error: 'studentId, amount и date обязательны' });
    }
    const payment = await prisma.payment.create({
      data: {
        studentId: Number(studentId),
        amount: Number(amount),
        date
      }
    });
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при добавлении оплаты' });
  }
});

app.get('/api/students/:id/payments', async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.id);
    const payments = await prisma.payment.findMany({
      where: { studentId },
      orderBy: { date: 'desc' }
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении оплат' });
  }
});

app.get('/debtors', async (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Укажите month в формате YYYY-MM' });
    }

    const students = await prisma.student.findMany({
      include: { payments: true }
    });

    const debtors = [];

    for (const student of students) {
      const totalPaid = student.payments
        .filter(p => p.date.startsWith(month))
        .reduce((sum, p) => sum + p.amount, 0);

      const monthlyFee = student.monthlyFee;

      if (totalPaid < monthlyFee) {
        debtors.push({
          id: student.id,
          name: student.name,
          phone: student.phone,
          group: student.group,
          monthlyFee,
          totalPaid,
          debt: monthlyFee - totalPaid
        });
      }
    }

    res.json(debtors);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при расчете должников' });
  }
});

app.get('/', (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Учёт оплат</title>
    <style>
        body { font-family: sans-serif; background: #f4f7f6; margin: 0; padding: 15px; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 12px; }
        .form-group { margin-bottom: 12px; }
        label { display: block; margin-bottom: 4px; font-weight: bold; }
        input, select, button { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
        button { background: #3498db; color: white; border: none; font-weight: bold; cursor: pointer; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
        .badge { background: #e74c3c; color: white; padding: 3px 8px; border-radius: 4px; }
        .section { margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <h2>📚 Учёт оплат учебного центра</h2>
        
        <div class="section">
            <h3>Внести оплату</h3>
            <form id="paymentForm">
                <div class="form-group">
                    <label>Ученик:</label>
                    <select id="studentSelect" required></select>
                </div>
                <div class="form-group">
                    <label>Сумма (₽):</label>
                    <input type="number" id="payAmount" required placeholder="5000">
                </div>
                <div class="form-group">
                    <label>Дата:</label>
                    <input type="date" id="payDate" required>
                </div>
                <button type="submit">Добавить оплату</button>
            </form>
        </div>

        <div class="section">
            <h3>Должники за месяц</h3>
            <div class="form-group">
                <label>Выберите месяц:</label>
                <input type="month" id="monthInput" value="${new Date().toISOString().slice(0, 7)}">
            </div>
            <div id="debtorsList">Загрузка...</div>
        </div>
        
        <div class="section">
            <h3>Добавить ученика</h3>
            <form id="studentForm">
                <div class="form-group"><input type="text" id="stName" placeholder="Имя Фамилия" required></div>
                <div class="form-group"><input type="text" id="stPhone" placeholder="Телефон" required></div>
                <div class="form-group"><input type="text" id="stGroup" placeholder="Группа" required></div>
                <div class="form-group"><input type="number" id="stFee" placeholder="Месячная оплата" required></div>
                <button type="submit" style="background: #2ecc71;">Создать</button>
            </form>
        </div>
    </div>

    <script>
        document.getElementById('payDate').value = new Date().toISOString().split('T')[0];

        async function loadData() {
            const resStudents = await fetch('/api/students');
            const students = await resStudents.json();
            const select = document.getElementById('studentSelect');
            select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.group}) - ${s.monthlyFee}₽</option>`).join('');

            const month = document.getElementById('monthInput').value;
            const resDebtors = await fetch('/debtors?month=' + month);
            const debtors = await resDebtors.json();
            
            const listDiv = document.getElementById('debtorsList');
            if (debtors.length === 0) {
                listDiv.innerHTML = '<p style="color: green;">Должников нет! 🎉</p>';
            } else {
                listDiv.innerHTML = `<table>
                    <tr><th>Имя</th><th>Группа</th><th>Долг</th></tr>
                    ${debtors.map(d => `<tr><td>${d.name}<br><small>${d.phone}</small></td><td>${d.group}</td><td><span class="badge">${d.debt} ₽</span></td></tr>`).join('')}
                `;
            }
        }

        document.getElementById('paymentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: document.getElementById('studentSelect').value,
                    amount: document.getElementById('payAmount').value,
                    date: document.getElementById('payDate').value
                })
            });
            alert('Оплата добавлена!');
            document.getElementById('payAmount').value = '';
            loadData();
        });

        document.getElementById('studentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: document.getElementById('stName').value,
                    phone: document.getElementById('stPhone').value,
                    group: document.getElementById('stGroup').value,
                    monthlyFee: document.getElementById('stFee').value
                })
            });
            alert('Ученик создан!');
            document.getElementById('stName').value = '';
            document.getElementById('stPhone').value = '';
            document.getElementById('stGroup').value = '';
            document.getElementById('stFee').value = '';
            loadData();
        });

        document.getElementById('monthInput').addEventListener('change', loadData);
        loadData();
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await prisma.$connect();
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
