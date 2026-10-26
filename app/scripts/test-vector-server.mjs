// Ephemeral PostgreSQL/pgvector test adapter. Production uses the compose service.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const db = new PGlite({ extensions: { vector } });
await db.exec(await readFile(new URL('../../database/pgvector/01_setup.sql', import.meta.url), 'utf8'));
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 35433, maxConnections: 10 });
await server.start();
console.log('Ephemeral pgvector test server ready at 127.0.0.1:35433');
async function stop() { await server.stop(); await db.close(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
