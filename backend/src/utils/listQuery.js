/**
 * Helpers for the filter / sort / paginate behaviour shared by every listing
 * endpoint. Sort columns are resolved through a whitelist so a query string can
 * never inject SQL into the ORDER BY clause.
 */

export function resolveSort(sortBy, sortOrder, allowedColumns, fallbackKey) {
  const key = allowedColumns[sortBy] ? sortBy : fallbackKey;
  const direction = String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return { column: allowedColumns[key], key, direction };
}

export function resolvePagination(query, { defaultLimit = 10, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawLimit = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * `%` and `_` are wildcards to LIKE, and a search term arrives as user input.
 * Unescaped, `?name=%` matched every row: a filter box that quietly ignores what
 * was typed into it, and a one-character way to ask for the entire table.
 * Backslash is escaped first, so it cannot be used to disarm the escapes that
 * follow it.
 */
function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Accumulates `WHERE` fragments alongside their bound values so callers never
 * have to hand-count `$1, $2, ...` placeholders.
 */
export class WhereBuilder {
  constructor(startIndex = 1) {
    this.clauses = [];
    this.values = [];
    this.index = startIndex;
  }

  /** `add('LOWER(u.name) LIKE $?', `%${value}%`)` - `$?` is replaced with the next placeholder. */
  add(fragment, ...values) {
    let filled = fragment;
    for (const value of values) {
      filled = filled.replace('$?', `$${this.index++}`);
      this.values.push(value);
    }
    this.clauses.push(filled);
    return this;
  }

  /** Adds a case-insensitive "contains" filter, skipping blank input. */
  like(expression, value) {
    if (value === undefined || value === null || String(value).trim() === '') return this;
    const term = escapeLikePattern(String(value).trim().toLowerCase());
    return this.add(`${expression} LIKE $? ESCAPE '\\'`, `%${term}%`);
  }

  sql(prefix = 'WHERE') {
    return this.clauses.length ? `${prefix} ${this.clauses.join(' AND ')}` : '';
  }

  get nextIndex() {
    return this.index;
  }
}
