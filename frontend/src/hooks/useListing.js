import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, parseApiError } from '../api/client.js';

/**
 * Drives the filter + sort + paginate cycle every listing screen shares.
 * Text filters are debounced so typing in a search box does not fire a request
 * per keystroke, and any filter change resets back to page 1.
 */
export function useListing(endpoint, { filters: initialFilters = {}, sortBy, sortOrder = 'asc', limit = 10 } = {}) {
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedFilters, setDebouncedFilters] = useState(initialFilters);
  const [sort, setSort] = useState({ sortBy, sortOrder });
  const [page, setPage] = useState(1);

  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const queryKey = JSON.stringify({ endpoint, debouncedFilters, sort, page, limit, refreshToken });

  useEffect(() => {
    const controller = new AbortController();
    const params = { ...sort, page, limit };
    for (const [key, value] of Object.entries(debouncedFilters)) {
      if (value !== '' && value !== null && value !== undefined) params[key] = value;
    }

    setLoading(true);
    api
      .get(endpoint, { params, signal: controller.signal })
      .then(({ data: body }) => {
        setData(body.data);
        setPagination(body.pagination);
        if (body.sort) setSort(body.sort);
        setError('');
      })
      .catch((err) => {
        if (controller.signal.aborted || err.code === 'ERR_CANCELED') return;
        setError(parseApiError(err).message);
        setData([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // queryKey folds every input into one primitive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const setFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(initialFilters), [initialFilters]);

  const toggleSort = useCallback((key) => {
    setSort((current) =>
      current.sortBy === key
        ? { sortBy: key, sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc' }
        : { sortBy: key, sortOrder: 'asc' },
    );
    setPage(1);
  }, []);

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => value !== '' && value !== null && value !== undefined),
    [filters],
  );

  return {
    data,
    pagination,
    loading,
    error,
    filters,
    setFilter,
    resetFilters,
    hasActiveFilters,
    sort,
    toggleSort,
    page,
    setPage,
    refresh,
  };
}
