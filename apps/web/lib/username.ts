export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

export function normaliseUsername(value: string) {
  return value.replace(/^\/?u\//i, "").trim();
}

export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(value);
}
