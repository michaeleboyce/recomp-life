import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const neonSql = neon(process.env.DATABASE_URL!);
export const pgDb = drizzle(neonSql, { schema });
export { neonSql };
