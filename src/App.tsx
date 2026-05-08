import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { dealers, employees, initialStatements, initialTransactions } from './data/mockData';
import { DealerPayment, DealerPaymentAllocation, EmployeeCommission, EmployeePayment, EmployeePaymentAllocation, Role, SettlementTransaction, Statement } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { DealersPage } from './pages/DealersPage';
import { AssignmentsPage, DealerProfilePage, EmployeeProfilePage, EmployeesPage, MyCommissionsPage, SettingsPage, StatementDetailPage, TransactionsPage } from './pages/PlaceholderPages';
import { clearAppStorage, loadFromStorage, saveToStorage } from './lib/persistence';
import { generateEmployeeCommissionsForStatements } from './lib/statementCalculations';

const initialEmployeeCommissions = generateEmployeeCommissionsForStatements(
  initialStatements,
  dealers,
  employees,
  initialTransactions,
);

export function App() {
  const [role, setRole] = useState<Role>(() => loadFromStorage<Role>('role', 'admin'));
  // TODO: Replace localStorage persistence with Supabase persistence in production.
  const [statements, setStatements] = useState<Statement[]>(() => loadFromStorage('statements', initialStatements));
  const [transactions, setTransactions] = useState<SettlementTransaction[]>(() => loadFromStorage('transactions', initialTransactions));
  const [flash, setFlash] = useState<string>('');
  const [dealerPayments, setDealerPayments] = useState<DealerPayment[]>(() => loadFromStorage('dealerPayments', []));
  const [dealerPaymentAllocations, setDealerPaymentAllocations] = useState<DealerPaymentAllocation[]>(() => loadFromStorage('dealerPaymentAllocations', []));
  const [employeeCommissions, setEmployeeCommissions] = useState<EmployeeCommission[]>(() => loadFromStorage('employeeCommissions', initialEmployeeCommissions));
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>(() => loadFromStorage('employeePayments', []));
  const [employeePaymentAllocations, setEmployeePaymentAllocations] = useState<EmployeePaymentAllocation[]>(() => loadFromStorage('employeePaymentAllocations', []));
  const employee = employees[0];
  const assignedStoreIds = useMemo(() => employee.assignments.map((a) => a.storeId), [employee.assignments]);

  useEffect(() => { saveToStorage('statements', statements); }, [statements]);
  useEffect(() => { saveToStorage('transactions', transactions); }, [transactions]);
  useEffect(() => { saveToStorage('role', role); }, [role]);
  useEffect(() => { saveToStorage('dealerPayments', dealerPayments); }, [dealerPayments]);
  useEffect(() => { saveToStorage('dealerPaymentAllocations', dealerPaymentAllocations); }, [dealerPaymentAllocations]);
  useEffect(() => { saveToStorage('employeeCommissions', employeeCommissions); }, [employeeCommissions]);
  useEffect(() => { saveToStorage('employeePayments', employeePayments); }, [employeePayments]);
  useEffect(() => { saveToStorage('employeePaymentAllocations', employeePaymentAllocations); }, [employeePaymentAllocations]);
  useEffect(() => {
    setEmployeeCommissions((existing) =>
      generateEmployeeCommissionsForStatements(statements, dealers, employees, transactions, existing),
    );
  }, [statements, transactions]);

  const resetDemoData = () => {
    if (!window.confirm('Reset demo data? This clears local persisted state.')) return;
    clearAppStorage();
    setStatements(initialStatements);
    setTransactions(initialTransactions);
    setDealerPayments([]);
    setDealerPaymentAllocations([]);
    setEmployeeCommissions(initialEmployeeCommissions);
    setEmployeePayments([]);
    setEmployeePaymentAllocations([]);
    setFlash('Demo data reset to seeded defaults.');
  };

  return (
    <Routes>
      <Route path="/" element={<AppLayout role={role} setRole={setRole} flash={flash} setFlash={setFlash} />}>
        <Route index element={<DashboardPage dealers={dealers} statements={statements} transactions={transactions} allocations={dealerPaymentAllocations} role={role} employee={employee} employeeCommissions={employeeCommissions} employeePaymentAllocations={employeePaymentAllocations} />} />
        <Route path="dealers" element={<DealersPage dealers={dealers} statements={statements} transactions={transactions} allocations={dealerPaymentAllocations} storeIds={role === 'employee' ? assignedStoreIds : undefined} />} />
        <Route path="dealers/:dealerId" element={<DealerProfilePage role={role} assignedStoreIds={assignedStoreIds} dealers={dealers} statements={statements} transactions={transactions} setStatements={setStatements} setFlash={setFlash} payments={dealerPayments} allocations={dealerPaymentAllocations} setPayments={setDealerPayments} setAllocations={setDealerPaymentAllocations} employees={employees} employeeCommissions={employeeCommissions} setEmployeeCommissions={setEmployeeCommissions} />} />
        <Route path="statements/:statementId" element={<StatementDetailPage role={role} assignedStoreIds={assignedStoreIds} dealers={dealers} statements={statements} transactions={transactions} setTransactions={setTransactions} setFlash={setFlash} allocations={dealerPaymentAllocations} employees={employees} />} />
        <Route path="transactions" element={role === 'admin' ? <TransactionsPage role={role} assignedStoreIds={assignedStoreIds} dealers={dealers} transactions={transactions} setTransactions={setTransactions} setFlash={setFlash} /> : <Navigate to="/" replace />} />
        <Route path="employees" element={role === 'admin' ? <EmployeesPage employees={employees} dealers={dealers} commissions={employeeCommissions} allocations={employeePaymentAllocations} /> : <Navigate to="/" replace />} />
        <Route path="employees/:employeeId" element={<EmployeeProfilePage role={role} employees={employees} dealers={dealers} commissions={employeeCommissions} payments={employeePayments} allocations={employeePaymentAllocations} setPayments={setEmployeePayments} setAllocations={setEmployeePaymentAllocations} setCommissions={setEmployeeCommissions} setFlash={setFlash} />} />
        <Route path="assignments" element={role === 'admin' ? <AssignmentsPage employees={employees} dealers={dealers} /> : <Navigate to="/" replace />} />
        <Route path="settings" element={role === 'admin' ? <SettingsPage onResetDemoData={resetDemoData} /> : <Navigate to="/" replace />} />
        <Route path="my-commissions" element={<MyCommissionsPage role={role} employee={employee} dealers={dealers} commissions={employeeCommissions} payments={employeePayments} allocations={employeePaymentAllocations} />} />
      </Route>
    </Routes>
  );
}
