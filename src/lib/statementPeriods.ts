import { Statement } from '../types';

export function getStatementPeriodBounds(statement: Pick<Statement, 'month'>) {
  const [yearText, monthText] = statement.month.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { min: statement.month, max: statement.month, label: statement.month };
  }

  const lastDay = new Date(year, month, 0).getDate();
  const paddedMonth = String(month).padStart(2, '0');
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return {
    min: `${year}-${paddedMonth}-01`,
    max: `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
    label,
  };
}

export function isDateWithinStatementPeriod(date: string, statement: Pick<Statement, 'month'>) {
  const { min, max } = getStatementPeriodBounds(statement);
  return date >= min && date <= max;
}

export function defaultDateForStatement(statement: Pick<Statement, 'month'>) {
  const today = new Date().toISOString().slice(0, 10);
  return isDateWithinStatementPeriod(today, statement) ? today : getStatementPeriodBounds(statement).min;
}

export function statementPeriodDateMessage(statement: Pick<Statement, 'month'>) {
  const { min, max, label } = getStatementPeriodBounds(statement);
  return `Transaction date must be within the statement period. This statement is for ${label}. Please select a date between ${min} and ${max}.`;
}
