/*
 * Local stand-in for the pg_safeupdate check that Supabase loads for API connections (the authenticator role's
 * session_preload_libraries): an UPDATE or DELETE without a WHERE clause, at the top or inside a data-modifying WITH,
 * is refused with "UPDATE requires a WHERE clause" / "DELETE requires a WHERE clause". The check runs when a
 * statement is parsed, so it also covers the statements PL/pgSQL functions and triggers run on an API call.
 * Written for the Laria local checks; build and load it with build.sh (needs postgresql-server-dev-16).
 * In a session: LOAD 'laria_safeupdate'; turn it off with SET laria_safeupdate.enabled = off.
 */
#include "postgres.h"

#include "fmgr.h"
#include "nodes/parsenodes.h"
#include "parser/analyze.h"
#include "utils/guc.h"

PG_MODULE_MAGIC;

void _PG_init(void);

static bool laria_safeupdate_enabled = true;
static post_parse_analyze_hook_type earlier_hook = NULL;

static void
refuse_unfiltered(Query *query)
{
	ListCell   *cell;

	foreach(cell, query->cteList)
	{
		CommonTableExpr *cte = lfirst_node(CommonTableExpr, cell);

		if (cte->ctequery && IsA(cte->ctequery, Query))
			refuse_unfiltered((Query *) cte->ctequery);
	}

	if (query->commandType != CMD_UPDATE && query->commandType != CMD_DELETE)
		return;
	if (query->jointree != NULL && query->jointree->quals != NULL)
		return;
	ereport(ERROR,
			(errcode(ERRCODE_CARDINALITY_VIOLATION),
			 errmsg("%s requires a WHERE clause", query->commandType == CMD_UPDATE ? "UPDATE" : "DELETE")));
}

static void
after_parse_analyze(ParseState *pstate, Query *query, JumbleState *jstate)
{
	if (earlier_hook)
		earlier_hook(pstate, query, jstate);
	if (laria_safeupdate_enabled)
		refuse_unfiltered(query);
}

void
_PG_init(void)
{
	DefineCustomBoolVariable("laria_safeupdate.enabled",
							 "Refuse UPDATE and DELETE without a WHERE clause, as Supabase does on API calls.",
							 NULL,
							 &laria_safeupdate_enabled,
							 true,
							 PGC_SUSET,
							 0,
							 NULL, NULL, NULL);
	earlier_hook = post_parse_analyze_hook;
	post_parse_analyze_hook = after_parse_analyze;
}
