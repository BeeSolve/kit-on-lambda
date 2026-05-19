import { dirname } from "node:path";

export function assertUnreachable(
  value: never,
  message = JSON.stringify(value),
): never {
  throw Error("An unreachable state reached!\n" + message);
}

export function computeRoutes(files: string[]): string[] {
  return [
    ...new Set(
      files
        .map((x) => {
          const z = dirname(x);
          if (z === ".") return x;
          if (z.includes("/")) return undefined;
          return `${z}/*`;
        })
        .filter((x): x is string => x != null),
    ),
  ];
}
