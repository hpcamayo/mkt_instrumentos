// Import limits (owner decision D-3, accepted default). Kept in one place so the wizard, the parsers and the docs agree.
// The database enforces the same file size (bucket limit and create_store_import_session) and row count.
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_DATA_ROWS = 2000;
export const IMPORT_MAX_COLUMNS = 80;
export const IMPORT_MAX_CELL_CHARS = 2000;
// A header row is searched for among the first rows, so a title or a blank line above the table is fine.
export const IMPORT_HEADER_SEARCH_ROWS = 20;

// XLSX is a ZIP: bounds on what the reader will inflate (design §7.4).
export const XLSX_MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const XLSX_MAX_ENTRY_RATIO = 100;
export const XLSX_MAX_ENTRIES = 2000;
// Compressed bytes fed to the inflater at a time; with deflate's ~1:1032 ceiling one slice can never produce more
// than ~16 MB before the budget is checked again.
export const XLSX_INFLATE_SLICE_BYTES = 16 * 1024;

// Step sizes (design §7.1): one server step does one bounded unit of work.
export const IMPORT_STAGE_CHUNK_ROWS = 500;
export const IMPORT_PLAN_CHUNK_ROWS = 100;
export const IMPORT_COMMIT_CHUNK_ROWS = 50;
