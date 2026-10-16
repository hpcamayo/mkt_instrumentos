// Import limits (owner decision D-3, accepted default). Kept in one place so the wizard, the parsers and the docs agree.
// The database enforces the same file size (bucket limit and create_store_import_session) and row count.
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_DATA_ROWS = 2000;
export const IMPORT_MAX_COLUMNS = 80;
export const IMPORT_MAX_CELL_CHARS = 2000;
// A header row is searched for among the first rows, so a title or a blank line above the table is fine.
export const IMPORT_HEADER_SEARCH_ROWS = 20;

// XLSX is a ZIP: bounds on what the reader will inflate (design §7.4). The total is a hard ceiling on the parts kept:
// the central directory's sizes are checked against it before anything is inflated, and each part's buffer is
// allocated once at its declared size, which the inflater may never pass.
export const XLSX_MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const XLSX_MAX_ENTRY_RATIO = 100;
export const XLSX_MAX_ENTRIES = 2000;
// Compressed bytes fed to the inflater at a time. Deflate expands at most ~1:1032, so one push hands over at most
// ~1 MB (XLSX_INFLATE_OVERSHOOT_BYTES): the most a lying header can make the reader inflate past a declared size,
// the ratio or the budget before it is refused. The inflater also keeps its 32 KB window while it runs.
export const XLSX_INFLATE_SLICE_BYTES = 1024;
export const XLSX_INFLATE_OVERSHOOT_BYTES = XLSX_INFLATE_SLICE_BYTES * 1032;

// Step sizes (design §7.1): one server step does one bounded unit of work.
export const IMPORT_STAGE_CHUNK_ROWS = 500;
export const IMPORT_PLAN_CHUNK_ROWS = 100;
export const IMPORT_COMMIT_CHUNK_ROWS = 50;
