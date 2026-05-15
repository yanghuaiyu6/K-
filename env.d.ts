declare module 'react' {
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
  export function useState<T>(initialState: T): [T, (value: T) => void];
  export const StrictMode: (props: { children?: unknown }) => unknown;
}

declare module 'react-dom/client' {
  export function createRoot(container: Element): { render(children: unknown): void };
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module '@vitejs/plugin-react' {
  const react: () => unknown;
  export default react;
}

declare module 'vite' {
  export function defineConfig(config: unknown): unknown;
}

declare module 'vitest' {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: () => void) => void;
  export const expect: any;
}

declare module '*.css';

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
