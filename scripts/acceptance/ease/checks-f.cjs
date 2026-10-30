// Register the remaining suite's new coverage without duplicating A–E.
"use strict";
const existing=new Set(["a","b","c","d","e"].flatMap(group=>require("./checks-"+group+".cjs")).map(entry=>entry.id));
module.exports=require("./remaining.cjs").filter(entry=>!existing.has(entry.id));
