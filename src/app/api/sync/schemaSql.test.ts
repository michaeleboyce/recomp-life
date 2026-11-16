// @vitest-environment node
// Keeps the hand-run clean-schema script and src/db/schema.ts from drifting apart.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableColumns, getTableName } from 'drizzle-orm';
import * as schema from '@/db/schema';

const SQL = readFileSync(join(process.cwd(), 'scripts/sql/2026-11-12-clean-schema.sql'), 'utf8');

interface SqlColumn { type: string; notNull: boolean; primaryKey: boolean; unique: boolean; default?: string }

function parseCreateTables(sql: string): Map<string, Map<string, SqlColumn>> {
  const tables = new Map<string, Map<string, SqlColumn>>();
  const createRe = /CREATE TABLE "([a-z0-9_]+)" \(([\s\S]*?)\n\);/g;
  for (const [, name, body] of sql.matchAll(createRe)) {
    const columns = new Map<string, SqlColumn>();
    for (const line of body.split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean)) {
      // The type may be several words ("timestamp with time zone"); it ends where the
      // constraints begin.
      const match = /^"([a-z0-9_]+)" ([a-z][a-z ]*?)((?: (?:NOT NULL|PRIMARY KEY|UNIQUE|DEFAULT \S+))*)$/.exec(line);
      if (!match) throw new Error(`Unparsed line in ${name}: ${line}`);
      const [, column, type, rest] = match;
      columns.set(column, {
        type,
        notNull: /NOT NULL/.test(rest) || /PRIMARY KEY/.test(rest),
        primaryKey: /PRIMARY KEY/.test(rest),
        unique: /UNIQUE/.test(rest),
        default: /DEFAULT (\S+)/.exec(rest)?.[1],
      });
    }
    tables.set(name, columns);
  }
  return tables;
}

const sqlTables = parseCreateTables(SQL);
const drizzleTables = Object.values(schema);

describe('scripts/sql/2026-11-12-clean-schema.sql', () => {
  it('runs in one transaction and warns that it destroys all data', () => {
    expect(SQL).toMatch(/DESTROYS ALL DATA/);
    expect(SQL).toMatch(/D1/);
    expect(SQL.trim()).toMatch(/^--[\s\S]*\nBEGIN;[\s\S]*\nCOMMIT;$/);
  });

  it('drops every old and new table if it exists, before creating anything', () => {
    const firstCreate = SQL.indexOf('CREATE TABLE');
    for (const table of [
      'workouts', 'sets', 'runs', 'activities', 'bodyweight', 'pain_entries', 'estimated_1rms',
      'lift_states', 'user_profile', 'readiness_logs', 'lift_adjustments', 'health_daily', 'favorite_workouts', 'forecasts', 'coach_events',
      'imported_sessions',
    ]) {
      const drop = SQL.indexOf(`DROP TABLE IF EXISTS "${table}";`);
      expect(drop, table).toBeGreaterThan(-1);
      expect(drop, table).toBeLessThan(firstCreate);
    }
  });

  it('stores every date as timestamp with time zone, never a bare timestamp', () => {
    expect(SQL).not.toMatch(/" timestamp(?! with time zone)/);
    for (const table of drizzleTables) {
      for (const column of Object.values(getTableColumns(table))) {
        if (column.getSQLType().startsWith('timestamp')) {
          expect(column.getSQLType(), `${getTableName(table)}.${column.name}`).toBe('timestamp with time zone');
        }
      }
    }
  });

  it('creates exactly the Drizzle tables', () => {
    expect([...sqlTables.keys()].sort()).toEqual(drizzleTables.map((t) => getTableName(t)).sort());
  });

  for (const table of drizzleTables) {
    const name = getTableName(table);
    it(`${name}: every Drizzle column appears with the same type and constraints, and no others`, () => {
      const sqlColumns = sqlTables.get(name)!;
      const columns = Object.values(getTableColumns(table));
      expect([...sqlColumns.keys()].sort()).toEqual(columns.map((c) => c.name).sort());
      for (const column of columns) {
        const sqlColumn = sqlColumns.get(column.name)!;
        expect(sqlColumn.type, `${name}.${column.name} type`).toBe(column.getSQLType());
        expect(sqlColumn.notNull, `${name}.${column.name} not null`).toBe(column.notNull);
        expect(sqlColumn.primaryKey, `${name}.${column.name} primary key`).toBe(column.primary);
        expect(sqlColumn.unique, `${name}.${column.name} unique`).toBe(column.isUnique);
        expect(sqlColumn.default, `${name}.${column.name} default`).toBe(
          column.hasDefault ? String(column.default) : undefined
        );
      }
    });
  }
});

describe('scripts/sql/2026-11-14-glass-box.sql', () => {
  const ADDITIVE = readFileSync(join(process.cwd(), 'scripts/sql/2026-11-14-glass-box.sql'), 'utf8');
  const statements = ADDITIVE.split('\n').filter((l) => /^(ALTER TABLE|CREATE TABLE)/.test(l));

  it('says what it does, touches no existing data and is safe to run twice', () => {
    expect(ADDITIVE.trim()).toMatch(/^--[\s\S]*\nBEGIN;[\s\S]*\nCOMMIT;$/);
    expect(ADDITIVE).toMatch(/touches no existing data/);
    expect(ADDITIVE).toMatch(/safe to run more than once/);
    expect(ADDITIVE).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE) /);
  });

  it('uses IF NOT EXISTS on every statement', () => {
    expect(statements).toHaveLength(3);
    for (const line of statements) expect(line, line).toMatch(/IF NOT EXISTS/);
  });

  it('creates the same tables and columns as the clean-schema script (the later write stamp aside)', () => {
    const additive = parseCreateTables(ADDITIVE.replace(/CREATE TABLE IF NOT EXISTS/g, 'CREATE TABLE'));
    for (const name of ['forecasts', 'coach_events']) {
      const later = new Map(sqlTables.get(name));
      later.delete('server_updated_at');
      expect(additive.get(name), name).toEqual(later);
    }
    expect(ADDITIVE).toMatch(/ADD COLUMN IF NOT EXISTS "decisions" jsonb;/);
    expect(sqlTables.get('workouts')!.get('decisions')).toMatchObject({ type: 'jsonb', notNull: false });
  });
});

describe('scripts/sql/2026-11-16-imported-history.sql', () => {
  const ADDITIVE = readFileSync(join(process.cwd(), 'scripts/sql/2026-11-16-imported-history.sql'), 'utf8');
  const statements = ADDITIVE.split('\n').filter((l) => /^(ALTER TABLE|CREATE TABLE)/.test(l));

  it('says what it does, changes no existing row and is safe to run twice', () => {
    expect(ADDITIVE.trim()).toMatch(/^--[\s\S]*\nBEGIN;[\s\S]*\nCOMMIT;$/);
    expect(ADDITIVE).toMatch(/imported_sessions/);
    expect(ADDITIVE).toMatch(/changes no existing row/);
    expect(ADDITIVE).toMatch(/safe to run more than once/);
    expect(ADDITIVE).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE) /);
  });

  it('uses IF NOT EXISTS on every statement', () => {
    expect(statements).toHaveLength(2);
    for (const line of statements) expect(line, line).toMatch(/IF NOT EXISTS/);
  });

  it('creates the same table and column as the clean-schema script', () => {
    const additive = parseCreateTables(ADDITIVE.replace(/CREATE TABLE IF NOT EXISTS/g, 'CREATE TABLE'));
    expect(additive.get('imported_sessions')).toEqual(sqlTables.get('imported_sessions'));
    expect(ADDITIVE).toMatch(/ADD COLUMN IF NOT EXISTS "variant" jsonb;/);
    expect(sqlTables.get('lift_adjustments')!.get('variant')).toMatchObject({ type: 'jsonb', notNull: false });
  });
});

describe('scripts/sql/2026-11-16-pull-pages.sql', () => {
  const ADDITIVE = readFileSync(join(process.cwd(), 'scripts/sql/2026-11-16-pull-pages.sql'), 'utf8');
  const statements = ADDITIVE.split('\n').filter((l) => /^(ALTER TABLE|CREATE TABLE)/.test(l));

  it('says what it does, changes no existing row and is safe to run twice', () => {
    expect(ADDITIVE.trim()).toMatch(/^--[\s\S]*\nBEGIN;[\s\S]*\nCOMMIT;$/);
    expect(ADDITIVE).toMatch(/touches no existing data/);
    expect(ADDITIVE).toMatch(/safe to run more than once/);
    expect(ADDITIVE).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE) /);
  });

  it('adds the server write stamp to every table, as the clean-schema script has it', () => {
    expect(statements).toHaveLength(sqlTables.size);
    for (const name of sqlTables.keys()) {
      const line = statements.find((l) => l.includes(`"${name}"`));
      expect(line, name).toMatch(/^ALTER TABLE (IF EXISTS )?"[a-z_]+" ADD COLUMN IF NOT EXISTS "server_updated_at" bigint NOT NULL DEFAULT 0;$/);
      expect(sqlTables.get(name)!.get('server_updated_at'), name).toEqual({
        type: 'bigint', notNull: true, primaryKey: false, unique: false, default: '0',
      });
    }
  });
});
