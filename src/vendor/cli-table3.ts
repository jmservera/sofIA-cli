// Minimal stub for cli-table3
export default class Table {
  private rows: any[][] = [];
  constructor(_opts?: any) {}
  push(...rows: any[][]) {
    this.rows.push(...rows);
  }
  toString() {
    return this.rows.map((row) => row.join(' | ')).join('\n');
  }
}
