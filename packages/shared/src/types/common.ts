/** Standard, versioned API envelope shared by every endpoint. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** JSON-encoded { field: value } filter map — the API list-query contract */
  filters?: string;
}

export interface Option {
  label: string;
  value: string;
}

/** Minimal shape every entity exposes for pickers/dropdowns. */
export interface ReferenceItem {
  id: string;
  code: string;
  name: string;
}
