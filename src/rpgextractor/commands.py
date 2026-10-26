from __future__ import annotations
from .adapters.semantics import semantics
import re

# Standard event command catalogue. Recognition is separate from interpretation.
NAMES = {
0:"end",101:"show_text",102:"show_choices",103:"input_number",104:"select_item",105:"scroll_text",108:"comment",
111:"conditional_branch",112:"loop",113:"break_loop",115:"exit_event",117:"call_common_event",118:"label",119:"jump_label",
121:"control_switches",122:"control_variables",123:"control_self_switch",124:"control_timer",125:"change_gold",126:"change_items",127:"change_weapons",128:"change_armors",129:"change_party",
132:"change_battle_bgm",133:"change_victory_me",134:"change_save_access",135:"change_menu_access",136:"change_encounter",137:"change_formation",138:"change_window_color",139:"change_defeat_me",140:"change_vehicle_bgm",
201:"transfer_player",202:"set_vehicle_location",203:"set_event_location",204:"scroll_map",205:"set_movement_route",206:"get_on_off_vehicle",211:"change_transparency",212:"show_animation",213:"show_balloon",214:"erase_event",216:"change_followers",217:"gather_followers",
221:"fadeout_screen",222:"fadein_screen",223:"tint_screen",224:"flash_screen",225:"shake_screen",230:"wait",231:"show_picture",232:"move_picture",233:"rotate_picture",234:"tint_picture",235:"erase_picture",236:"weather",
241:"play_bgm",242:"fadeout_bgm",243:"save_bgm",244:"replay_bgm",245:"play_bgs",246:"fadeout_bgs",249:"play_me",250:"play_se",251:"stop_se",261:"play_movie",
281:"change_map_name_display",282:"change_tileset",283:"change_battleback",284:"change_parallax",285:"get_location_info",
301:"battle_processing",302:"shop_processing",303:"name_input",311:"change_hp",312:"change_mp",313:"change_state",314:"recover_all",315:"change_exp",316:"change_level",317:"change_parameter",318:"change_skill",319:"change_equipment",320:"change_name",321:"change_class",322:"change_actor_images",323:"change_vehicle_image",324:"change_nickname",325:"change_profile",326:"change_tp",
331:"change_enemy_hp",332:"change_enemy_mp",333:"change_enemy_state",334:"enemy_recover_all",335:"enemy_appear",336:"enemy_transform",337:"battle_animation",339:"force_action",340:"abort_battle",342:"change_enemy_tp",
351:"open_menu",352:"open_save",353:"game_over",354:"return_title",355:"script",356:"mv_plugin_command",357:"mz_plugin_command",
401:"text_line",402:"choice_branch",403:"choice_cancel",404:"choices_end",405:"scroll_line",408:"comment_line",411:"else",412:"conditional_end",413:"repeat_above",505:"movement_continuation",601:"battle_win",602:"battle_escape",603:"battle_lose",604:"battle_end",605:"shop_continuation",655:"script_continuation",657:"mz_plugin_argument"
}
OPEN = {102:404,111:412,112:413,301:604}
BRANCH = {402:102,403:102,411:111,601:301,602:301,603:301}
END = {v:k for k,v in OPEN.items()}


def analyze_commands(raw_commands, owner_id, event_id, engine, cancel=lambda: None):
    commands, groups, refs, unknown, opaque, blocks, stack = [], [], [], [], [], [], []
    if not isinstance(raw_commands, list):
        raise ValueError("이벤트 명령 list가 배열이 아닙니다.")
    def ref(index, kind, target, role, **detail):
        refs.append({"source_id": f"{owner_id}:command:{index}", "event_id":event_id,
                     "owner_id":owner_id,"command_index":index,"target_kind":kind,
                     "target_id":str(target),"role":role,"detail":detail})
    def resource(i, folder, name):
        if isinstance(name,str) and name:
            ref(i,"asset",folder+"/"+name,"resource",logical_path=folder+"/"+name)
    def vr(i, value, role="read", **detail):
        if type(value) is int and value > 0:
            ref(i,"variable",value,role,**detail)
    for i, raw in enumerate(raw_commands):
        cancel()
        valid = isinstance(raw,dict) and type(raw.get("code")) is int and type(raw.get("indent")) is int and isinstance(raw.get("parameters"),list)
        code = raw.get("code") if isinstance(raw,dict) else None
        indent = raw.get("indent",0) if valid else 0
        p = raw.get("parameters",[]) if valid else []
        name = NAMES.get(code,"unknown") if type(code) is int else "malformed"
        if (engine == "MV" and code in (357,657)) or (engine=="VXACE" and code in (139,140,325,326,342,356,357,657)) or (engine=="MV_MZ" and code in (356,357,657)):
            name = "unknown_engine_extension"
        c = {"id":f"{owner_id}:command:{i}","index":i,"kind":name,"raw":raw,"contexts":[]}
        c["semantic"]=semantics(engine,code,p) if valid and name!="unknown_engine_extension" else None
        commands.append(c)
        if not valid or name in ("unknown","unknown_engine_extension"):
            unknown.append({"source_id":c["id"],"event_id":event_id,"code":code,"reason":"알 수 없거나 비정상적인 명령", "raw_preserved":True})
        if not valid or name=="unknown_engine_extension":
            continue
        # Iterative structural links; never execute control flow or recurse.
        if code in BRANCH:
            for b in reversed(stack):
                if b["code"] == BRANCH[code] and b["indent"] == indent:
                    b["branches"].append({"command_id":c["id"],"index":i,"parameters":p})
                    b["active_branch"] = c["id"]
                    break
        if code in END:
            for j in range(len(stack)-1,-1,-1):
                if stack[j]["code"] == END[code] and stack[j]["indent"] == indent:
                    stack[j]["end_index"] = i
                    stack[j]["end_command_id"] = c["id"]
                    del stack[j:]
                    break
        c["contexts"] = [{"block_id":b["command_id"],"branch_id":b.get("active_branch")} for b in stack]
        if code in OPEN:
            b={"command_id":c["id"],"code":code,"indent":indent,"start_index":i,"end_index":None,"branches":[]}
            blocks.append(b); stack.append(b)
        def get(n, default=None):
            return p[n] if len(p)>n else default
        def range_refs(kind, role):
            a,z=get(0),get(1)
            if type(a) is int and type(z) is int and 0 < a <= z and z-a <= 100000:
                for n in range(a,z+1):
                    if n % 1024 == 0: cancel()
                    ref(i,kind,n,role,operation=get(2),operand=p[3:])
            else:
                opaque.append({"source_id":c["id"],"reason":"비정상/과대 범위: 원본 파라미터로 재분석 필요"})
        if code == 111:
            if get(0) == 0: ref(i,"switch",get(1),"test",expected_on=get(2)==0)
            if get(0) == 1:
                vr(i,get(1),"test",comparison=get(4),operand_type=get(2),operand=get(3))
                if get(2) == 1: vr(i,get(3))
            if get(0) == 2: ref(i,"self_switch",get(1),"test",runtime_event_context=True,expected_on=get(2)==0)
            if get(0) in (4,8,9,10): ref(i,{4:"actor",8:"item",9:"weapon",10:"armor"}[get(0)],get(1),"test")
            if get(0) == 12: opaque.append({"source_id":c["id"],"reason":"스크립트 조건: 의존성 미확정"})
        if code == 121: range_refs("switch","write")
        if code == 122:
            range_refs("variable","write")
            if get(2) != 0: range_refs("variable","read")
            if get(3) == 1: vr(i,get(4),operand_for_range=[get(0),get(1)])
            if get(3) == 4: opaque.append({"source_id":c["id"],"reason":"변수 피연산자 스크립트"})
        if code == 123: ref(i,"self_switch",get(0),"write",runtime_event_context=True,operation=get(1))
        if code == 117: ref(i,"common_event",get(0),"call")
        if code in (103,104): vr(i,get(0),"write")
        if code in (201,202):
            mode = 0 if code == 201 else 1
            if get(mode) == 0: ref(i,"map",get(mode+1),"transfer" if code==201 else "vehicle_location")
            elif get(mode) == 1:
                for n in (mode+1,mode+2,mode+3): vr(i,get(n),dynamic_map=code==201)
        if code == 203 and get(1) == 1:
            vr(i,get(2)); vr(i,get(3))
        if code in (231,232):
            off = 3 if code == 231 else 3
            if get(off) == 1:
                vr(i,get(4)); vr(i,get(5))
        if code == 285:
            vr(i,get(0),"write")
            if get(2) == 1 or (engine == "MV" and get(2) not in (0,None)): vr(i,get(3)); vr(i,get(4))
        if code == 301:
            if get(0) == 0: ref(i,"troop",get(1),"battle")
            if get(0) == 1: vr(i,get(1))
        if code == 125 and get(1) == 1: vr(i,get(2))
        if code in (126,127,128):
            ref(i,{126:"item",127:"weapon",128:"armor"}[code],get(0),"write",parameters=p)
            if get(2) == 1: vr(i,get(3))
        if code == 129: ref(i,"actor",get(0),"party_change",operation=get(1))
        if code in (303,319,320,321,322,324,325): ref(i,"actor",get(0),"state_change",parameters=p)
        if code in (302,605):
            kind={0:"item",1:"weapon",2:"armor"}.get(get(0)) if type(get(0)) is int else None
            if kind: ref(i,kind,get(1),"shop_goods")
        if code in (311,312,313,314,315,316,317,318,326):
            if get(0) == 1: vr(i,get(1))
            elif get(0) == 0 and get(1): ref(i,"actor",get(1),"state_change",parameters=p)
        for target_code, type_index, value_index in [(311,3,4),(312,3,4),(315,3,4),(316,3,4),(317,4,5),(326,3,4),(331,2,3),(332,2,3),(342,2,3)]:
            if code == target_code and get(type_index) == 1: vr(i,get(value_index))
        if code in (101,): resource(i,"img/faces",get(0))
        if code == 231: resource(i,"img/pictures",get(1))
        if code == 283:
            resource(i,"img/battlebacks1",get(0)); resource(i,"img/battlebacks2",get(1))
        if code == 284: resource(i,"img/parallaxes",get(0))
        if code == 322:
            resource(i,"img/characters",get(1)); resource(i,"img/faces",get(3)); resource(i,"img/sv_actors",get(5))
        if code == 323: resource(i,"img/characters",get(1))
        audio = {132:("bgm",0),133:("me",0),139:("me",0),140:("bgm",1),241:("bgm",0),245:("bgs",0),249:("me",0),250:("se",0)}
        if code in audio:
            folder, n=audio[code]; sound=get(n)
            if isinstance(sound,dict): resource(i,"audio/"+folder,sound.get("name"))
        if code == 261: resource(i,"movies",get(0))
        if code == 282: ref(i,"tileset",get(0),"read")
        if code in (212,337): ref(i,"animation",get(1),"read")
        if code == 355: opaque.append({"source_id":c["id"],"reason":"스크립트: 실행/의존성 추론 안 함"})
        if code == 356:
            text=get(0,"")
            c["plugin"]={"format":"MV","text":text,"tokens":text.split(" ") if isinstance(text,str) else [],"plugin_identity":None}
            opaque.append({"source_id":c["id"],"reason":"MV 플러그인 명령: 대상 플러그인 자동 확정 불가"})
        if code == 357:
            c["plugin"]={"format":"MZ","plugin_name":get(0),"command_name":get(1),"display_name":get(2),"arguments":get(3)}
            ref(i,"plugin",get(0),"call")
        if code == 205 and isinstance(get(1),dict):
            scan_route(get(1),i,ref,resource,opaque)
        text_values=[]
        if code in (401,405) and isinstance(get(0),str): text_values.append(get(0))
        if code==102 and isinstance(get(0),list): text_values.extend(x for x in get(0) if isinstance(x,str))
        if code==101 and engine=="MZ" and isinstance(get(4),str): text_values.append(get(4))
        for text_value in text_values:
            for match in re.finditer(r'(?<!\\)\\[Vv]\[(\d+)\]',text_value):
                vr(i,int(match[1]),"text_read")
            for match in re.finditer(r'(?<!\\)\\[Nn]\[(\d+)\]',text_value):
                ref(i,"actor",match[1],"text_read")
    for b in blocks:
        b.pop("active_branch",None)
    continuation = {101:401,105:405,355:655,108:408}
    for i,c in enumerate(commands):
        raw=c["raw"]
        if not isinstance(raw,dict) or raw.get("code") not in continuation: continue
        code=raw["code"]; line_code=continuation[code]; j=i+1; lines=[]; ids=[]
        if code in (355,108):
            lines.append(raw.get("parameters",[""])[0]); ids.append(c["id"])
        while j<len(commands):
            r=commands[j]["raw"]
            if not isinstance(r,dict) or r.get("code") != line_code: break
            lines.append(r.get("parameters",[""])[0] if r.get("parameters") else ""); ids.append(commands[j]["id"]); j+=1
        p=raw.get("parameters",[])
        group={"id":c["id"]+":group","kind":{101:"dialogue",105:"scroll_text",355:"script",108:"comment"}[code],
               "start_command_id":c["id"],"line_command_ids":ids,"lines":lines,
               "text":"\n".join(lines) if all(isinstance(x,str) for x in lines) else None,
               "contexts":c["contexts"],"raw_options":p}
        if code == 101:
            group["speaker"] = p[4] if engine == "MZ" and len(p)>4 else None
            group["face"] = {"name":p[0] if p else None,"index":p[1] if len(p)>1 else None}
            r=commands[j]["raw"] if j<len(commands) else {}
            group["following_input_command_id"] = commands[j]["id"] if isinstance(r,dict) and r.get("code") in (102,103,104) else None
        groups.append(group)
    choices=[]
    for c in commands:
        r=c["raw"]
        if isinstance(r,dict) and r.get("code")==102 and isinstance(r.get("parameters"),list):
            p=r["parameters"]
            choices.append({"command_id":c["id"],"choices":p[0] if p else [],"cancel_type":p[1] if len(p)>1 else None,
                            "default_type":p[2] if len(p)>2 else 0,"position_type":p[3] if len(p)>3 else 2,
                            "background":p[4] if len(p)>4 else 0,"flow_block_id":c["id"],"cancel":semantics(engine,102,p)["cancel"]})
    return {"commands":commands,"text_groups":groups,"choices":choices,"flow_blocks":blocks},refs,unknown,opaque


def scan_route(route, index, ref, resource, opaque):
    for j, step in enumerate(route.get("list",[])):
        if not isinstance(step,dict): continue
        p=step.get("parameters",[])
        if not isinstance(p,list) or not p: continue
        if step.get("code") in (27,28):
            ref(index,"switch",p[0],"write",movement_index=j,expected_on=step["code"]==27)
        if step.get("code")==41: resource(index,"img/characters",p[0])
        if step.get("code")==44 and isinstance(p[0],dict): resource(index,"audio/se",p[0].get("name"))
        if step.get("code")==45: opaque.append({"source_id":f"movement:{index}:{j}","reason":"이동 루트 스크립트"})
