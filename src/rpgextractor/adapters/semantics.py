"""Small explicit shared semantic contract; raw parameters always remain authoritative."""
def semantics(engine,code,p):
    get=lambda i,default=None:p[i] if i<len(p) else default
    names={101:'show_text',102:'show_choices',111:'conditional_branch',117:'call_common_event',121:'set_switch',122:'set_variable',123:'set_self_switch',201:'transfer_player',231:'show_picture',355:'script'}
    if code not in names: return None
    out={'operation':names[code]}
    if code==101: out.update(face_name=get(0),face_index=get(1),background=get(2),position=get(3),speaker=get(4) if engine=='MZ' else None)
    elif code==102:
        raw=get(1); choices=get(0,[])
        if engine=='VXACE':
            cancel={'mode':'disabled'} if raw==0 else {'mode':'branch'} if raw==5 else {'mode':'choice','index':raw-1} if type(raw) is int and 1<=raw<=4 else {'mode':'unknown','raw':raw}
        else:
            cancel={'mode':'disabled'} if raw==-1 else {'mode':'branch'} if raw==-2 or (type(raw) is int and raw>=len(choices)) else {'mode':'choice','index':raw}
        out.update(choices=choices,cancel=cancel,default_index=0 if engine=='VXACE' else get(2,0))
    elif code==111: out.update(condition_type=get(0),operands=p[1:],script_language='ruby' if engine=='VXACE' else 'javascript' if engine in ('MV','MZ') else 'unknown')
    elif code==117: out['common_event_id']=get(0)
    elif code==121: out.update(first_id=get(0),last_id=get(1),value=get(2)==0)
    elif code==122: out.update(first_id=get(0),last_id=get(1),operator=get(2),operand_type=get(3),operand=p[4:])
    elif code==123: out.update(key=get(0),value=get(1)==0,scope='current_map_event')
    elif code==201: out.update(location_mode=get(0),map=get(1),x=get(2),y=get(3),direction=get(4),fade=get(5))
    elif code==231: out.update(picture_id=get(0),image=get(1),origin=get(2),coordinate_mode=get(3),x=get(4),y=get(5),zoom_x=get(6),zoom_y=get(7),opacity=get(8),blend_mode=get(9))
    elif code==355: out.update(language='ruby' if engine=='VXACE' else 'javascript' if engine in ('MV','MZ') else 'unknown',executed=False)
    return out
