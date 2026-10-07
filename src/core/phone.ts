export function formatMobilePhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length <= 3
    ? digits
    : digits.length <= 7
      ? digits.slice(0, 3) + "-" + digits.slice(3)
      : digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
}

export function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length <= 4
    ? digits
    : digits.length <= 6
      ? digits.slice(0, 4) + "-" + digits.slice(4)
      : digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);
}
