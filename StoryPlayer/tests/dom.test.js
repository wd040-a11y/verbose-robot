import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../src/ui/dom.js';

test('async buttons preserve disabled state set by the player and prevent overlapping actions', async () => {
  const original = globalThis.document;
  globalThis.document = {createElement: () => ({disabled:false, attrs:{}, setAttribute(k,v){this.attrs[k]=v}, removeAttribute(k){delete this.attrs[k]}})};
  try {
    let release, calls=0;
    const pending=new Promise(r=>release=r);
    const b=button('next',async()=>{calls++; await pending; b.disabled=true;});
    const first=b.onclick();
    await b.onclick();
    assert.equal(calls,1);
    assert.equal(b.attrs['aria-busy'],'true');
    release(); await first;
    assert.equal(b.disabled,true);
    assert.equal(b.attrs['aria-busy'],undefined);
    await b.onclick(); assert.equal(calls,1);
  } finally { globalThis.document=original; }
});
