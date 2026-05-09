import { Navigate, Route, Routes } from 'react-router-dom';
import { type SetStateAction, useEffect, useMemo, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { dealers, employees, initialStatements, initialTransactions } from './data/mockData';
import { Assignment, Dealer, DealerPayment, DealerPaymentAllocation, Employee, EmployeeCommission, EmployeePayment, EmployeePaymentAllocation, Role, SettlementTransaction, Statement, TransactionStatus } from './types';
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
import {
  approveTransaction,
  createStatement as createSupabaseStatement,
  createTransaction as createSupabaseTransaction,
  fetchDealerPaymentAllocations,
  fetchDealerPayments,
  fetchStatements,
  fetchTransactions,
  recordDealerPaymentWithAllocations,
  rejectTransaction,
  updateStatementStatus,
  type CreateTransactionInput,
  type RecordDealerPaymentInput,
} from './lib/settlementActivityService';

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
  const [supabaseStatements, setSupabaseStatements] = useState<Statement[] | null>(null);
  const [supabaseTransactions, setSupabaseTransactions] = useState<SettlementTransaction[] | null>(null);
  const [supabaseDealerPayments, setSupabaseDealerPayments] = useState<DealerPayment[] | null>(null);
  const [supabaseDealerPaymentAllocations, setSupabaseDealerPaymentAllocations] = useState<DealerPaymentAllocation[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [dealerPaymentLoading, setDealerPaymentLoading] = useState(false);
  const [dealerPaymentError, setDealerPaymentError] = useState('');

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

  useEffect(() => {
    if (!usingSupabaseReferenceData) {
      setSupabaseStatements(null);
      setSupabaseTransactions(null);
      setSupabaseDealerPayments(null);
      setSupabaseDealerPaymentAllocations(null);
      setActivityError('');
      setDealerPaymentError('');
      setActivityLoading(false);
      setDealerPaymentLoading(false);
      return;
    }

    let active = true;
    setActivityLoading(true);
    setActivityError('');

    Promise.all([fetchStatements(activeDealers), fetchTransactions(activeDealers)])
      .then(([nextStatements, nextTransactions]) => {
        if (!active) return;
        setSupabaseStatements(nextStatements);
        setSupabaseTransactions(nextTransactions);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Failed to load Supabase statements and transactions.', error);
        setSupabaseStatements(null);
        setSupabaseTransactions(null);
        setActivityError('Supabase statements and transactions could not be loaded. The app is using local settlement activity.');
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeDealers, usingSupabaseReferenceData]);

  const usingSupabaseActivityData = Boolean(
    usingSupabaseReferenceData &&
      supabaseStatements &&
      supabaseTransactions &&
      !activityError,
  );
  useEffect(() => {
    if (!usingSupabaseActivityData) {
      setSupabaseDealerPayments(null);
      setSupabaseDealerPaymentAllocations(null);
      setDealerPaymentError('');
      setDealerPaymentLoading(false);
      return;
    }

    let active = true;
    setDealerPaymentLoading(true);
    setDealerPaymentError('');

    Promise.all([
      fetchDealerPayments(activeDealers),
      fetchDealerPaymentAllocations(supabaseStatements ?? []),
    ])
      .then(([nextPayments, nextAllocations]) => {
        if (!active) return;
        setSupabaseDealerPayments(nextPayments);
        setSupabaseDealerPaymentAllocations(nextAllocations);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Failed to load Supabase dealer payments.', error);
        setSupabaseDealerPayments([]);
        setSupabaseDealerPaymentAllocations([]);
        setDealerPaymentError('Supabase dealer payments could not be loaded. Dealer payment rows are unavailable until Supabase responds.');
      })
      .finally(() => {
        if (active) setDealerPaymentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeDealers, supabaseStatements, usingSupabaseActivityData]);

  const usingSupabaseDealerPaymentData = usingSupabaseActivityData;
  const activeStatements = usingSupabaseActivityData ? supabaseStatements! : statements;
  const activeTransactions = usingSupabaseActivityData ? supabaseTransactions! : transactions;
  const activeDealerPayments = usingSupabaseDealerPaymentData ? supabaseDealerPayments ?? [] : dealerPayments;
  const activeDealerPaymentAllocations = usingSupabaseDealerPaymentData
    ? supabaseDealerPaymentAllocations ?? []
    : dealerPaymentAllocations;
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
        activeStatements,
        activeDealers,
        employeesWithAssignments,
        activeTransactions,
      );
      const existingIds = new Set(existing.map((commission) => commission.id));
      return [...existing, ...generated.filter((commission) => !existingIds.has(commission.id))];
    });
  }, [activeDealers, activeStatements, activeTransactions, employeesWithAssignments]);

  const setActiveStatements = (value: SetStateAction<Statement[]>) => {
    if (usingSupabaseActivityData) {
      setSupabaseStatements((previous) => {
        const current = previous ?? [];
        return typeof value === 'function' ? value(current) : value;
      });
      return;
    }

    setStatements(value);
  };

  const setActiveTransactions = (value: SetStateAction<SettlementTransaction[]>) => {
    if (usingSupabaseActivityData) {
      setSupabaseTransactions((previous) => {
        const current = previous ?? [];
        return typeof value === 'function' ? value(current) : value;
      });
      return;
    }

    setTransactions(value);
  };

  const friendlySupabaseError = (error: unknown, fallback: string) => {
    const maybe = error as { code?: string; message?: string };
    if (maybe?.code === '23505') return 'A statement for this dealer and month already exists.';
    return maybe?.message ? `${fallback}: ${maybe.message}` : fallback;
  };

  const handleCreateStatement = async (dealer: Dealer, month: string) => {
    if (!usingSupabaseActivityData) return;

    try {
      const created = await createSupabaseStatement(dealer, month);
      setSupabaseStatements((previous) => [...(previous ?? []), created]);
      setFlash('Statement created in Supabase.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Statement could not be created'));
    }
  };

  const handleUpdateStatementStatus = async (statement: Statement, status: Statement['status']) => {
    if (!usingSupabaseActivityData) return;

    try {
      await updateStatementStatus(statement.supabaseId ?? statement.id, status);
      setSupabaseStatements((previous) =>
        (previous ?? []).map((row) => (row.id === statement.id ? { ...row, status } : row)),
      );
      setFlash(status === 'closed' ? 'Statement closed in Supabase.' : 'Statement updated in Supabase.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Statement could not be updated'));
    }
  };

  const handleCreateTransaction = async (
    statement: Statement,
    dealer: Dealer,
    input: CreateTransactionInput,
  ) => {
    if (!usingSupabaseActivityData) return;

    try {
      const created = await createSupabaseTransaction({ dealer, statement, input, role });
      setSupabaseTransactions((previous) => [created, ...(previous ?? [])]);
      setFlash(role === 'admin' ? 'Transaction added and confirmed in Supabase.' : 'Transaction submitted for admin review.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Transaction could not be created'));
    }
  };

  const handleTransactionStatus = async (transactionId: string, status: TransactionStatus) => {
    if (!usingSupabaseActivityData) return;

    try {
      if (status === 'confirmed') {
        await approveTransaction(transactionId);
      } else if (status === 'rejected') {
        await rejectTransaction(transactionId);
      }
      setSupabaseTransactions((previous) =>
        (previous ?? []).map((transaction) =>
          transaction.id === transactionId ? { ...transaction, status } : transaction,
        ),
      );
      setFlash(status === 'confirmed' ? 'Transaction approved.' : 'Transaction rejected.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Transaction status could not be updated'));
    }
  };

  const handleRecordDealerPayment = async (input: RecordDealerPaymentInput) => {
    if (!usingSupabaseDealerPaymentData) return;

    try {
      const recorded = await recordDealerPaymentWithAllocations(input);
      setSupabaseDealerPayments((previous) => [recorded.payment, ...(previous ?? [])]);
      setSupabaseDealerPaymentAllocations((previous) => [
        ...(previous ?? []),
        ...recorded.allocations,
      ]);
      setFlash('Dealer payment recorded and allocated in Supabase.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Dealer payment could not be recorded'));
    }
  };

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
    ? usingSupabaseActivityData
      ? 'Supabase statements, transactions & dealer payments · Local employee commissions'
      : 'Supabase reference data · Local settlement activity'
    : auth.authEnabled
      ? 'Mock reference data · Local settlement activity'
      : 'Demo mode · Local settlement activity';
  const dataSourceError = [referenceError, activityError, dealerPaymentError].filter(Boolean).join(' ');
  const referenceStatusLabel = referenceLoading
    ? 'Loading Supabase reference data'
    : activityLoading
      ? 'Loading Supabase statements & transactions'
      : dealerPaymentLoading
        ? 'Loading Supabase dealer payments'
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
              dataSourceError={dataSourceError}
            />
          )
        }
      >
        <Route index element={<DashboardPage dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} allocations={activeDealerPaymentAllocations} role={role} employee={{ ...employee, assignments: visibleEmployeeAssignments }} employeeCommissions={role === 'employee' ? employeeVisibleCommissions : employeeCommissions} employeePaymentAllocations={employeePaymentAllocations} dealerPayments={activeDealerPayments} employeePayments={employeePayments} />} />
        <Route path="dealers" element={<DealersPage dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} allocations={activeDealerPaymentAllocations} storeIds={role === 'employee' ? assignedStoreIds : undefined} />} />
        <Route path="dealers/:dealerId" element={<DealerProfilePage role={role} assignedStoreIds={assignedStoreIds} addTransactionStoreIds={addTransactionStoreIds} dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} setStatements={setActiveStatements} setFlash={setFlash} payments={activeDealerPayments} allocations={activeDealerPaymentAllocations} setPayments={setDealerPayments} setAllocations={setDealerPaymentAllocations} employees={employeesWithAssignments} employeeCommissions={employeeCommissions} setEmployeeCommissions={setEmployeeCommissions} onCreateStatement={usingSupabaseActivityData ? handleCreateStatement : undefined} onUpdateStatementStatus={usingSupabaseActivityData ? handleUpdateStatementStatus : undefined} onRecordDealerPayment={usingSupabaseDealerPaymentData ? handleRecordDealerPayment : undefined} />} />
        <Route path="statements/:statementId" element={<StatementDetailPage role={role} assignedStoreIds={assignedStoreIds} addTransactionStoreIds={addTransactionStoreIds} dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} setTransactions={setActiveTransactions} setFlash={setFlash} allocations={activeDealerPaymentAllocations} employees={employeesWithAssignments} onCreateTransaction={usingSupabaseActivityData ? handleCreateTransaction : undefined} />} />
        <Route path="transactions" element={role === 'admin' ? <TransactionsPage role={role} assignedStoreIds={assignedStoreIds} dealers={activeDealers} transactions={activeTransactions} setTransactions={setActiveTransactions} setFlash={setFlash} onUpdateTransactionStatus={usingSupabaseActivityData ? handleTransactionStatus : undefined} /> : <Navigate to="/" replace />} />
        <Route path="employees" element={role === 'admin' ? <EmployeesPage employees={employeesWithAssignments} dealers={activeDealers} commissions={employeeCommissions} allocations={employeePaymentAllocations} /> : <Navigate to="/" replace />} />
        <Route path="employees/:employeeId" element={<EmployeeProfilePage role={role} employees={employeesWithAssignments} dealers={activeDealers} commissions={employeeCommissions} payments={employeePayments} allocations={employeePaymentAllocations} setPayments={setEmployeePayments} setAllocations={setEmployeePaymentAllocations} setCommissions={setEmployeeCommissions} setFlash={setFlash} />} />
        <Route path="assignments" element={role === 'admin' ? <AssignmentsPage employees={employeesWithAssignments} dealers={activeDealers} onUpdateAssignment={updateAssignment} /> : <Navigate to="/" replace />} />
        <Route path="settings" element={role === 'admin' ? <SettingsPage onResetDemoData={resetDemoData} /> : <Navigate to="/" replace />} />
        <Route path="my-commissions" element={<MyCommissionsPage role={role} employee={employee} dealers={activeDealers} commissions={role === 'employee' ? employeeVisibleCommissions : employeeCommissions} payments={employeePayments} allocations={employeePaymentAllocations} />} />
      </Route>
    </Routes>
  );
}
