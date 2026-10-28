// Conservative whole-name dictionary. Never translate unknown proper names by guessing.
const names=new Map(Object.entries({'村':'마을','町':'마을','街':'도시','城':'성','森':'숲','宿屋':'여관','酒場':'주점','教会':'교회','学校':'학교','図書館':'도서관','病院':'병원','洞窟':'동굴','港':'항구','海岸':'해안','地下室':'지하실','自宅':'집','広場':'광장','王都':'왕도','武器屋':'무기점','防具屋':'방어구점','道具屋':'도구점'}));
export function placeName(map,aliases={},translated){
 const raw=map.name||'';
 if(aliases[map.map_id])return {text:aliases[map.map_id],source:'직접 지정',raw};
 if(translated&&translated!==raw)return {text:translated,source:'가져온 번역',raw};
 if(names.has(raw.trim()))return {text:names.get(raw.trim()),source:'기본 장소 용어',raw};
 if(/[ぁ-ヿ一-龯]/.test(raw))return {text:`장소 ${map.map_id} · ${raw}`,source:'미번역 원문',raw};
 return {text:raw||`장소 ${map.map_id}`,source:raw?'원문':'이름 없음',raw};
}
