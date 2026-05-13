import { Navigate, Route, Routes } from 'react-router-dom';
import { type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { dealers, employees, initialStatements, initialTransactions } from './data/mockData';
import { Assignment, Dealer, DealerPayment, DealerPaymentAllocation, Employee, EmployeeCommission, EmployeePayment, EmployeePaymentAllocation, PendingOrderCost, PendingOrderCostScope, Role, SettlementTransaction, Statement, TransactionStatus } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { DealersPage } from './pages/DealersPage';
import { AssignmentsPage, DealerProfilePage, EmployeeProfilePage, EmployeesPage, MyCommissionsPage, SettingsPage, StatementDetailPage, TransactionsPage } from './pages/PlaceholderPages';
import { clearAppStorage, loadFromStorage, saveToStorage } from './lib/persistence';
import { generateEmployeeCommissionsForStatements, sortStatementsByPeriod } from './lib/statementCalculations';
import { useAuth } from './auth/AuthContext';
import { LoginPage, SignupPage } from './pages/AuthPages';
import {
  createEmployeeStoreAssignment,
  DealerUpdate,
  EmployeeAssignmentState,
  fetchFinancialReferenceData,
  FinancialReferenceData,
  updateFinancialDealer,
  updateEmployeeStoreAssignment,
} from './lib/financialReferenceService';
import {
  approveTransaction,
  createStatement as createSupabaseStatement,
  createPendingOrderCost,
  createTransaction as createSupabaseTransaction,
  cancelPendingOrderCost as cancelSupabasePendingOrderCost,
  deleteTransactionSafely,
  deleteStatementSafely as deleteSupabaseStatementSafely,
  fetchDealerPaymentAllocations,
  fetchDealerPayments,
  fetchEmployeeCommissions,
  fetchEmployeePaymentAllocations,
  fetchEmployeePayments,
  fetchStatements,
  fetchTransactions,
  fetchPendingOrderCosts,
  createOrUpdateEmployeeCommissions,
  recordDealerPaymentWithAllocations,
  recordEmployeePaymentWithAllocations,
  resolvePendingOrderCost as resolveSupabasePendingOrderCost,
  updatePendingOrderCost as updateSupabasePendingOrderCost,
  rejectTransaction,
  updateTransaction as updateSupabaseTransaction,
  updateStatementStatus,
  type CreateTransactionInput,
  type PendingOrderCostInput,
  type PendingOrderCostUpdateInput,
  type ResolvePendingOrderCostInput,
  type RecordDealerPaymentInput,
  type RecordEmployeePaymentInput,
  type UpdateTransactionInput,
} from './lib/settlementActivityService';

const initialEmployeeCommissions = generateEmployeeCommissionsForStatements(
  initialStatements,
  dealers,
  employees,
  initialTransactions,
);

const EMPTY_STATEMENTS: Statement[] = [];
const EMPTY_TRANSACTIONS: SettlementTransaction[] = [];
const EMPTY_DEALER_PAYMENTS: DealerPayment[] = [];
const EMPTY_DEALER_PAYMENT_ALLOCATIONS: DealerPaymentAllocation[] = [];
const EMPTY_EMPLOYEE_COMMISSIONS: EmployeeCommission[] = [];
const EMPTY_EMPLOYEE_PAYMENTS: EmployeePayment[] = [];
const EMPTY_EMPLOYEE_PAYMENT_ALLOCATIONS: EmployeePaymentAllocation[] = [];
const EMPTY_PENDING_ORDER_COSTS: PendingOrderCost[] = [];

const normalizeAssignment = (assignment: Assignment): Assignment => ({
  storeId: assignment.storeId,
  dealerId: assignment.dealerId,
  commissionRatePct: Number(assignment.commissionRatePct) || 0,
  canViewTransactions: assignment.canViewTransactions ?? true,
  canAddTransactions: assignment.canAddTransactions ?? true,
  canEditTransactions: assignment.canEditTransactions ?? false,
  canDeleteTransactions: assignment.canDeleteTransactions ?? false,
  canViewCommission: assignment.canViewCommission ?? true,
  transactionApprovalMode: assignment.transactionApprovalMode ?? 'pending_review',
  status: assignment.status ?? 'active',
  supabaseId: assignment.supabaseId,
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

const commissionKey = (commission: Pick<EmployeeCommission, 'employeeId' | 'statementId'>) =>
  `${commission.employeeId}:${commission.statementId}`;

const mergeEmployeeCommissions = (
  current: EmployeeCommission[],
  updates: EmployeeCommission[],
): EmployeeCommission[] => {
  const updateByKey = new Map(updates.map((commission) => [commissionKey(commission), commission]));
  const seen = new Set<string>();
  const merged = current.map((commission) => {
    const key = commissionKey(commission);
    const update = updateByKey.get(key);
    if (!update) return commission;
    seen.add(key);
    return update;
  });

  return [...merged, ...updates.filter((commission) => !seen.has(commissionKey(commission)))];
};

const commissionNeedsSync = (existing: EmployeeCommission | undefined, next: EmployeeCommission) => {
  if (!existing) return true;
  if (['paid', 'partially_paid'].includes(existing.status)) return false;
  const nextWithExistingRate = prepareCommissionForSync(existing, next);

  // Rate edits apply to future generated rows only. Existing open rows should
  // update only when the statement calculation base changes.
  return (
    existing.companyShareAmount !== next.companyShareAmount ||
    existing.printingCosts !== next.printingCosts ||
    existing.shippingCosts !== next.shippingCosts ||
    existing.commissionBaseAdjustments !== next.commissionBaseAdjustments ||
    existing.commissionBase !== next.commissionBase ||
    Math.abs(existing.commissionAmount - nextWithExistingRate.commissionAmount) > 0.001 ||
    Math.abs(existing.remainingAmount - nextWithExistingRate.remainingAmount) > 0.001 ||
    existing.status !== nextWithExistingRate.status
  );
};

const prepareCommissionForSync = (
  existing: EmployeeCommission | undefined,
  next: EmployeeCommission,
): EmployeeCommission => {
  if (!existing) return next;

  const commissionAmount = Math.max(next.commissionBase * existing.commissionRate, 0);
  const remainingAmount = Math.max(commissionAmount - existing.paidAmount, 0);
  const status =
    remainingAmount === 0
      ? commissionAmount > 0
        ? 'paid'
        : 'closed'
      : existing.paidAmount > 0
        ? 'partially_paid'
        : 'open';

  return {
    ...next,
    id: existing.id,
    supabaseId: existing.supabaseId,
    commissionRate: existing.commissionRate,
    commissionAmount,
    paidAmount: existing.paidAmount,
    remainingAmount,
    status,
    createdAt: existing.createdAt,
  };
};

export function App() {
  const auth = useAuth();
  const [demoRole, setDemoRole] = useState<Role>(() => loadFromStorage<Role>('role', 'admin'));
  const [localDealers, setLocalDealers] = useState<Dealer[]>(() => loadFromStorage('dealers', dealers));
  // TODO: Replace localStorage persistence with Supabase persistence in production.
  const [statements, setStatements] = useState<Statement[]>(() => loadFromStorage('statements', initialStatements));
  const [transactions, setTransactions] = useState<SettlementTransaction[]>(() => loadFromStorage('transactions', initialTransactions));
  const [flash, setFlash] = useState<string>('');
  const [dealerPayments, setDealerPayments] = useState<DealerPayment[]>(() => loadFromStorage('dealerPayments', []));
  const [dealerPaymentAllocations, setDealerPaymentAllocations] = useState<DealerPaymentAllocation[]>(() => loadFromStorage('dealerPaymentAllocations', []));
  const [employeeCommissions, setEmployeeCommissions] = useState<EmployeeCommission[]>(() => loadFromStorage('employeeCommissions', initialEmployeeCommissions));
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>(() => loadFromStorage('employeePayments', []));
  const [employeePaymentAllocations, setEmployeePaymentAllocations] = useState<EmployeePaymentAllocation[]>(() => loadFromStorage('employeePaymentAllocations', []));
  const [pendingOrderCosts, setPendingOrderCosts] = useState<PendingOrderCost[]>(() => loadFromStorage('pendingOrderCosts', []));
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
  const [supabaseEmployeeCommissions, setSupabaseEmployeeCommissions] = useState<EmployeeCommission[] | null>(null);
  const [supabaseEmployeePayments, setSupabaseEmployeePayments] = useState<EmployeePayment[] | null>(null);
  const [supabaseEmployeePaymentAllocations, setSupabaseEmployeePaymentAllocations] = useState<EmployeePaymentAllocation[] | null>(null);
  const [supabasePendingOrderCosts, setSupabasePendingOrderCosts] = useState<PendingOrderCost[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [dealerPaymentLoading, setDealerPaymentLoading] = useState(false);
  const [dealerPaymentError, setDealerPaymentError] = useState('');
  const [employeeSettlementLoading, setEmployeeSettlementLoading] = useState(false);
  const commissionSyncTriggeredByUserRef = useRef(false);
  const [commissionSyncStatus, setCommissionSyncStatus] = useState<'not_run' | 'ok' | 'failed'>('not_run');

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
  const activeDealers = usingSupabaseReferenceData ? supabaseReferenceData!.dealers : localDealers;
  const baseEmployees = usingSupabaseReferenceData ? supabaseReferenceData!.employees : employees;
  const activeAssignmentState = usingSupabaseReferenceData ? supabaseAssignmentState! : employeeAssignments;

  useEffect(() => {
    if (!usingSupabaseReferenceData) {
      setSupabaseStatements(null);
      setSupabaseTransactions(null);
      setSupabasePendingOrderCosts(null);
      setSupabaseDealerPayments(null);
      setSupabaseDealerPaymentAllocations(null);
      setSupabaseEmployeeCommissions(null);
      setSupabaseEmployeePayments(null);
      setSupabaseEmployeePaymentAllocations(null);
      setActivityError('');
      setDealerPaymentError('');
      setActivityLoading(false);
      setDealerPaymentLoading(false);
      setEmployeeSettlementLoading(false);
      setCommissionSyncStatus('not_run');
      return;
    }

    let active = true;
    setActivityLoading(true);
    setActivityError('');

    const loadActivity = async () => {
      const nextStatements = await fetchStatements(activeDealers);
      const nextTransactions = await fetchTransactions(activeDealers, nextStatements);
      const nextPendingOrderCosts = await fetchPendingOrderCosts(activeDealers, nextStatements);
      return { nextStatements, nextTransactions, nextPendingOrderCosts };
    };

    loadActivity()
      .then(({ nextStatements, nextTransactions, nextPendingOrderCosts }) => {
        if (!active) return;
        setSupabaseStatements(nextStatements);
        setSupabaseTransactions(nextTransactions);
        setSupabasePendingOrderCosts(nextPendingOrderCosts);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Failed to load Supabase statements and transactions.', error);
        setActivityError('Supabase statements and transactions could not be loaded. Keeping any previously loaded Supabase settlement activity.');
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
      supabaseTransactions,
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
  const activeStatements = usingSupabaseReferenceData ? supabaseStatements ?? EMPTY_STATEMENTS : statements;
  const activeTransactions = usingSupabaseReferenceData ? supabaseTransactions ?? EMPTY_TRANSACTIONS : transactions;
  const activePendingOrderCosts = usingSupabaseReferenceData
    ? supabasePendingOrderCosts ?? EMPTY_PENDING_ORDER_COSTS
    : pendingOrderCosts;
  const activeDealerPayments = usingSupabaseReferenceData
    ? supabaseDealerPayments ?? EMPTY_DEALER_PAYMENTS
    : dealerPayments;
  const activeDealerPaymentAllocations = usingSupabaseReferenceData
    ? supabaseDealerPaymentAllocations ?? EMPTY_DEALER_PAYMENT_ALLOCATIONS
    : dealerPaymentAllocations;
  const employeesWithAssignments = useMemo(
    () => hydrateEmployeesWithAssignments(baseEmployees, activeAssignmentState),
    [activeAssignmentState, baseEmployees],
  );
  useEffect(() => {
    if (!usingSupabaseDealerPaymentData) {
      setSupabaseEmployeeCommissions(null);
      setSupabaseEmployeePayments(null);
      setSupabaseEmployeePaymentAllocations(null);
      setEmployeeSettlementLoading(false);
      setCommissionSyncStatus('not_run');
      return;
    }

    let active = true;
    setEmployeeSettlementLoading(true);

    const loadEmployeeSettlements = async () => {
      const nextCommissions = await fetchEmployeeCommissions({
        employees: employeesWithAssignments,
        dealers: activeDealers,
        statements: activeStatements,
      });
      const [nextPayments, nextAllocations] = await Promise.all([
        fetchEmployeePayments(employeesWithAssignments),
        fetchEmployeePaymentAllocations(nextCommissions),
      ]);
      return { nextCommissions, nextPayments, nextAllocations };
    };

    loadEmployeeSettlements()
      .then(({ nextCommissions, nextPayments, nextAllocations }) => {
        if (!active) return;
        setSupabaseEmployeeCommissions(nextCommissions);
        setSupabaseEmployeePayments(nextPayments);
        setSupabaseEmployeePaymentAllocations(nextAllocations);
        setCommissionSyncStatus('ok');
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Failed to load Supabase employee settlements.', error);
        setCommissionSyncStatus('failed');
      })
      .finally(() => {
        if (active) setEmployeeSettlementLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeDealers, activeStatements, employeesWithAssignments, usingSupabaseDealerPaymentData]);

  const usingSupabaseEmployeeSettlementData = usingSupabaseDealerPaymentData;
  const activeEmployeeCommissions = usingSupabaseEmployeeSettlementData
    ? supabaseEmployeeCommissions ?? EMPTY_EMPLOYEE_COMMISSIONS
    : usingSupabaseReferenceData
      ? EMPTY_EMPLOYEE_COMMISSIONS
      : employeeCommissions;
  const activeEmployeePayments = usingSupabaseEmployeeSettlementData
    ? supabaseEmployeePayments ?? EMPTY_EMPLOYEE_PAYMENTS
    : usingSupabaseReferenceData
      ? EMPTY_EMPLOYEE_PAYMENTS
      : employeePayments;
  const activeEmployeePaymentAllocations = usingSupabaseEmployeeSettlementData
    ? supabaseEmployeePaymentAllocations ?? EMPTY_EMPLOYEE_PAYMENT_ALLOCATIONS
    : usingSupabaseReferenceData
      ? EMPTY_EMPLOYEE_PAYMENT_ALLOCATIONS
      : employeePaymentAllocations;
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
        .filter(
          (assignment) =>
            assignment.status === 'active' &&
            assignment.canViewTransactions &&
            assignment.canAddTransactions,
        )
        .map((assignment) => assignment.storeId),
    [employee.assignments],
  );
  const confirmedTransactionStoreIds = useMemo(
    () =>
      employee.assignments
        .filter(
          (assignment) =>
            assignment.status === 'active' &&
            assignment.canViewTransactions &&
            assignment.canAddTransactions &&
            assignment.transactionApprovalMode === 'confirmed',
        )
        .map((assignment) => assignment.storeId),
    [employee.assignments],
  );
  const editTransactionStoreIds = useMemo(
    () =>
      employee.assignments
        .filter(
          (assignment) =>
            assignment.status === 'active' &&
            assignment.canViewTransactions &&
            assignment.canEditTransactions,
        )
        .map((assignment) => assignment.storeId),
    [employee.assignments],
  );
  const deleteTransactionStoreIds = useMemo(
    () =>
      employee.assignments
        .filter(
          (assignment) =>
            assignment.status === 'active' &&
            assignment.canViewTransactions &&
            assignment.canDeleteTransactions,
        )
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
      activeEmployeeCommissions.filter((commission) => {
        const dealer = activeDealers.find((row) => row.id === commission.dealerId);
        return dealer ? commissionStoreIds.includes(dealer.storeId) : false;
      }),
    [activeDealers, activeEmployeeCommissions, commissionStoreIds],
  );
  const role: Role = auth.authEnabled ? (auth.isAdmin ? 'admin' : 'employee') : demoRole;
  const roleLabel = auth.authEnabled
    ? auth.roles.length > 0
      ? auth.roles.join(', ')
      : 'No role assigned'
    : 'Demo role switcher';

  useEffect(() => { saveToStorage('dealers', localDealers); }, [localDealers]);
  useEffect(() => { saveToStorage('statements', statements); }, [statements]);
  useEffect(() => { saveToStorage('transactions', transactions); }, [transactions]);
  useEffect(() => { saveToStorage('role', demoRole); }, [demoRole]);
  useEffect(() => { saveToStorage('dealerPayments', dealerPayments); }, [dealerPayments]);
  useEffect(() => { saveToStorage('dealerPaymentAllocations', dealerPaymentAllocations); }, [dealerPaymentAllocations]);
  useEffect(() => { saveToStorage('employeeCommissions', employeeCommissions); }, [employeeCommissions]);
  useEffect(() => { saveToStorage('employeePayments', employeePayments); }, [employeePayments]);
  useEffect(() => { saveToStorage('employeePaymentAllocations', employeePaymentAllocations); }, [employeePaymentAllocations]);
  useEffect(() => { saveToStorage('pendingOrderCosts', pendingOrderCosts); }, [pendingOrderCosts]);
  useEffect(() => { saveToStorage('employeeAssignments', employeeAssignments); }, [employeeAssignments]);
  useEffect(() => {
    if (usingSupabaseEmployeeSettlementData) return;

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
  }, [activeDealers, activeStatements, activeTransactions, employeesWithAssignments, usingSupabaseEmployeeSettlementData]);

  useEffect(() => {
    if (
      !usingSupabaseEmployeeSettlementData ||
      !auth.isAdmin ||
      employeeSettlementLoading ||
      supabaseEmployeeCommissions === null
    ) {
      return;
    }

    const generated = generateEmployeeCommissionsForStatements(
      activeStatements,
      activeDealers,
      employeesWithAssignments,
      activeTransactions,
      supabaseEmployeeCommissions,
    );
    const existingByKey = new Map(supabaseEmployeeCommissions.map((commission) => [commissionKey(commission), commission]));
    const commissionsToSync = generated
      .filter((commission) =>
        commissionNeedsSync(existingByKey.get(commissionKey(commission)), commission),
      )
      .map((commission) =>
        prepareCommissionForSync(existingByKey.get(commissionKey(commission)), commission),
      );

    if (commissionsToSync.length === 0) {
      if (commissionSyncTriggeredByUserRef.current) {
        commissionSyncTriggeredByUserRef.current = false;
        setCommissionSyncStatus('ok');
      }
      return;
    }

    let active = true;
    const userTriggeredSync = commissionSyncTriggeredByUserRef.current;
    createOrUpdateEmployeeCommissions({
      commissions: commissionsToSync,
      employees: employeesWithAssignments,
      dealers: activeDealers,
      statements: activeStatements,
    })
      .then((synced) => {
        if (!active) return;
        setSupabaseEmployeeCommissions((previous) => mergeEmployeeCommissions(previous ?? [], synced));
        setCommissionSyncStatus('ok');
        if (userTriggeredSync) {
          commissionSyncTriggeredByUserRef.current = false;
        }
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Failed to sync Supabase employee commissions.', {
          error,
          rowsAttempted: commissionsToSync.map((commission) => ({
            employeeId: commission.employeeId,
            dealerId: commission.dealerId,
            statementId: commission.statementId,
            period: `${commission.periodYear}-${String(commission.periodMonth).padStart(2, '0')}`,
            commissionBase: commission.commissionBase,
            commissionRate: commission.commissionRate,
            commissionAmount: commission.commissionAmount,
            status: commission.status,
          })),
        });
        setCommissionSyncStatus('failed');
        if (userTriggeredSync) {
          commissionSyncTriggeredByUserRef.current = false;
          setFlash('Statement updated, but commission sync could not be completed. Please refresh or try again.');
        }
      });

    return () => {
      active = false;
    };
  }, [
    activeDealers,
    activeStatements,
    activeTransactions,
    auth.isAdmin,
    employeeSettlementLoading,
    employeesWithAssignments,
    supabaseEmployeeCommissions,
    usingSupabaseEmployeeSettlementData,
  ]);

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

  const friendlyTransactionDeleteError = (error: unknown) => {
    if (
      error instanceof Error &&
      error.message === 'This transaction cannot be deleted because the statement has paid employee commissions.'
    ) {
      return error.message;
    }
    console.warn('Transaction delete failed.', error);
    return 'Transaction could not be deleted. Please try again.';
  };

  const removeOpenCommissionsForStatement = (previous: EmployeeCommission[], statementId: string) =>
    previous.filter(
      (commission) =>
        commission.statementId !== statementId ||
        ['paid', 'partially_paid'].includes(commission.status) ||
        commission.paidAmount > 0,
    );

  const getPendingCostStatus = (
    scope: PendingOrderCostScope,
    finalPrintingCost?: number | null,
    finalShippingCost?: number | null,
  ): PendingOrderCost['status'] => {
    const printingResolved = (finalPrintingCost ?? 0) > 0;
    const shippingResolved = (finalShippingCost ?? 0) > 0;
    if (scope === 'printing') return printingResolved ? 'resolved' : 'pending';
    if (scope === 'shipping') return shippingResolved ? 'resolved' : 'pending';
    if (printingResolved && shippingResolved) return 'resolved';
    if (printingResolved || shippingResolved) return 'partially_resolved';
    return 'pending';
  };

  const replacePendingCost = (rows: PendingOrderCost[], next: PendingOrderCost) =>
    rows.map((row) => (row.id === next.id ? next : row));

  const handleCreateStatement = async (dealer: Dealer, month: string) => {
    if (!usingSupabaseActivityData) return;

    try {
      const created = await createSupabaseStatement(dealer, month);
      setSupabaseStatements((previous) => sortStatementsByPeriod([...(previous ?? []), created]));
      setFlash('Statement created in Supabase.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Statement could not be created'));
    }
  };

  const handleUpdateStatementStatus = async (statement: Statement, status: Statement['status']) => {
    if (!usingSupabaseActivityData) return;

    try {
      await updateStatementStatus(statement.supabaseId ?? statement.id, status);
      commissionSyncTriggeredByUserRef.current = true;
      setSupabaseStatements((previous) =>
        (previous ?? []).map((row) => (row.id === statement.id ? { ...row, status } : row)),
      );
      setFlash(status === 'closed' ? 'Statement closed in Supabase.' : 'Statement updated in Supabase.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Statement could not be updated'));
    }
  };

  const pruneDeletedStatementState = (statement: Statement) => {
    const canRemoveCommission = (commission: EmployeeCommission) =>
      commission.statementId !== statement.id ||
      ['paid', 'partially_paid'].includes(commission.status) ||
      commission.paidAmount > 0;

    if (usingSupabaseActivityData) {
      setSupabaseStatements((previous) => (previous ?? []).filter((row) => row.id !== statement.id));
      setSupabaseTransactions((previous) =>
        (previous ?? []).filter((transaction) => transaction.statementId !== statement.id),
      );
      setSupabaseEmployeeCommissions((previous) => (previous ?? []).filter(canRemoveCommission));
      return;
    }

    setStatements((previous) => previous.filter((row) => row.id !== statement.id));
    setTransactions((previous) => previous.filter((transaction) => transaction.statementId !== statement.id));
    setEmployeeCommissions((previous) => previous.filter(canRemoveCommission));
  };

  const handleDeleteStatement = async (statement: Statement) => {
    if (role !== 'admin') return false;

    const dealerAllocationExists = activeDealerPaymentAllocations.some(
      (allocation) => allocation.statementId === statement.id,
    );
    if (dealerAllocationExists) {
      setFlash('This statement has dealer payment allocations and cannot be deleted. Remove related payment allocations first.');
      return false;
    }

    const commissionsForStatement = activeEmployeeCommissions.filter(
      (commission) => commission.statementId === statement.id,
    );
    const commissionIds = new Set(commissionsForStatement.map((commission) => commission.id));
    const hasEmployeePaymentAllocation = activeEmployeePaymentAllocations.some((allocation) =>
      commissionIds.has(allocation.commissionId),
    );
    const hasPaidCommission = commissionsForStatement.some(
      (commission) =>
        ['paid', 'partially_paid'].includes(commission.status) ||
        commission.paidAmount > 0 ||
        hasEmployeePaymentAllocation,
    );

    if (hasPaidCommission) {
      setFlash('This statement has paid employee commissions and cannot be deleted.');
      return false;
    }

    if (!window.confirm('Delete this statement? This will also delete related transactions and unpaid commission rows. This action cannot be undone.')) {
      return false;
    }

    try {
      if (usingSupabaseActivityData) {
        await deleteSupabaseStatementSafely(statement.supabaseId ?? statement.id);
      }
      pruneDeletedStatementState(statement);
      setFlash('Statement deleted.');
      return true;
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Statement could not be deleted'));
      return false;
    }
  };

  const handleCreateTransaction = async (
    statement: Statement,
    dealer: Dealer,
    input: CreateTransactionInput,
  ) => {
    if (!usingSupabaseActivityData) return;

    try {
      const status: TransactionStatus =
        role === 'admin' || confirmedTransactionStoreIds.includes(dealer.storeId)
          ? 'confirmed'
          : 'pending_review';
      const created = await createSupabaseTransaction({ dealer, statement, input: { ...input, status }, role });
      setSupabaseTransactions((previous) => [created, ...(previous ?? [])]);
      setFlash(status === 'confirmed' ? 'Transaction added and confirmed in Supabase.' : 'Transaction submitted for admin review.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Transaction could not be created'));
      throw error;
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

  const canCurrentUserMutateTransaction = (
    transaction: SettlementTransaction,
    action: 'edit' | 'delete',
  ) => {
    if (role === 'admin') return true;
    const dealer = activeDealers.find((row) => row.id === transaction.dealerId);
    if (!dealer) return false;
    const allowedStores = action === 'edit' ? editTransactionStoreIds : deleteTransactionStoreIds;
    if (!allowedStores.includes(dealer.storeId)) return false;
    if (auth.authEnabled) return transaction.createdBy === auth.user?.id;
    return transaction.createdByRole === 'employee';
  };

  const handleUpdateTransaction = async (
    transaction: SettlementTransaction,
    patch: UpdateTransactionInput,
  ) => {
    if (!canCurrentUserMutateTransaction(transaction, 'edit')) {
      setFlash('You do not have permission to edit this transaction.');
      return false;
    }

    try {
      if (usingSupabaseActivityData) {
        const updated = await updateSupabaseTransaction(
          transaction.supabaseId ?? transaction.id,
          patch,
          activeDealers,
          activeStatements,
        );
        if (updated) {
          setSupabaseTransactions((previous) =>
            (previous ?? []).map((row) => (row.id === transaction.id ? updated : row)),
          );
        }
      } else {
        setTransactions((previous) =>
          previous.map((row) => (row.id === transaction.id ? { ...row, ...patch } : row)),
        );
      }
      setFlash('Transaction updated.');
      return true;
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Transaction could not be updated'));
      return false;
    }
  };

  const handleDeleteTransaction = async (transaction: SettlementTransaction) => {
    if (!canCurrentUserMutateTransaction(transaction, 'delete')) {
      setFlash('You do not have permission to delete this transaction.');
      return false;
    }

    const statement = activeStatements.find((row) => row.id === transaction.statementId);
    if (!statement) {
      setFlash('Transaction could not be deleted because the statement was not found.');
      return false;
    }

    const commissionsForStatement = activeEmployeeCommissions.filter(
      (commission) => commission.statementId === statement.id,
    );
    const commissionIds = new Set(commissionsForStatement.map((commission) => commission.id));
    const hasEmployeePaymentAllocation = activeEmployeePaymentAllocations.some((allocation) =>
      commissionIds.has(allocation.commissionId),
    );
    const hasPaidCommission = commissionsForStatement.some(
      (commission) =>
        ['paid', 'partially_paid'].includes(commission.status) ||
        commission.paidAmount > 0 ||
        hasEmployeePaymentAllocation,
    );

    if (hasPaidCommission) {
      setFlash('This transaction cannot be deleted because the statement has paid employee commissions.');
      return false;
    }

    const hasDealerPaymentAllocations = activeDealerPaymentAllocations.some(
      (allocation) => allocation.statementId === statement.id,
    );
    const allocationWarning = hasDealerPaymentAllocations
      ? '\n\nWarning: Deleting this transaction may change a statement that has payment allocations.'
      : '';

    if (
      !window.confirm(
        `Delete this transaction? Statement totals will be recalculated. This action cannot be undone.${allocationWarning}`,
      )
    ) {
      return false;
    }

    try {
      if (usingSupabaseActivityData) {
        await deleteTransactionSafely(
          transaction.supabaseId ?? transaction.id,
          statement.supabaseId ?? statement.id,
        );
        setSupabaseTransactions((previous) =>
          (previous ?? []).filter((row) => row.id !== transaction.id),
        );
        setSupabaseEmployeeCommissions((previous) =>
          removeOpenCommissionsForStatement(previous ?? [], statement.id),
        );
      } else {
        setTransactions((previous) => previous.filter((row) => row.id !== transaction.id));
        setEmployeeCommissions((previous) => removeOpenCommissionsForStatement(previous, statement.id));
      }
      setFlash('Transaction deleted.');
      return true;
    } catch (error) {
      setFlash(friendlyTransactionDeleteError(error));
      return false;
    }
  };

  const handleCreatePendingOrderCost = async (input: PendingOrderCostInput) => {
    if (role === 'employee' && !addTransactionStoreIds.includes(input.dealer.storeId)) {
      setFlash('Pending order cost could not be created for this dealer.');
      throw new Error('Employee cannot add pending costs for this dealer.');
    }

    try {
      if (usingSupabaseActivityData) {
        const created = await createPendingOrderCost(input);
        setSupabasePendingOrderCosts((previous) => [...(previous ?? []), created]);
      } else {
        const created: PendingOrderCost = {
          id: `poc-${Date.now()}`,
          dealerId: input.dealer.id,
          statementId: input.statement?.id ?? null,
          orderCode: input.orderCode,
          costScope: input.costScope,
          estimatedPrintingCost: input.estimatedPrintingCost ?? null,
          estimatedShippingCost: input.estimatedShippingCost ?? null,
          finalPrintingCost: null,
          finalShippingCost: null,
          currency: input.currency,
          exchangeRateToUsd: input.exchangeRateToUsd,
          note: input.note || null,
          status: 'pending',
          createdBy: role,
          resolvedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setPendingOrderCosts((previous) => [...previous, created]);
      }
      setFlash('Pending order cost created.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Pending order cost could not be created'));
      throw error;
    }
  };

  const handleUpdatePendingOrderCost = async (
    pendingCost: PendingOrderCost,
    updates: PendingOrderCostUpdateInput,
  ) => {
    if (role !== 'admin') return;

    try {
      if (usingSupabaseActivityData) {
        const updated = await updateSupabasePendingOrderCost(
          pendingCost.supabaseId ?? pendingCost.id,
          updates,
          activeDealers,
          activeStatements,
        );
        setSupabasePendingOrderCosts((previous) => replacePendingCost(previous ?? [], updated));
      } else {
        setPendingOrderCosts((previous) =>
          replacePendingCost(previous, {
            ...pendingCost,
            ...updates,
            updatedAt: new Date().toISOString(),
          }),
        );
      }
      setFlash('Pending order cost saved.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Pending order cost could not be saved'));
      throw error;
    }
  };

  const handleCancelPendingOrderCost = async (pendingCost: PendingOrderCost) => {
    if (role !== 'admin') return;

    try {
      if (usingSupabaseActivityData) {
        const updated = await cancelSupabasePendingOrderCost(
          pendingCost.supabaseId ?? pendingCost.id,
          activeDealers,
          activeStatements,
        );
        setSupabasePendingOrderCosts((previous) => replacePendingCost(previous ?? [], updated));
      } else {
        setPendingOrderCosts((previous) =>
          replacePendingCost(previous, {
            ...pendingCost,
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          }),
        );
      }
      setFlash('Pending order cost cancelled.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Pending order cost could not be cancelled'));
      throw error;
    }
  };

  const handleResolvePendingOrderCost = async (input: ResolvePendingOrderCostInput) => {
    if (role !== 'admin') return;

    try {
      if (usingSupabaseActivityData) {
        const resolved = await resolveSupabasePendingOrderCost(input);
        setSupabasePendingOrderCosts((previous) => replacePendingCost(previous ?? [], resolved.pendingCost));
        setSupabaseTransactions((previous) => [...resolved.transactions, ...(previous ?? [])]);
      } else {
        const now = new Date().toISOString();
        const transactionDate = now.slice(0, 10);
        const nextTransactions: SettlementTransaction[] = [];
        const existingPrintingResolved = (input.pendingCost.finalPrintingCost ?? 0) > 0;
        const existingShippingResolved = (input.pendingCost.finalShippingCost ?? 0) > 0;
        const nextPrintingCost = input.finalPrintingCost ?? input.pendingCost.finalPrintingCost ?? null;
        const nextShippingCost = input.finalShippingCost ?? input.pendingCost.finalShippingCost ?? null;
        if (!existingPrintingResolved && (nextPrintingCost ?? 0) > 0) {
          const usdAmount = Math.round(((nextPrintingCost ?? 0) * input.exchangeRateToUsd + Number.EPSILON) * 100) / 100;
          nextTransactions.push({
            id: `t-${Date.now()}-printing`,
            dealerId: input.dealer.id,
            statementId: input.statement.id,
            date: transactionDate,
            type: 'printing_cost',
            amount: usdAmount,
            originalAmount: nextPrintingCost ?? 0,
            originalCurrency: input.currency,
            exchangeRateToUsd: input.exchangeRateToUsd,
            usdAmount,
            status: 'confirmed',
            orderCode: input.pendingCost.orderCode,
            description: `Resolved pending printing cost for ${input.pendingCost.orderCode}`,
            createdByRole: 'admin',
          });
        }
        if (!existingShippingResolved && (nextShippingCost ?? 0) > 0) {
          const usdAmount = Math.round(((nextShippingCost ?? 0) * input.exchangeRateToUsd + Number.EPSILON) * 100) / 100;
          nextTransactions.push({
            id: `t-${Date.now()}-shipping`,
            dealerId: input.dealer.id,
            statementId: input.statement.id,
            date: transactionDate,
            type: 'shipping_cost',
            amount: usdAmount,
            originalAmount: nextShippingCost ?? 0,
            originalCurrency: input.currency,
            exchangeRateToUsd: input.exchangeRateToUsd,
            usdAmount,
            status: 'confirmed',
            orderCode: input.pendingCost.orderCode,
            description: `Resolved pending shipping cost for ${input.pendingCost.orderCode}`,
            createdByRole: 'admin',
          });
        }
        const status = getPendingCostStatus(
          input.pendingCost.costScope,
          nextPrintingCost,
          nextShippingCost,
        );
        setTransactions((previous) => [...nextTransactions, ...previous]);
        setPendingOrderCosts((previous) =>
          replacePendingCost(previous, {
            ...input.pendingCost,
            finalPrintingCost: nextPrintingCost,
            finalShippingCost: nextShippingCost,
            currency: input.currency,
            exchangeRateToUsd: input.exchangeRateToUsd,
            status,
            resolvedAt: status === 'resolved' ? now : null,
            updatedAt: now,
          }),
        );
      }
      setFlash('Pending order cost resolved.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Pending order cost could not be resolved'));
      throw error;
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

  const handleRecordEmployeePayment = async (input: RecordEmployeePaymentInput) => {
    if (!usingSupabaseEmployeeSettlementData) return;

    try {
      const recorded = await recordEmployeePaymentWithAllocations(input);
      setSupabaseEmployeePayments((previous) => [recorded.payment, ...(previous ?? [])]);
      setSupabaseEmployeePaymentAllocations((previous) => [
        ...(previous ?? []),
        ...recorded.allocations,
      ]);
      setSupabaseEmployeeCommissions((previous) =>
        mergeEmployeeCommissions(previous ?? [], recorded.commissions),
      );
      setFlash('Employee payment recorded and allocated in Supabase.');
    } catch (error) {
      setFlash(friendlySupabaseError(error, 'Employee payment could not be recorded'));
    }
  };

  const handleRecalculateEmployeeCommissions = async (targetEmployee: Employee) => {
    if (role !== 'admin') return;

    const generated = generateEmployeeCommissionsForStatements(
      activeStatements,
      activeDealers,
      [targetEmployee],
      activeTransactions,
      activeEmployeeCommissions,
    );
    const existingByKey = new Map(activeEmployeeCommissions.map((commission) => [commissionKey(commission), commission]));
    const nextRows = generated.filter((commission) => {
      if (commission.employeeId !== targetEmployee.id) return false;
      const existing = existingByKey.get(commissionKey(commission));
      return !existing || !['paid', 'partially_paid'].includes(existing.status);
    });

    if (usingSupabaseEmployeeSettlementData) {
      try {
        const synced = await createOrUpdateEmployeeCommissions({
          commissions: nextRows,
          employees: employeesWithAssignments,
          dealers: activeDealers,
          statements: activeStatements,
        });
        setSupabaseEmployeeCommissions((previous) => mergeEmployeeCommissions(previous ?? [], synced));
        setCommissionSyncStatus('ok');
        setFlash(
          synced.length === 0
            ? 'No open commission rows needed recalculation.'
            : `${synced.length} commission row${synced.length === 1 ? '' : 's'} recalculated.`,
        );
      } catch (error) {
        console.error('Manual employee commission recalculation failed.', {
          error,
          employeeId: targetEmployee.id,
          employeeSupabaseId: targetEmployee.supabaseId,
          rowsAttempted: nextRows.map((commission) => ({
            employeeId: commission.employeeId,
            dealerId: commission.dealerId,
            statementId: commission.statementId,
            period: `${commission.periodYear}-${String(commission.periodMonth).padStart(2, '0')}`,
            companyShareAmount: commission.companyShareAmount,
            printingCosts: commission.printingCosts,
            shippingCosts: commission.shippingCosts,
            commissionBaseAdjustments: commission.commissionBaseAdjustments,
            commissionBase: commission.commissionBase,
            commissionRate: commission.commissionRate,
            commissionAmount: commission.commissionAmount,
            paidAmount: commission.paidAmount,
            remainingAmount: commission.remainingAmount,
            status: commission.status,
          })),
        });
        setCommissionSyncStatus('failed');
        setFlash('Commission recalculation could not be completed. Please refresh or try again.');
      }
      return;
    }

    setEmployeeCommissions(generated);
    setFlash(
      nextRows.length === 0
        ? 'No open commission rows needed recalculation.'
        : `${nextRows.length} commission row${nextRows.length === 1 ? '' : 's'} recalculated.`,
    );
  };

  const updateAssignment = async (employeeId: string, nextAssignment: Assignment) => {
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
      if (!nextAssignment.supabaseId) {
        setFlash('Assignment could not be saved: missing Supabase assignment id.');
        throw new Error('Missing Supabase assignment id.');
      }

      try {
        const updated = await updateEmployeeStoreAssignment(nextAssignment.supabaseId, nextAssignment);
        const mergedAssignment = normalizeAssignment({
          ...nextAssignment,
          ...updated,
          storeId: nextAssignment.storeId,
          dealerId: nextAssignment.dealerId,
          supabaseId: nextAssignment.supabaseId,
        });
        setSupabaseAssignmentState((previous) => {
          const currentState = previous ?? {};
          const current = currentState[employeeId] || [];
          return {
            ...currentState,
            [employeeId]: current.map((assignment) =>
              assignment.supabaseId === nextAssignment.supabaseId ? mergedAssignment : assignment,
            ),
          };
        });
        setSupabaseReferenceAssignments((previous) => {
          if (!previous) return previous;
          const current = previous[employeeId] || [];
          return {
            ...previous,
            [employeeId]: current.map((assignment) =>
              assignment.supabaseId === nextAssignment.supabaseId ? mergedAssignment : assignment,
            ),
          };
        });
        setFlash('Assignment saved in Supabase.');
      } catch (error) {
        setFlash(friendlySupabaseError(error, 'Assignment could not be saved'));
        throw error;
      }
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

  const createAssignment = async (employeeId: string, nextAssignment: Assignment) => {
    const employeeForAssignment = employeesWithAssignments.find((row) => row.id === employeeId);
    const dealerForAssignment = activeDealers.find((row) => row.id === nextAssignment.dealerId || row.storeId === nextAssignment.storeId);

    if (!employeeForAssignment || !dealerForAssignment) {
      setFlash('Assignment could not be created: employee or dealer was not found.');
      throw new Error('Employee or dealer was not found.');
    }

    const duplicate = employeeForAssignment.assignments.some(
      (assignment) =>
        assignment.storeId === dealerForAssignment.storeId ||
        assignment.dealerId === dealerForAssignment.id,
    );
    if (duplicate) {
      setFlash('This employee is already assigned to this store.');
      throw new Error('This employee is already assigned to this store.');
    }

    const normalizedAssignment = normalizeAssignment({
      ...nextAssignment,
      storeId: dealerForAssignment.storeId,
      dealerId: dealerForAssignment.id,
    });

    if (usingSupabaseReferenceData) {
      if (!employeeForAssignment.supabaseId || !dealerForAssignment.supabaseId) {
        setFlash('Assignment could not be created: missing Supabase ids.');
        throw new Error('Missing Supabase ids.');
      }

      try {
        const created = await createEmployeeStoreAssignment({
          employeeId: employeeForAssignment.supabaseId,
          dealerId: dealerForAssignment.supabaseId,
          commissionRatePct: normalizedAssignment.commissionRatePct,
          canViewTransactions: normalizedAssignment.canViewTransactions,
          canAddTransactions: normalizedAssignment.canAddTransactions,
          canEditTransactions: normalizedAssignment.canEditTransactions,
          canDeleteTransactions: normalizedAssignment.canDeleteTransactions,
          canViewCommission: normalizedAssignment.canViewCommission,
          transactionApprovalMode: normalizedAssignment.transactionApprovalMode,
          status: normalizedAssignment.status,
        });
        const mergedAssignment = normalizeAssignment({
          ...normalizedAssignment,
          ...created,
          storeId: dealerForAssignment.storeId,
          dealerId: dealerForAssignment.id,
        });

        const addToState = (previous: EmployeeAssignmentState | null): EmployeeAssignmentState => {
          const currentState = previous ?? {};
          return {
            ...currentState,
            [employeeId]: [...(currentState[employeeId] || []), mergedAssignment],
          };
        };

        setSupabaseAssignmentState(addToState);
        setSupabaseReferenceAssignments(addToState);
        setFlash('Assignment created.');
      } catch (error) {
        const maybe = error as { code?: string };
        const message = maybe?.code === '23505'
          ? 'This employee is already assigned to this store.'
          : friendlySupabaseError(error, 'Assignment could not be created');
        setFlash(message);
        throw new Error(message);
      }
      return;
    }

    setEmployeeAssignments((previous) => ({
      ...previous,
      [employeeId]: [...(previous[employeeId] || []), normalizedAssignment],
    }));
    setFlash('Assignment created.');
  };

  const updateDealer = async (dealerId: string, updates: DealerUpdate) => {
    const applyDealerUpdate = (current: Dealer, patch: Dealer): Dealer => ({
      ...current,
      ...patch,
      id: current.id,
      storeId: current.storeId,
      supabaseId: current.supabaseId,
    });

    if (usingSupabaseReferenceData) {
      const dealer = activeDealers.find((row) => row.id === dealerId);
      if (!dealer?.supabaseId) {
        setFlash('Dealer could not be saved: missing Supabase dealer id.');
        throw new Error('Missing Supabase dealer id.');
      }

      try {
        const updated = await updateFinancialDealer(dealer.supabaseId, updates);
        setSupabaseReferenceData((previous) =>
          previous
            ? {
                ...previous,
                dealers: previous.dealers.map((row) =>
                  row.id === dealerId ? applyDealerUpdate(row, updated) : row,
                ),
              }
            : previous,
        );
        setFlash('Dealer agreement saved in Supabase.');
      } catch (error) {
        setFlash(friendlySupabaseError(error, 'Dealer could not be saved'));
        throw error;
      }
      return;
    }

    setLocalDealers((previous) =>
      previous.map((dealer) =>
        dealer.id === dealerId
          ? {
              ...dealer,
              ...updates,
              storeName: updates.storeName || updates.name,
            }
          : dealer,
      ),
    );
    setFlash('Dealer agreement saved locally.');
  };

  const resetDemoData = () => {
    if (!window.confirm('Reset demo data? This clears local persisted state.')) return;
    clearAppStorage();
    setStatements(initialStatements);
    setLocalDealers(dealers);
    setTransactions(initialTransactions);
    setDealerPayments([]);
    setDealerPaymentAllocations([]);
    setEmployeeCommissions(initialEmployeeCommissions);
    setEmployeePayments([]);
    setEmployeePaymentAllocations([]);
    setPendingOrderCosts([]);
    setEmployeeAssignments(initialEmployeeAssignments);
    if (usingSupabaseReferenceData && supabaseReferenceAssignments) {
      setSupabaseAssignmentState(supabaseReferenceAssignments);
    }
    setFlash('Demo data reset to seeded defaults.');
  };

  const dataModeLabel = usingSupabaseReferenceData
    ? usingSupabaseActivityData
      ? 'Supabase settlement, commissions & assignments'
      : 'Supabase reference data · Loading settlement activity'
    : auth.authEnabled
      ? 'Mock reference data · Local settlement activity'
      : 'Demo mode · Local settlement activity';
  const dataSourceError = [referenceError, activityError, dealerPaymentError]
    .filter(Boolean)
    .join(' ');
  const referenceStatusLabel = referenceLoading
    ? 'Loading Supabase reference data'
    : activityLoading
      ? 'Loading Supabase statements & transactions'
      : dealerPaymentLoading
        ? 'Loading Supabase dealer payments'
        : employeeSettlementLoading
          ? 'Loading Supabase employee commissions'
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
        <Route index element={<DashboardPage dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} allocations={activeDealerPaymentAllocations} role={role} employee={{ ...employee, assignments: visibleEmployeeAssignments }} employeeCommissions={role === 'employee' ? employeeVisibleCommissions : activeEmployeeCommissions} employeePaymentAllocations={activeEmployeePaymentAllocations} dealerPayments={activeDealerPayments} employeePayments={activeEmployeePayments} pendingOrderCosts={activePendingOrderCosts} />} />
        <Route path="dealers" element={<DealersPage dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} allocations={activeDealerPaymentAllocations} storeIds={role === 'employee' ? assignedStoreIds : undefined} />} />
        <Route path="dealers/:dealerId" element={<DealerProfilePage role={role} assignedStoreIds={assignedStoreIds} addTransactionStoreIds={addTransactionStoreIds} dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} setStatements={setActiveStatements} setFlash={setFlash} payments={activeDealerPayments} allocations={activeDealerPaymentAllocations} setPayments={setDealerPayments} setAllocations={setDealerPaymentAllocations} employees={employeesWithAssignments} employeeCommissions={activeEmployeeCommissions} setEmployeeCommissions={setEmployeeCommissions} pendingOrderCosts={activePendingOrderCosts} onCreateStatement={usingSupabaseActivityData ? handleCreateStatement : undefined} onUpdateStatementStatus={usingSupabaseActivityData ? handleUpdateStatementStatus : undefined} onRecordDealerPayment={usingSupabaseDealerPaymentData ? handleRecordDealerPayment : undefined} onDeleteStatement={handleDeleteStatement} onUpdateDealer={updateDealer} onCreatePendingOrderCost={handleCreatePendingOrderCost} onUpdatePendingOrderCost={handleUpdatePendingOrderCost} onCancelPendingOrderCost={handleCancelPendingOrderCost} onResolvePendingOrderCost={handleResolvePendingOrderCost} />} />
        <Route path="statements/:statementId" element={<StatementDetailPage role={role} assignedStoreIds={assignedStoreIds} addTransactionStoreIds={addTransactionStoreIds} confirmedTransactionStoreIds={confirmedTransactionStoreIds} editTransactionStoreIds={editTransactionStoreIds} deleteTransactionStoreIds={deleteTransactionStoreIds} currentUserId={auth.user?.id} dealers={activeDealers} statements={activeStatements} transactions={activeTransactions} setTransactions={setActiveTransactions} setFlash={setFlash} payments={activeDealerPayments} allocations={activeDealerPaymentAllocations} employees={employeesWithAssignments} pendingOrderCosts={activePendingOrderCosts} onCreateTransaction={usingSupabaseActivityData ? handleCreateTransaction : undefined} onUpdateTransaction={handleUpdateTransaction} onDeleteStatement={handleDeleteStatement} onDeleteTransaction={handleDeleteTransaction} onCreatePendingOrderCost={handleCreatePendingOrderCost} onUpdatePendingOrderCost={handleUpdatePendingOrderCost} onCancelPendingOrderCost={handleCancelPendingOrderCost} onResolvePendingOrderCost={handleResolvePendingOrderCost} />} />
        <Route path="transactions" element={role === 'admin' ? <TransactionsPage role={role} assignedStoreIds={assignedStoreIds} dealers={activeDealers} transactions={activeTransactions} setTransactions={setActiveTransactions} setFlash={setFlash} onUpdateTransactionStatus={usingSupabaseActivityData ? handleTransactionStatus : undefined} onDeleteTransaction={handleDeleteTransaction} /> : <Navigate to="/" replace />} />
        <Route path="employees" element={role === 'admin' ? <EmployeesPage employees={employeesWithAssignments} dealers={activeDealers} commissions={activeEmployeeCommissions} allocations={activeEmployeePaymentAllocations} /> : <Navigate to="/" replace />} />
        <Route path="employees/:employeeId" element={<EmployeeProfilePage role={role} employees={employeesWithAssignments} dealers={activeDealers} transactions={activeTransactions} commissions={activeEmployeeCommissions} payments={activeEmployeePayments} allocations={activeEmployeePaymentAllocations} setPayments={setEmployeePayments} setAllocations={setEmployeePaymentAllocations} setCommissions={setEmployeeCommissions} setFlash={setFlash} onRecordEmployeePayment={usingSupabaseEmployeeSettlementData ? handleRecordEmployeePayment : undefined} onRecalculateCommissions={handleRecalculateEmployeeCommissions} />} />
        <Route path="assignments" element={role === 'admin' ? <AssignmentsPage employees={employeesWithAssignments} dealers={activeDealers} onUpdateAssignment={updateAssignment} onCreateAssignment={createAssignment} /> : <Navigate to="/" replace />} />
        <Route path="settings" element={role === 'admin' ? <SettingsPage onResetDemoData={resetDemoData} dataModeLabel={referenceStatusLabel} commissionSyncStatus={commissionSyncStatus} /> : <Navigate to="/" replace />} />
        <Route path="my-commissions" element={<MyCommissionsPage role={role} employee={employee} dealers={activeDealers} commissions={role === 'employee' ? employeeVisibleCommissions : activeEmployeeCommissions} payments={activeEmployeePayments} allocations={activeEmployeePaymentAllocations} />} />
      </Route>
    </Routes>
  );
}
