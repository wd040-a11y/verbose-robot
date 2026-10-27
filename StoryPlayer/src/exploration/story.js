// Source-order segments are not an assertion of a playable story path.
export async function storyPage(page, common = async () => null, seen = new Set()) {
  const nodes = [], relations = [];
  for (const command of page.commands || []) {
    const {code, parameters = [], indent = 0} = command.raw;
    const node = {id:command.id, code, indent, parameters, kind:'command'};
    if ([401,405].includes(code)) node.kind='dialogue';
    if (code===102) node.kind='choices';
    if ([111,411,412,402,403,404,112,113,413,118,119].includes(code)) node.kind='branch';
    if ([231,232,235,261].includes(code)) node.kind='picture';
    if ([355,655,356,357].includes(code)) node.kind='unresolved';
    if (code===117) {
      node.kind='common';
      const id=parameters[0];
      relations.push({from:command.id,to:`common_event:${id}`,type:'calls',certainty:'source',evidence:[command.id]});
      if(seen.has(id)||seen.size>=8) node.warning='공통 이벤트 순환 또는 탐색 한도';
      else {
        const sub=await common(id);
        if(sub) node.content=await storyPage(sub,common,new Set([...seen,id]));
        else node.warning='공통 이벤트 원본 누락';
      }
    }
    nodes.push(node);
  }
  return {page:page.id,conditions:page.conditions || page.raw_metadata?.conditions,nodes,relations,policy:'원본 순서와 분기 표시. 실행 경로 및 도달 가능성 미확정'};
}
export function contentFlags(tree) {
  const flags={dialogue:false,choices:false,cg:false,uncertain:false};
  for(const n of tree.nodes){
    flags.dialogue ||= n.kind==='dialogue'; flags.choices ||= n.kind==='choices';
    flags.cg ||= n.code===231; flags.uncertain ||= n.kind==='unresolved'||Boolean(n.warning)||(n.code===111&&n.parameters[0]===12);
    if(n.content){const sub=contentFlags(n.content);for(const k in flags)flags[k] ||= sub[k];}
  }
  return flags;
}
export async function auditContent(pages, common, probe) {
  const result={pages:0,dialoguePages:0,choicePages:0,cgPages:0,readablePages:0,uncertainPages:0,interpreterBlockedDialoguePages:0,interpreterUncheckedPages:0,details:[]};
  for(const page of pages){
    const tree=await storyPage(page,common),f=contentFlags(tree);
    result.pages++; if(f.dialogue)result.dialoguePages++;if(f.choices)result.choicePages++;if(f.cg)result.cgPages++;if(f.dialogue||f.choices)result.readablePages++;if(f.uncertain)result.uncertainPages++;
    const execution=probe?await probe(page):{status:'unchecked'};
    if(execution.status==='unchecked')result.interpreterUncheckedPages++;
    if(f.dialogue&&execution.status==='blocked')result.interpreterBlockedDialoguePages++;
    result.details.push({page:page.id,...f,execution});
  }
  return result;
}
