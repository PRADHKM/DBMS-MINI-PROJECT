import test from 'node:test';
import assert from 'node:assert/strict';
import { parseId, optionalId, date, enumValue, numberValue, text, assertFields, canAccessEmployee, dateOrder } from '../lib/domain.mjs';

test('IDs reject injection, array query parameters, fractions and unsafe integers', () => {
  for (const invalid of ['1 OR 1=1', ['1'], true, 0, -1, 1.1, '1.0', '9007199254740992', undefined]) {
    assert.throws(() => parseId(invalid), { status: 400 });
  }
  assert.equal(parseId('104'), 104);
  assert.equal(optionalId('', 'manager_id'), null);
});
test('dates reject impossible calendar dates and rollover', () => {
  for (const invalid of ['2025-02-29', '2026-13-01', '2026-02-30', '2026-1-01', '0000-01-01', ['2026-01-01']]) assert.throws(() => date(invalid, 'date'), { status: 400 });
  assert.equal(date('2024-02-29', 'date'), '2024-02-29');
  assert.throws(() => date('', 'date', { required: true }), { status: 400 });
});
test('date ordering permits nullable dates but rejects reversed intervals', () => {
  dateOrder(null, '2026-01-01');
  dateOrder('2026-01-01', '2026-01-01');
  assert.throws(() => dateOrder('2026-02-01', '2026-01-01'), { status: 400 });
});
test('employee authorization denies cross employee and missing session access', () => {
  assert.equal(canAccessEmployee({ role: 'employee', empId: 4 }, 4), true);
  assert.equal(canAccessEmployee({ role: 'employee', empId: 4 }, 5), false);
  assert.equal(canAccessEmployee(undefined, 4), false);
  assert.equal(canAccessEmployee({ role: 'admin', empId: 4 }, 5), true);
});
test('payload allowlists reject role and assignment escalation fields', () => {
  assert.throws(() => assertFields({phone:'123',role:'admin'}, ['phone']), { status: 400 });
  assert.throws(() => assertFields({status:'completed',assigned_to:9}, ['status']), { status: 400 });
  for (const invalid of [null, ['name'], 'text']) assert.throws(() => assertFields(invalid, ['name']), { status: 400 });
});
test('hours reject nonfinite and out of range values', () => {
  for (const invalid of [0, -1, 24.01, Infinity, 'NaN', true, [8], '']) assert.throws(() => numberValue(invalid, 'hours', { min:0.01, max:24 }), { status:400 });
  assert.equal(numberValue('7.50','hours',{min:0.01,max:24}),7.5);
});
test('enum values validate states rather than passing arbitrary SQL values', () => {
  assert.equal(enumValue(undefined,'role',['admin','employee'],'employee'),'employee');
  assert.throws(() => enumValue('owner','role',['admin','employee']),{status:400});
});
test('required text is bounded and rejects arrays or empty whitespace', () => {
  assert.equal(text('  Asha  ','name',{required:true,max:100}),'Asha');
  for(const invalid of ['   ',['Asha'],'a'.repeat(101)]) assert.throws(() => text(invalid,'name',{required:true,max:100}),{status:400});
});
