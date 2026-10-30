// Two ways a case stops without a verdict. LocalOnly: it needs something only the local copy has (the demo accounts,
// the job secret, an Admin sign-in, the AI fake), so on the live site it stays Not Run. LiveUnsafe: going on would
// touch someone who is not part of the run (a real listing, store or account, or a buyer's saved-search alert), so the
// live run stops that case and records it as Not Run.
"use strict";

class LocalOnly extends Error {}
class LiveUnsafe extends Error {}

module.exports = { LocalOnly, LiveUnsafe };
