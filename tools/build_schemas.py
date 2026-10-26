"""Generate checked-in Draft 2020-12 schemas. No remote $refs."""
from pathlib import Path
import json
S={"type":"string"}; I={"type":"integer"}; A={"type":"array"}; O={"type":"object"}
def obj(properties, required=None, additional=False):
 return {"type":"object","properties":properties,"required":list(properties) if required is None else required,"additionalProperties":additional}
def arr(items): return {"type":"array","items":items}
def ref(name): return {"$ref":"#/$defs/"+name}
nullable_s={"type":["string","null"]}
command=obj({"id":S,"index":{"type":"integer","minimum":0},"kind":S,"raw":{},"contexts":arr(obj({"block_id":S,"branch_id":nullable_s})),"plugin":O,"semantic":{"type":["object","null"]}},["id","index","kind","raw","contexts"])
page=obj({"id":S,"page_index":I,"raw_unparsed":{},"raw_metadata":O,"list_present":{"type":"boolean"},"condition_checks":arr(O),"selection_priority":I,"trigger":{},"priority_type":{},"commands":arr(ref("command")),"text_groups":arr(O),"choices":arr(O),"flow_blocks":arr(O)},["id","page_index"])
page["oneOf"]=[{"required":["raw_unparsed"],"not":{"required":["commands"]}},{"required":["raw_metadata","commands","list_present","condition_checks","text_groups","choices","flow_blocks"]}]
event=obj({"id":S,"raw_unparsed":{},"source":O,"classification":{"type":"null"},"raw_metadata":O,"pages_present":{"type":"boolean"},"position":O,"page_selection":{"const":"highest_satisfied_page_index"},"pages":arr(ref("page"))},["id"])
event["oneOf"]=[{"required":["raw_unparsed"],"not":{"required":["pages"]}},{"required":["raw_metadata","pages","source","pages_present","page_selection"]}]
reference=obj({"id":S,"source_id":S,"event_id":S,"owner_id":S,"command_index":{"type":["integer","null"]},"target_kind":S,"target_id":S,"role":S,"detail":O,"resolved_ids":arr(S),"resolution":S},["id","source_id","event_id","owner_id","command_index","target_kind","target_id","role","detail","resolved_ids"])
issue=obj({"code":S,"path":S,"message":S,"severity":{"enum":["warning","error"]}})
report=obj({"state":S,"schema_valid":{"type":"boolean"},"source_counts":O,"output_counts":O,"switches":I,"variables":I,"images":I,"assets":I,"decrypted":I,"asset_failures":I,"plugins":I,"errors":I,"warnings":I,"unknown_commands":I,"opaque_operations":I,"output_folder":S})
usage=obj({"id":S,"number":I,"name":{},"initial_value":{},"reference_count":I,"references":arr(S),"used_by":arr(S)})
plugin=obj({"id":S,"name":{},"load_index":I,"enabled":{},"parameters":{},"raw":O,"exists":{"type":"boolean"},"source_path":nullable_s,"archive_path":nullable_s,"settings_source":S,"command_calls":arr(S)},["id","name","load_index","enabled","parameters","raw","exists","source_path","archive_path","settings_source"])
asset=obj({"id":S,"source_path":S,"status":{"enum":["indexed","copied","decrypted","copy_disabled","decryption_disabled","unsupported_encryption","failed"]},"category":S,"output_path":nullable_s,"logical_path":S,"original_extension":S,"size_bytes":I,"sha256":S,"output_sha256":nullable_s,"dimensions":{"type":["array","null"],"items":I},"detected_format":nullable_s,"encryption":S,"original_archive_path":S,"reference_ids":arr(S),"used_by":arr(S)},["id","source_path","status"])
annotation=obj({"target_id":S,"kind":{"enum":["character_name","event_title","story_time","time_of_day","event_order","switch_meaning","variable_meaning","event_classification","ending_condition","state_preset"]},"value":{},"evidence_ids":arr(S),"confidence":{"type":"number","minimum":0,"maximum":1}},["target_id","kind","value","evidence_ids"])
types={
"scripts":arr(obj({"id":{},"name":{},"order":{"type":"integer","minimum":0},"status":{"enum":["failed","decompressed"]},"source_path":nullable_s,"references":arr(S),"source":S},["id","name","order","status","source_path","references"])),
"manifest":obj({"tool_version":S,"state":{"enum":["in_progress","complete","complete_with_issues","partial","invalid","cancelled","failed"]},"created_at":S,"engine_version":nullable_s,"source_root":S,"adapter_version":S,"archive_sha256":nullable_s,"options":O,"schema":S,"entrypoints":O,"id_convention":O,"key_policy":S}),
"game":obj({"title":{},"system":O,"engine_detection":O,"state_origin":S,"initial_switch_value":{"const":False},"initial_variable_value":{"const":0}}),
"map_shard":obj({"id":S,"source_file":S,"raw_map":O,"tiles_preserved":{"type":"boolean"},"event_array_length":{"type":["integer","null"]},"events":arr(ref("event"))}),
"common_event_shard":obj({"id":S,"source":O,"raw_metadata":O,"page":ref("page")}),
"troop_shard":ref("event"),
"maps":arr(obj({"id":S,"map_id":I,"name":{},"map_info":{},"display_name":{},"source_file":S,"width":{},"height":{},"event_ids":arr(S),"file":S})),
"events":arr(obj({"id":S,"name":{},"map_id":I,"file":S,"pointer":S})),
"common_events":arr(obj({"id":S,"name":{},"trigger":{},"switch_id":{},"file":S})),
"troops":arr(obj({"id":S,"name":{},"file":S})),
"database":obj({"source_file":S,"records":{}}),
"database_index":arr(obj({"name":S,"file":S})),
"switches":arr(ref("usage")),"variables":arr(ref("usage")),
"reference":ref("reference"),"reference_index":obj({"by_target":{"type":"object","additionalProperties":arr(S)},"by_source":{"type":"object","additionalProperties":arr(S)},"records_file":S}),
"plugins":arr(ref("plugin")),"assets":arr(ref("asset")),
"relations":obj({"common_event_calls":{"type":"object","additionalProperties":arr(S)},"common_event_callers":{"type":"object","additionalProperties":arr(S)},"map_connections":arr(O),"dependency_rule":S}),
"source_inventory":arr(obj({"path":S,"size_bytes":I,"sha256":S,"archive_path":nullable_s,"representation":{"enum":["not_archived","exact_bytes","redacted_json"]},"redacted_fields":arr(S)},["path","size_bytes","sha256","archive_path","representation"])),
"enrichment":obj({"annotations":arr(ref("annotation"))}),
"overview":obj({"title":{},"counts":O,"maps":S,"actors":S,"database":S,"relations":S,"switches":S,"variables":S,"common_events":S,"plugins":S,"event_index":S,"opaque_count":I,"instructions":S}),
"switch_usage":arr({"allOf":[{**usage,"additionalProperties":True}, {"type":"object","required":["usages"],"properties":{"usages":arr(O)}}]}),
"variable_usage":arr({"allOf":[{**usage,"additionalProperties":True}, {"type":"object","required":["usages"],"properties":{"usages":arr(O)}}]}),
"event_chunk":obj({"id":S,"event_id":S,"page_id":S,"source_shard":S,"command_start":I,"command_end_exclusive":I,"commands":arr(ref("command")),"page_conditions":{},"flow_blocks":arr(O),"text_groups":arr(O),"reference_ids":arr(S)}),
"text_record":obj({"event_id":S,"page_id":S,"source_shard":S,"group":O,"choice":O},["event_id","page_id","source_shard"]),
"usage_context":obj({"owner_id":S,"source_shard":S,"reference_ids":arr(S),"commands":arr(ref("command")),"text_groups":arr(O)}),
"issues":arr(ref("issue")),"report":ref("report"),"comparisons":arr(obj({"source_id":S,"raw_equal":{"type":"boolean"}})),
"unresolved":arr(obj({"reference_id":S,"target":S,"source_id":S,"reason":S})),
"unsupported":arr(obj({"source_id":S,"event_id":S,"code":{},"reason":S,"raw_preserved":{"const":True}})),
"opaque":arr(obj({"source_id":S,"reason":S})),
"integrity":obj({"events_compared":I,"all_raw_equal":{"type":"boolean"},"counts_equal":{"type":"boolean"},"mismatches":arr(O)}),
"validation":obj({"valid":{"type":"boolean"},"errors":arr(obj({"path":S,"message":S}))})}
base={"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:rpgextract:package:1.1.0",
      **obj({"schema_version":{"const":"1.1.0"},"engine":{"enum":["MV","MZ","MV_MZ","VXACE"]},"game_id":S,"package_id":S,"data_type":{"enum":list(types)},"data":{} }),
      "$defs":{"command":command,"page":page,"event":event,"reference":reference,"issue":issue,"report":report,"usage":usage,"plugin":plugin,"asset":asset,"annotation":annotation},
      "allOf":[{"if":{"properties":{"data_type":{"const":name}}},"then":{"properties":{"data":definition}}} for name,definition in types.items()]}
root=Path(__file__).resolve().parents[1]/"src/rpgextractor/schemas"
root.mkdir(parents=True,exist_ok=True)
(root/"package.schema.json").write_text(json.dumps(base,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
(root/"schema_version.json").write_text(json.dumps({"schema_version":"1.1.0","dialect":"2020-12","compatible_major":1},indent=2)+"\n",encoding="utf-8")
