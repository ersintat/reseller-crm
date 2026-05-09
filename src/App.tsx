import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { dealers, employees, initialStatements, initialTransactions } from './data/mockData';
import { Assignment, DealerPayment, DealerPaymentAllocation, Employee, EmployeeCommission, EmployeePayment, EmployeePaymentAllocation, Role, SettlementTransaction, Statement } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { DealersPage } from './pages/DealersPage';
import { AssignmentsPage, DealerProfilePage, EmployeeProfilePage, EmployeesPage, MyCommissionsPage, SettingsPage, StatementDetailPage, TransactionsPage } from './pages/PlaceholderPages';
import { clearAppStorage, loadFromStorage, saveToStorage } from './lib/persistence';
import { generateEmployeeCommissionsForStatements } from './lib/statementCalculations';
import { useAuth } from './auth/AuthContext';
import { LoginPage, SignupPage } from './pages/AuthPages';
import {
  EmployeeAssignmentState,
  fetchFinancialReferenceData,
  FinancialReferenceData,
} from './lib/financialReferenceService';

const initialEmployeeCommissions = generateEmployeeCommissionsForStatements(
  initialStatements,
  dealers,
  employees,
  initialTransactions,
);

const normalizeAssignment = (assignment: Assignment): Assignment => ({
  storeId: assignment.storeId,
  commissionRatePct: Number(assignment.commissionRatePct) || 0,
  canViewTransactions: assignment.canViewTransactions ?? true,
  canAddTransactions: assignment.canAddTransactions ?? true,
  canEditTransactions: assignment.canEditTransactions ?? false,
  canViewCommission: assignment.canViewCommission ?? true,
  status: assignment.status ?? 'active',
});

const initialEmployeeAssignments: EmployeeAssignmentState = employees.reduce((output, employee) => {
  output[employee.id] = employee.assignments.map(normalizeAssignment);
  return output;
}, {} as EmployeeAssignmentState);

const hydrateEmployeesWithAssignments = (
  baseEmployees: Employee[],
  assignmentState: EmployeeAssignmentState,
): Employee[] =>
  baseEmployees.map((employee) => ({
    ...employee,
    assignments: (assignmentState[employee.id] || employee.assignments).map(normalizeAssignment),
  }));

export function App() {
  const auth = useAuth();
  const [demoRole, setDemoRole] = useState<Role>(() => loadFromStorage<Role>('role', 'admin'));
  // TODO: Replace localStorage persistence with Supabase persistence in production.
  const [statements, setStatements] = useState<Statement[]>(() => loadFromStorage('statements', initialStatements));
  const [transactions, setTransactions] = useState<SettlementTransaction[]>(() => loadFromStorage('transactions', initialTransactions));
  const [flash, setFlash] = useState<string>('');
  const [dealerPayments, setDealerPayments] = useState<DealerPayment[]>(() => loadFromStorage('dealerPayments', []));
  const [dealerPaymentAllocations, setDealerPaymentAllocations] = useState<DealerPaymentAllocation[]>(() => loadFromStorage('dealerPaymentAllocations', []));
  const [employeeCommissions, setEmployeeCommissions] = useState<EmployeeCommission[]>(() => loadFromStorage('employeeCommissions', initialEmployeeCommissions));
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>(() => loadFromStorage('employeePayments', []));
  const [employeePaymentAllocations, setEmployeePaymentAllocations] = useState<EmployeePaymentAllocation[]>(() => loadFromStorage('employeePaymentAllocations', []));
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignmentState>(() =>
    loadFromStorage('employeeAssignments', initialEmployeeAssignments),
  );
  const [supabaseReferenceData, setSupabaseReferenceData] = useState<FinancialReferenceData | null>(null);
  const [supabaseAssignmentState, setSupabaseAssignmentState] = useState<EmployeeAssignmentState | null>(null);
  const [supabaseReferenceAssignments, setSupabaseReferenceAssignments] = useState<EmployeeAssignmentState | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');

  useEffect(() => {
    if (!auth.authEnabled || !auth.user) {
      setSupabaseReferenceData(null);
      setSupabaseAssignmentState(null);
      setSupabaseReferenceAssignments(null);
      setReferenceError('');
      setReferenceLoading(false);
      return;
    }

    let active = true;
    setReferenceLoading(true);
    setReferenceError('');

    fetchFinancialReferenceData()
      .then((data) => {
        if (!active) return;
        setSupabaseReferenceData(data);
        setSupabaseAssignmentState(data.assignmentState);
        setSupabaseReferenceAssignments(data.assignmentState);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Failed to load Supabase financial reference data.', error);
        setSupabaseReferenceData(null);
        setSupabaseAssignmentState(null);
        setSupabaseReferenceAssignments(null);
        setReferenceError('Supabase reference data could not be loaded. The app is using local demo reference data.');
      })
      .finally(() => {
        if (active) setReferenceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [auth.authEnabled, auth.user?.id]);

  const usingSupabaseReferenceData = Boolean(
    auth.authEnabled &&
      auth.user &&
      supabaseReferenceData &&
      supabaseAssignmentState,
  );
  const activeDealers = usingSupabaseReferenceData ? supabaseReferenceData!.dealers : dealers;
  const baseEmployees = usingSupabaseReferenceData ? supabaseReferenceData!.employees : employees;
  const activeAssignmentState = usingSupabaseReferenceData ? supabaseAssignmentState! : employeeAssignments;
  const employeesWithAssignments = useMemo(
    () => hydrateEmployeesWithAssignments(baseEmployees, activeAssignmentState),
    [activeAssignmentState, baseEmployees],
  );
  const employee =
    employeesWithAssignments[0] ??
    (usingSupabaseReferenceData
      ? { id: 'unlinked-employee', name: 'No linked employee', roleTitle: 'Employee', assignments: [] }
      : employees[0]);
  const visibleEmployeeAssignments = useMemo(
    () =>
      employee.assignments.filter(
        (assignment) => assignment.status === 'active' && assignment.canViewTransactions,
      ),
    [employee.assignments],
  );
  const assignedStoreIds = useMemo(
    () => visibleEmployeeAssignments.map((assignment) => assignment.storeId),
    [visibleEmployeeAssignments],
  );
  const addTransactionStoreIds = useMemo(
    () =>
      employee.assignments
        .filter((assignment) => assignment.status === 'active' && assignment.canAddTransactions)
        .map((assignment) => assignment.storeId),
    [employee.assignments],
  );
  const commissionStoreIds = useMemo(
    () =>
      employee.assignments
        .filter((assignment) => assignment.status === 'active' && assignment.canViewCommission)
        .map((assignment) => assignment.storeId),
    [employee.assignments],
  );
  const employeeVisibleCommissions = useMemo(
    () =>
      employeeCommissions.filter((commission) => {
        const dealer = activeDealers.find((row) => row.id === commission.dealerId);
        return dealer ? commissionStoreIds.includes(dealer.storeId) : false;
      }),
    [activeDealers, commissionStoreIds, employeeCommissions],
  );
  const role: Role = auth.authEnabled ? (auth.isAdmin ? 'admin' : 'employee') : demoRole;
  const roleLabel = auth.authEnabled
    ? auth.roles.length > 0
      ? auth.roles.join(', ')
      : 'No role assigned'
    : 'Demo role switcher';

  useEffect(() => { saveToStorage('statements', statements); }, [statements]);
  useEffect(() => { saveToStorage('transactions', transactions); }, [transactions]);
  useEffect(() => { saveToStorage('role', demoRole); }, [demoRole]);
  useEffect(() => { saveToStorage('dealerPayments', dealerPayments); }, [dealerPayments]);
  useEffect(() => { saveToStorage('dealerPaymentAllocations', dealerPaymentAllocations); }, [dealerPaymentAllocations]);
  useEffect(() => { saveToStorage('employeeCommissions', employeeCommissions); }, [employeeCommissions]);
  useEffect(() => { saveToStorage('employeePayments', employeePayments); }, [employeePayments]);
  useEffect(() => { saveToStorage('employeePaymentAllocations', employeePaymentAllocations); }, [employeePaymentAllocations]);
  useEffect(() => { saveToStorage('employeeAssignments', employeeAssignments); }, [employeeAssignments]);
  useEffect(() => {
    setEmployeeCommissions((existing) => {
      const generated = generateEmployeeCommissionsForStatements(
        statements,
        activeDealers,
        employeesWithAssignments,
        transactions,
      );
      const existingIds = new Set(existing.map((commission) => commission.id));
      return [...existing, ...generated.filter((commission) => !existingIds.has(commission.id))];
    });
  }, [activeDealers, statements, transactions, employeesWithAssignments]);

  const updateAssignment = (employeeId: string, nextAssignment: Assignment) => {
    const updateState = (previous: EmployeeAssignmentState | null): EmployeeAssignmentState => {
      const currentState = previous ?? {};
      const current = currentState[employeeId] || [];
      return {
        ...currentState,
        [employeeId]: current.map((assignment) =>
          assignment.storeId === nextAssignment.storeId ? normalizeAssignment(nextAssignment) : assignment,
        ),
      };
    };

    if (usingSupabaseReferenceData) {
      setSupabaseAssignmentState(updateState);
      return;
    }

    setEmployeeAssignments((previous) => {
      const current = previous[employeeId] || [];
      return {
        ...previous,
        [employeeId]: current.map((assignment) =>
          assignment.storeId === nextAssignment.storeId ? normalizeAssignment(nextAssignment) : assignment,
        ),
      };
    });
  };

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
    setEmployeeAssignments(initialEmployeeAssignments);
    if (usingSupabaseReferenceData && supabaseReferenceAssignments) {
      setSupabaseAssignmentState(supabaseReferenceAssignments);
    }
    setFlash('Demo data reset to seeded defaults.');
  };

  const dataModeLabel = usingSupabaseReferenceData
    ? 'Supabase reference data · Local settlement activity'
    : auth.authEnabled
      ? 'Mock reference data · Local settlement activity'
      : 'Demo role switcher · Local settlement activity';
  const referenceStatusLabel = referenceLoading
    ? 'Loading Supabase reference data'
    : dataModeLabel;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          auth.authEnabled && auth.loading ? (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
              Loading authentication...
            </div>
          ) : auth.authEnabled && !auth.user ? (
            <Navigate to="/login" replace />
          ) : (
            <AppLayout
              role={role}
              setRole={setDemoRole}
              flash={flash}
              setFlash={setFlash}
              authEnabled={auth.authEnabled}
              userEmail={auth.user?.email}
              roleLabel={roleLabel}
              onSignOut={() => {
                void auth.signOut();
              }}
              dataModeLabel={referenceStatusLabel}
              dataSourceError={referenceError}
            />
          )
        }
      >
        <Route index element={<DashboardPage dealers={activeDealers} statements={statements} transactions={transactions} allocations={dealerPaymentAllocations} role={role} employee={{ ...employee, assignments: visibleEmployeeAssignments }} employeeCommissions={role === 'employee' ? employeeVisibleCommissions : employeeCommissions} employeePaymentAllocations={employeePaymentAllocations} dealerPayments={dealerPayments} employeePayments={employeePayments} />} />
        <Route path="dealers" element={<DealersPage dealers={activeDealers} statements={statements} transactions={transactions} allocations={dealerPaymentAllocations} storeIds={role === 'employee' ? assignedStoreIds : undefined} />} />
        <Route path="dealers/:dealerId" element={<DealerProfilePage role={role} assignedStoreIds={assignedStoreIds} addTransactionStoreIds={addTransactionStoreIds} dealers={activeDealers} statements={statements} transactions={transactions} setStatements={setStatements} setFlash={setFlash} payments={dealerPayments} allocations={dealerPaymentAllocations} setPayments={setDealerPayments} setAllocations={setDealerPaymentAllocations} employees={employeesWithAssignments} employeeCommissions={employeeCommissions} setEmployeeCommissions={setEmployeeCommissions} />} />
        <Route path="statements/:statementId" element={<StatementDetailPage role={role} assignedStoreIds={assignedStoreIds} addTransactionStoreIds={addTransactionStoreIds} dealers={activeDealers} statements={statements} transactions={transactions} setTransactions={setTransactions} setFlash={setFlash} allocations={dealerPaymentAllocations} employees={employeesWithAssignments} />} />
        <Route path="transactions" element={role === 'admin' ? <TransactionsPage role={role} assignedStoreIds={assignedStoreIds} dealers={activeDealers} transactions={transactions} setTransactions={setTransactions} setFlash={setFlash} /> : <Navigate to="/" replace />} />
        <Route path="employees" element={role === 'admin' ? <EmployeesPage employees={employeesWithAssignments} dealers={activeDealers} commissions={employeeCommissions} allocations={employeePaymentAllocations} /> : <Navigate to="/" replace />} />
        <Route path="employees/:employeeId" element={<EmployeeProfilePage role={role} employees={employeesWithAssignments} dealers={activeDealers} commissions={employeeCommissions} payments={employeePayments} allocations={employeePaymentAllocations} setPayments={setEmployeePayments} setAllocations={setEmployeePaymentAllocations} setCommissions={setEmployeeCommissions} setFlash={setFlash} />} />
        <Route path="assignments" element={role === 'admin' ? <AssignmentsPage employees={employeesWithAssignments} dealers={activeDealers} onUpdateAssignment={updateAssignment} /> : <Navigate to="/" replace />} />
        <Route path="settings" element={role === 'admin' ? <SettingsPage onResetDemoData={resetDemoData} /> : <Navigate to="/" replace />} />
        <Route path="my-commissions" element={<MyCommissionsPage role={role} employee={employee} dealers={activeDealers} commissions={role === 'employee' ? employeeVisibleCommissions : employeeCommissions} payments={employeePayments} allocations={employeePaymentAllocations} />} />
      </Route>
    </Routes>
  );
}
