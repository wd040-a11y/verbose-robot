import { pictureBounds, unionBounds } from "./presentation/geometry.js";
import { faceRect, pictureStyle } from "./resources.js";
export async function loadImage(blob) {
  const url = URL.createObjectURL(blob),
    image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export class SceneRenderer {
  constructor(scene, face) {
    this.scene = scene;
    this.face = face;
    this.generation = 0;
    this.faceGeneration = 0;
    this.layer = document.createElement("div");
    this.layer.className = "picture-layer";
    scene.classList.add("scene");
    scene.append(this.layer);
    this.setSize(816, 624);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(scene);
  }
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.scene.style.aspectRatio = `${width} / ${height}`;
    this.layer.style.width = width + "px";
    this.layer.style.height = height + "px";
    this.resize();
  }
  resize() {
    if(this.focused)return;
    const w=this.fitWidth||this.width,h=this.fitHeight||this.height;
    const scale=Math.min(this.scene.clientWidth/w,this.scene.clientHeight/h);
    this.layer.style.transform=`translate(${Math.max(0,(this.scene.clientWidth-w*scale)/2)}px, ${Math.max(0,(this.scene.clientHeight-h*scale)/2)}px) scale(${scale})`;
  }
  async pictures(pkg, s) {
    const generation = ++this.generation;
    this.layer.replaceChildren();
    this.fitWidth=null;this.fitHeight=null;
    const boxes=[];
    this.focused=(this.mode||'auto')!=='original'&&Object.keys(s.pictures).length===1;
    this.scene.classList.toggle('cg-focus',this.focused);
    this.layer.style.width=this.focused?'100%':this.width+'px';
    this.layer.style.height=this.focused?'100%':this.height+'px';
    if(this.focused)this.layer.style.transform='none';else this.resize();
    for (const [id, p] of Object.entries(s.pictures).sort(
      (a, b) => +a[0] - +b[0],
    )) {
      let image;
      try {
        const blob = await pkg.image("img/pictures/" + p.name);
        if (blob) image = await loadImage(blob);
      } catch {
        /* Missing/corrupt resource never affects interpreter. */
      }
      if (generation !== this.generation) return;
      const e = image || document.createElement("div");
      e.className = "picture" + (image ? "" : " missing-picture");
      e.dataset.pictureId = id;
      if (image) e.alt = p.name;
      else
        e.textContent = `그림 ${id}: ${p.name} — 리소스 미등록 (이벤트 계속 실행)`;
      if(this.focused&&image){e.className="focused-picture";e.style.opacity=String((p.opacity??255)/255);this.scene.style.aspectRatio=`${image.naturalWidth}/${image.naturalHeight}`;}
      else {Object.assign(e.style,pictureStyle(p));this.scene.style.aspectRatio=`${this.width}/${this.height}`;}
      e.style.zIndex = id;
      this.layer.append(e);
      if(image && (p.opacity??255)>0)boxes.push({element:e,rect:pictureBounds(p,image.naturalWidth,image.naturalHeight),p});
    }
    // Auto/CG fit preserves relative composition, including off-screen pictures.
    // Original mode keeps the engine viewport and intentional cropping.
    if(!this.focused && this.mode!=='original' && boxes.length){
      const bounds=unionBounds(boxes.map(x=>x.rect));
      this.fitWidth=bounds.width;this.fitHeight=bounds.height;
      this.layer.style.width=bounds.width+'px';this.layer.style.height=bounds.height+'px';
      this.scene.style.aspectRatio=`${bounds.width}/${bounds.height}`;
      for(const {element,p} of boxes){element.style.left=((p.x||0)-bounds.x)+'px';element.style.top=((p.y||0)-bounds.y)+'px';}
    }
    this.resize();
  }
  async portrait(pkg, message) {
    const generation = ++this.faceGeneration;
    this.face.replaceChildren();
    if (!message?.face) return;
    try {
      const blob = await pkg.image("img/faces/" + message.face);
      if (!blob) throw Error("미등록");
      const image = await loadImage(blob);
      if (generation !== this.faceGeneration) return;
      const rect = faceRect(
        pkg.manifest.engine,
        message.faceIndex,
        image.naturalWidth,
        image.naturalHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        `${message.face} 얼굴 ${message.faceIndex}`,
      );
      canvas.dataset.faceIndex = message.faceIndex;
      canvas
        .getContext("2d")
        .drawImage(
          image,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height,
        );
      this.face.append(canvas);
    } catch {
      if (generation !== this.faceGeneration) return;
      const text = document.createElement("small");
      text.textContent = `얼굴: ${message.face} [${message.faceIndex}] — 이미지 없음`;
      this.face.append(text);
    }
  }
}
