export function assertUnreachable(
  value: never,
  message = JSON.stringify(value),
): never {
  throw Error("An unreachable state reached!\n" + message);
}
