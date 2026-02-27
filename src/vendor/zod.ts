// Minimal stub of zod for local testing without npm install.
// Provides just enough for schemas used in this project.
export type ZodType<T> = { parse: (input: any) => T };

const makeType = <T>(checker: (input: any) => boolean) => ({
  parse: (input: any) => {
    if (!checker(input)) throw new Error('Invalid input');
    return input as T;
  },
  optional() {
    return makeType<T | undefined>((val) => val === undefined || checker(val));
  },
  default(val: T) {
    return {
      parse: (input: any) => (input === undefined ? val : checker(input) ? (input as T) : (() => { throw new Error('Invalid default input'); })()),
    } as any;
  },
});

export const z = {
  string: () => makeType<string>((x) => typeof x === 'string'),
  number: () => makeType<number>((x) => typeof x === 'number'),
  boolean: () => makeType<boolean>((x) => typeof x === 'boolean'),
  any: () => makeType<any>(() => true),
  record: (_: any) => makeType<Record<string, any>>((x) => typeof x === 'object' && x !== null),
  array: <T>(schema: ZodType<T>) => ({
    parse: (input: any) => {
      if (!Array.isArray(input)) throw new Error('Invalid array');
      return input.map((i) => schema.parse(i));
    },
    optional: () => z.array(schema),
    default: (val: T[]) => ({ parse: (input: any) => (input === undefined ? val : z.array(schema).parse(input)) }),
  }),
  object: <T extends Record<string, any>>(shape: { [K in keyof T]: ZodType<T[K]> }) => ({
    parse: (input: any) => {
      if (typeof input !== 'object' || input === null) throw new Error('Invalid object');
      const out: any = {};
      for (const key of Object.keys(shape)) {
        try {
          out[key] = shape[key].parse((input as any)[key]);
        } catch (err) {
          throw new Error(`Invalid field ${key}`);
        }
      }
      return out as T;
    },
    optional: () => ({
      parse: (input: any) => {
        if (input === undefined) return undefined;
        return (z.object(shape) as any).parse(input);
      },
      default: (val: any) => ({ parse: (input: any) => (input === undefined ? val : (z.object(shape) as any).parse(input)) }),
    }),
  }),
  union: <T>(schemas: ZodType<any>[]) => ({
    parse: (input: any) => {
      for (const schema of schemas) {
        try {
          return schema.parse(input) as T;
        } catch {
          /* continue */
        }
      }
      throw new Error('No union variant matched');
    },
  }),
  literal: <T extends string | number | boolean>(value: T) => makeType<T>((x) => x === value),
  enum: <T extends string>(values: readonly T[]) => makeType<T>((x) => values.includes(x as any)),
};
(z as any).infer = (schema: any) => schema;

export type infer<T> = T extends { parse: (input: any) => infer R } ? R : never;
export const literal = z.literal;
export const enumZ = z.enum;
export default z;
