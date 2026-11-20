import bcrypt from 'bcryptjs';
import { enumValue, fail, text } from './api';

export async function prepareEmployeeAccount({ username, password, role }) {
  const login = text(username, 'username', { max: 50 });
  if (!login && (password == null || password === '')) return null;
  if (!login || password == null || password === '') fail(400, 'Provide both a username and a password to create a login.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    fail(400, 'Password must be at least 8 characters and at most 72 bytes.');
  }
  const accountRole = enumValue(role, 'role', ['admin', 'employee'], 'employee');
  return [login, await bcrypt.hash(password, 12), accountRole];
}

export async function insertEmployeeAccount(conn, employeeId, account) {
  await conn.execute('INSERT INTO USER_ACCOUNT (emp_id,username,password_hash,role) VALUES (?,?,?,?)',
    [employeeId, ...account]);
}
