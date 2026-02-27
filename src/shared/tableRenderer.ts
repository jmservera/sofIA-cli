/**
 * Table rendering helper using cli-table3.
 */
import Table from 'cli-table3';

export interface TableOptions {
  head?: string[];
  rows: string[][];
  colWidths?: number[];
}

/**
 * Render a table as a string.
 */
export function renderTable(options: TableOptions): string {
  const { head, rows, colWidths } = options;

  const tableOpts: Table.TableConstructorOptions = {};
  if (head) tableOpts.head = head;
  if (colWidths) tableOpts.colWidths = colWidths;

  const table = new Table(tableOpts);
  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}
