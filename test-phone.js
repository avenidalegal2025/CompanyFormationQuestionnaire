// Test format_phone logic (simulating the Python function)
function format_phone(phone) {
  if (!phone) return '';
  const phone_str = String(phone);
  let phone_clean = phone_str.replace(/\D/g, '');
  while (phone_clean.startsWith('1') && phone_clean.length > 10) {
    phone_clean = phone_clean.slice(1);
  }
  if (phone_clean.length === 10) {
    return phone_clean.slice(0,3) + '-' + phone_clean.slice(3,6) + '-' + phone_clean.slice(6);
  }
  return phone_clean || '';
}

const tests = [
  ['+1 555 555 5555', '555-555-5555'],
  ['+15555555555', '555-555-5555'],
  ['1555555555', '155-555-5555'],
  ['(786) 512-0434', '786-512-0434'],
  ['+17866400626', '786-640-0626'],
  ['555-555-5555', '555-555-5555'],
  ['+115555555555', '555-555-5555'],
  ['', ''],
  ['+1 786 640 0626', '786-640-0626'],
  ['444 444 4444', '444-444-4444'],
];

let pass = 0, fail = 0;
tests.forEach(([input, expected]) => {
  const result = format_phone(input);
  const ok = result === expected;
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ` format_phone("${input}") = "${result}"` + (ok ? '' : ` (expected: "${expected}")`));
});
console.log(`\n${pass}/${pass+fail} tests passed`);
