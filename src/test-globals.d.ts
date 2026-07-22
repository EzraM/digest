declare function describe(name: string, body: () => void): void;
declare function it(name: string, body: () => void | Promise<void>): void;

interface TestMatchers {
  toBe(expected: unknown): void;
  toBeUndefined(): void;
  toContain(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatchObject(expected: unknown): void;
}

declare function expect(actual: any): TestMatchers & {
  not: Pick<TestMatchers, "toContain">;
};
