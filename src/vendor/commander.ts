// Minimal stub for commander
export class Command {
  private actions: Record<string, Function> = {};
  private options: any = {};
  name(_n: string) { return this; }
  description(_d: string) { return this; }
  version(_v: string) { return this; }
  option(_flags: string, _desc?: string) { return this; }
  argument(_name: string, _desc?: string) { return this; }
  command(_name: string) { return this; }
  action(fn: Function) { this.actions['default'] = fn; return this; }
  parseAsync(_argv: string[]) { return Promise.resolve(); }
}
